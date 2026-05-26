"""Open-Meteo current-conditions proxy.

For MVP we serve the *baked* weather that the pipeline already attached to each
CT (so the choropleth always has a value). The `/api/weather/live` endpoint
refreshes from Open-Meteo at 15-minute TTL — used by the live overlay toggle.
"""

from __future__ import annotations

import logging
from typing import Iterable

import httpx

from ..config import Settings
from ..models.weather import CTWeather
from .cache import TTLCache
from .data_loader import DataStore

logger = logging.getLogger(__name__)

# Open-Meteo enforces a per-request URL length cap; we batch points into chunks
# small enough to fit comfortably under any reasonable proxy limit.
BATCH_SIZE = 50


class WeatherService:
    def __init__(
        self,
        settings: Settings,
        store: DataStore,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._settings = settings
        self._store = store
        self._client = client
        self._owns_client = client is None
        self._cache: TTLCache[list[CTWeather]] = TTLCache(ttl_seconds=settings.weather_ttl_seconds)

    def baked(self) -> list[CTWeather]:
        """Return the static weather snapshot baked into the ``communities`` table."""
        out: list[CTWeather] = []
        for rec in self._store.list():
            p = rec.properties
            out.append(
                CTWeather(
                    ctuid=rec.ctuid,
                    temperature_c=_f(p.get("temperature_c")),
                    humidex=_f(p.get("humidex")),
                    precipitation_mm=_f(p.get("precipitation_mm")),
                    wind_speed_kmh=_f(p.get("wind_speed_kmh")),
                    wind_gusts_kmh=_f(p.get("wind_gusts_kmh")),
                    weather_code=_i(p.get("weather_code")),
                )
            )
        return out

    def simulated(self, overrides: dict[str, float | int | None]) -> list[CTWeather]:
        """Apply per-field overrides uniformly across every CT's baked weather.

        Frontend supplies the scenario preset (heatwave, icestorm, etc.); the
        backend just stamps the values onto each row so the choropleth shifts.
        """
        rows = self.baked()
        clean = {k: v for k, v in overrides.items() if v is not None}
        if not clean:
            return rows
        return [row.model_copy(update=clean) for row in rows]

    async def live(self) -> list[CTWeather]:
        """Fresh per-CT weather from Open-Meteo, cached for ``weather_ttl_seconds``."""
        return await self._cache.get(self._fetch_remote)

    async def _fetch_remote(self) -> list[CTWeather]:
        centroids = self._store.centroids()
        if not centroids:
            logger.warning("No CT centroids available; weather will be empty.")
            return []

        client = await self._get_client()
        results: list[CTWeather] = []
        for batch in _chunks(centroids, BATCH_SIZE):
            results.extend(await self._fetch_batch(client, batch))
        return results

    async def _fetch_batch(
        self,
        client: httpx.AsyncClient,
        batch: list[tuple[str, float, float]],
    ) -> list[CTWeather]:
        lats = ",".join(f"{lat:.5f}" for _, _, lat in batch)
        lons = ",".join(f"{lon:.5f}" for _, lon, _ in batch)
        params = {
            "latitude": lats,
            "longitude": lons,
            "current": "temperature_2m,apparent_temperature,precipitation,wind_speed_10m,wind_gusts_10m,weather_code",
            "wind_speed_unit": "kmh",
            "timezone": "America/Toronto",
        }
        try:
            resp = await client.get(self._settings.openmeteo_url, params=params, timeout=10.0)
            resp.raise_for_status()
            raw = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("Open-Meteo batch fetch failed: %s — falling back to baked weather.", exc)
            return [self._baked_for(ctuid) for ctuid, _, _ in batch]

        rows = raw if isinstance(raw, list) else [raw]
        out: list[CTWeather] = []
        for (ctuid, _lon, _lat), row in zip(batch, rows, strict=False):
            cur = (row or {}).get("current") or {}
            out.append(
                CTWeather(
                    ctuid=ctuid,
                    temperature_c=_f(cur.get("temperature_2m")),
                    humidex=_f(cur.get("apparent_temperature")),
                    precipitation_mm=_f(cur.get("precipitation")),
                    wind_speed_kmh=_f(cur.get("wind_speed_10m")),
                    wind_gusts_kmh=_f(cur.get("wind_gusts_10m")),
                    weather_code=_i(cur.get("weather_code")),
                )
            )
        return out

    def _baked_for(self, ctuid: str) -> CTWeather:
        rec = self._store.get(ctuid)
        p = rec.properties if rec else {}
        return CTWeather(
            ctuid=ctuid,
            temperature_c=_f(p.get("temperature_c")),
            humidex=_f(p.get("humidex")),
            precipitation_mm=_f(p.get("precipitation_mm")),
            wind_speed_kmh=_f(p.get("wind_speed_kmh")),
            wind_gusts_kmh=_f(p.get("wind_gusts_kmh")),
            weather_code=_i(p.get("weather_code")),
        )

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


def _chunks(items: list, size: int) -> Iterable[list]:
    for i in range(0, len(items), size):
        yield items[i : i + size]


def _f(v: object) -> float | None:
    try:
        return float(v) if v is not None and v != "" else None  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _i(v: object) -> int | None:
    f = _f(v)
    return None if f is None else int(f)


__all__ = ["WeatherService"]
