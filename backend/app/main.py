"""Threshold FastAPI application entrypoint.

Lifespan owns the lifecycle of:
  - the in-memory ontology (DataStore)
  - the shared httpx client used by the Tier C proxies
  - the outage, weather, and briefing service singletons

Routes pull these off ``app.state`` via ``app.deps``.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse

from .config import Settings, get_settings
from .db import Database
from .routes import (
    briefing,
    communities,
    extreme_plan,
    facilities,
    flood,
    health,
    outages,
    recommendations,
    scenarios,
    weather,
)
from .services.data_loader import load_data_store
from .services.flood import FloodService
from .services.llm import BriefingService
from .services.outages import OutageService
from .services.persistence import PersistenceService
from .services.weather import WeatherService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger("threshold")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.settings = settings
        # DB must come up before the store — the store is loaded from it.
        app.state.db = Database(settings)
        await app.state.db.connect()
        app.state.persistence = PersistenceService(app.state.db)
        app.state.store = await load_data_store(app.state.db)
        app.state.http_client = httpx.AsyncClient(
            headers={"User-Agent": "Threshold/0.1 (+https://threshold.ca)"}
        )
        app.state.outage_service = OutageService(settings, client=app.state.http_client)
        app.state.weather_service = WeatherService(
            settings, store=app.state.store, client=app.state.http_client
        )
        app.state.flood_service = FloodService(
            settings,
            store=app.state.store,
            persistence=app.state.persistence,
            client=app.state.http_client,
        )
        app.state.briefing_service = BriefingService(settings, client=app.state.http_client)
        logger.info(
            "Threshold backend ready — %d communities loaded from Postgres.",
            len(app.state.store.communities),
        )
        try:
            yield
        finally:
            await app.state.http_client.aclose()
            await app.state.db.dispose()

    app = FastAPI(
        title="Threshold",
        version="0.1.0",
        description=(
            "Civic data fusion API for community energy vulnerability. "
            "Every numeric value is traceable to a public dataset."
        ),
        default_response_class=ORJSONResponse,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(scenarios.router)
    app.include_router(communities.router)
    app.include_router(outages.router)
    app.include_router(weather.router)
    app.include_router(flood.router)
    app.include_router(facilities.router)
    app.include_router(briefing.router)
    app.include_router(recommendations.router)
    app.include_router(extreme_plan.router)

    return app


app = create_app()
