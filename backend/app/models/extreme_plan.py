"""Extreme-scenario strategic plan models.

Used by ``POST /api/extreme-plan`` — a city-wide / utility-wide rollup that
aggregates a user-selected set of Census Tracts under an extreme weather
scenario (heatwave or ice storm) and returns a prioritised action plan plus
LLM-generated executive summary. Numbers come from the scoring engine; the
LLM only wraps prose around them.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from .recommendation import RecommendationInput

ExtremeScenario = Literal["heatwave", "icestorm"]
Audience = Literal["city", "alectra"]


class ExtremePlanRequest(BaseModel):
    """Frontend payload: which neighbourhoods, which scenario, which audience."""

    ctuids: list[str] = Field(min_length=1, description="Selected Census Tract UIDs.")
    scenario: ExtremeScenario
    audience: Audience = Field(
        description="'city' for emergency-management view; 'alectra' for utility-ops view."
    )


class PlanTotals(BaseModel):
    """Roll-up across the selected CTs."""

    ct_count: int
    population_at_risk: int
    customers_at_risk: int
    est_cost_cad: float
    max_score: float | None
    avg_score: float | None


class SelectedCommunity(BaseModel):
    """One row in the selection summary, ordered by scenario score."""

    ctuid: str
    neighbourhood: str
    score: float | None
    risk_level: str | None
    population: int | None
    customers_affected: int


class PriorityAction(BaseModel):
    """One bucket of work — same action across N selected CTs."""

    id: str
    action: str
    actor: Literal["Alectra", "City", "Community"]
    confidence: Literal["High", "Medium", "Low"]
    target_ctuids: list[str]
    affected_population: int
    est_cost_cad: float | None
    why: str
    inputs: list[RecommendationInput]


class ExtremePlanResponse(BaseModel):
    """The strategic plan returned to the City or Alectra dashboard."""

    scenario: ExtremeScenario
    audience: Audience
    totals: PlanTotals
    selected_communities: list[SelectedCommunity]
    priority_actions: list[PriorityAction]
    executive_summary: str = Field(
        description="4–6 sentence LLM-generated narrative (or deterministic fallback) wrapped around the numbers above."
    )
    used_llm: bool
