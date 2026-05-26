"""A1 -- StatsCan 2021 Census Tract cartographic boundaries.

Downloads the national shapefile once, filters to the two CMAs we serve
(Toronto 535 + Hamilton 537) within Ontario, and reprojects to EPSG:4326.
"""

from __future__ import annotations

import logging
from pathlib import Path

import geopandas as gpd

from ._http import download_and_extract_zip
from .urls import CT_BOUNDARIES_URL, TARGET_CMA_CODES, TARGET_PROVINCE_PRUID

logger = logging.getLogger(__name__)


def load_ct_boundaries(cache_dir: Path) -> gpd.GeoDataFrame:
    """Return CTs in scope, projected to WGS84.

    The shapefile is national (~5500 CTs). Filtering on CMA + PRUID drops it
    to ~370 -- enough to cover Alectra's footprint with headroom.
    """
    extract_dir = cache_dir / "ct_boundaries"
    download_and_extract_zip(CT_BOUNDARIES_URL, extract_dir)
    shp_paths = list(extract_dir.glob("*.shp"))
    if not shp_paths:
        raise FileNotFoundError(f"No .shp found in {extract_dir}")

    gdf = gpd.read_file(shp_paths[0])
    gdf["cma_code"] = gdf["CTUID"].astype(str).str[:3]
    gdf = gdf[
        gdf["cma_code"].isin(TARGET_CMA_CODES)
        & (gdf["PRUID"].astype(str) == TARGET_PROVINCE_PRUID)
    ].copy()
    gdf = gdf.to_crs("EPSG:4326").reset_index(drop=True)

    if len(gdf) < 350:
        raise RuntimeError(
            f"Expected >=350 CTs after CMA filter, got {len(gdf)}. "
            "Upstream shapefile may have changed."
        )
    logger.info("A1: %d CTs in scope (CMAs %s)", len(gdf), TARGET_CMA_CODES)
    return gdf
