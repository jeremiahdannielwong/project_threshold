"""Stage 5 -- Score.

Loads the latest model per scenario from ``ml.models``, applies it to the
current ``curated.community_features``, and writes one row per CT x scenario
to ``ml.community_scores``. Each row carries ``model_id`` so any score on
the frontend can be traced back to the exact training run.
"""

from __future__ import annotations

import json
import logging
import pickle
import time
from typing import Any

import numpy as np
import pandas as pd
from sqlalchemy import text

from ..config import INVERTED_FACTORS, SCENARIOS, grade_for
from . import StageResult

logger = logging.getLogger(__name__)


_LATEST_PER_SCENARIO_SQL = text(
    """
    SELECT DISTINCT ON (scenario)
        model_id, scenario, version, factor_columns, artifact
    FROM ml.models
    ORDER BY scenario, version DESC, fitted_at DESC
    """
)


async def _load_features(db: Any, factor_cols: list[str]) -> pd.DataFrame:
    cols_csv = ", ".join(factor_cols)
    async with db.session() as session:
        rows = (
            await session.execute(
                text(f"SELECT ctuid, {cols_csv} FROM curated.community_features")
            )
        ).mappings().all()
    return pd.DataFrame([dict(r) for r in rows])


def _apply(df: pd.DataFrame, factor_cols: list[str], weights: dict[str, float]) -> pd.DataFrame:
    X = df[factor_cols].copy()
    medians = X.median(numeric_only=True).fillna(0.0)
    X = X.fillna(medians)
    for col in factor_cols:
        if col in INVERTED_FACTORS:
            X[col] = -X[col]
    for col, w in weights.items():
        if col in X.columns:
            X[col] = X[col] * w
    return X


async def run(db: Any) -> StageResult:
    started = time.perf_counter()

    async with db.session() as session:
        models = (await session.execute(_LATEST_PER_SCENARIO_SQL)).mappings().all()
    if not models:
        raise RuntimeError(
            "score: ml.models is empty -- run stages.train first"
        )

    scenario_rows: list[dict[str, Any]] = []
    for m in models:
        scenario = m["scenario"]
        artifact = pickle.loads(m["artifact"])
        factor_cols: list[str] = artifact["factor_cols"]
        pipe = artifact["pipeline"]
        s_min = float(artifact["score_min"])
        s_max = float(artifact["score_max"])
        overrides = SCENARIOS.get(scenario, {})

        df = await _load_features(db, factor_cols)
        if df.empty:
            logger.warning("score: features empty -- nothing to score for %s", scenario)
            continue

        X = _apply(df, factor_cols, overrides)
        pc1 = pipe.transform(X.values)[:, 0]
        if s_max == s_min:
            scaled = np.zeros_like(pc1)
        else:
            scaled = (pc1 - s_min) / (s_max - s_min) * 100.0
            scaled = np.clip(scaled, 0.0, 100.0)

        for ctuid, score, factor_row in zip(df["ctuid"], scaled, X.to_dict(orient="records"), strict=True):
            scenario_rows.append(
                {
                    "ctuid": str(ctuid),
                    "scenario": scenario,
                    "score": float(score),
                    "grade": grade_for(float(score)),
                    "model_id": m["model_id"],
                    "factor_values": json.dumps(
                        {k: (None if pd.isna(v) else float(v)) for k, v in factor_row.items()}
                    ),
                }
            )

    insert_sql = text(
        """
        INSERT INTO ml.community_scores
            (ctuid, scenario, score, grade, model_id, factor_values)
        VALUES (:ctuid, :scenario, :score, :grade, :model_id,
                CAST(:factor_values AS JSONB))
        """
    )
    async with db.session() as session:
        await session.execute(text("TRUNCATE TABLE ml.community_scores"))
        if scenario_rows:
            await session.execute(insert_sql, scenario_rows)
        await session.commit()

    elapsed = time.perf_counter() - started
    per_scenario = {s: sum(1 for r in scenario_rows if r["scenario"] == s) for s in SCENARIOS}
    logger.info("score: wrote %d rows in %.2fs (%s)", len(scenario_rows), elapsed, per_scenario)
    return StageResult(
        name="score",
        rows_written=len(scenario_rows),
        elapsed_seconds=elapsed,
        details=per_scenario,
    )
