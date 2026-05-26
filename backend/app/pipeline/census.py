"""A2 — Brampton 2021 Census demographics via the City of Brampton ESRI FS.

Joins 4 ArcGIS layers (population, income, tenure/dwelling-age, low income) by
CTUID and derives the percentage columns the score consumes.
"""

from __future__ import annotations

import logging

import httpx
import pandas as pd

from .sources import BRAMPTON_CENSUS_FS, HTTP_TIMEOUT_SECONDS

logger = logging.getLogger(__name__)


def _fetch_layer(layer_id: int, fields: str) -> pd.DataFrame:
    r = httpx.get(
        f"{BRAMPTON_CENSUS_FS}/{layer_id}/query",
        params={
            "f": "json",
            "where": "1=1",
            "outFields": fields,
            "returnGeometry": "false",
            "resultRecordCount": 2000,
        },
        timeout=HTTP_TIMEOUT_SECONDS,
    )
    r.raise_for_status()
    rows = [feat["attributes"] for feat in r.json().get("features", [])]
    df = pd.DataFrame(rows)
    df["CTUID"] = df["CTUID"].astype(str)
    return df


def load_brampton_census() -> pd.DataFrame:
    """Return a CT-level DataFrame with the columns the PCA expects."""
    pop = _fetch_layer(1, "CTUID,POPULATION_2021,TOTAL_PRIVATE_DWELLINGS")
    inc = _fetch_layer(8, "CTUID,TOTAL_MED_HH_INC_2020")
    ten = _fetch_layer(
        6,
        "CTUID,RENTER,TOTAL_PRIV_HH_BY_TENURE_25,"
        "FROM1960_OR_BEFORE,FROM1961_TO_1980,TOTAL_PRIV_DWELL_PERIOD_25",
    )
    low = _fetch_layer(11, "CTUID,TOTAL_LOWINC_2020_LIM,TOTAL_PCT_LOWINC_2020_LIM")

    df = (
        pop.merge(inc, on="CTUID", how="outer")
        .merge(ten, on="CTUID", how="outer")
        .merge(low, on="CTUID", how="outer")
    )
    df = df.rename(
        columns={
            "POPULATION_2021": "population",
            "TOTAL_MED_HH_INC_2020": "median_income",
            "TOTAL_PCT_LOWINC_2020_LIM": "pct_low_income",
        }
    )
    df["pct_renters"] = (
        df["RENTER"] / df["TOTAL_PRIV_HH_BY_TENURE_25"].replace(0, float("nan"))
    ).round(4)
    df["pct_pre1980"] = (
        (df["FROM1960_OR_BEFORE"].fillna(0) + df["FROM1961_TO_1980"].fillna(0))
        / df["TOTAL_PRIV_DWELL_PERIOD_25"].replace(0, float("nan"))
    ).round(4)
    df["pct_low_income"] = (df["pct_low_income"] / 100).round(4)

    out = df[
        ["CTUID", "population", "median_income", "pct_renters", "pct_pre1980", "pct_low_income"]
    ].copy()
    logger.info("A2: %d Brampton CTs", len(out))
    return out
