"""Health and readiness."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from ..deps import get_store
from ..services.data_loader import DataStore

router = APIRouter()


@router.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready", tags=["health"])
def ready(store: Annotated[DataStore, Depends(get_store)]) -> dict[str, object]:
    return {
        "status": "ok" if store.communities else "degraded",
        "communities": len(store.communities),
        "facilities": len(store.facilities),
        "loadings": len(store.loadings),
        "loaded_at": store.loaded_at,
    }
