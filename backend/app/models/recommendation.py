"""Recommendation card models."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from .common import SourceCitation
from .community import Scenario

Actor = Literal["Alectra", "City", "Community", "Resident"]
Confidence = Literal["High", "Medium", "Low"]


class RecommendationInput(BaseModel):
    """One numeric input that the card is grounded in. Always traceable."""

    name: str
    value: float | int
    units: str | None = None
    source: SourceCitation


class Recommendation(BaseModel):
    """Per-CT action card. Numbers come from the scoring engine, not the LLM."""

    id: str
    action: str
    why: str = Field(description="One-sentence rationale that names numbers.")
    actor: Actor
    confidence: Confidence
    projected_impact: str | None = Field(
        default=None,
        description="Plain-language projected impact (e.g. 'prevents ~10 ER visits'). Optional.",
    )
    cost_estimate_cad: float | None = None
    inputs: list[RecommendationInput]
    scenario: Scenario
