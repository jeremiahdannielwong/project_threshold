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
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from .config import Settings, get_settings
from .db import Database
from .routes import (
    briefing,
    communities,
    extreme_plan,
    facilities,
    finance,
    flood,
    health,
    outages,
    recommendations,
    scenarios,
    weather,
)
from .services.data_loader import load_data_store
from .services.finance import FinanceService
from .services.flood import FloodService
from .services.llm import BriefingService
from .services.outages import OutageService
from .services.persistence import PersistenceService
from .services.weather import WeatherService
from .limiter import limiter

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
            headers={"User-Agent": "Threshold/1.0 (+https://github.com/Davedat-110105/project_threshold)"}
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
        app.state.finance_service = FinanceService(settings, client=app.state.http_client)
        logger.info(
            "Threshold backend ready — %d communities loaded from Postgres.",
            len(app.state.store.communities),
        )
        try:
            yield
        finally:
            await app.state.briefing_service.aclose()
            await app.state.http_client.aclose()
            await app.state.db.dispose()

    app = FastAPI(
        title="Threshold API",
        version="1.0.0",
        description=(
            "Community energy vulnerability platform for the Alectra service territory. "
            "Fuses census, vulnerability indices, live weather, flood signals, and utility "
            "outage data into traceable, scenario-aware scores for every Census Tract. "
            "Every numeric value is traceable to a named public dataset."
        ),
        default_response_class=ORJSONResponse,
        lifespan=lifespan,
    )

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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
    app.include_router(finance.router)

    return app


app = create_app()
