"""Tests for the opt-in persistence layer.

Two surfaces:
- ``Database`` (engine wrapper) — should report ``enabled=False`` and not
  attempt any network connection when ``THRESHOLD_DATABASE_URL`` is unset.
- ``PersistenceService`` — every write/read helper must short-circuit cleanly
  when the DB is disabled (returns ``None`` / empty list, never raises).

The "enabled" path is exercised end-to-end against the docker-compose Postgres
in a separate integration step; this file stays unit-test-fast and offline.
"""

from __future__ import annotations

import pytest

from app.config import Settings
from app.db import Database
from app.services.persistence import PersistenceService


@pytest.fixture
def disabled_db() -> Database:
    return Database(Settings(THRESHOLD_DATABASE_URL=None))


@pytest.fixture
def persistence(disabled_db: Database) -> PersistenceService:
    return PersistenceService(disabled_db)


def test_database_disabled_when_url_unset(disabled_db: Database) -> None:
    assert disabled_db.enabled is False


@pytest.mark.anyio
async def test_connect_is_noop_when_disabled(disabled_db: Database) -> None:
    # Must not raise and must not flip enabled to True.
    await disabled_db.connect()
    assert disabled_db.enabled is False


@pytest.mark.anyio
async def test_session_raises_when_disabled(disabled_db: Database) -> None:
    with pytest.raises(RuntimeError, match="Database is disabled"):
        async with disabled_db.session():
            pass


@pytest.mark.anyio
async def test_record_weather_returns_none_when_disabled(
    persistence: PersistenceService,
) -> None:
    row_id = await persistence.record_weather(
        source="openweather",
        latitude=43.7315,
        longitude=-79.7624,
        temperature_c=22.4,
    )
    assert row_id is None


@pytest.mark.anyio
async def test_record_weather_batch_returns_zero_when_disabled(
    persistence: PersistenceService,
) -> None:
    inserted = await persistence.record_weather_batch(
        [
            {"source": "openweather", "latitude": 43.7, "longitude": -79.8},
            {"source": "openweather", "latitude": 43.8, "longitude": -79.7},
        ]
    )
    assert inserted == 0


@pytest.mark.anyio
async def test_record_flood_returns_none_when_disabled(
    persistence: PersistenceService,
) -> None:
    row_id = await persistence.record_flood(
        latitude=43.73,
        longitude=-79.74,
        ctuid="5350528.20",
        river_discharge=6.0,
    )
    assert row_id is None


@pytest.mark.anyio
async def test_record_flood_batch_returns_zero_when_disabled(
    persistence: PersistenceService,
) -> None:
    inserted = await persistence.record_flood_batch(
        [
            {"latitude": 43.7, "longitude": -79.8, "ctuid": "1", "river_discharge": 4.0},
            {"latitude": 43.8, "longitude": -79.7, "ctuid": "2", "river_discharge": 5.0},
        ]
    )
    assert inserted == 0


@pytest.mark.anyio
async def test_recent_flood_returns_empty_when_disabled(
    persistence: PersistenceService,
) -> None:
    rows = await persistence.recent_flood(limit=10)
    assert rows == []


@pytest.mark.anyio
async def test_record_score_returns_none_when_disabled(
    persistence: PersistenceService,
) -> None:
    row_id = await persistence.record_score(
        ctuid="5350528.20",
        score=0.74,
        factors={"cisv_score": 0.62, "humidex": 38.1},
    )
    assert row_id is None


@pytest.mark.anyio
async def test_latest_score_returns_none_when_disabled(
    persistence: PersistenceService,
) -> None:
    result = await persistence.latest_score("5350528.20")
    assert result is None


@pytest.mark.anyio
async def test_recent_weather_returns_empty_when_disabled(
    persistence: PersistenceService,
) -> None:
    rows = await persistence.recent_weather(limit=10)
    assert rows == []


@pytest.mark.anyio
async def test_persistence_enabled_flag_reflects_database(
    persistence: PersistenceService,
) -> None:
    assert persistence.enabled is False


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"
