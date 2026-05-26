"""Community (Census Tract) endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from ..deps import get_store, require_community
from ..models.common import Envelope
from ..models.community import CommunityDetail, CommunitySummary, Scenario
from ..services.data_loader import CommunityRecord, DataStore
from ..services.scoring import to_detail, to_summary
from ..sources import sources_for_factors

router = APIRouter(prefix="/api/communities", tags=["communities"])


@router.get("", response_model=Envelope[list[CommunitySummary]])
def list_communities(
    store: Annotated[DataStore, Depends(get_store)],
    sort_by: Annotated[Scenario | None, Query(description="Sort descending by this scenario's score.")] = None,
    limit: Annotated[int | None, Query(ge=1, le=1000)] = None,
) -> Envelope[list[CommunitySummary]]:
    summaries = [to_summary(rec) for rec in store.list()]

    if sort_by is not None:
        key = {
            "baseline": "threshold_score_baseline",
            "heatwave": "threshold_score_heatwave",
            "icestorm": "threshold_score_icestorm",
        }[sort_by]
        summaries.sort(key=lambda s: (getattr(s, key) or -1), reverse=True)

    if limit is not None:
        summaries = summaries[:limit]

    return Envelope(
        data=summaries,
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


@router.get("/{ctuid}", response_model=Envelope[CommunityDetail])
def get_community(
    rec: Annotated[CommunityRecord, Depends(require_community)],
    store: Annotated[DataStore, Depends(get_store)],
    scenario: Annotated[Scenario, Query()] = "baseline",
) -> Envelope[CommunityDetail]:
    detail = to_detail(rec, store, scenario)
    return Envelope(
        data=detail,
        sources=sources_for_factors([f.name for f in detail.factors]),
    )
