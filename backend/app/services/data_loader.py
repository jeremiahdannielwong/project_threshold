"""Load Tier A ontology from Postgres into an in-memory ``DataStore``.

The pipeline (``python -m app.pipeline``) is the only writer. The backend reads
once at startup and serves from memory — fast point lookups, no per-request DB
round-trip — but the database remains the system of record.

If the DB is disabled (no ``THRESHOLD_DATABASE_URL``) or its tables are empty,
the store boots empty with a clear warning. There is no file fallback.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from sqlalchemy import select

from ..db import Database

logger = logging.getLogger(__name__)

# Factors that feed the PCA. Order matches the radar chart, recommendation
# engine, and briefing prompt so they all agree.
PCA_FACTORS: tuple[str, ...] = (
    "cisv_score",
    "cisv_dim1",
    "cisv_dim2",
    "cisv_dim3",
    "cisv_dim4",
    "cisr_score",
    "pct_renters",
    "pct_pre1980",
    "humidex",
    "median_income",
)

FACTOR_DIRECTION: dict[str, str] = {
    "cisv_score": "vulnerable",
    "cisv_dim1": "vulnerable",
    "cisv_dim2": "vulnerable",
    "cisv_dim3": "vulnerable",
    "cisv_dim4": "vulnerable",
    "pct_renters": "vulnerable",
    "pct_pre1980": "vulnerable",
    "humidex": "vulnerable",
    "cisr_score": "resilient",
    "median_income": "resilient",
}

FACTOR_LABELS: dict[str, str] = {
    "cisv_score": "Social Vulnerability (CISV)",
    "cisv_dim1": "CISV · Racialized & Immigrant Pop.",
    "cisv_dim2": "CISV · Income & Labour Market",
    "cisv_dim3": "CISV · Education & Indigenous Id.",
    "cisv_dim4": "CISV · Dwelling Conditions",
    "cisr_score": "Social Resilience (CISR)",
    "pct_renters": "Renter Households (%)",
    "pct_pre1980": "Pre-1980 Dwellings (%)",
    "humidex": "Humidex (°C)",
    "median_income": "Median Household Income (CAD)",
}


@dataclass
class CommunityRecord:
    """One Census Tract row from the ``communities`` table."""

    ctuid: str
    properties: dict
    geometry: dict | None = None


@dataclass
class FactorLoading:
    name: str
    loading_baseline: float
    loading_heatwave: float
    loading_icestorm: float


@dataclass
class DataStore:
    """In-memory ontology served to every read endpoint."""

    communities: dict[str, CommunityRecord] = field(default_factory=dict)
    facilities: list[dict] = field(default_factory=list)
    loadings: dict[str, FactorLoading] = field(default_factory=dict)
    loaded_at: str | None = None

    def get(self, ctuid: str) -> CommunityRecord | None:
        return self.communities.get(_normalise_ctuid(ctuid))

    def list(self) -> list[CommunityRecord]:
        return list(self.communities.values())

    def centroids(self) -> list[tuple[str, float, float]]:
        """Return (ctuid, lon, lat) per CT for outbound weather fetches."""
        out: list[tuple[str, float, float]] = []
        for rec in self.communities.values():
            if not rec.geometry:
                continue
            try:
                lon, lat = _polygon_centroid(rec.geometry)
            except ValueError:
                continue
            out.append((rec.ctuid, lon, lat))
        return out


async def load_data_store(db: Database) -> DataStore:
    """Query the three ontology tables and assemble a ``DataStore``.

    Returns an empty store (with a warning) when the DB is disabled or the
    tables haven't been populated yet — the backend keeps booting either way.
    """
    from datetime import datetime, timezone

    store = DataStore(loaded_at=datetime.now(timezone.utc).isoformat())

    if not db.enabled:
        logger.warning(
            "THRESHOLD_DATABASE_URL not set — backend booting with an empty store. "
            "Set the DSN and run `python -m app.pipeline` to populate."
        )
        return store

    # Local import avoids a circular at module import time (db.connect imports
    # models lazily; this module is imported by routes which are imported by
    # main which sets up the db first).
    from ..models.db import Community, Facility, PcaLoading

    async with db.session() as session:
        community_rows = (await session.execute(select(Community))).scalars().all()
        facility_rows = (await session.execute(select(Facility))).scalars().all()
        loading_rows = (await session.execute(select(PcaLoading))).scalars().all()

    if not community_rows:
        logger.warning(
            "communities table is empty — backend will serve empty community list. "
            "Run `python -m app.pipeline` to populate."
        )

    for row in community_rows:
        ctuid = _normalise_ctuid(row.ctuid)
        props = dict(row.properties or {})
        props.setdefault("ctuid", ctuid)
        store.communities[ctuid] = CommunityRecord(
            ctuid=ctuid,
            properties=props,
            geometry=row.geometry,
        )

    for row in facility_rows:
        props = dict(row.properties or {})
        store.facilities.append(
            {
                "type": "Feature",
                "geometry": row.geometry,
                "properties": props,
            }
        )

    for row in loading_rows:
        store.loadings[row.factor] = FactorLoading(
            name=row.factor,
            loading_baseline=row.loading_baseline or 0.0,
            loading_heatwave=row.loading_heatwave or 0.0,
            loading_icestorm=row.loading_icestorm or 0.0,
        )

    logger.info(
        "DataStore loaded from Postgres — %d communities, %d facilities, %d loadings",
        len(store.communities),
        len(store.facilities),
        len(store.loadings),
    )
    return store


def _normalise_ctuid(value: str | float) -> str:
    """CTUIDs come in as either '5350528.20' or 5350528.20. Normalise to str."""
    if isinstance(value, float):
        return f"{value:.2f}"
    return str(value).strip()


def _polygon_centroid(geometry: dict) -> tuple[float, float]:
    """Mean-of-vertices centroid. Good enough for per-CT weather lookups.

    Real spatial centroids belong in the pipeline; here we just need a query
    point inside the polygon's bounding region.
    """
    geom_type = geometry.get("type")
    coords = geometry.get("coordinates")
    if not coords:
        raise ValueError("empty geometry")

    if geom_type == "Polygon":
        ring = coords[0]
    elif geom_type == "MultiPolygon":
        ring = coords[0][0]
    else:
        raise ValueError(f"unsupported geometry: {geom_type!r}")

    xs = [pt[0] for pt in ring]
    ys = [pt[1] for pt in ring]
    return sum(xs) / len(xs), sum(ys) / len(ys)
