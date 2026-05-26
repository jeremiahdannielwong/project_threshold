"""Recommendation cards."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..deps import get_store
from ..models.common import Envelope
from ..models.community import Scenario
from ..models.recommendation import Recommendation
from ..services.data_loader import DataStore
from ..services.recommendations import recommend
from ..sources import sources_for_factors

router = APIRouter(prefix="/api/recommendations", tags=["recommendations"])


@router.get("", response_model=Envelope[list[Recommendation]])
def get_recommendations(
    store: Annotated[DataStore, Depends(get_store)],
    ct: Annotated[str, Query(alias="ct", description="Census Tract UID.", min_length=1)],
    scenario: Annotated[Scenario, Query()] = "baseline",
) -> Envelope[list[Recommendation]]:
    rec = store.get(ct)
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Census Tract {ct!r} not found.",
        )
    cards = recommend(rec, scenario)
    factor_names: set[str] = set()
    for card in cards:
        for inp in card.inputs:
            factor_names.add(inp.name)
    return Envelope(data=cards, sources=sources_for_factors(factor_names))
