"""Persist Tier A build results into Postgres.

Writes are wrapped in a single transaction per table: ``DELETE FROM`` then bulk
``INSERT``. This gives readers a clean before/after — they either see the
previous build or the new one, never a half-rewritten table.

NaN floats are converted to ``None`` before insert because JSON does not have a
NaN literal and asyncpg would reject the value.
"""

from __future__ import annotations

import logging
import math
from typing import Any, Iterable

import geopandas as gpd
import pandas as pd
from sqlalchemy import delete

from ..db import Database
from ..models.db import Community, Facility, PcaLoading

logger = logging.getLogger(__name__)


def _clean(value: Any) -> Any:
    """JSON-safe coerce: NaN/inf -> None, numpy scalars -> Python primitives."""
    if value is None:
        return None
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return value
    # numpy scalar types expose .item()
    item = getattr(value, "item", None)
    if callable(item):
        try:
            v = item()
        except (ValueError, TypeError):
            return value
        return _clean(v)
    return value


def _row_to_props(row: pd.Series, drop: set[str]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for col, val in row.items():
        if col in drop:
            continue
        out[col] = _clean(val)
    return out


async def write_ontology(
    db: Database,
    *,
    communities: gpd.GeoDataFrame,
    facilities: gpd.GeoDataFrame,
    loadings: pd.DataFrame,
) -> dict[str, int]:
    """Persist the three Tier A artifacts. Returns row counts."""
    if not db.enabled:
        raise RuntimeError(
            "Pipeline requires THRESHOLD_DATABASE_URL — there is nowhere to write to."
        )

    community_rows = list(_iter_communities(communities))
    facility_rows = list(_iter_facilities(facilities))
    loading_rows = list(_iter_loadings(loadings))

    async with db.session() as session:
        # Single transaction across all three tables so readers never see a
        # partial update.
        await session.execute(delete(Community))
        await session.execute(delete(Facility))
        await session.execute(delete(PcaLoading))
        if community_rows:
            session.add_all([Community(**r) for r in community_rows])
        if facility_rows:
            session.add_all([Facility(**r) for r in facility_rows])
        if loading_rows:
            session.add_all([PcaLoading(**r) for r in loading_rows])
        await session.commit()

    counts = {
        "communities": len(community_rows),
        "facilities": len(facility_rows),
        "pca_loadings": len(loading_rows),
    }
    logger.info("Pipeline wrote: %s", counts)
    return counts


def _iter_communities(gdf: gpd.GeoDataFrame) -> Iterable[dict[str, Any]]:
    geometry_col = gdf.geometry.name
    drop = {geometry_col, "CTUID"}
    geo_series = gdf.geometry
    for idx, row in gdf.iterrows():
        ctuid = str(row["CTUID"])
        geom = geo_series.iloc[idx].__geo_interface__ if geo_series.iloc[idx] is not None else None
        yield {
            "ctuid": ctuid,
            "properties": _row_to_props(row, drop),
            "geometry": geom,
        }


def _iter_facilities(gdf: gpd.GeoDataFrame) -> Iterable[dict[str, Any]]:
    geometry_col = gdf.geometry.name
    drop = {geometry_col}
    geo_series = gdf.geometry
    for idx, row in gdf.iterrows():
        geom = geo_series.iloc[idx].__geo_interface__ if geo_series.iloc[idx] is not None else None
        yield {
            "properties": _row_to_props(row, drop),
            "geometry": geom,
        }


def _iter_loadings(df: pd.DataFrame) -> Iterable[dict[str, Any]]:
    for _, row in df.iterrows():
        yield {
            "factor": str(row["factor"]),
            "loading_baseline": _clean(row.get("loading_baseline", 0.0)) or 0.0,
            "loading_heatwave": _clean(row.get("loading_heatwave", 0.0)) or 0.0,
            "loading_icestorm": _clean(row.get("loading_icestorm", 0.0)) or 0.0,
            "source_slug": (row.get("source_slug") or None),
        }
