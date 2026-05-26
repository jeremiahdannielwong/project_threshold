"""Scenario metadata + facility overlay."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_scenarios_metadata(client: TestClient) -> None:
    resp = client.get("/api/scenarios")
    assert resp.status_code == 200
    rows = resp.json()["data"]
    slugs = {row["slug"] for row in rows}
    assert slugs == {"baseline", "heatwave", "icestorm"}
    heatwave = next(row for row in rows if row["slug"] == "heatwave")
    assert heatwave["weight_overrides"]["humidex"] == 2.5


def test_facilities_overlay(client: TestClient) -> None:
    resp = client.get("/api/facilities")
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["type"] == "FeatureCollection"
    assert len(body["data"]["features"]) == 1
    assert body["data"]["features"][0]["properties"]["name"] == "Chinguacousy Wellness Centre"
