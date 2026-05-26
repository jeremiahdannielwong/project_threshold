"""LLM briefing — deterministic fallback path (GEMINI_API_KEY unset)."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_briefing_fallback_uses_real_numbers(client: TestClient) -> None:
    resp = client.post(
        "/api/briefing",
        json={"ctuid": "5350528.20", "scenario": "heatwave"},
    )
    assert resp.status_code == 200
    body = resp.json()
    data = body["data"]
    assert data["used_llm"] is False
    assert data["score"] == 88.0
    # The deterministic briefing must include the actual score and neighbourhood.
    assert "Springdale" in data["briefing"]
    assert "88.0" in data["briefing"]
    # Inputs surface the exact numeric values that justified the prose.
    assert data["inputs"]["humidex"] == 32.0
    assert data["inputs"]["pct_renters"] == 0.55


def test_briefing_unknown_ct(client: TestClient) -> None:
    resp = client.post("/api/briefing", json={"ctuid": "9999999.99", "scenario": "baseline"})
    assert resp.status_code == 404


def test_briefing_invalid_scenario(client: TestClient) -> None:
    resp = client.post("/api/briefing", json={"ctuid": "5350528.20", "scenario": "tornado"})
    assert resp.status_code == 422
