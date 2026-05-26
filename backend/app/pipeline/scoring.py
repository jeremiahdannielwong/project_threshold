"""PCA composite — Tier A only.

Tier C live data (weather + outages) is intentionally absent: those columns
exist on the output schema (NaN) so the read endpoints can hydrate them at
request time from the live proxies.
"""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler

logger = logging.getLogger(__name__)

# Source slug map mirrors app/sources.py so the pca_loadings table stays traceable.
SOURCE_MAP: dict[str, str] = {
    "median_income": "brampton-esri-census2021",
    "pct_pre1980": "brampton-esri-census2021",
    "pct_renters": "brampton-esri-census2021",
    "cisv_score": "statcan-cisv-2021",
    "cisv_dim1": "statcan-cisv-2021",
    "cisv_dim2": "statcan-cisv-2021",
    "cisv_dim3": "statcan-cisv-2021",
    "cisv_dim4": "statcan-cisv-2021",
    "cisr_score": "statcan-cisr-2021",
}

# Tier A factor columns the PCA actually consumes at build time.
# (Tier C — humidex, active_outages, customers_affected — is layered in live
# by the read endpoints, not baked into the score.)
FACTOR_COLS: tuple[str, ...] = (
    "median_income",
    "pct_pre1980",
    "pct_renters",
    "cisv_score",
    "cisv_dim1",
    "cisv_dim2",
    "cisv_dim3",
    "cisv_dim4",
    "cisr_score",
)

# Scenario weight overrides — applied AFTER the Tier A score lookup by the
# scenarios route, but we still write per-scenario PCA loadings here so the
# radar chart can show what the model considers important under each scenario.
SCENARIOS: dict[str, dict[str, float]] = {
    "baseline": {},
    "heatwave": {"pct_renters": 1.2, "pct_pre1980": 1.2},
    "icestorm": {"pct_renters": 1.5, "pct_pre1980": 1.3},
}


def run_pca(df: pd.DataFrame, factor_cols: list[str], weights: dict[str, float] | None) -> tuple[PCA, np.ndarray]:
    X = df[factor_cols].copy()
    if weights:
        for col, w in weights.items():
            if col in X.columns:
                X[col] = X[col] * w
    scaled = StandardScaler().fit_transform(X)
    pca = PCA(n_components=min(5, len(factor_cols)))
    pca.fit(scaled)
    raw = pca.transform(scaled)[:, 0]
    s_min, s_max = raw.min(), raw.max()
    if s_max == s_min:
        return pca, np.zeros_like(raw)
    return pca, (raw - s_min) / (s_max - s_min) * 100


def score_communities(master: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Return (scored CT frame, loadings frame).

    ``master`` must contain CTUID + the Tier A factor columns. NaNs are
    imputed with column medians; CTs missing >50% are dropped.
    """
    available = [c for c in FACTOR_COLS if c in master.columns]
    if len(available) < 3:
        raise RuntimeError(
            f"Need >=3 Tier A factor columns to fit PCA, got {available}"
        )

    df = master[["CTUID"] + available].copy()
    row_null_pct = df[available].isnull().mean(axis=1)
    df = df[row_null_pct <= 0.5].reset_index(drop=True)

    medians = df[available].median().fillna(0)
    df[available] = df[available].fillna(medians)

    keep = [c for c in available if df[c].std() != 0]
    if len(keep) != len(available):
        dropped = set(available) - set(keep)
        logger.warning("Dropping zero-variance factor columns: %s", dropped)

    df["median_income"] = -df["median_income"]
    if "cisr_score" in keep:
        df["cisr_score"] = -df["cisr_score"]

    pcas: dict[str, PCA] = {}
    score_cols: dict[str, np.ndarray] = {}
    for name, weights in SCENARIOS.items():
        pca, scores = run_pca(df, keep, weights or None)
        pcas[name] = pca
        score_cols[f"threshold_score_{name}"] = scores
        logger.info("PCA %s: PC1 explains %.1f%%", name, pca.explained_variance_ratio_[0] * 100)

    scored = master.merge(
        df[["CTUID"]].assign(**score_cols),
        on="CTUID",
        how="inner",
    )

    loadings = pd.DataFrame({"factor": keep})
    for name, pca in pcas.items():
        loadings[f"loading_{name}"] = pca.components_[0]
    loadings["source_slug"] = [SOURCE_MAP.get(c, "unknown") for c in keep]
    loadings = loadings.sort_values("loading_baseline", key=abs, ascending=False)

    return scored, loadings


def risk_level(score: float | None) -> str:
    if score is None or pd.isna(score):
        return "Low"
    if score >= 75:
        return "Critical"
    if score >= 50:
        return "High"
    if score >= 25:
        return "Moderate"
    return "Low"
