"""Open-Meteo Flood (GloFAS) proxy.

GET /api/flood       → empty list (no baked flood data yet; v1 ships live-only)
GET /api/flood/live  → fresh per-CT river discharge from GloFAS v4 via Open-Meteo

Every live fetch persists one ``flood_observations`` row per CT when the DB is
enabled — this is the only place flood data ever gets written, so the table
doubles as the historical record.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

import httpx

from ..config import Settings
from ..models.flood import CTFlood
from .cache import TTLCache
from .data_loader import DataStore
from .persistence import PersistenceService

logger = logging.getLogger(__name__)

# Open-Meteo Flood accepts one coordinate per request, so we serialise CTs.
# Per-call timeout stays small; the TTL cache absorbs the per-CT cost.
PER_CALL_TIMEOUT = 8.0
PAST_DAYS = 30
FORECAST_DAYS = 7


class FloodService:
    def __init__(
        self,
        settings: Settings,
        store: DataStore,
        persistence: PersistenceService,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._settings = settings
        self._store = store
        self._persistence = persistence
        self._client = client
        self._owns_client = client is None
        self._cache: TTLCache[list[CTFlood]] = TTLCache(ttl_seconds=settings.flood_ttl_seconds)

    async def live(self) -> list[CTFlood]:
        """Fresh per-CT river discharge. Persists each row on cold-cache fetch."""
        return await self._cache.get(self._fetch_remote)

    async def _fetch_remote(self) -> list[CTFlood]:
        centroids = self._store.centroids()
        if not centroids:
            logger.warning("No CT centroids available; flood signal will be empty.")
            return []

        client = await self._get_client()
        results: list[CTFlood] = []
        persist_rows: list[dict[str, Any]] = []

        for ctuid, lon, lat in centroids:
            row, db_row = await self._fetch_one(client, ctuid, lat, lon)
            results.append(row)
            if db_row is not None:
                persist_rows.append(db_row)

        if persist_rows and self._persistence.enabled:
            inserted = await self._persistence.record_flood_batch(persist_rows)
            logger.info("Persisted %d flood observations.", inserted)

        return results

    async def _fetch_one(
        self,
        client: httpx.AsyncClient,
        ctuid: str,
        lat: float,
        lon: float,
    ) -> tuple[CTFlood, dict[str, Any] | None]:
        params = {
            "latitude": f"{lat:.5f}",
            "longitude": f"{lon:.5f}",
            "daily": "river_discharge,river_discharge_mean,river_discharge_max",
            "past_days": PAST_DAYS,
            "forecast_days": FORECAST_DAYS,
            "timezone": "America/Toronto",
        }
        try:
            resp = await client.get(
                self._settings.flood_api_url, params=params, timeout=PER_CALL_TIMEOUT
            )
            resp.raise_for_status()
            raw = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("Open-Meteo Flood fetch failed for CT %s: %s", ctuid, exc)
            return CTFlood(ctuid=ctuid), None

        return _summarise(ctuid, lat, lon, raw)

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient()
        return self._client

    async def aclose(self) -> None:
        if self._owns_client and self._client is not None:
            await self._client.aclose()
            self._client = None

    def clear_cache(self) -> None:
        self._cache.clear()


def _summarise(
    ctuid: str, lat: float, lon: float, raw: dict[str, Any]
) -> tuple[CTFlood, dict[str, Any] | None]:
    """Collapse a GloFAS daily array into today's discharge, 30d mean, 7d max."""
    daily = (raw or {}).get("daily") or {}
    times: list[str] = daily.get("time") or []
    discharge: list[float | None] = daily.get("river_discharge") or []
    mean: list[float | None] = daily.get("river_discharge_mean") or []
    maxv: list[float | None] = daily.get("river_discharge_max") or []

    if not times:
        return CTFlood(ctuid=ctuid), None

    # GloFAS publishes one value per day; "today" is the first day not in the
    # past_days window. If the upstream window shifts, fall back to len(past).
    today_idx = min(PAST_DAYS, len(times) - 1)

    today_discharge = _f(_safe_index(discharge, today_idx))
    past_mean_vals = [v for v in mean[:today_idx] if _f(v) is not None]
    past_mean = (sum(_f(v) or 0.0 for v in past_mean_vals) / len(past_mean_vals)
                 if past_mean_vals else None)
    forecast_max_window = maxv[today_idx:today_idx + FORECAST_DAYS]
    forecast_max_vals = [v for v in forecast_max_window if _f(v) is not None]
    forecast_max = max((_f(v) or 0.0) for v in forecast_max_vals) if forecast_max_vals else None

    anomaly: float | None
    if forecast_max is not None and past_mean and past_mean > 0:
        anomaly = forecast_max / past_mean
    else:
        anomaly = None

    dto = CTFlood(
        ctuid=ctuid,
        river_discharge=today_discharge,
        discharge_30d_mean=past_mean,
        discharge_7d_max=forecast_max,
        discharge_anomaly=anomaly,
    )

    observed_at = _parse_date(times[today_idx])
    db_row = {
        "ctuid": ctuid,
        "latitude": lat,
        "longitude": lon,
        "observed_at": observed_at,
        "river_discharge": today_discharge,
        "discharge_30d_mean": past_mean,
        "discharge_7d_max": forecast_max,
        "discharge_anomaly": anomaly,
        "raw_payload": raw,
    }
    return dto, db_row


def _safe_index(arr: list, idx: int):
    if 0 <= idx < len(arr):
        return arr[idx]
    return None


def _f(v: object) -> float | None:
    try:
        return float(v) if v is not None and v != "" else None  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _parse_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        # GloFAS daily dates are "YYYY-MM-DD"; anchor at UTC midnight.
        return datetime.fromisoformat(value).replace(tzinfo=timezone.utc)
    except ValueError:
        return None


__all__ = ["FloodService"]
