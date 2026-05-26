"""Orchestrator for the Tier A build.

Reads every upstream source, spatially joins them, fits the PCA composite, and
persists the result into Postgres:

  - ``communities``   table  ← scored CT polygons + attributes
  - ``facilities``    table  ← cooling/warming centres
  - ``pca_loadings``  table  ← per-scenario PCA loadings

Run from the backend directory with::

    python -m app.pipeline                                  # uses .env
    THRESHOLD_DATABASE_URL=postgresql+asyncpg://... \\
        python -m app.pipeline

There is no file output. The DB is the system of record; the backend reads
from it at startup.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
from dataclasses import dataclass
from pathlib import Path

import geopandas as gpd
import numpy as np

from .alectra import load_alectra_service_area
from .boundaries import load_ct_boundaries
from .census import load_brampton_census
from .cimd import load_cimd
from .facilities import build_facilities
from .neighbourhoods import neighbourhood_map
from .scoring import risk_level, score_communities

logger = logging.getLogger("threshold.pipeline")

# Tier C columns are placeholders only — read endpoints hydrate them live.
TIER_C_PLACEHOLDERS: dict[str, object] = {
    "temperature_c": np.nan,
    "humidex": np.nan,
    "precipitation_mm": np.nan,
    "wind_speed_kmh": np.nan,
    "wind_gusts_kmh": np.nan,
    "weather_code": np.nan,
    "active_outages": 0,
    "customers_affected": 0,
}


@dataclass
class BuildResult:
    n_communities: int
    n_facilities: int
    n_loadings: int


async def build_all(cache_dir: Path) -> BuildResult:
    """Run the full Tier A pipeline end-to-end and persist into Postgres.

    ``cache_dir`` holds the upstream zip/CSV cache so successive runs are fast.
    It is NOT a publication target — the only consumer of the cache is the
    pipeline itself.
    """
    from ..config import get_settings
    from ..db import Database
    from .db_writer import write_ontology

    settings = get_settings()
    db = Database(settings)
    if not db.enabled:
        raise RuntimeError(
            "Pipeline requires THRESHOLD_DATABASE_URL. Set it (e.g. in backend/.env) "
            "to a postgresql+asyncpg://… DSN and re-run."
        )

    cache_dir.mkdir(parents=True, exist_ok=True)

    logger.info("=== A1 · CT boundaries ===")
    gdf_ct = load_ct_boundaries(cache_dir)

    logger.info("=== A2 · Brampton census ===")
    df_census = load_brampton_census()

    logger.info("=== A3 + A4 · CISV / CISR ===")
    df_cimd = load_cimd(cache_dir)

    logger.info("=== Alectra service area ===")
    gdf_alectra = load_alectra_service_area()

    logger.info("=== Facilities ===")
    gdf_facilities = build_facilities()

    logger.info("=== Joins ===")
    master = gdf_ct.merge(df_census, on="CTUID", how="left").merge(
        df_cimd, on="CTUID", how="left"
    )

    # served_by_alectra: CT centroid within Alectra footprint union
    centroids = master.copy()
    centroids.geometry = centroids.geometry.centroid
    alectra_union = gdf_alectra.geometry.union_all()
    master["served_by_alectra"] = centroids.geometry.within(alectra_union)
    master = master[master["served_by_alectra"]].reset_index(drop=True)
    logger.info("After Alectra clip: %d CTs", len(master))

    # Tier C placeholder columns — backend hydrates these live.
    for col, default in TIER_C_PLACEHOLDERS.items():
        master[col] = default

    logger.info("=== PCA ===")
    scored, loadings = score_communities(master)

    logger.info("=== Brampton filter + neighbourhood map ===")
    brampton_ctuids = set(df_census["CTUID"].astype(str))
    gdf_brampton = scored[scored["CTUID"].astype(str).isin(brampton_ctuids)].copy()
    nbhd = neighbourhood_map(gdf_ct)
    gdf_brampton["neighbourhood"] = gdf_brampton["CTUID"].map(nbhd).fillna("Brampton")
    gdf_brampton["threshold_score"] = gdf_brampton["threshold_score_baseline"]
    gdf_brampton["risk_level"] = gdf_brampton["threshold_score_baseline"].apply(risk_level)

    gdf_brampton = gpd.GeoDataFrame(gdf_brampton, geometry="geometry", crs=gdf_ct.crs)

    logger.info("=== Persisting to Postgres ===")
    await db.connect()
    try:
        counts = await write_ontology(
            db,
            communities=gdf_brampton,
            facilities=gdf_facilities,
            loadings=loadings,
        )
    finally:
        await db.dispose()

    return BuildResult(
        n_communities=counts["communities"],
        n_facilities=counts["facilities"],
        n_loadings=counts["pca_loadings"],
    )


def _parse_args() -> argparse.Namespace:
    from ..config import get_settings  # deferred — backend deps not needed for import

    settings = get_settings()
    p = argparse.ArgumentParser(
        prog="python -m app.pipeline",
        description="Build Tier A artifacts and write them to Postgres.",
    )
    p.add_argument(
        "--cache-dir",
        type=Path,
        default=settings.data_dir,
        help=(
            "Local directory for upstream zip / CSV cache "
            f"(default: {settings.data_dir}). Not an output."
        ),
    )
    p.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="Log DEBUG-level pipeline messages.",
    )
    return p.parse_args()


def main() -> None:
    args = _parse_args()
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    )
    result = asyncio.run(build_all(args.cache_dir))
    logger.info(
        "Done — wrote %d communities, %d facilities, %d loadings to Postgres.",
        result.n_communities,
        result.n_facilities,
        result.n_loadings,
    )


if __name__ == "__main__":
    main()
