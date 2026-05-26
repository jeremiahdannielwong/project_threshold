"""Alectra live outage feed proxy.

Polls the Alectra ArcGIS FeatureServer (Layer 7 = Outage Area polygons),
short-TTL caches the response, and returns it as a clean GeoJSON
FeatureCollection. The map renders this directly.

Per invariant: this is the *live* read path. Pipeline-side polling for the
archival training dataset is a separate concern and not implemented here.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from ..config import Settings
from ..models.weather import OutageCollection, OutageFeature
from .cache import TTLCache

logger = logging.getLogger(__name__)

# Properties we surface on the frontend. Anything else is dropped to keep the
# payload small and free of accidental PII.
KEEP_PROPS = {
    "OBJECTID",
    "CUSTOUT",
    "CUSTOMERS_AFFECTED",
    "OUTTYPE",
    "OUTSTART",
    "OUTFINISH",
    "RESOLVDATE",
    "ETOR",
    "NUMVALVES",
    "CauseDescription",
}


class OutageService:
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None) -> None:
        self._settings = settings
        self._client = client
        self._owns_client = client is None
        self._cache: TTLCache[OutageCollection] = TTLCache(ttl_seconds=settings.outages_ttl_seconds)

    async def fetch(self) -> OutageCollection:
        """Return cached outage collection, refreshing every TTL window."""
        return await self._cache.get(self._fetch_remote)

    async def _fetch_remote(self) -> OutageCollection:
        params = {"f": "geojson", "where": "1=1", "outFields": "*"}
        try:
            client = await self._get_client()
            resp = await client.get(self._settings.alectra_outages_url, params=params, timeout=10.0)
            resp.raise_for_status()
            raw = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("Alectra outage fetch failed: %s — returning empty collection.", exc)
            return OutageCollection(features=[])

        features: list[OutageFeature] = []
        for feat in raw.get("features", []):
            geometry = feat.get("geometry")
            if not geometry:
                continue
            props = feat.get("properties") or {}
            cleaned = {k: v for k, v in props.items() if k in KEEP_PROPS}
            features.append(OutageFeature(geometry=geometry, properties=cleaned))
        return OutageCollection(features=features)

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


def summarise(collection: OutageCollection) -> dict[str, Any]:
    """Coarse counters used by the frontend status bar."""
    total_affected = 0
    for feat in collection.features:
        v = feat.properties.get("CUSTOUT") or feat.properties.get("CUSTOMERS_AFFECTED") or 0
        try:
            total_affected += int(v)
        except (TypeError, ValueError):
            continue
    return {
        "active_outages": len(collection.features),
        "customers_affected": total_affected,
    }
