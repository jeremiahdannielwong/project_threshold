"""Test fixtures.

The pipeline writes to Postgres and the backend reads from it, but tests
shouldn't require a running database. We hand the lifespan a pre-built
``DataStore`` via monkeypatch on ``load_data_store`` so the test app boots
with a deterministic three-CT ontology and never opens a real connection.

All outbound HTTP from the backend is routed through an httpx MockTransport
so tests cannot accidentally reach the network.
"""

from __future__ import annotations

from typing import Iterator

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.services.data_loader import CommunityRecord, DataStore, FactorLoading


@pytest.fixture
def synthetic_store() -> DataStore:
    """Three CTs covering Critical / Moderate / Low risk tiers."""
    store = DataStore(loaded_at="2026-05-25T00:00:00+00:00")
    store.communities = {
        "5350528.20": _community(
            "5350528.20",
            "Springdale",
            threshold_baseline=82.0,
            threshold_heatwave=88.0,
            threshold_icestorm=70.0,
            risk_level="Critical",
            pct_renters=0.55,
            pct_pre1980=0.40,
            pct_low_income=0.18,
            humidex=32.0,
            cisv_score=0.48,
            cisr_score=0.21,
            active_outages=2,
            customers_affected=420,
        ),
        "5350001.01": _community(
            "5350001.01",
            "Brampton Flowertown",
            threshold_baseline=45.0,
            threshold_heatwave=52.0,
            threshold_icestorm=40.0,
            risk_level="Moderate",
            pct_renters=0.22,
            pct_pre1980=0.10,
            pct_low_income=0.07,
            humidex=27.0,
            cisv_score=0.20,
            cisr_score=0.55,
            active_outages=0,
            customers_affected=0,
        ),
        "5350002.02": _community(
            "5350002.02",
            "Bramalea",
            threshold_baseline=18.0,
            threshold_heatwave=20.0,
            threshold_icestorm=22.0,
            risk_level="Low",
            pct_renters=0.30,
            pct_pre1980=0.50,
            pct_low_income=0.05,
            humidex=26.0,
            cisv_score=0.12,
            cisr_score=0.62,
            active_outages=0,
            customers_affected=0,
        ),
    }
    store.facilities = [
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [-79.75, 43.73]},
            "properties": {
                "name": "Chinguacousy Wellness Centre",
                "type": "Cooling Centre",
                "_source_layer": "recreation",
            },
        }
    ]
    store.loadings = {
        name: FactorLoading(
            name=name,
            loading_baseline=baseline,
            loading_heatwave=heatwave,
            loading_icestorm=icestorm,
        )
        for name, baseline, heatwave, icestorm in [
            ("cisv_score", 0.45, 0.40, 0.42),
            ("cisv_dim1", 0.05, 0.05, 0.05),
            ("cisv_dim2", 0.29, 0.28, 0.30),
            ("cisv_dim3", 0.26, 0.25, 0.27),
            ("cisv_dim4", 0.41, 0.40, 0.42),
            ("cisr_score", -0.30, -0.28, -0.31),
            ("pct_renters", 0.22, 0.30, 0.32),
            ("pct_pre1980", 0.18, 0.16, 0.18),
            ("humidex", 0.25, 0.45, 0.10),
            ("median_income", -0.15, -0.14, -0.16),
        ]
    }
    return store


@pytest.fixture
def settings() -> Settings:
    return Settings(
        GEMINI_API_KEY=None,
        THRESHOLD_OUTAGES_TTL=60,
        THRESHOLD_WEATHER_TTL=60,
        THRESHOLD_DATABASE_URL=None,
    )


@pytest.fixture
def client(
    settings: Settings,
    synthetic_store: DataStore,
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[TestClient]:
    """Sync test client. Lifespan runs automatically on context enter/exit.

    The data store is injected via a monkeypatched ``load_data_store`` (so the
    test app never opens a DB connection). All outbound HTTP from the backend
    is intercepted by an httpx MockTransport that returns canned Alectra +
    Open-Meteo + Gemini payloads.
    """

    async def fake_load(_db):  # noqa: ANN001 — db arg unused
        return synthetic_store

    monkeypatch.setattr("app.main.load_data_store", fake_load)

    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if "Outage_Details" in url or "outage" in url.lower():
            return httpx.Response(
                200,
                json={
                    "type": "FeatureCollection",
                    "features": [
                        {
                            "type": "Feature",
                            "geometry": {
                                "type": "Polygon",
                                "coordinates": [
                                    [
                                        [-79.7, 43.7],
                                        [-79.6, 43.7],
                                        [-79.6, 43.8],
                                        [-79.7, 43.7],
                                    ]
                                ],
                            },
                            "properties": {"CUSTOUT": 120, "OUTTYPE": "Storm"},
                        }
                    ],
                },
            )
        if "flood-api.open-meteo.com" in url:
            # 30 past days at 4.0 m³/s, today at 6.0, 7 forecast days peaking at 18.0.
            past = [4.0] * 30
            today = [6.0]
            forecast = [8.0, 10.0, 14.0, 18.0, 16.0, 12.0, 9.0]
            series = past + today + forecast
            times = [f"2026-04-{(i % 28) + 1:02d}" for i in range(len(series))]
            return httpx.Response(
                200,
                json={
                    "latitude": 43.73,
                    "longitude": -79.74,
                    "daily": {
                        "time": times,
                        "river_discharge": series,
                        "river_discharge_mean": series,
                        "river_discharge_max": series,
                    },
                },
            )
        if "open-meteo" in url:
            return httpx.Response(
                200,
                json=[
                    {
                        "current": {
                            "temperature_2m": 21.5,
                            "apparent_temperature": 23.0,
                            "precipitation": 0.0,
                            "wind_speed_10m": 12.0,
                            "wind_gusts_10m": 24.0,
                            "weather_code": 0,
                        }
                    }
                ]
                * 3,
            )
        if "generativelanguage.googleapis.com" in url:
            return httpx.Response(
                200,
                json={
                    "candidates": [
                        {"content": {"parts": [{"text": "Stub briefing — score 82.0 (Critical)."}]}}
                    ]
                },
            )
        return httpx.Response(404, json={"error": f"unstubbed: {url}"})

    transport = httpx.MockTransport(handler)
    real_async_client = httpx.AsyncClient

    def patched_client(*args, **kwargs):
        kwargs["transport"] = transport
        return real_async_client(*args, **kwargs)

    monkeypatch.setattr("app.main.httpx.AsyncClient", patched_client)

    app = create_app(settings=settings)
    with TestClient(app) as c:
        yield c


def _community(
    ctuid: str,
    neighbourhood: str,
    *,
    threshold_baseline: float,
    threshold_heatwave: float,
    threshold_icestorm: float,
    risk_level: str,
    pct_renters: float,
    pct_pre1980: float,
    pct_low_income: float,
    humidex: float,
    cisv_score: float,
    cisr_score: float,
    active_outages: int,
    customers_affected: int,
) -> CommunityRecord:
    return CommunityRecord(
        ctuid=ctuid,
        properties={
            "ctuid": ctuid,
            "neighbourhood": neighbourhood,
            "population": 5000,
            "median_income": 68000,
            "pct_renters": pct_renters,
            "pct_pre1980": pct_pre1980,
            "pct_low_income": pct_low_income,
            "cisv_score": cisv_score,
            "cisv_dim1": 0.10,
            "cisv_dim2": 0.20,
            "cisv_dim3": 0.15,
            "cisv_dim4": 0.18,
            "cisv_quintile": 4,
            "cisr_score": cisr_score,
            "cisr_dim1": 0.30,
            "cisr_dim2": 0.25,
            "cisr_dim3": 0.20,
            "cisr_quintile": 3,
            "temperature_c": 20.5,
            "humidex": humidex,
            "precipitation_mm": 0.0,
            "wind_speed_kmh": 10.0,
            "wind_gusts_kmh": 22.0,
            "weather_code": 0,
            "active_outages": active_outages,
            "customers_affected": customers_affected,
            "threshold_score_baseline": threshold_baseline,
            "threshold_score_heatwave": threshold_heatwave,
            "threshold_score_icestorm": threshold_icestorm,
            "threshold_score": threshold_baseline,
            "risk_level": risk_level,
        },
        geometry={
            "type": "Polygon",
            "coordinates": [
                [
                    [-79.75, 43.73],
                    [-79.74, 43.73],
                    [-79.74, 43.74],
                    [-79.75, 43.74],
                    [-79.75, 43.73],
                ]
            ],
        },
    )
