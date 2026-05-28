"""LLM briefing models."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from .community import Scenario

SolutionActor = Literal["City", "Alectra", "Community", "Both"]
SolutionLeverage = Literal["High", "Medium", "Low"]


class SolutionItem(BaseModel):
    """One concrete intervention that would lower the assessed probability."""

    headline: str = Field(description="Short solution title — 6–10 words.")
    actor: SolutionActor = Field(description="Owner of the intervention.")
    detail: str = Field(description="One sentence: what to do and the expected effect.")
    leverage: SolutionLeverage = Field(
        description="Expected impact on the probability if executed within 24h."
    )


class BriefingRequest(BaseModel):
    ctuid: str = Field(min_length=1, max_length=20)
    scenario: Scenario = "baseline"
    active_layers: list[str] = Field(
        default_factory=list,
        description=(
            "Which map layers the operator currently has visible. Lets the engine "
            "bias solutions toward the operator's current focus (e.g. shelters → "
            "cooling-centre solutions, outages → feeder restoration, etc.)."
        ),
    )


class BriefingResponse(BaseModel):
    ctuid: str
    scenario: Scenario
    risk_level: str | None
    score: float | None
    briefing: str = Field(description="Plain-language narrative wrapped around numeric inputs.")
    solutions: list[SolutionItem] = Field(
        default_factory=list,
        description="Ranked candidate interventions that would reduce the probability.",
    )
    inputs: dict[str, float | int | str | None] = Field(
        description="The exact numeric inputs handed to the LLM. UI may surface these.",
    )
    used_llm: bool = Field(description="False when the deterministic fallback produced the prose.")
