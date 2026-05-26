"""City-wide / utility-wide strategic plan for extreme weather scenarios.

POST /api/extreme-plan
  body: { ctuids: [...], scenario: "heatwave"|"icestorm", audience: "city"|"alectra" }

Returns aggregate totals, ranked priority actions for the chosen audience, and
an LLM-generated executive summary (with deterministic fallback). Numbers are
sourced from the scoring engine; the LLM only writes prose around them.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from ..deps import get_briefing_service, get_store
from ..models.common import Envelope
from ..models.extreme_plan import ExtremePlanRequest, ExtremePlanResponse
from ..services.data_loader import DataStore
from ..services.extreme_plan import build_plan, total_cost
from ..services.llm import BriefingService
from ..sources import sources_for_factors

router = APIRouter(prefix="/api/extreme-plan", tags=["extreme-plan"])


@router.post("", response_model=Envelope[ExtremePlanResponse])
async def post_extreme_plan(
    body: ExtremePlanRequest,
    store: Annotated[DataStore, Depends(get_store)],
    briefing_service: Annotated[BriefingService, Depends(get_briefing_service)],
) -> Envelope[ExtremePlanResponse]:
    totals, selected, actions, missing = build_plan(
        store=store, ctuids=body.ctuids, scenario=body.scenario, audience=body.audience
    )

    if missing and not selected:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"None of the requested Census Tracts were found: {missing}",
        )

    # Patch in the cost roll-up now that we have the action list.
    totals = totals.model_copy(update={"est_cost_cad": total_cost(actions)})

    prose, used_llm = await briefing_service.extreme_plan_summary(
        scenario=body.scenario,
        audience=body.audience,
        totals=totals,
        selected=selected,
        actions=actions,
    )

    response = ExtremePlanResponse(
        scenario=body.scenario,
        audience=body.audience,
        totals=totals,
        selected_communities=selected,
        priority_actions=actions,
        executive_summary=prose,
        used_llm=used_llm,
    )

    # Sources span every factor any action used, plus the composite score.
    factor_names: set[str] = {"threshold_score_pca"}
    for a in actions:
        for inp in a.inputs:
            factor_names.add(inp.name)

    return Envelope(data=response, sources=sources_for_factors(factor_names))
