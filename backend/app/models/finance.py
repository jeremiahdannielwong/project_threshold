"""Finance feed response models.

Captures the live cost-of-living context that turns raw vulnerability into a
real-dollar story: current electricity rates, inflation, and the energy-poverty
threshold (% of household income spent on energy beyond which a household is
considered energy-poor).
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ElectricityRate(BaseModel):
    """Ontario Energy Board Regulated Price Plan — TOU and ULO tiers."""

    model_config = ConfigDict(extra="ignore")

    plan: str = Field(description="TOU or ULO")
    tier: str = Field(description="off-peak / mid-peak / on-peak / ultra-low / weekend")
    cents_per_kwh: float
    effective_from: str = Field(description="YYYY-MM-DD")


class FinanceSnapshot(BaseModel):
    """Current macroeconomic + utility-cost context."""

    model_config = ConfigDict(extra="ignore")

    # Inflation
    cpi_yoy_pct: float = Field(description="Year-over-year CPI inflation, Canada, %")
    cpi_vintage: str = Field(description="YYYY-MM (reference month for the CPI reading)")

    # Energy cost
    ontario_electricity_rates: list[ElectricityRate]
    blended_residential_cents_per_kwh: float = Field(
        description="Weighted-average residential cost factoring tiers + delivery + regulatory."
    )

    # Household energy assumption
    typical_household_kwh_per_year: int = Field(
        description="StatsCan-derived typical Ontario household consumption."
    )
    annual_household_energy_cost_cad: float = Field(
        description="typical_kwh × blended_rate, in CAD."
    )

    # Energy-poverty threshold (commonly 6% of household income spent on energy)
    energy_poverty_threshold_pct: float = Field(default=6.0)

    # Provenance
    rate_source_url: str
    cpi_source_url: str
