"""Live outage feed."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from ..deps import get_outage_service
from ..models.common import Envelope
from ..models.weather import OutageCollection
from ..services.outages import OutageService, summarise
from ..sources import get_source

router = APIRouter(prefix="/api/outages", tags=["outages"])


@router.get("", response_model=Envelope[OutageCollection])
async def get_outages(
    service: Annotated[OutageService, Depends(get_outage_service)],
) -> Envelope[OutageCollection]:
    collection = await service.fetch()
    return Envelope(data=collection, sources=[get_source("alectra-outages-live")])


@router.get("/summary", response_model=Envelope[dict[str, int]])
async def get_outage_summary(
    service: Annotated[OutageService, Depends(get_outage_service)],
) -> Envelope[dict[str, int]]:
    collection = await service.fetch()
    return Envelope(data=summarise(collection), sources=[get_source("alectra-outages-live")])
