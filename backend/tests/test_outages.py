"""Live outage feed proxy."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_outages_envelope(client: TestClient) -> None:
    resp = client.get("/api/outages")
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"]["type"] == "FeatureCollection"
    assert len(body["data"]["features"]) == 1
    feat = body["data"]["features"][0]
    # KEEP_PROPS filter must drop unknown properties.
    assert feat["properties"] == {"CUSTOUT": 120, "OUTTYPE": "Storm"}
    assert body["sources"][0]["slug"] == "alectra-outages-live"


def test_outage_summary(client: TestClient) -> None:
    resp = client.get("/api/outages/summary")
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"] == {"active_outages": 1, "customers_affected": 120}
