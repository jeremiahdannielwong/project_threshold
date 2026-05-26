"""A3 + A4 — Canadian Index of Social Vulnerability + Resilience.

Both indices ship as DA-level CSVs. We download the DA→CT crosswalk, scope it
to Ontario CMAs 535/537, then mean-aggregate scores to the CT level.
"""

from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd

from ._http import download_and_extract_zip
from .sources import (
    CISR_URL,
    CISV_URL,
    DA_CT_CROSSWALK_URL,
    TARGET_CMA_CODES,
    TARGET_PROVINCE_PRUID,
)

logger = logging.getLogger(__name__)


def _read_first_csv(d: Path) -> pd.DataFrame:
    csv_path = next(p for p in d.glob("*.csv") if "notes" not in p.name.lower())
    return pd.read_csv(csv_path)


def load_cimd(cache_dir: Path) -> pd.DataFrame:
    """Return a CT-level DataFrame with CISV + CISR columns."""
    cached = cache_dir / "real_cisr_cisv.csv"
    if cached.exists():
        logger.info("A3/A4: using cached %s", cached.name)
        return pd.read_csv(cached, dtype={"CTUID": str})

    cisv_raw = _read_first_csv(download_and_extract_zip(CISV_URL, cache_dir / "cisv"))
    cisr_raw = _read_first_csv(download_and_extract_zip(CISR_URL, cache_dir / "cisr"))

    geo_dir = download_and_extract_zip(DA_CT_CROSSWALK_URL, cache_dir / "geo_attr")
    geo_csv = next(geo_dir.glob("*.csv"))
    geo = pd.read_csv(
        geo_csv,
        dtype=str,
        encoding="latin-1",
        usecols=["PRUID_PRIDU", "DAUID_ADIDU", "CTUID_SRIDU", "CMAUID_RMRIDU"],
    )
    xwalk = geo[
        (geo["PRUID_PRIDU"] == TARGET_PROVINCE_PRUID)
        & (geo["CMAUID_RMRIDU"].isin(TARGET_CMA_CODES))
    ][["DAUID_ADIDU", "CTUID_SRIDU"]].drop_duplicates()
    xwalk["DAUID_ADIDU"] = xwalk["DAUID_ADIDU"].astype(str)

    cisv = _normalize_cisv(cisv_raw)
    cisr = _normalize_cisr(cisr_raw)

    cisv_cols = [c for c in cisv.columns if c == "DAUID_ADIDU" or c.startswith("cisv_")]
    cisr_cols = [c for c in cisr.columns if c == "DAUID_ADIDU" or c.startswith("cisr_")]
    da = xwalk.merge(cisv[cisv_cols], on="DAUID_ADIDU", how="left").merge(
        cisr[cisr_cols], on="DAUID_ADIDU", how="left"
    )
    score_cols = [c for c in da.columns if c not in ("DAUID_ADIDU", "CTUID_SRIDU")]
    ct = (
        da.groupby("CTUID_SRIDU")[score_cols]
        .mean()
        .round(4)
        .reset_index()
        .rename(columns={"CTUID_SRIDU": "CTUID"})
    )
    cached.parent.mkdir(parents=True, exist_ok=True)
    ct.to_csv(cached, index=False)
    logger.info("A3/A4: %d CTs aggregated, cached -> %s", len(ct), cached)
    return ct


def _normalize_cisv(raw: pd.DataFrame) -> pd.DataFrame:
    df = raw.copy()
    df["DAUID_ADIDU"] = df["Dissemination Area (DA)"].astype(str).str.zfill(8)
    rename = {
        "Dimension 1 Scores": "cisv_dim1",
        "Dimension 2 Scores": "cisv_dim2",
        "Dimension 3 Scores": "cisv_dim3",
        "Dimension 4 Scores": "cisv_dim4",
        "CISV Scores": "cisv_score",
        "CISV Quintiles": "cisv_quintile",
    }
    df = df.rename(columns={k: v for k, v in rename.items() if k in df.columns})
    return df


def _normalize_cisr(raw: pd.DataFrame) -> pd.DataFrame:
    df = raw.copy()
    df["DAUID_ADIDU"] = df["Dissemination Area (DA)"].astype(str).str.zfill(8)
    rename = {
        "Dimension 1 Scores": "cisr_dim1",
        "Dimension 2 Scores": "cisr_dim2",
        "Dimension 3 Scores": "cisr_dim3",
        "CISR Scores": "cisr_score",
        "CISR Quintiles": "cisr_quintile",
    }
    df = df.rename(columns={k: v for k, v in rename.items() if k in df.columns})
    return df
