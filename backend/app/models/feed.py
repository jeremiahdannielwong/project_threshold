"""Public-facing ambient feed models.

The feed is the resident-facing surface: one consumption shape, served from a
process-local cache that the hourly sweep keeps warm. The LLM never runs in the
request path — the prose was generated when the sweep last ran.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from .briefing import BriefingResponse
from .community import RiskTier, Scenario

FeedSeverity = Literal["Calm", "Heads up", "Take action", "Urgent"]


class NearestFacility(BaseModel):
    """Closest cooling/warming facility to the CT centroid."""

    name: str
    kind: str = Field(description="Source layer: 'recreation' or 'libraries'.")
    distance_km: float
    address: str | None = None
    open_until: str | None = None


class FeedEntry(BaseModel):
    """One CT's entry in the resident-facing feed cache.

    Wraps the existing :class:`BriefingResponse` with the metadata residents
    actually consume: severity, nearest open facility, freshness timestamp.
    """

    ctuid: str
    neighbourhood: str
    severity: FeedSeverity
    severity_headline: str = Field(
        description="≤12-word plain-language line. The first thing a resident reads."
    )
    risk_level: RiskTier | None
    score: float | None
    scenario: Scenario = Field(
        description="Which scenario the LLM prose targets. Picked by the sweep based on current weather."
    )
    briefing: BriefingResponse
    nearest_facility: NearestFacility | None
    generated_at: datetime


class PostalLookupResponse(BaseModel):
    """Postal-prefix → CTUID resolver result."""

    postal_prefix: str = Field(description="The first 3 characters of the postal code (the FSA).")
    ctuid: str
    neighbourhood: str


class FeedStatus(BaseModel):
    """Diagnostic summary for the sweep — used by /api/feed/status."""

    entries: int
    last_sweep_at: datetime | None
    next_sweep_at: datetime | None
    interval_seconds: int
    sweep_in_progress: bool
