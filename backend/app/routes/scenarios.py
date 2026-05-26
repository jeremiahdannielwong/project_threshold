"""Scenario picker metadata.

Frontend uses this to render the scenario buttons + tooltip explanations.
"""

from __future__ import annotations

from fastapi import APIRouter

from ..models.common import Envelope
from ..models.weather import ScenarioInfo
from ..services.scoring import (
    SCENARIO_DESCRIPTIONS,
    SCENARIO_LABELS,
    SCENARIO_WEIGHTS,
    SCENARIOS,
)
from ..sources import get_source

router = APIRouter(prefix="/api/scenarios", tags=["scenarios"])


@router.get("", response_model=Envelope[list[ScenarioInfo]])
def list_scenarios() -> Envelope[list[ScenarioInfo]]:
    data = [
        ScenarioInfo(
            slug=s,
            label=SCENARIO_LABELS[s],
            description=SCENARIO_DESCRIPTIONS[s],
            weight_overrides=SCENARIO_WEIGHTS[s],
        )
        for s in SCENARIOS
    ]
    return Envelope(data=data, sources=[get_source("threshold-score-pca")])
