"""Extreme-scenario strategic plan endpoint."""

from __future__ import annotations

from fastapi.testclient import TestClient


def _post(client: TestClient, **body) -> dict:
    resp = client.post("/api/extreme-plan", json=body)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_extreme_plan_heatwave_city(client: TestClient) -> None:
    payload = _post(
        client,
        ctuids=["5350528.20", "5350001.01"],
        scenario="heatwave",
        audience="city",
    )
    data = payload["data"]
    assert data["scenario"] == "heatwave"
    assert data["audience"] == "city"

    # Sorted by heatwave score descending: Springdale (88) before Flowertown (52).
    assert [c["ctuid"] for c in data["selected_communities"]] == ["5350528.20", "5350001.01"]
    assert data["totals"]["ct_count"] == 2
    assert data["totals"]["population_at_risk"] == 10000  # 5000 + 5000
    assert data["totals"]["max_score"] == 88.0

    # Springdale has humidex 32 + renters 0.55 → cooling-bus rule fires.
    actions = data["priority_actions"]
    bus = next(a for a in actions if a["id"] == "heatwave-city-cooling-bus")
    assert bus["actor"] == "City"
    assert "5350528.20" in bus["target_ctuids"]
    assert bus["est_cost_cad"] == 1800.0  # one CT × 1800

    # Total cost should match the sum across actions emitted.
    total = sum((a["est_cost_cad"] or 0) for a in actions)
    assert data["totals"]["est_cost_cad"] == total


def test_extreme_plan_icestorm_alectra(client: TestClient) -> None:
    data = _post(
        client,
        ctuids=["5350528.20", "5350001.01", "5350002.02"],
        scenario="icestorm",
        audience="alectra",
    )["data"]
    assert data["audience"] == "alectra"

    actions = data["priority_actions"]
    # Springdale has 2 active outages + 420 customers affected → crew pre-stage fires.
    crew = next(a for a in actions if a["id"] == "icestorm-alectra-crew-prestage")
    assert crew["actor"] == "Alectra"
    assert "5350528.20" in crew["target_ctuids"]
    assert crew["est_cost_cad"] == 6500.0

    # Restoration-priority list catches Critical/High-tier CTs (Springdale icestorm score = 70 → High).
    priority = next(a for a in actions if a["id"] == "icestorm-alectra-restore-priority")
    assert "5350528.20" in priority["target_ctuids"]


def test_extreme_plan_executive_summary_falls_back_without_gemini(client: TestClient) -> None:
    data = _post(
        client,
        ctuids=["5350528.20"],
        scenario="heatwave",
        audience="city",
    )["data"]
    # No GEMINI_API_KEY in the test fixture → deterministic prose path.
    assert data["used_llm"] is False
    assert "Springdale" in data["executive_summary"]
    assert "Heatwave" in data["executive_summary"]


def test_extreme_plan_all_missing_returns_404(client: TestClient) -> None:
    resp = client.post(
        "/api/extreme-plan",
        json={"ctuids": ["9999999.99"], "scenario": "heatwave", "audience": "city"},
    )
    assert resp.status_code == 404


def test_extreme_plan_some_missing_succeeds(client: TestClient) -> None:
    data = _post(
        client,
        ctuids=["5350528.20", "9999999.99"],
        scenario="heatwave",
        audience="city",
    )["data"]
    # Missing CT silently dropped; valid CT still drives the plan.
    assert data["totals"]["ct_count"] == 1
    assert data["selected_communities"][0]["ctuid"] == "5350528.20"


def test_extreme_plan_rejects_baseline_scenario(client: TestClient) -> None:
    resp = client.post(
        "/api/extreme-plan",
        json={"ctuids": ["5350528.20"], "scenario": "baseline", "audience": "city"},
    )
    assert resp.status_code == 422  # pydantic rejects literal value


def test_extreme_plan_rejects_empty_ctuids(client: TestClient) -> None:
    resp = client.post(
        "/api/extreme-plan",
        json={"ctuids": [], "scenario": "heatwave", "audience": "city"},
    )
    assert resp.status_code == 422
