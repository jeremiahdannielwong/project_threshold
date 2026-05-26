"""Write helpers for the two persisted entities.

Callers (the weather fetcher, the scoring service) hand in plain dicts /
floats; this module owns the ORM details and the "DB disabled" branch so the
rest of the codebase doesn't have to care whether Postgres is wired up.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Iterable

from sqlalchemy import select

from ..db import Database
from ..models.db import FloodObservation, ThresholdScore, WeatherObservation

logger = logging.getLogger(__name__)


class PersistenceService:
    def __init__(self, db: Database) -> None:
        self._db = db

    @property
    def enabled(self) -> bool:
        return self._db.enabled

    async def record_weather(
        self,
        *,
        source: str,
        latitude: float,
        longitude: float,
        station_id: str | None = None,
        station_name: str | None = None,
        ctuid: str | None = None,
        observed_at: datetime | None = None,
        temperature_c: float | None = None,
        feels_like_c: float | None = None,
        humidex: float | None = None,
        dew_point_c: float | None = None,
        relative_humidity: float | None = None,
        pressure_hpa: float | None = None,
        visibility_km: float | None = None,
        wind_speed_kmh: float | None = None,
        wind_gusts_kmh: float | None = None,
        wind_direction_deg: float | None = None,
        precipitation_mm: float | None = None,
        weather_code: int | None = None,
        weather_description: str | None = None,
        raw_payload: dict[str, Any] | None = None,
    ) -> int | None:
        """Insert a single weather observation. Returns row id (or None if DB off)."""
        if not self._db.enabled:
            return None
        row = WeatherObservation(
            source=source,
            station_id=station_id,
            station_name=station_name,
            ctuid=ctuid,
            latitude=latitude,
            longitude=longitude,
            observed_at=observed_at,
            temperature_c=temperature_c,
            feels_like_c=feels_like_c,
            humidex=humidex,
            dew_point_c=dew_point_c,
            relative_humidity=relative_humidity,
            pressure_hpa=pressure_hpa,
            visibility_km=visibility_km,
            wind_speed_kmh=wind_speed_kmh,
            wind_gusts_kmh=wind_gusts_kmh,
            wind_direction_deg=wind_direction_deg,
            precipitation_mm=precipitation_mm,
            weather_code=weather_code,
            weather_description=weather_description,
            raw_payload=raw_payload,
        )
        async with self._db.session() as session:
            session.add(row)
            await session.commit()
            await session.refresh(row)
            return row.id

    async def record_weather_batch(
        self, rows: Iterable[dict[str, Any]]
    ) -> int:
        """Bulk insert. Each dict must match ``record_weather`` kwargs. Returns count."""
        if not self._db.enabled:
            return 0
        orm_rows = [WeatherObservation(**r) for r in rows]
        if not orm_rows:
            return 0
        async with self._db.session() as session:
            session.add_all(orm_rows)
            await session.commit()
            return len(orm_rows)

    async def record_flood(
        self,
        *,
        latitude: float,
        longitude: float,
        source: str = "open-meteo-flood",
        ctuid: str | None = None,
        observed_at: datetime | None = None,
        river_discharge: float | None = None,
        discharge_30d_mean: float | None = None,
        discharge_7d_max: float | None = None,
        discharge_anomaly: float | None = None,
        raw_payload: dict[str, Any] | None = None,
    ) -> int | None:
        """Insert a single river-discharge observation. Returns row id (or None if DB off)."""
        if not self._db.enabled:
            return None
        row = FloodObservation(
            source=source,
            ctuid=ctuid,
            latitude=latitude,
            longitude=longitude,
            observed_at=observed_at,
            river_discharge=river_discharge,
            discharge_30d_mean=discharge_30d_mean,
            discharge_7d_max=discharge_7d_max,
            discharge_anomaly=discharge_anomaly,
            raw_payload=raw_payload,
        )
        async with self._db.session() as session:
            session.add(row)
            await session.commit()
            await session.refresh(row)
            return row.id

    async def record_flood_batch(self, rows: Iterable[dict[str, Any]]) -> int:
        """Bulk insert. Each dict must match ``record_flood`` kwargs. Returns count."""
        if not self._db.enabled:
            return 0
        orm_rows = [FloodObservation(**r) for r in rows]
        if not orm_rows:
            return 0
        async with self._db.session() as session:
            session.add_all(orm_rows)
            await session.commit()
            return len(orm_rows)

    async def recent_flood(
        self, *, ctuid: str | None = None, limit: int = 100
    ) -> list[FloodObservation]:
        if not self._db.enabled:
            return []
        stmt = select(FloodObservation).order_by(FloodObservation.fetched_at.desc()).limit(limit)
        if ctuid is not None:
            stmt = stmt.where(FloodObservation.ctuid == ctuid)
        async with self._db.session() as session:
            result = await session.execute(stmt)
            return list(result.scalars().all())

    async def record_score(
        self,
        *,
        ctuid: str,
        score: float,
        factors: dict[str, float],
        weights: dict[str, float] | None = None,
        scenario_slug: str = "baseline",
    ) -> int | None:
        if not self._db.enabled:
            return None
        row = ThresholdScore(
            ctuid=ctuid,
            scenario_slug=scenario_slug,
            score=score,
            factors=factors,
            weights=weights,
        )
        async with self._db.session() as session:
            session.add(row)
            await session.commit()
            await session.refresh(row)
            return row.id

    async def latest_score(
        self, ctuid: str, scenario_slug: str = "baseline"
    ) -> ThresholdScore | None:
        if not self._db.enabled:
            return None
        stmt = (
            select(ThresholdScore)
            .where(
                ThresholdScore.ctuid == ctuid,
                ThresholdScore.scenario_slug == scenario_slug,
            )
            .order_by(ThresholdScore.computed_at.desc())
            .limit(1)
        )
        async with self._db.session() as session:
            result = await session.execute(stmt)
            return result.scalar_one_or_none()

    async def recent_weather(
        self, *, source: str | None = None, limit: int = 100
    ) -> list[WeatherObservation]:
        if not self._db.enabled:
            return []
        stmt = select(WeatherObservation).order_by(WeatherObservation.fetched_at.desc()).limit(limit)
        if source is not None:
            stmt = stmt.where(WeatherObservation.source == source)
        async with self._db.session() as session:
            result = await session.execute(stmt)
            return list(result.scalars().all())


__all__ = ["PersistenceService"]
