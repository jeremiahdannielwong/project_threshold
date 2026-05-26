"""Stage 1 -- Ingest.

Pulls each upstream source via the loaders in ``pipeline.sources`` and lands
the result as one row per fetch in the ``raw.*`` tables. Nothing is parsed or
joined here -- the payload is stored verbatim so any future schema change
is recoverable from history.

Outputs:
  raw.census_2021
  raw.cisv_cisr_2021
  raw.alectra_service_area
  raw.ct_boundaries
  raw.facilities
  raw.neighbourhoods
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any

import geopandas as gpd
import pandas as pd
from sqlalchemy import text

from ..config import FACTOR_COLS  # noqa: F401  (referenced via __all__)
from ..sources import (
    build_facilities,
    load_alectra_service_area,
    load_brampton_census,
    load_cimd,
    load_ct_boundaries,
)
from ..sources.urls import (
    ALECTRA_ITEM_URL,
    BRAMPTON_CENSUS_FS,
    BRAMPTON_LIB_URL,
    BRAMPTON_REC_URL,
    BRAMPTON_SPA_URL,
    CISV_URL,
    CT_BOUNDARIES_URL,
    SOURCE_SLUGS,
)
from . import StageResult

logger = logging.getLogger(__name__)


async def _insert_raw(
    db: Any,
    *,
    table: str,
    source_slug: str,
    source_url: str,
    payload: list[dict] | dict | None = None,
    payload_bytes: bytes | None = None,
    row_count: int | None = None,
    notes: str | None = None,
) -> None:
    sql = text(
        f"""
        INSERT INTO raw.{table}
            (source_slug, source_url, payload, payload_bytes, row_count, notes)
        VALUES (:slug, :url, CAST(:payload AS JSONB), :bytes, :rows, :notes)
        """
    )
    payload_json = json.dumps(payload) if payload is not None else None
    async with db.session() as session:
        await session.execute(
            sql,
            {
                "slug": source_slug,
                "url": source_url,
                "payload": payload_json,
                "bytes": payload_bytes,
                "rows": row_count,
                "notes": notes,
            },
        )
        await session.commit()


def _records(obj: pd.DataFrame | gpd.GeoDataFrame) -> list[dict]:
    """JSON-safe records: geometries -> GeoJSON dicts, NaN -> None."""
    if isinstance(obj, gpd.GeoDataFrame):
        df = obj.copy()
        geom_col = df.geometry.name
        df[geom_col] = df.geometry.apply(
            lambda g: g.__geo_interface__ if g is not None else None
        )
        plain = pd.DataFrame(df.drop(columns=[]))
    else:
        plain = obj.copy()
    plain = plain.where(plain.notnull(), None)
    return json.loads(plain.to_json(orient="records", date_format="iso"))


async def run(db: Any, *, cache_dir: Path) -> StageResult:
    started = time.perf_counter()
    cache_dir.mkdir(parents=True, exist_ok=True)
    details: dict[str, int] = {}

    logger.info("ingest: A1 CT boundaries")
    gdf_ct = load_ct_boundaries(cache_dir)
    await _insert_raw(
        db,
        table="ct_boundaries",
        source_slug=SOURCE_SLUGS["ct_boundaries"],
        source_url=CT_BOUNDARIES_URL,
        payload=_records(gdf_ct),
        row_count=len(gdf_ct),
    )
    details["ct_boundaries"] = len(gdf_ct)

    logger.info("ingest: A2 Brampton census")
    df_census = load_brampton_census()
    await _insert_raw(
        db,
        table="census_2021",
        source_slug=SOURCE_SLUGS["census_2021"],
        source_url=BRAMPTON_CENSUS_FS,
        payload=_records(df_census),
        row_count=len(df_census),
    )
    details["census_2021"] = len(df_census)

    logger.info("ingest: A3/A4 CISV + CISR")
    df_cimd = load_cimd(cache_dir)
    await _insert_raw(
        db,
        table="cisv_cisr_2021",
        source_slug=SOURCE_SLUGS["cisv_cisr_2021"],
        source_url=CISV_URL,
        payload=_records(df_cimd),
        row_count=len(df_cimd),
    )
    details["cisv_cisr_2021"] = len(df_cimd)

    logger.info("ingest: Alectra service area")
    gdf_alectra = load_alectra_service_area()
    await _insert_raw(
        db,
        table="alectra_service_area",
        source_slug=SOURCE_SLUGS["alectra_service_area"],
        source_url=ALECTRA_ITEM_URL,
        payload=_records(gdf_alectra),
        row_count=len(gdf_alectra),
    )
    details["alectra_service_area"] = len(gdf_alectra)

    logger.info("ingest: facilities")
    gdf_facilities = build_facilities()
    await _insert_raw(
        db,
        table="facilities",
        source_slug=SOURCE_SLUGS["facilities"],
        source_url=f"{BRAMPTON_REC_URL} + {BRAMPTON_LIB_URL}",
        payload=_records(gdf_facilities),
        row_count=len(gdf_facilities),
    )
    details["facilities"] = len(gdf_facilities)

    logger.info("ingest: neighbourhoods")
    # Neighbourhoods are derived from CT geometry via SPA spatial join. Stash
    # the SPA polygon set here so ``clean`` can replay the join offline.
    from ..sources._http import get_text

    spa_geojson = get_text(
        BRAMPTON_SPA_URL + "/query",
        params={
            "f": "geojson",
            "where": "1=1",
            "outFields": "SPA_NAME,SPA_NUMBER",
            "returnGeometry": "true",
            "resultRecordCount": 200,
        },
    )
    await _insert_raw(
        db,
        table="neighbourhoods",
        source_slug=SOURCE_SLUGS["neighbourhoods"],
        source_url=BRAMPTON_SPA_URL,
        payload=json.loads(spa_geojson),
        row_count=None,
    )
    details["neighbourhoods"] = 1

    elapsed = time.perf_counter() - started
    total = sum(details.values())
    logger.info("ingest: done in %.2fs, %d total records", elapsed, total)
    return StageResult(
        name="ingest",
        rows_written=total,
        elapsed_seconds=elapsed,
        details=details,
    )
