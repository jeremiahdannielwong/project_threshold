"""Community (Census Tract) response models."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .common import SourceCitation

RiskTier = Literal["Critical", "High", "Moderate", "Low"]
Scenario = Literal["baseline", "heatwave", "icestorm"]


class CommunitySummary(BaseModel):
    """Compact CT record returned by /api/communities."""

    model_config = ConfigDict(extra="ignore")

    ctuid: str
    neighbourhood: str
    population: int | None = None
    median_income: float | None = None
    pct_renters: float | None = None
    pct_pre1980: float | None = None
    pct_low_income: float | None = None
    cisv_score: float | None = None
    cisr_score: float | None = None
    humidex: float | None = None
    temperature_c: float | None = None
    active_outages: int = 0
    customers_affected: int = 0
    threshold_score_baseline: float | None = None
    threshold_score_heatwave: float | None = None
    threshold_score_icestorm: float | None = None
    risk_level: RiskTier | None = None


class FactorBreakdown(BaseModel):
    """One row of the radar chart / factor bar surface."""

    name: str = Field(description="Machine-readable factor name (e.g. 'cisv_score').")
    label: str = Field(description="Human-readable label.")
    raw_value: float | None
    loading_baseline: float
    loading_heatwave: float
    loading_icestorm: float
    direction: Literal["vulnerable", "resilient"]
    source: SourceCitation


class CommunityDetail(BaseModel):
    """Full CT record returned by /api/communities/{ctuid}."""

    model_config = ConfigDict(extra="ignore")

    ctuid: str
    neighbourhood: str
    risk_level: RiskTier | None
    scores: dict[Scenario, float | None]
    population: int | None
    median_income: float | None
    pct_renters: float | None
    pct_pre1980: float | None
    pct_low_income: float | None
    cisv: dict[str, float | None]
    cisr: dict[str, float | None]
    weather: dict[str, float | int | None]
    outages: dict[str, int]
    factors: list[FactorBreakdown]
