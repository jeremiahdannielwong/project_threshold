"""LLM briefing endpoint.

POST /api/briefing  { ctuid, scenario } → Envelope[BriefingResponse]

The route is intentionally non-streaming for MVP — keeps the contract trivial
for the React client. The PRD calls for SSE; that's a stretch upgrade once the
basic shape is wired through.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status

from ..deps import get_briefing_service, get_store
from ..limiter import limiter
from ..models.briefing import BriefingRequest, BriefingResponse
from ..models.common import Envelope
from ..services.data_loader import DataStore
from ..services.llm import BriefingService
from ..sources import sources_for_factors

router = APIRouter(prefix="/api/briefing", tags=["briefing"])


@router.post("", response_model=Envelope[BriefingResponse])
@limiter.limit("10/minute")
async def post_briefing(
    request: Request,
    body: BriefingRequest,
    service: Annotated[BriefingService, Depends(get_briefing_service)],
    store: Annotated[DataStore, Depends(get_store)],
) -> Envelope[BriefingResponse]:
    rec = store.get(body.ctuid)
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Census Tract {body.ctuid!r} not found.",
        )
    briefing = await service.brief(rec, body.scenario, store=store)
    return Envelope(
        data=briefing,
        sources=sources_for_factors(
            [
                "cisv_score",
                "cisr_score",
                "pct_renters",
                "pct_pre1980",
                "median_income",
                "humidex",
                "active_outages",
            ]
        ),
    )
