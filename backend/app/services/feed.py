"""Ambient feed cache + hourly sweep.

The cache is a process-local dict keyed by CTUID. The sweep is an asyncio task
that wakes once per ``interval_seconds``, refreshes the live weather (Tier C),
calls :class:`BriefingService.brief` for every CT in the data store, and writes
the result into the cache. Routes read from the cache — Gemini never runs in
the request path.

Severity is derived at sweep time from the freshly-overlaid score + live
signals so that residents see a plain-language label aligned with the prose.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

from ..models.community import Scenario
from ..models.feed import FeedEntry, FeedSeverity, FeedStatus, NearestFacility
from ..models.weather import CTWeather
from .data_loader import CommunityRecord, DataStore
from .llm import BriefingService, _nearest_facility
from .outages import OutageService
from .scoring import risk_tier, score_for
from .weather import WeatherService

logger = logging.getLogger(__name__)


@dataclass
class FeedCache:
    """In-memory feed store. Keyed by CTUID."""

    entries: dict[str, FeedEntry] = field(default_factory=dict)
    last_sweep_at: datetime | None = None
    sweep_in_progress: bool = False

    def get(self, ctuid: str) -> FeedEntry | None:
        return self.entries.get(ctuid)

    def all(self) -> list[FeedEntry]:
        return list(self.entries.values())

    def put(self, entry: FeedEntry) -> None:
        self.entries[entry.ctuid] = entry

    def status(self, interval_seconds: int) -> FeedStatus:
        next_at: datetime | None = None
        if self.last_sweep_at is not None:
            next_at = datetime.fromtimestamp(
                self.last_sweep_at.timestamp() + interval_seconds,
                tz=timezone.utc,
            )
        return FeedStatus(
            entries=len(self.entries),
            last_sweep_at=self.last_sweep_at,
            next_sweep_at=next_at,
            interval_seconds=interval_seconds,
            sweep_in_progress=self.sweep_in_progress,
        )


def pick_active_scenario(humidex: float | None, temperature_c: float | None) -> Scenario:
    """Choose the scenario whose Gemini prose is most relevant *right now*.

    Cheap heuristic: heat dominates whenever humidex hits the heat-advisory
    region (~28 °C apparent), cold dominates below freezing point, otherwise
    baseline carries the structural narrative.
    """
    if humidex is not None and humidex >= 28:
        return "heatwave"
    if temperature_c is not None and temperature_c <= -5:
        return "icestorm"
    return "baseline"


def compute_severity(
    score: float | None,
    humidex: float | None,
    temperature_c: float | None,
    active_outages: int,
    customers_affected: int,
) -> FeedSeverity:
    """Resident-facing severity label.

    Combines the structural risk (score) with the live hazard signals so that
    a Low-tier CT still surfaces 'Urgent' if there's an outage on its street,
    and a Critical-tier CT only escalates if the live data agrees something is
    happening *now*.
    """
    extreme_heat = humidex is not None and humidex >= 35
    extreme_cold = temperature_c is not None and temperature_c <= -15
    severe_outage = active_outages >= 1 and customers_affected >= 50

    if (score is not None and score >= 75) and (extreme_heat or extreme_cold or severe_outage):
        return "Urgent"
    if extreme_heat or extreme_cold or severe_outage:
        return "Take action"
    if score is not None and score >= 75:
        return "Take action"
    if score is not None and score >= 50:
        return "Heads up"
    return "Calm"


def severity_headline(
    severity: FeedSeverity,
    scenario: Scenario,
    humidex: float | None,
    temperature_c: float | None,
    active_outages: int,
) -> str:
    """A ≤12-word plain-language line. Deterministic — Gemini prose lives in the briefing.

    The headline is what a resident sees *first*. It must read clearly without
    jargon at any age or literacy level.
    """
    if severity == "Calm":
        return "All clear in your area."
    if active_outages >= 1:
        return "Power is out near you."
    if scenario == "heatwave" or (humidex is not None and humidex >= 28):
        if severity == "Urgent":
            return "Dangerous heat — act now."
        return "Heat is building in your area."
    if scenario == "icestorm" or (temperature_c is not None and temperature_c <= -5):
        if severity == "Urgent":
            return "Extreme cold — check on neighbours."
        return "Cold weather risk in your area."
    if severity == "Urgent":
        return "Urgent local risk — see actions below."
    return "Heads up — review what's happening."


class FeedSweepService:
    """Hourly background job that keeps :class:`FeedCache` warm.

    Lifecycle:
      1. ``start()`` schedules an asyncio task and returns it.
      2. The task immediately runs an initial sweep so the cache is warm by
         the time the app starts serving requests.
      3. The task then sleeps ``interval_seconds`` between sweeps.
      4. ``stop()`` cancels the task on shutdown.
    """

    def __init__(
        self,
        *,
        store: DataStore,
        briefing_service: BriefingService,
        weather_service: WeatherService,
        outage_service: OutageService,
        cache: FeedCache,
        interval_seconds: int = 3600,
    ) -> None:
        self._store = store
        self._briefing = briefing_service
        self._weather = weather_service
        self._outages = outage_service
        self._cache = cache
        self._interval = max(60, int(interval_seconds))
        self._task: asyncio.Task | None = None

    def start(self) -> asyncio.Task:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run_loop(), name="feed-sweep")
        return self._task

    async def stop(self) -> None:
        if self._task is not None and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass

    async def _run_loop(self) -> None:
        try:
            while True:
                try:
                    await self.sweep_once()
                except Exception as exc:  # noqa: BLE001
                    logger.exception("Feed sweep failed (will retry next tick): %s", exc)
                await asyncio.sleep(self._interval)
        except asyncio.CancelledError:
            logger.info("Feed sweep loop cancelled.")
            raise

    async def sweep_once(self) -> int:
        """Run a single full sweep across every CT in the store. Returns count written.

        Public so a debug/admin route can trigger an out-of-cycle refresh.
        """
        records = self._store.list()
        if not records:
            logger.warning("Feed sweep: data store is empty; nothing to brief.")
            return 0

        self._cache.sweep_in_progress = True
        started = datetime.now(timezone.utc)
        logger.info("Feed sweep starting — %d communities.", len(records))

        weather_by_ct = await self._refresh_weather()
        # Outage spatial overlay is pipeline-baked on rec.properties for now;
        # the global Tier C feed is refreshed so future per-CT joins can pull
        # from the warm cache without an extra round-trip.
        try:
            await self._outages.fetch()
        except Exception as exc:  # noqa: BLE001
            logger.warning("Feed sweep: outage refresh failed (continuing): %s", exc)

        written = 0
        for rec in records:
            try:
                entry = await self._brief_one(rec, weather_by_ct.get(rec.ctuid))
            except Exception as exc:  # noqa: BLE001
                logger.warning("Feed sweep: brief failed for CT %s: %s", rec.ctuid, exc)
                continue
            self._cache.put(entry)
            written += 1

        self._cache.last_sweep_at = datetime.now(timezone.utc)
        self._cache.sweep_in_progress = False
        elapsed = (self._cache.last_sweep_at - started).total_seconds()
        logger.info("Feed sweep complete — %d entries in %.1fs.", written, elapsed)
        return written

    async def _refresh_weather(self) -> dict[str, CTWeather]:
        """Return fresh per-CT weather keyed by ctuid. Falls back to baked on failure."""
        try:
            rows = await self._weather.live()
        except Exception as exc:  # noqa: BLE001
            logger.warning("Feed sweep: live weather failed, using baked: %s", exc)
            rows = self._weather.baked()
        return {row.ctuid: row for row in rows}

    async def _brief_one(
        self,
        rec: CommunityRecord,
        live_weather: CTWeather | None,
    ) -> FeedEntry:
        overrides: dict[str, float | int | None] = {}
        if live_weather is not None:
            overrides["humidex"] = live_weather.humidex
            overrides["temperature_c"] = live_weather.temperature_c

        scenario = pick_active_scenario(
            overrides.get("humidex") if "humidex" in overrides else _f(rec.properties.get("humidex")),
            overrides.get("temperature_c") if "temperature_c" in overrides else _f(rec.properties.get("temperature_c")),
        )

        briefing = await self._briefing.brief(
            rec,
            scenario,
            store=self._store,
            overrides=overrides,
        )

        humidex = _f(briefing.inputs.get("humidex"))
        temperature = _f(briefing.inputs.get("temperature_c"))
        active_outages = _i(briefing.inputs.get("active_outages")) or 0
        customers_affected = _i(briefing.inputs.get("customers_affected")) or 0

        severity = compute_severity(
            briefing.score,
            humidex,
            temperature,
            active_outages,
            customers_affected,
        )
        headline = severity_headline(severity, scenario, humidex, temperature, active_outages)

        near = _nearest_facility(rec, self._store)
        nearest_facility = (
            NearestFacility(name=near[0], kind=near[1], distance_km=near[2])
            if near
            else None
        )

        return FeedEntry(
            ctuid=rec.ctuid,
            neighbourhood=str(rec.properties.get("neighbourhood") or "Brampton"),
            severity=severity,
            severity_headline=headline,
            risk_level=risk_tier(briefing.score),
            score=briefing.score,
            scenario=scenario,
            briefing=briefing,
            nearest_facility=nearest_facility,
            generated_at=datetime.now(timezone.utc),
        )


def _f(v: object) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _i(v: object) -> int | None:
    f = _f(v)
    return None if f is None else int(f)


__all__ = [
    "FeedCache",
    "FeedSweepService",
    "compute_severity",
    "pick_active_scenario",
    "severity_headline",
]
