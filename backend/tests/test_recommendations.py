"""Recommendation cards."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_heatwave_card_appears_for_high_humidex_renter_ct(client: TestClient) -> None:
    resp = client.get(
        "/api/recommendations",
        params={"ct": "5350528.20", "scenario": "heatwave"},
    )
    assert resp.status_code == 200
    cards = resp.json()["data"]
    actions = {c["action"] for c in cards}
    assert any("cooling bus" in a for a in actions)
    # Every recommendation must list its numeric inputs.
    for card in cards:
        assert card["inputs"], "recommendation has no traceable inputs"
        for inp in card["inputs"]:
            assert inp["source"]["slug"]


def test_icestorm_card_triggers_on_active_outage(client: TestClient) -> None:
    resp = client.get(
        "/api/recommendations",
        params={"ct": "5350528.20", "scenario": "icestorm"},
    )
    assert resp.status_code == 200
    cards = resp.json()["data"]
    assert any("warming centre" in c["action"].lower() or "warming" in c["action"].lower() for c in cards)


def test_low_risk_ct_returns_few_or_no_cards(client: TestClient) -> None:
    resp = client.get(
        "/api/recommendations",
        params={"ct": "5350002.02", "scenario": "baseline"},
    )
    assert resp.status_code == 200
    cards = resp.json()["data"]
    # Pre-1980 share is 50% but low-income share is 5%, so retrofit rule misses.
    # Tier is Low so community-partner rule misses. Result: zero cards.
    assert cards == []


def test_unknown_ct_404(client: TestClient) -> None:
    resp = client.get("/api/recommendations", params={"ct": "9999999.99"})
    assert resp.status_code == 404
