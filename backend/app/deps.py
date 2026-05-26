"""FastAPI dependency wiring.

The data store, outage service, weather service, and briefing service all live
on ``app.state``. These helpers turn them into typed FastAPI dependencies so
routes can declare them in their signatures.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

from .config import Settings
from .db import Database
from .services.data_loader import DataStore
from .services.flood import FloodService
from .services.llm import BriefingService
from .services.outages import OutageService
from .services.persistence import PersistenceService
from .services.weather import WeatherService


def get_settings_dep(request: Request) -> Settings:
    return request.app.state.settings


def get_store(request: Request) -> DataStore:
    return request.app.state.store


def get_outage_service(request: Request) -> OutageService:
    return request.app.state.outage_service


def get_weather_service(request: Request) -> WeatherService:
    return request.app.state.weather_service


def get_flood_service(request: Request) -> FloodService:
    return request.app.state.flood_service


def get_briefing_service(request: Request) -> BriefingService:
    return request.app.state.briefing_service


def get_db(request: Request) -> Database:
    return request.app.state.db


def get_persistence(request: Request) -> PersistenceService:
    return request.app.state.persistence


def require_community(ctuid: str, store: Annotated[DataStore, Depends(get_store)]):
    rec = store.get(ctuid)
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Census Tract {ctuid!r} not found.",
        )
    return rec
