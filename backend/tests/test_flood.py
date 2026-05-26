"""Flood endpoint + FloodService summarisation."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_flood_default_returns_empty(client: TestClient) -> None:
    resp = client.get("/api/flood")
    assert resp.status_code == 200
    body = resp.json()
    assert body["data"] == []
    assert body["sources"][0]["slug"] == "open-meteo-flood"


def test_flood_live_returns_per_ct_rows(client: TestClient) -> None:
    resp = client.get("/api/flood", params={"live": "true"})
    assert resp.status_code == 200
    rows = resp.json()["data"]
    assert len(rows) == 3
    # Stubbed GloFAS: today=6.0, past 30d mean=4.0, forecast peak=18.0.
    for r in rows:
        assert r["river_discharge"] == 6.0
        assert r["discharge_30d_mean"] == 4.0
        assert r["discharge_7d_max"] == 18.0
        # 18.0 / 4.0 = 4.5 → clear hazard anomaly.
        assert r["discharge_anomaly"] == 4.5


class _FakePersistence:
    """Stand-in for PersistenceService that captures flood batch writes."""

    def __init__(self) -> None:
        self.enabled = True
        self.batches: list[list[dict]] = []

    async def record_flood_batch(self, rows):
        materialised = list(rows)
        self.batches.append(materialised)
        return len(materialised)


def test_flood_live_persists_when_db_enabled(client: TestClient) -> None:
    """When the DB is on, every live fetch must record one row per CT."""
    flood_service = client.app.state.flood_service
    fake = _FakePersistence()
    flood_service._persistence = fake
    flood_service.clear_cache()

    resp = client.get("/api/flood", params={"live": "true"})
    assert resp.status_code == 200

    assert len(fake.batches) == 1
    rows = fake.batches[0]
    assert len(rows) == 3
    ctuids = {r["ctuid"] for r in rows}
    assert ctuids == {"5350528.20", "5350001.01", "5350002.02"}
    sample = rows[0]
    assert sample["river_discharge"] == 6.0
    assert sample["discharge_7d_max"] == 18.0
    assert sample["raw_payload"]["daily"]["time"][0].startswith("2026-")
