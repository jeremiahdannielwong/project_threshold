"""A2 -- Brampton 2021 Census demographics via the City of Brampton ESRI FS.

Joins 8 ArcGIS layers by CTUID and derives the percentage columns the score
consumes. Layers:

  1  Population
  2  Total Age          -> pct_seniors_65plus, pct_children_under5
  6  Household Chars.   -> pct_renters, pct_pre1980 (existing)
  7  Household Type     -> pct_living_alone
  8  Household Income   -> median_income (existing)
 11  Low Income         -> pct_low_income (existing)
 21  Knowledge of Off.  -> pct_no_official_lang
 41  Commuting Mode     -> pct_transit_commute

NOTE: The 5 NEW derived columns (seniors, children, living_alone,
no_official_lang, transit_commute) flow out of this function but downstream
pipeline stages (clean / features / publish) still need to be widened to
propagate them into `staging.census_tracts` and `curated.community_features`.
Until that wiring lands, the columns are visible to anyone who calls
load_brampton_census() directly, and to the frontend via the static
brampton_full.geojson which is enriched by pipeline/data/census_extra/.
"""

from __future__ import annotations

import logging

import httpx
import pandas as pd

from .urls import BRAMPTON_CENSUS_FS, HTTP_TIMEOUT_SECONDS

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
    """Return a CT-level DataFrame with the columns the PCA + frontend consume."""
    pop = _fetch_layer(1, "CTUID,POPULATION_2021,TOTAL_PRIVATE_DWELLINGS")
    age = _fetch_layer(
        2,
        "CTUID,TOTAL_PCT_AGE_65_AND_OVER,TOTAL_AGE_0_TO_4,TOTAL_AGE_GRPS",
    )
    inc = _fetch_layer(8, "CTUID,TOTAL_MED_HH_INC_2020")
    ten = _fetch_layer(
        6,
        "CTUID,RENTER,TOTAL_PRIV_HH_BY_TENURE_25,"
        "FROM1960_OR_BEFORE,FROM1961_TO_1980,TOTAL_PRIV_DWELL_PERIOD_25",
    )
    hht = _fetch_layer(7, "CTUID,TOTAL_PCT_ONE_PERSON_HH")
    low = _fetch_layer(11, "CTUID,TOTAL_LOWINC_2020_LIM,TOTAL_PCT_LOWINC_2020_LIM")
    lang = _fetch_layer(21, "CTUID,TOTAL_PCT_NEITHER")
    commute = _fetch_layer(
        41,
        "CTUID,TOTAL_PUBLIC_TRANSIT,TOTAL_EMP_LABOUR_FORCE_25",
    )

    df = (
        pop.merge(age, on="CTUID", how="outer")
        .merge(inc, on="CTUID", how="outer")
        .merge(ten, on="CTUID", how="outer")
        .merge(hht, on="CTUID", how="outer")
        .merge(low, on="CTUID", how="outer")
        .merge(lang, on="CTUID", how="outer")
        .merge(commute, on="CTUID", how="outer")
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

    # New derived columns. PCT_* fields from Census come in 0-100 scale — divide
    # by 100 so every share in this dataframe is 0-1 (matches existing convention).
    df["pct_seniors_65plus"] = (df["TOTAL_PCT_AGE_65_AND_OVER"] / 100).round(4)
    df["pct_children_under5"] = (
        df["TOTAL_AGE_0_TO_4"] / df["TOTAL_AGE_GRPS"].replace(0, float("nan"))
    ).round(4)
    df["pct_living_alone"] = (df["TOTAL_PCT_ONE_PERSON_HH"] / 100).round(4)
    df["pct_no_official_lang"] = (df["TOTAL_PCT_NEITHER"] / 100).round(4)
    df["pct_transit_commute"] = (
        df["TOTAL_PUBLIC_TRANSIT"]
        / df["TOTAL_EMP_LABOUR_FORCE_25"].replace(0, float("nan"))
    ).round(4)

    out = df[
        [
            "CTUID",
            "population",
            "median_income",
            "pct_renters",
            "pct_pre1980",
            "pct_low_income",
            "pct_seniors_65plus",
            "pct_children_under5",
            "pct_living_alone",
            "pct_no_official_lang",
            "pct_transit_commute",
        ]
    ].copy()
    logger.info("A2: %d Brampton CTs", len(out))
    return out
