"""Map each CT to a Brampton Secondary Plan Area (neighbourhood name)."""

from __future__ import annotations

import logging

import geopandas as gpd
import pandas as pd

from ._http import get_text
from .sources import BRAMPTON_SPA_URL

logger = logging.getLogger(__name__)


def neighbourhood_map(gdf_ct: gpd.GeoDataFrame) -> pd.Series:
    """Return CTUID-indexed Series of neighbourhood names (default ``Brampton``)."""
    text = get_text(
        BRAMPTON_SPA_URL + "/query",
        params={
            "f": "geojson",
            "where": "1=1",
            "outFields": "SPA_NAME,SPA_NUMBER",
            "returnGeometry": "true",
            "resultRecordCount": 200,
        },
    )
    spa = gpd.read_file(text).to_crs("EPSG:4326")
    spa["SPA_NAME"] = spa["SPA_NAME"].str.strip().str.title()

    # Project to a Canadian equal-area CRS so centroids land in the right place.
    proj = gdf_ct[["CTUID", "geometry"]].to_crs("EPSG:3347").copy()
    pts = gdf_ct[["CTUID", "geometry"]].copy()
    pts["geometry"] = proj.geometry.centroid.to_crs("EPSG:4326").values

    joined = gpd.sjoin(pts, spa[["SPA_NAME", "geometry"]], how="left", predicate="within")
    mapping = joined.groupby("CTUID")["SPA_NAME"].first().fillna("Brampton")
    logger.info("Neighbourhoods: %d named", (mapping != "Brampton").sum())
    return mapping
