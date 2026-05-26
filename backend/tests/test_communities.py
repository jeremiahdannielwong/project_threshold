"""Communities endpoints."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_list_communities_envelope(client: TestClient) -> None:
    resp = client.get("/api/communities")
    assert resp.status_code == 200
    body = resp.json()
    assert "data" in body and "sources" in body and "generated_at" in body
    assert len(body["data"]) == 3
    ctuids = {c["ctuid"] for c in body["data"]}
    assert ctuids == {"5350528.20", "5350001.01", "5350002.02"}


def test_list_communities_sort_and_limit(client: TestClient) -> None:
    resp = client.get("/api/communities", params={"sort_by": "heatwave", "limit": 2})
    assert resp.status_code == 200
    rows = resp.json()["data"]
    assert len(rows) == 2
    # 88 (Springdale) > 52 (Flowertown) > 20 (Bramalea)
    assert rows[0]["ctuid"] == "5350528.20"
    assert rows[1]["ctuid"] == "5350001.01"


def test_community_detail_factor_breakdown(client: TestClient) -> None:
    resp = client.get("/api/communities/5350528.20", params={"scenario": "heatwave"})
    assert resp.status_code == 200
    body = resp.json()
    detail = body["data"]
    assert detail["ctuid"] == "5350528.20"
    assert detail["neighbourhood"] == "Springdale"
    assert detail["risk_level"] == "Critical"
    assert detail["scores"]["heatwave"] == 88.0
    factor_names = {f["name"] for f in detail["factors"]}
    # Spec requires the 10 PCA factors to be present in the breakdown.
    assert {"cisv_score", "humidex", "median_income", "cisr_score"}.issubset(factor_names)
    # Every factor must carry its source citation.
    for factor in detail["factors"]:
        assert factor["source"]["slug"]
        assert factor["source"]["url"]
    # Sources at envelope level must dedupe.
    slugs = [s["slug"] for s in body["sources"]]
    assert len(slugs) == len(set(slugs))


def test_community_detail_not_found(client: TestClient) -> None:
    resp = client.get("/api/communities/9999999.99")
    assert resp.status_code == 404
