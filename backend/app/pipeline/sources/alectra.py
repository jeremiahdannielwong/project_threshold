"""Alectra service-area polygon -- used to clip CTs to the utility's footprint."""

from __future__ import annotations

import io
import logging

import geopandas as gpd

from ._http import get_json, get_text
from .urls import ALECTRA_ITEM_URL

logger = logging.getLogger(__name__)


def load_alectra_service_area() -> gpd.GeoDataFrame:
    meta = get_json(ALECTRA_ITEM_URL)
    service_url = (meta.get("url") or "").rstrip("/")
    if not service_url:
        raise RuntimeError("Could not resolve Alectra service URL from item metadata")

    text = get_text(
        f"{service_url}/0/query",
        params={
            "f": "geojson",
            "where": "1=1",
            "outFields": "*",
            "returnGeometry": "true",
        },
    )
    gdf = gpd.read_file(io.StringIO(text)).to_crs("EPSG:4326")
    logger.info("Alectra service area: %d polygon(s)", len(gdf))
    return gdf
