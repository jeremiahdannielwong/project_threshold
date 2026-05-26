"""Stage 6 -- Publish.

Promotes the latest scores + curated features + staging facilities into the
three serving tables the FastAPI app reads at startup:

  public.communities    (CT polygons + scores + factor values)
  public.facilities     (cooling / warming centres)
  public.pca_loadings   (per-scenario factor weights for the radar chart)

The promotion runs as a single transaction (DELETE then INSERT for each
table) so the backend never reads a half-rewritten ontology.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

import pandas as pd
from sqlalchemy import delete, text

from ...models.db import Community, Facility, PcaLoading
from ..config import FACTOR_SOURCE_MAP, SCENARIOS, grade_for
from . import StageResult

logger = logging.getLogger(__name__)


_FEATURES_SQL = text(
    """
    SELECT
        cf.ctuid,
        cf.population,
        cf.median_income,
        cf.pct_renters,
        cf.pct_pre1980,
        cf.pct_low_income,
        cf.cisv_score,
        cf.cisv_dim1,
        cf.cisv_dim2,
        cf.cisv_dim3,
        cf.cisv_dim4,
        cf.cisr_score,
        cf.neighbourhood,
        cf.served_by_alectra,
        cf.geometry
    FROM curated.community_features cf
    """
)

_SCORES_SQL = text(
    """
    SELECT DISTINCT ON (s.ctuid, s.scenario)
        s.ctuid, s.scenario, s.score, s.grade, s.model_id, s.computed_at
    FROM ml.community_scores s
    ORDER BY s.ctuid, s.scenario, s.computed_at DESC
    """
)

_LOADINGS_SQL = text(
    """
    SELECT DISTINCT ON (scenario)
        scenario, factor_columns, loadings
    FROM ml.models
    ORDER BY scenario, version DESC, fitted_at DESC
    """
)


# Tier C live-data placeholder columns -- the read endpoints hydrate these.
_TIER_C_DEFAULTS: dict[str, Any] = {
    "temperature_c": None,
    "humidex": None,
    "precipitation_mm": None,
    "wind_speed_kmh": None,
    "wind_gusts_kmh": None,
    "weather_code": None,
    "active_outages": 0,
    "customers_affected": 0,
}


async def _publish_communities(db: Any) -> int:
    async with db.session() as session:
        features = (await session.execute(_FEATURES_SQL)).mappings().all()
        scores = (await session.execute(_SCORES_SQL)).mappings().all()
    if not features:
        logger.warning("publish: curated.community_features is empty")
        return 0

    score_lookup: dict[tuple[str, str], dict[str, Any]] = {
        (s["ctuid"], s["scenario"]): dict(s) for s in scores
    }

    rows: list[dict[str, Any]] = []
    for f in features:
        ctuid = f["ctuid"]
        props: dict[str, Any] = {
            "population": f["population"],
            "median_income": f["median_income"],
            "pct_renters": f["pct_renters"],
            "pct_pre1980": f["pct_pre1980"],
            "pct_low_income": f["pct_low_income"],
            "cisv_score": f["cisv_score"],
            "cisv_dim1": f["cisv_dim1"],
            "cisv_dim2": f["cisv_dim2"],
            "cisv_dim3": f["cisv_dim3"],
            "cisv_dim4": f["cisv_dim4"],
            "cisr_score": f["cisr_score"],
            "neighbourhood": f["neighbourhood"],
            "served_by_alectra": f["served_by_alectra"],
        }
        for col, default in _TIER_C_DEFAULTS.items():
            props[col] = default

        for scenario in SCENARIOS:
            entry = score_lookup.get((ctuid, scenario))
            if entry is not None:
                props[f"threshold_score_{scenario}"] = entry["score"]
                props[f"model_id_{scenario}"] = entry["model_id"]
            else:
                props[f"threshold_score_{scenario}"] = None
                props[f"model_id_{scenario}"] = None

        baseline_score = props.get("threshold_score_baseline")
        props["threshold_score"] = baseline_score
        props["risk_level"] = grade_for(baseline_score)

        geom = f["geometry"]
        if isinstance(geom, str):
            try:
                geom = json.loads(geom)
            except json.JSONDecodeError:
                geom = None
        rows.append({"ctuid": ctuid, "properties": props, "geometry": geom})

    async with db.session() as session:
        await session.execute(delete(Community))
        if rows:
            session.add_all([Community(**r) for r in rows])
        await session.commit()
    return len(rows)


async def _publish_facilities(db: Any) -> int:
    async with db.session() as session:
        rows = (
            await session.execute(
                text(
                    """
                    SELECT name, address, type, role, website, source_layer, geometry
                    FROM staging.facilities
                    """
                )
            )
        ).mappings().all()

    out: list[dict[str, Any]] = []
    for r in rows:
        geom = r["geometry"]
        if isinstance(geom, str):
            try:
                geom = json.loads(geom)
            except json.JSONDecodeError:
                geom = None
        props = {
            "name": r["name"],
            "address": r["address"],
            "type": r["type"],
            "role": r["role"],
            "website": r["website"],
            "_source_layer": r["source_layer"],
        }
        out.append({"properties": props, "geometry": geom})

    async with db.session() as session:
        await session.execute(delete(Facility))
        if out:
            session.add_all([Facility(**r) for r in out])
        await session.commit()
    return len(out)


async def _publish_loadings(db: Any) -> int:
    async with db.session() as session:
        rows = (await session.execute(_LOADINGS_SQL)).mappings().all()
    if not rows:
        return 0

    factor_to_row: dict[str, dict[str, Any]] = {}
    for r in rows:
        scenario = r["scenario"]
        loadings = r["loadings"]
        if isinstance(loadings, str):
            loadings = json.loads(loadings)
        for factor, coef in loadings.items():
            entry = factor_to_row.setdefault(
                factor,
                {
                    "factor": factor,
                    "loading_baseline": 0.0,
                    "loading_heatwave": 0.0,
                    "loading_icestorm": 0.0,
                    "source_slug": FACTOR_SOURCE_MAP.get(factor),
                },
            )
            entry[f"loading_{scenario}"] = float(coef)

    out = sorted(
        factor_to_row.values(), key=lambda r: abs(r["loading_baseline"]), reverse=True
    )
    async with db.session() as session:
        await session.execute(delete(PcaLoading))
        if out:
            session.add_all([PcaLoading(**r) for r in out])
        await session.commit()
    return len(out)


async def run(db: Any) -> StageResult:
    started = time.perf_counter()
    details = {
        "communities": await _publish_communities(db),
        "facilities": await _publish_facilities(db),
        "pca_loadings": await _publish_loadings(db),
    }
    elapsed = time.perf_counter() - started
    total = sum(details.values())
    logger.info("publish: wrote %d rows in %.2fs (%s)", total, elapsed, details)
    return StageResult(
        name="publish",
        rows_written=total,
        elapsed_seconds=elapsed,
        details=details,
    )
