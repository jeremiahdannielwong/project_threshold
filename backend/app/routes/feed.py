"""Resident-facing ambient feed.

One endpoint per CT (``GET /api/feed/{ctuid}``) reads from the in-memory cache
maintained by :class:`FeedSweepService`. Gemini never runs in the request path.

A thin postal-prefix resolver (``GET /api/feed/lookup``) maps a Brampton FSA
(first 3 chars of a postal code, e.g. ``L6R``) to the closest CT centroid so
residents don't need to know their CTUID.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from ..deps import get_store
from ..models.common import Envelope
from ..models.feed import FeedEntry, FeedStatus, PostalLookupResponse
from ..services.data_loader import DataStore
from ..services.feed import FeedCache
from ..sources import sources_for_factors

router = APIRouter(prefix="/api/feed", tags=["feed"])


# Approximate FSA centroids for Brampton (lon, lat). Used purely to resolve a
# postal-prefix query to a representative CT — the resident sees the CT whose
# centroid is closest. Source: public postal code databases, rounded.
_BRAMPTON_FSA_CENTROIDS: dict[str, tuple[float, float]] = {
    "L6P": (-79.7066, 43.7644),
    "L6R": (-79.7800, 43.7404),
    "L6S": (-79.7350, 43.7250),
    "L6T": (-79.7236, 43.7036),
    "L6V": (-79.7607, 43.6863),
    "L6W": (-79.7400, 43.6850),
    "L6X": (-79.7848, 43.6926),
    "L6Y": (-79.7700, 43.6646),
    "L6Z": (-79.8050, 43.7350),
    "L7A": (-79.8350, 43.7300),
}


def _get_cache(request: Request) -> FeedCache:
    cache = getattr(request.app.state, "feed_cache", None)
    if cache is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Ambient feed is not initialised on this instance.",
        )
    return cache


def _get_interval(request: Request) -> int:
    sweep = getattr(request.app.state, "feed_sweep", None)
    return int(getattr(sweep, "_interval", 3600)) if sweep is not None else 3600


@router.get("/status", response_model=Envelope[FeedStatus])
def get_status(
    request: Request,
    cache: Annotated[FeedCache, Depends(_get_cache)],
) -> Envelope[FeedStatus]:
    return Envelope(data=cache.status(_get_interval(request)), sources=[])


@router.get("/lookup", response_model=Envelope[PostalLookupResponse])
def lookup_by_postal(
    store: Annotated[DataStore, Depends(get_store)],
    postal: str = Query(
        min_length=3,
        max_length=7,
        description="Full postal code or 3-character FSA (e.g. 'L6R' or 'L6R 3T1').",
    ),
) -> Envelope[PostalLookupResponse]:
    """Resolve a postal prefix to the nearest CT in the Brampton coverage."""
    prefix = postal.strip().upper().replace(" ", "")[:3]
    fsa = _BRAMPTON_FSA_CENTROIDS.get(prefix)
    if fsa is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"Postal prefix {prefix!r} is outside the Brampton MVP coverage. "
                f"Supported FSAs: {', '.join(sorted(_BRAMPTON_FSA_CENTROIDS))}"
            ),
        )

    centroids = store.centroids()
    if not centroids:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No CT centroids loaded — pipeline data may be missing.",
        )

    fsa_lon, fsa_lat = fsa
    best_ctuid: str | None = None
    best_dist = float("inf")
    for ctuid, lon, lat in centroids:
        d = (lon - fsa_lon) ** 2 + (lat - fsa_lat) ** 2
        if d < best_dist:
            best_dist = d
            best_ctuid = ctuid

    if best_ctuid is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No matching CT.")

    rec = store.get(best_ctuid)
    neighbourhood = str((rec.properties.get("neighbourhood") if rec else None) or "Brampton")
    return Envelope(
        data=PostalLookupResponse(
            postal_prefix=prefix,
            ctuid=best_ctuid,
            neighbourhood=neighbourhood,
        ),
        sources=[],
    )


@router.get("/{ctuid}", response_model=Envelope[FeedEntry])
def get_feed_entry(
    ctuid: str,
    store: Annotated[DataStore, Depends(get_store)],
    cache: Annotated[FeedCache, Depends(_get_cache)],
) -> Envelope[FeedEntry]:
    """Serve the cached ambient feed entry for one CT. No LLM call here."""
    rec = store.get(ctuid)
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Census Tract {ctuid!r} not found.",
        )
    entry = cache.get(rec.ctuid)
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Ambient briefing not yet generated for this CT. "
                "The first sweep runs at app startup — try again in a few seconds."
            ),
        )
    return Envelope(
        data=entry,
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
