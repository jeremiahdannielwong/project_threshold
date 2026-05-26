"""Stage 3 -- Features.

Joins the three staging tables on CTUID into a single feature table that the
model trains on AND the serving layer reads from.

  staging.census_tracts + staging.vulnerability + staging.ct_geometries
      -> curated.community_features

Only CTs served by Alectra are kept (matches the application's geographic
scope). Pandera enforces the contract on the output frame before write.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

import pandas as pd
from sqlalchemy import text

from .. import schemas
from . import StageResult

logger = logging.getLogger(__name__)


_LOAD_SQL = text(
    """
    SELECT
        c.ctuid,
        c.population,
        c.median_income,
        c.pct_renters,
        c.pct_pre1980,
        c.pct_low_income,
        v.cisv_score,
        v.cisv_dim1,
        v.cisv_dim2,
        v.cisv_dim3,
        v.cisv_dim4,
        v.cisr_score,
        g.neighbourhood,
        g.served_by_alectra,
        g.geometry
    FROM staging.census_tracts c
    LEFT JOIN staging.vulnerability v ON v.ctuid = c.ctuid
    LEFT JOIN staging.ct_geometries g ON g.ctuid = c.ctuid
    """
)


async def run(db: Any) -> StageResult:
    started = time.perf_counter()

    async with db.session() as session:
        rows = (await session.execute(_LOAD_SQL)).mappings().all()
    df = pd.DataFrame([dict(r) for r in rows])

    if df.empty:
        logger.warning("features: staging join is empty")
        return StageResult(name="features", elapsed_seconds=time.perf_counter() - started)

    df["served_by_alectra"] = df["served_by_alectra"].fillna(False).astype(bool)
    before = len(df)
    df = df[df["served_by_alectra"]].copy()
    logger.info(
        "features: %d rows before Alectra clip, %d after", before, len(df)
    )

    # Pandera contract -- fails the stage if anything is malformed.
    df = schemas.CommunityFeatures.validate(df, lazy=True)

    df["geometry_json"] = df["geometry"].apply(
        lambda g: json.dumps(g) if g is not None else None
    )
    df = df.where(df.notnull(), None)

    insert_rows = df[[
        "ctuid",
        "population",
        "median_income",
        "pct_renters",
        "pct_pre1980",
        "pct_low_income",
        "cisv_score",
        "cisv_dim1",
        "cisv_dim2",
        "cisv_dim3",
        "cisv_dim4",
        "cisr_score",
        "neighbourhood",
        "served_by_alectra",
        "geometry_json",
    ]].rename(columns={"geometry_json": "geometry"}).to_dict(orient="records")

    insert_sql = text(
        """
        INSERT INTO curated.community_features
            (ctuid, population, median_income, pct_renters, pct_pre1980,
             pct_low_income, cisv_score, cisv_dim1, cisv_dim2, cisv_dim3,
             cisv_dim4, cisr_score, neighbourhood, served_by_alectra, geometry)
        VALUES
            (:ctuid, :population, :median_income, :pct_renters, :pct_pre1980,
             :pct_low_income, :cisv_score, :cisv_dim1, :cisv_dim2, :cisv_dim3,
             :cisv_dim4, :cisr_score, :neighbourhood, :served_by_alectra,
             CAST(:geometry AS JSONB))
        """
    )
    async with db.session() as session:
        await session.execute(text("TRUNCATE TABLE curated.community_features"))
        if insert_rows:
            await session.execute(insert_sql, insert_rows)
        await session.commit()

    elapsed = time.perf_counter() - started
    logger.info("features: wrote %d rows in %.2fs", len(insert_rows), elapsed)
    return StageResult(
        name="features",
        rows_written=len(insert_rows),
        elapsed_seconds=elapsed,
        details={"clip": "alectra"},
    )
