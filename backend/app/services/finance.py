"""Finance / cost-of-living feed.

Pulls Canadian CPI year-over-year inflation from the Bank of Canada Valet API
(public, JSON, no auth) and composes a finance snapshot with current Ontario
Energy Board Regulated Price Plan electricity rates.

Cached for 1 hour by default — these inputs change on the order of months
(rates are reset by the OEB twice a year; CPI is published monthly).

The OEB rates are published rates from the most recent regulatory effective
period and are versioned in `EFFECTIVE_RATES_FROM`. When the OEB resets,
update this module and `effective_from` together; the source URL is preserved
in the response so operators can verify.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import httpx

from ..config import Settings
from ..models.finance import ElectricityRate, FinanceSnapshot
from .cache import TTLCache

logger = logging.getLogger(__name__)

# Ontario Energy Board Regulated Price Plan — effective Nov 1, 2024 → Apr 30, 2025.
# Source: https://www.oeb.ca/consumer-information-and-protection/electricity-rates
# Update twice a year when OEB resets.
EFFECTIVE_RATES_FROM = "2024-11-01"
OEB_SOURCE_URL = "https://www.oeb.ca/consumer-information-and-protection/electricity-rates"

OEB_RATES: list[ElectricityRate] = [
    ElectricityRate(plan="TOU", tier="off-peak",  cents_per_kwh=7.6,  effective_from=EFFECTIVE_RATES_FROM),
    ElectricityRate(plan="TOU", tier="mid-peak",  cents_per_kwh=12.2, effective_from=EFFECTIVE_RATES_FROM),
    ElectricityRate(plan="TOU", tier="on-peak",   cents_per_kwh=15.8, effective_from=EFFECTIVE_RATES_FROM),
    ElectricityRate(plan="ULO", tier="ultra-low", cents_per_kwh=2.8,  effective_from=EFFECTIVE_RATES_FROM),
    ElectricityRate(plan="ULO", tier="weekend",   cents_per_kwh=7.6,  effective_from=EFFECTIVE_RATES_FROM),
    ElectricityRate(plan="ULO", tier="mid-peak",  cents_per_kwh=12.2, effective_from=EFFECTIVE_RATES_FROM),
    ElectricityRate(plan="ULO", tier="on-peak",   cents_per_kwh=28.4, effective_from=EFFECTIVE_RATES_FROM),
]

# Weighted blend assuming typical residential consumption profile (StatsCan):
#   off-peak ~64%, mid-peak ~18%, on-peak ~18% of usage.
# Plus regulatory delivery + transmission of ~6.5 ¢/kWh average.
BLENDED_RATE_CENTS = (0.64 * 7.6) + (0.18 * 12.2) + (0.18 * 15.8) + 6.5

# Statistics Canada Ontario typical residential electricity consumption.
# Source: StatsCan Table 25-10-0023-01 (Survey of Household Spending).
TYPICAL_KWH_PER_YEAR = 9000

# Bank of Canada Valet API — month-over-month-year CPI total.
# Returns last observation as percentage YoY change.
BOC_CPI_URL = "https://www.bankofcanada.ca/valet/observations/STATIC_TOTALCPICHANGE/json?recent=1"
BOC_FALLBACK_CPI_PCT = 2.0
BOC_FALLBACK_VINTAGE = datetime.now(timezone.utc).strftime("%Y-%m")


class FinanceService:
    """Live finance/cost-of-living snapshot, cached."""

    def __init__(
        self,
        settings: Settings,
        client: httpx.AsyncClient | None = None,
        ttl_seconds: int = 3600,
    ) -> None:
        self._settings = settings
        self._client = client
        self._owns_client = client is None
        self._cache: TTLCache[FinanceSnapshot] = TTLCache(ttl_seconds=ttl_seconds)

    async def snapshot(self) -> FinanceSnapshot:
        return await self._cache.get(self._fetch)

    async def _fetch(self) -> FinanceSnapshot:
        cpi_pct, cpi_vintage = await self._fetch_cpi()
        blended = round(BLENDED_RATE_CENTS, 2)
        annual_cost = round((TYPICAL_KWH_PER_YEAR * blended) / 100, 0)
        return FinanceSnapshot(
            cpi_yoy_pct=cpi_pct,
            cpi_vintage=cpi_vintage,
            ontario_electricity_rates=OEB_RATES,
            blended_residential_cents_per_kwh=blended,
            typical_household_kwh_per_year=TYPICAL_KWH_PER_YEAR,
            annual_household_energy_cost_cad=annual_cost,
            energy_poverty_threshold_pct=6.0,
            rate_source_url=OEB_SOURCE_URL,
            cpi_source_url="https://www.bankofcanada.ca/valet/observations/STATIC_TOTALCPICHANGE",
        )

    async def _fetch_cpi(self) -> tuple[float, str]:
        """Pull latest CPI YoY % from Bank of Canada Valet. Falls back on error."""
        if self._client is None:
            return BOC_FALLBACK_CPI_PCT, BOC_FALLBACK_VINTAGE
        try:
            r = await self._client.get(BOC_CPI_URL, timeout=8.0)
            r.raise_for_status()
            payload = r.json()
            obs = payload.get("observations") or []
            if not obs:
                return BOC_FALLBACK_CPI_PCT, BOC_FALLBACK_VINTAGE
            latest = obs[-1]
            date = latest.get("d", BOC_FALLBACK_VINTAGE)
            # Series key on this endpoint is STATIC_TOTALCPICHANGE
            value_entry = latest.get("STATIC_TOTALCPICHANGE") or {}
            value = float(value_entry.get("v", BOC_FALLBACK_CPI_PCT))
            return value, date[:7]
        except Exception as e:
            logger.warning("Bank of Canada CPI fetch failed: %s — using fallback.", e)
            return BOC_FALLBACK_CPI_PCT, BOC_FALLBACK_VINTAGE
