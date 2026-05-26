"""Stage 4 -- Train.

Fits one StandardScaler + PCA pipeline per scenario on the curated feature
table. Every fit:

  - logs params, metrics, and the serialized model to MLflow
  - persists the model bytes + loadings + metrics to ``ml.models``

The model row is the durable artifact: ``stages.score`` and the backend can
read it back without needing the MLflow service to be online.
"""

from __future__ import annotations

import io
import json
import logging
import pickle
import time
import uuid
from typing import Any

import numpy as np
import pandas as pd
from sklearn.decomposition import PCA
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sqlalchemy import text

from ..config import FACTOR_COLS, INVERTED_FACTORS, SCENARIOS, runtime
from . import StageResult

logger = logging.getLogger(__name__)


def _next_version(existing: list[int]) -> int:
    return (max(existing) + 1) if existing else 1


def _prep_frame(df: pd.DataFrame, factor_cols: list[str]) -> pd.DataFrame:
    """Impute medians, drop high-null rows, flip inverted sign columns."""
    X = df[factor_cols].copy()
    keep_rows = X.isnull().mean(axis=1) <= 0.5
    X = X[keep_rows]
    medians = X.median(numeric_only=True).fillna(0.0)
    X = X.fillna(medians)
    for col in factor_cols:
        if col in INVERTED_FACTORS and col in X.columns:
            X[col] = -X[col]
    return X


def _apply_weights(X: pd.DataFrame, weights: dict[str, float]) -> pd.DataFrame:
    out = X.copy()
    for col, w in weights.items():
        if col in out.columns:
            out[col] = out[col] * w
    return out


def _fit_one(X: pd.DataFrame) -> tuple[Pipeline, np.ndarray, dict[str, Any]]:
    pipe = Pipeline(
        [
            ("scaler", StandardScaler()),
            ("pca", PCA(n_components=min(5, X.shape[1]))),
        ]
    )
    pipe.fit(X.values)
    pc1 = pipe.transform(X.values)[:, 0]
    s_min, s_max = float(pc1.min()), float(pc1.max())
    scaled = np.zeros_like(pc1) if s_max == s_min else (pc1 - s_min) / (s_max - s_min) * 100.0

    pca: PCA = pipe.named_steps["pca"]
    metrics = {
        "n_rows": int(X.shape[0]),
        "n_features": int(X.shape[1]),
        "explained_variance_pc1": float(pca.explained_variance_ratio_[0]),
        "explained_variance_total": float(pca.explained_variance_ratio_.sum()),
        "score_min": s_min,
        "score_max": s_max,
    }
    return pipe, scaled, metrics


def _maybe_setup_mlflow() -> Any | None:
    """Best-effort MLflow setup. Pipeline continues even if MLflow is down."""
    try:
        import mlflow
    except ImportError:  # pragma: no cover
        logger.warning("train: mlflow not installed; skipping experiment logging")
        return None
    rt = runtime()
    try:
        mlflow.set_tracking_uri(rt.mlflow_tracking_uri)
        mlflow.set_experiment(rt.mlflow_experiment)
    except Exception as exc:
        logger.warning("train: mlflow unavailable (%s); continuing without it", exc)
        return None
    return mlflow


async def _persist_model(
    db: Any,
    *,
    model_id: str,
    scenario: str,
    version: int,
    factor_cols: list[str],
    loadings: dict[str, float],
    explained_variance: list[float],
    metrics: dict[str, Any],
    artifact: bytes,
    mlflow_run_id: str | None,
) -> None:
    insert_sql = text(
        """
        INSERT INTO ml.models
            (model_id, kind, version, scenario, factor_columns, loadings,
             explained_variance, metrics, artifact, mlflow_run_id)
        VALUES
            (:model_id, :kind, :version, :scenario,
             CAST(:factor_columns AS JSONB), CAST(:loadings AS JSONB),
             CAST(:explained_variance AS JSONB), CAST(:metrics AS JSONB),
             :artifact, :mlflow_run_id)
        """
    )
    async with db.session() as session:
        await session.execute(
            insert_sql,
            {
                "model_id": model_id,
                "kind": "pca",
                "version": version,
                "scenario": scenario,
                "factor_columns": json.dumps(factor_cols),
                "loadings": json.dumps(loadings),
                "explained_variance": json.dumps(explained_variance),
                "metrics": json.dumps(metrics),
                "artifact": artifact,
                "mlflow_run_id": mlflow_run_id,
            },
        )
        await session.commit()


async def run(db: Any) -> StageResult:
    started = time.perf_counter()
    mlflow = _maybe_setup_mlflow()

    async with db.session() as session:
        rows = (
            await session.execute(
                text(
                    f"SELECT ctuid, {', '.join(FACTOR_COLS)} FROM curated.community_features"
                )
            )
        ).mappings().all()
    df = pd.DataFrame([dict(r) for r in rows])
    if df.empty:
        raise RuntimeError(
            "train: curated.community_features is empty -- run earlier stages first"
        )

    available = [c for c in FACTOR_COLS if c in df.columns]
    if len(available) < 3:
        raise RuntimeError(f"train: need >=3 factor columns, got {available}")

    keep_idx = df[available].isnull().mean(axis=1) <= 0.5
    base = df[keep_idx].copy()
    medians = base[available].median(numeric_only=True).fillna(0.0)
    base[available] = base[available].fillna(medians)

    keep = [c for c in available if base[c].std() != 0]
    if len(keep) != len(available):
        logger.warning("train: dropping zero-variance columns %s", set(available) - set(keep))

    async with db.session() as session:
        existing = [
            int(v)
            for (v,) in (await session.execute(text("SELECT version FROM ml.models"))).all()
        ]
    version = _next_version(existing)

    details: dict[str, str] = {}
    for scenario, overrides in SCENARIOS.items():
        X_base = _prep_frame(base.assign(ctuid=base["ctuid"]), keep)
        X = _apply_weights(X_base, overrides)
        pipe, scores, metrics = _fit_one(X)

        loadings = {
            col: float(coef)
            for col, coef in zip(keep, pipe.named_steps["pca"].components_[0], strict=True)
        }
        explained = pipe.named_steps["pca"].explained_variance_ratio_.tolist()

        buf = io.BytesIO()
        pickle.dump(
            {
                "pipeline": pipe,
                "factor_cols": keep,
                "weights": overrides,
                "score_min": metrics["score_min"],
                "score_max": metrics["score_max"],
            },
            buf,
        )
        artifact = buf.getvalue()

        model_id = f"pca-{scenario}-v{version}-{uuid.uuid4().hex[:8]}"
        run_id: str | None = None
        if mlflow is not None:
            try:
                with mlflow.start_run(run_name=model_id) as run:
                    mlflow.log_param("scenario", scenario)
                    mlflow.log_param("version", version)
                    mlflow.log_param("factor_cols", ",".join(keep))
                    for k, v in overrides.items():
                        mlflow.log_param(f"weight.{k}", v)
                    for k, v in metrics.items():
                        if isinstance(v, (int, float)):
                            mlflow.log_metric(k, v)
                    for col, coef in loadings.items():
                        mlflow.log_metric(f"loading.{col}", coef)
                    mlflow.log_dict({"scores_preview": scores.tolist()[:5]}, "scores_preview.json")
                    run_id = run.info.run_id
            except Exception as exc:  # pragma: no cover
                logger.warning("train: mlflow logging failed for %s (%s)", scenario, exc)

        await _persist_model(
            db,
            model_id=model_id,
            scenario=scenario,
            version=version,
            factor_cols=keep,
            loadings=loadings,
            explained_variance=explained,
            metrics=metrics,
            artifact=artifact,
            mlflow_run_id=run_id,
        )
        details[scenario] = model_id
        logger.info(
            "train: %s v%d -> %s (PC1 ev=%.3f, rows=%d)",
            scenario,
            version,
            model_id,
            metrics["explained_variance_pc1"],
            metrics["n_rows"],
        )

    elapsed = time.perf_counter() - started
    return StageResult(
        name="train",
        rows_written=len(details),
        elapsed_seconds=elapsed,
        details=details,
    )
