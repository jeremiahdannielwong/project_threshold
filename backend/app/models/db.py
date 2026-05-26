"""ORM tables for persisted values.

Two families of tables:

**Ontology** (written by ``app.pipeline``, read by every backend startup):

- ``communities``   — one row per Brampton Census Tract with scored attributes
                      and the CT polygon as GeoJSON.
- ``facilities``    — one row per cooling/warming centre with its point/polygon.
- ``pca_loadings``  — one row per Tier A factor, with the loading under each
                      scenario plus its source slug.

**Live capture** (written by services at request time):

- ``weather_observations`` — one row per fetch from any weather source.
- ``flood_observations``   — one row per CT × Open-Meteo Flood (GloFAS) fetch.
- ``threshold_scores``     — one row per CT × scenario × computation
                             (audit trail; not used as the read path).
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base


class Community(Base):
    """Scored Census Tract — polygon + factor attributes + composite scores."""

    __tablename__ = "communities"

    ctuid: Mapped[str] = mapped_column(String(16), primary_key=True)
    # Every non-geometry attribute the backend serves — keeps the schema
    # immune to factor-set changes.
    properties: Mapped[dict] = mapped_column(JSON, nullable=False)
    # GeoJSON Polygon / MultiPolygon literal. The backend hands this back
    # untouched and computes centroids in Python (see services.data_loader).
    geometry: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    built_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Facility(Base):
    """Cooling / warming centre (recreation centre or library)."""

    __tablename__ = "facilities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    properties: Mapped[dict] = mapped_column(JSON, nullable=False)
    geometry: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    built_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class PcaLoading(Base):
    """PCA factor loading per scenario (one row per factor)."""

    __tablename__ = "pca_loadings"

    factor: Mapped[str] = mapped_column(String(64), primary_key=True)
    loading_baseline: Mapped[float] = mapped_column(Float, default=0.0)
    loading_heatwave: Mapped[float] = mapped_column(Float, default=0.0)
    loading_icestorm: Mapped[float] = mapped_column(Float, default=0.0)
    source_slug: Mapped[str | None] = mapped_column(String(64), nullable=True)
    built_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class WeatherObservation(Base):
    __tablename__ = "weather_observations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Provenance
    source: Mapped[str] = mapped_column(String(64), index=True)
    station_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    station_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    ctuid: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)

    # Location
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)

    # Timing
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    observed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Measurements (all nullable — upstream coverage varies)
    temperature_c: Mapped[float | None] = mapped_column(Float, nullable=True)
    feels_like_c: Mapped[float | None] = mapped_column(Float, nullable=True)
    humidex: Mapped[float | None] = mapped_column(Float, nullable=True)
    dew_point_c: Mapped[float | None] = mapped_column(Float, nullable=True)
    relative_humidity: Mapped[float | None] = mapped_column(Float, nullable=True)
    pressure_hpa: Mapped[float | None] = mapped_column(Float, nullable=True)
    visibility_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    wind_speed_kmh: Mapped[float | None] = mapped_column(Float, nullable=True)
    wind_gusts_kmh: Mapped[float | None] = mapped_column(Float, nullable=True)
    wind_direction_deg: Mapped[float | None] = mapped_column(Float, nullable=True)
    precipitation_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    weather_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weather_description: Mapped[str | None] = mapped_column(String(128), nullable=True)

    # Full upstream JSON for replay/audit.
    raw_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    __table_args__ = (
        Index("ix_weather_source_fetched", "source", "fetched_at"),
        Index("ix_weather_latlon", "latitude", "longitude"),
    )


class FloodObservation(Base):
    """One real-time river discharge fetch from Open-Meteo Flood (GloFAS v4)."""

    __tablename__ = "flood_observations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    source: Mapped[str] = mapped_column(String(64), index=True, default="open-meteo-flood")
    ctuid: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)

    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)

    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    # Date that "today's" discharge value refers to (the GloFAS daily timestamp).
    observed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Discharge at the "today" index of the GloFAS daily series (m³/s).
    river_discharge: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Mean across the past 30 days of observed/reanalysis discharge (m³/s).
    discharge_30d_mean: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Max across the next 7 forecast days (m³/s).
    discharge_7d_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Ratio discharge_7d_max / discharge_30d_mean — real-time anomaly signal.
    discharge_anomaly: Mapped[float | None] = mapped_column(Float, nullable=True)

    raw_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    __table_args__ = (
        Index("ix_flood_ct_fetched", "ctuid", "fetched_at"),
    )


class ThresholdScore(Base):
    __tablename__ = "threshold_scores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    ctuid: Mapped[str] = mapped_column(String(16), index=True)
    scenario_slug: Mapped[str] = mapped_column(String(64), index=True, default="baseline")

    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    score: Mapped[float] = mapped_column(Float)

    # factor_name -> value at the time of computation
    factors: Mapped[dict] = mapped_column(JSON)
    # factor_name -> weight applied (PCA loading or scenario override)
    weights: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    __table_args__ = (
        Index("ix_score_ct_scenario_time", "ctuid", "scenario_slug", "computed_at"),
    )


__all__ = [
    "Community",
    "Facility",
    "FloodObservation",
    "PcaLoading",
    "ThresholdScore",
    "WeatherObservation",
]
