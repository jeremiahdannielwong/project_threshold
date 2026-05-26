"""Brampton cooling + warming centres (recreation facilities + libraries)."""

from __future__ import annotations

import logging

import geopandas as gpd
import pandas as pd

from ._http import get_text
from .sources import BRAMPTON_LIB_URL, BRAMPTON_REC_URL

logger = logging.getLogger(__name__)


def _fetch(url: str, label: str) -> gpd.GeoDataFrame:
    text = get_text(
        url + "/query",
        params={
            "f": "geojson",
            "where": "1=1",
            "outFields": "*",
            "returnGeometry": "true",
            "resultRecordCount": 2000,
        },
    )
    gdf = gpd.read_file(text)
    gdf["_source_layer"] = label
    return gdf


def _normalise(gdf_in: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    out = gdf_in[["geometry", "_source_layer"]].copy()
    out["name"] = gdf_in.get("FACILITY_NAME", "")
    out["address"] = gdf_in.get("ADDRESS", "")
    out["type"] = gdf_in.get("TYPE", out["_source_layer"])
    out["website"] = gdf_in.get("WEBSITE", "")
    if "STATUS" in gdf_in.columns:
        out = out[gdf_in["STATUS"] == "ACTIVE"]
    return out


def _role(row: pd.Series) -> str:
    t = str(row["type"]).upper()
    if "ARENA" in t or "ICE" in t:
        return "warming_centre"
    if "LIBRARY" in str(row["_source_layer"]).upper():
        return "cooling_centre"
    return "cooling_and_warming_centre"


def build_facilities() -> gpd.GeoDataFrame:
    """Fetch + normalise the facility set. Caller persists it (DB write)."""
    rec = _fetch(BRAMPTON_REC_URL, "Recreation Centre")
    lib = _fetch(BRAMPTON_LIB_URL, "Library")
    combined = pd.concat([_normalise(rec), _normalise(lib)], ignore_index=True)
    gdf = gpd.GeoDataFrame(combined, geometry="geometry", crs="EPSG:4326")
    gdf["role"] = gdf.apply(_role, axis=1)
    logger.info("Facilities: %d", len(gdf))
    return gdf
