"""Weather endpoint."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_weather_baked(client: TestClient) -> None:
    resp = client.get("/api/weather")
    assert resp.status_code == 200
    rows = resp.json()["data"]
    assert len(rows) == 3
    # Springdale baked humidex = 32.0
    springdale = next(r for r in rows if r["ctuid"] == "5350528.20")
    assert springdale["humidex"] == 32.0


def test_weather_live(client: TestClient) -> None:
    resp = client.get("/api/weather", params={"live": "true"})
    assert resp.status_code == 200
    rows = resp.json()["data"]
    assert len(rows) == 3
    # Stubbed Open-Meteo returns apparent_temperature=23.0 for all points.
    for r in rows:
        assert r["humidex"] == 23.0


def test_weather_simulate_heatwave(client: TestClient) -> None:
    resp = client.get(
        "/api/weather",
        params={"simulate": "true", "humidex": 48.0, "temperature_c": 42.0},
    )
    assert resp.status_code == 200
    rows = resp.json()["data"]
    assert len(rows) == 3
    for r in rows:
        assert r["humidex"] == 48.0
        assert r["temperature_c"] == 42.0
    # Un-overridden fields keep their baked values.
    springdale = next(r for r in rows if r["ctuid"] == "5350528.20")
    assert springdale["wind_gusts_kmh"] == 22.0


def test_weather_simulate_icestorm(client: TestClient) -> None:
    resp = client.get(
        "/api/weather",
        params={
            "simulate": "true",
            "temperature_c": -15.0,
            "wind_gusts_kmh": 90.0,
            "precipitation_mm": 20.0,
            "weather_code": 67,
        },
    )
    assert resp.status_code == 200
    rows = resp.json()["data"]
    for r in rows:
        assert r["temperature_c"] == -15.0
        assert r["wind_gusts_kmh"] == 90.0
        assert r["precipitation_mm"] == 20.0
        assert r["weather_code"] == 67


def test_weather_simulate_no_overrides_returns_baked(client: TestClient) -> None:
    resp = client.get("/api/weather", params={"simulate": "true"})
    assert resp.status_code == 200
    springdale = next(r for r in resp.json()["data"] if r["ctuid"] == "5350528.20")
    assert springdale["humidex"] == 32.0


def test_weather_live_and_simulate_conflict(client: TestClient) -> None:
    resp = client.get(
        "/api/weather",
        params={"live": "true", "simulate": "true", "humidex": 48.0},
    )
    assert resp.status_code == 400
