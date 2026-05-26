"""LLM briefing models."""

from __future__ import annotations

from pydantic import BaseModel, Field

from .community import Scenario


class BriefingRequest(BaseModel):
    ctuid: str = Field(min_length=1)
    scenario: Scenario = "baseline"


class BriefingResponse(BaseModel):
    ctuid: str
    scenario: Scenario
    risk_level: str | None
    score: float | None
    briefing: str = Field(description="Plain-language narrative wrapped around numeric inputs.")
    inputs: dict[str, float | int | str | None] = Field(
        description="The exact numeric inputs handed to the LLM. UI may surface these.",
    )
    used_llm: bool = Field(description="False when the deterministic fallback produced the prose.")
