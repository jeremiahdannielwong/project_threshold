"""Stage 2 -- Clean.

Reads the most recent payload from each ``raw.*`` table, casts types, dedupes,
validates against the Pandera schemas, and writes to ``staging.*``.

This stage is pure: no upstream HTTP calls. Re-running it is cheap and gives
a fresh staging snapshot for downstream stages to build on.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

import geopandas as gpd
import pandas as pd
from shapely.geometry import shape
from sqlalchemy import text

from .. import schemas
from . import StageResult

logger = logging.getLogger(__name__)


async def _latest_raw(db: Any, table: str) -> dict | None:
    sql = text(
        f"""
        SELECT payload, payload_bytes, row_count, load_at
        FROM raw.{table}
        ORDER BY load_at DESC
        LIMIT 1
        """
    )
    async with db.session() as session:
        row = (await session.execute(sql)).mappings().first()
    return dict(row) if row else None


async def _replace_staging(
    db: Any, *, table: str, df: pd.DataFrame, columns: list[str]
) -> int:
    """Atomically replace ``staging.<table>`` with ``df``."""
    if df.empty:
        logger.warning("clean: %s is empty, skipping", table)
        return 0

    df = df.where(df.notnull(), None)
    rows = df[columns].to_dict(orient="records")
    placeholders = ", ".join(f":{c}" for c in columns)
    cols_csv = ", ".join(columns)
    insert_sql = text(
        f"INSERT INTO staging.{table} ({cols_csv}) VALUES ({placeholders})"
    )
    async with db.session() as session:
        await session.execute(text(f"TRUNCATE TABLE staging.{table}"))
        if rows:
            await session.execute(insert_sql, rows)
        await session.commit()
    return len(rows)


def _payload_to_df(payload: Any) -> pd.DataFrame:
    if payload is None:
        return pd.DataFrame()
    if isinstance(payload, str):
        payload = json.loads(payload)
    return pd.DataFrame(payload)


async def _clean_census(db: Any) -> int:
    raw = await _latest_raw(db, "census_2021")
    if not raw:
        logger.warning("clean: no raw.census_2021 row")
        return 0
    df = _payload_to_df(raw["payload"])
    df = df.rename(columns={"CTUID": "ctuid"})
    df["ctuid"] = df["ctuid"].astype(str)
    df = df.drop_duplicates(subset=["ctuid"])
    df = schemas.CensusTractStaging.validate(df, lazy=True)
    return await _replace_staging(
        db,
        table="census_tracts",
        df=df,
        columns=[
            "ctuid",
            "population",
            "median_income",
            "pct_renters",
            "pct_pre1980",
            "pct_low_income",
        ],
    )


async def _clean_vulnerability(db: Any) -> int:
    raw = await _latest_raw(db, "cisv_cisr_2021")
    if not raw:
        logger.warning("clean: no raw.cisv_cisr_2021 row")
        return 0
    df = _payload_to_df(raw["payload"])
    df = df.rename(columns={"CTUID": "ctuid"})
    df["ctuid"] = df["ctuid"].astype(str)
    df = df.drop_duplicates(subset=["ctuid"])
    df = schemas.VulnerabilityStaging.validate(df, lazy=True)
    return await _replace_staging(
        db,
        table="vulnerability",
        df=df,
        columns=[
            "ctuid",
            "cisv_score",
            "cisv_dim1",
            "cisv_dim2",
            "cisv_dim3",
            "cisv_dim4",
            "cisr_score",
        ],
    )


async def _clean_geometries(db: Any) -> int:
    raw_ct = await _latest_raw(db, "ct_boundaries")
    raw_alectra = await _latest_raw(db, "alectra_service_area")
    raw_nbhd = await _latest_raw(db, "neighbourhoods")
    if not raw_ct:
        logger.warning("clean: no raw.ct_boundaries row")
        return 0

    ct_df = _payload_to_df(raw_ct["payload"])
    ct_df["ctuid"] = ct_df["CTUID"].astype(str)
    ct_df["pruid"] = ct_df.get("PRUID", "").astype(str)
    ct_df["cma_code"] = ct_df["ctuid"].str[:3]
    ct_df["geometry_obj"] = ct_df["geometry"].apply(
        lambda g: shape(g) if g is not None else None
    )
    gdf_ct = gpd.GeoDataFrame(ct_df, geometry="geometry_obj", crs="EPSG:4326")

    served = pd.Series(False, index=gdf_ct.index)
    if raw_alectra:
        alectra_df = _payload_to_df(raw_alectra["payload"])
        alectra_df["geometry_obj"] = alectra_df["geometry"].apply(
            lambda g: shape(g) if g is not None else None
        )
        gdf_alectra = gpd.GeoDataFrame(
            alectra_df, geometry="geometry_obj", crs="EPSG:4326"
        )
        union = gdf_alectra.geometry.union_all()
        centroids = gdf_ct.geometry.centroid
        served = centroids.within(union)

    neighbourhood = pd.Series("Brampton", index=gdf_ct.index)
    if raw_nbhd:
        spa_geojson = raw_nbhd["payload"]
        if isinstance(spa_geojson, str):
            spa_geojson = json.loads(spa_geojson)
        spa_features = spa_geojson.get("features", []) if isinstance(spa_geojson, dict) else []
        if spa_features:
            spa_df = pd.DataFrame(
                [
                    {
                        "SPA_NAME": (f.get("properties") or {}).get("SPA_NAME", ""),
                        "geometry_obj": shape(f["geometry"]) if f.get("geometry") else None,
                    }
                    for f in spa_features
                ]
            )
            spa_df["SPA_NAME"] = spa_df["SPA_NAME"].fillna("").str.strip().str.title()
            spa_gdf = gpd.GeoDataFrame(spa_df, geometry="geometry_obj", crs="EPSG:4326")
            proj_ct = gdf_ct.to_crs("EPSG:3347")
            pts = gdf_ct.copy()
            pts["geometry_obj"] = proj_ct.geometry.centroid.to_crs("EPSG:4326").values
            joined = gpd.sjoin(pts, spa_gdf[["SPA_NAME", "geometry_obj"]], how="left", predicate="within")
            neighbourhood = joined.groupby(joined.index)["SPA_NAME"].first().fillna("Brampton")

    out_rows = []
    for idx, row in gdf_ct.iterrows():
        geom = row["geometry_obj"]
        out_rows.append(
            {
                "ctuid": row["ctuid"],
                "cma_code": row.get("cma_code"),
                "pruid": row.get("pruid"),
                "geometry": json.dumps(geom.__geo_interface__) if geom is not None else None,
                "neighbourhood": neighbourhood.get(idx, "Brampton"),
                "served_by_alectra": bool(served.get(idx, False)),
            }
        )

    insert_sql = text(
        """
        INSERT INTO staging.ct_geometries
            (ctuid, cma_code, pruid, geometry, neighbourhood, served_by_alectra)
        VALUES (:ctuid, :cma_code, :pruid, CAST(:geometry AS JSONB),
                :neighbourhood, :served_by_alectra)
        """
    )
    async with db.session() as session:
        await session.execute(text("TRUNCATE TABLE staging.ct_geometries"))
        if out_rows:
            await session.execute(insert_sql, out_rows)
        await session.commit()
    return len(out_rows)


async def _clean_facilities(db: Any) -> int:
    raw = await _latest_raw(db, "facilities")
    if not raw:
        logger.warning("clean: no raw.facilities row")
        return 0
    df = _payload_to_df(raw["payload"])
    rows = []
    for _, r in df.iterrows():
        geom = r.get("geometry")
        if isinstance(geom, dict):
            geom_json = json.dumps(geom)
        elif isinstance(geom, str):
            geom_json = geom
        else:
            continue
        rows.append(
            {
                "name": r.get("name") or None,
                "address": r.get("address") or None,
                "type": r.get("type") or None,
                "role": r.get("role") or None,
                "website": r.get("website") or None,
                "source_layer": r.get("_source_layer") or None,
                "geometry": geom_json,
            }
        )
    insert_sql = text(
        """
        INSERT INTO staging.facilities
            (name, address, type, role, website, source_layer, geometry)
        VALUES (:name, :address, :type, :role, :website, :source_layer,
                CAST(:geometry AS JSONB))
        """
    )
    async with db.session() as session:
        await session.execute(text("TRUNCATE TABLE staging.facilities"))
        if rows:
            await session.execute(insert_sql, rows)
        await session.commit()
    return len(rows)


async def run(db: Any) -> StageResult:
    started = time.perf_counter()
    details = {
        "census_tracts": await _clean_census(db),
        "vulnerability": await _clean_vulnerability(db),
        "ct_geometries": await _clean_geometries(db),
        "facilities": await _clean_facilities(db),
    }
    elapsed = time.perf_counter() - started
    total = sum(details.values())
    logger.info("clean: done in %.2fs, %d rows", elapsed, total)
    return StageResult(
        name="clean",
        rows_written=total,
        elapsed_seconds=elapsed,
        details=details,
    )
