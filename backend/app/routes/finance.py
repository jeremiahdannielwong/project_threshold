"""Live finance / cost-of-living feed.

GET /api/finance  → current Ontario electricity rates + CPI YoY + the implied
                    annual household energy cost. Used by the frontend to
                    compute energy-cost share of income with real-dollar
                    provenance rather than a hardcoded assumption.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from ..models.common import Envelope, SourceCitation
from ..models.finance import FinanceSnapshot
from ..services.finance import FinanceService


router = APIRouter(prefix="/api/finance", tags=["finance"])


def get_finance_service(request: Request) -> FinanceService:
    return request.app.state.finance_service


@router.get("", response_model=Envelope[FinanceSnapshot])
async def get_finance(
    service: Annotated[FinanceService, Depends(get_finance_service)],
) -> Envelope[FinanceSnapshot]:
    snap = await service.snapshot()
    sources = [
        SourceCitation(
            slug="oeb-rpp-rates",
            label="Ontario Energy Board — Regulated Price Plan",
            vintage="live",
            url=snap.rate_source_url,
        ),
        SourceCitation(
            slug="bank-of-canada-cpi",
            label="Bank of Canada — Total CPI year-over-year change",
            vintage="live",
            url=snap.cpi_source_url,
        ),
    ]
    return Envelope(data=snap, sources=sources)
