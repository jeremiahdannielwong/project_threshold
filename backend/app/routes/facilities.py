"""Cooling/warming centre facility overlay."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from ..deps import get_store
from ..models.common import Envelope, SourceCitation
from ..services.data_loader import DataStore
from ..sources import get_source

router = APIRouter(prefix="/api/facilities", tags=["facilities"])


@router.get("", response_model=Envelope[dict])
def get_facilities(store: Annotated[DataStore, Depends(get_store)]) -> Envelope[dict]:
    sources: list[SourceCitation] = []
    if any((f.get("properties") or {}).get("_source_layer") == "recreation" for f in store.facilities):
        sources.append(get_source("brampton-esri-recreation"))
    if any((f.get("properties") or {}).get("_source_layer") == "libraries" for f in store.facilities):
        sources.append(get_source("brampton-esri-libraries"))
    if not sources:
        sources = [get_source("brampton-esri-recreation"), get_source("brampton-esri-libraries")]

    return Envelope(
        data={"type": "FeatureCollection", "features": store.facilities},
        sources=sources,
    )
