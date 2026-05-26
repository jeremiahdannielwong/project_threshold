"""Flood endpoint.

GET /api/flood              → empty list (no baked flood data yet)
GET /api/flood?live=true    → live GloFAS river discharge per CT
                              (cached for flood TTL; persisted on cold fetch)
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from ..deps import get_flood_service
from ..models.common import Envelope
from ..models.flood import CTFlood
from ..services.flood import FloodService
from ..sources import get_source

router = APIRouter(prefix="/api/flood", tags=["flood"])


@router.get("", response_model=Envelope[list[CTFlood]])
async def get_flood(
    service: Annotated[FloodService, Depends(get_flood_service)],
    live: Annotated[bool, Query(description="Fetch fresh GloFAS discharge values.")] = False,
) -> Envelope[list[CTFlood]]:
    data = await service.live() if live else []
    return Envelope(data=data, sources=[get_source("open-meteo-flood")])
