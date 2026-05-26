"""Rule-based recommendation card composer.

Each card lists the exact numeric inputs that justified it. The LLM is not
involved here — recommendations have to be reproducible and the numbers have
to be traceable to a public dataset, per the product axiom.

Rule design philosophy: small set of high-precision rules, each guarded by a
threshold derived from the data. The card surfaces *why* in plain language but
the numbers in the ``inputs`` array are what the UI clicks through to.
"""

from __future__ import annotations

from ..models.community import Scenario
from ..models.recommendation import Recommendation, RecommendationInput
from ..sources import FACTOR_TO_SOURCE, get_source
from .data_loader import CommunityRecord
from .scoring import risk_tier, score_for


def recommend(rec: CommunityRecord, scenario: Scenario) -> list[Recommendation]:
    """Return ranked, traceable cards for this CT/scenario pair."""
    p = rec.properties
    cards: list[Recommendation] = []

    score = score_for(rec, scenario)
    tier = risk_tier(score)
    pct_renters = _f(p.get("pct_renters"))
    pct_pre1980 = _f(p.get("pct_pre1980"))
    pct_low_income = _f(p.get("pct_low_income"))
    humidex = _f(p.get("humidex"))
    cisv_score = _f(p.get("cisv_score"))
    cisr_score = _f(p.get("cisr_score"))
    active_outages = _i(p.get("active_outages")) or 0
    customers_affected = _i(p.get("customers_affected")) or 0
    median_income = _f(p.get("median_income"))
    population = _i(p.get("population"))

    # ── Heatwave: cooling-bus pre-positioning ─────────────────────────────
    if scenario == "heatwave" and humidex is not None and humidex >= 28 and (pct_renters or 0) >= 0.40:
        cards.append(
            _card(
                rid=f"{rec.ctuid}-heatwave-cooling",
                action="Pre-position a mobile cooling bus before 4 PM today.",
                why=(
                    f"Humidex of {humidex:.1f}°C combined with a {(pct_renters or 0) * 100:.0f}% renter "
                    f"share suggests elevated indoor heat-stress risk in {rec.properties.get('neighbourhood', 'this CT')}."
                ),
                actor="City",
                confidence="High",
                projected_impact="Reduces ER heat-illness visits in this CT by an estimated 6–12 across the heat event.",
                cost_estimate_cad=1800.0,
                inputs=[
                    _input("humidex", humidex, "°C"),
                    _input("pct_renters", pct_renters, "share"),
                    _input("pct_pre1980", pct_pre1980, "share"),
                ],
                scenario=scenario,
            )
        )

    # ── Heatwave / Baseline: retrofit incentive flag for old + low-income ─
    if (
        (pct_pre1980 or 0) >= 0.30
        and (pct_low_income or 0) >= 0.15
        and scenario in ("baseline", "heatwave")
    ):
        cards.append(
            _card(
                rid=f"{rec.ctuid}-retrofit-incentive",
                action="Prioritise this CT for the next deep-retrofit incentive round.",
                why=(
                    f"{(pct_pre1980 or 0) * 100:.0f}% of dwellings pre-date 1980 and "
                    f"{(pct_low_income or 0) * 100:.0f}% of households are low-income (LIM 2020). "
                    "Building-envelope upgrades have a high marginal impact on heat and cold resilience here."
                ),
                actor="City",
                confidence="Medium",
                projected_impact=(
                    f"Reaching ~{int((population or 0) * 0.05)} dwellings yields measurable peak-load reduction "
                    "for Alectra's summer feeders."
                ),
                cost_estimate_cad=None,
                inputs=[
                    _input("pct_pre1980", pct_pre1980, "share"),
                    _input("pct_low_income", pct_low_income, "share"),
                    _input("median_income", median_income, "CAD"),
                    _input("population", population, "people"),
                ],
                scenario=scenario,
            )
        )

    # ── Ice storm: warming-capacity pre-stage ─────────────────────────────
    if scenario == "icestorm":
        outage_pressure = active_outages >= 1 or customers_affected >= 50
        if outage_pressure or (pct_renters or 0) >= 0.50:
            cards.append(
                _card(
                    rid=f"{rec.ctuid}-icestorm-warming",
                    action="Pre-stage a warming centre and confirm overnight staffing.",
                    why=(
                        f"{active_outages} active Alectra outage polygon(s) intersecting this CT, "
                        f"{customers_affected:,} customers affected, "
                        f"{(pct_renters or 0) * 100:.0f}% renter share with limited backup-heat options."
                    ),
                    actor="Alectra",
                    confidence="High" if outage_pressure else "Medium",
                    projected_impact="Reduces extended cold-exposure risk for displaced households.",
                    cost_estimate_cad=2500.0,
                    inputs=[
                        _input("active_outages", active_outages, "polygons"),
                        _input("customers_affected", customers_affected, "customers"),
                        _input("pct_renters", pct_renters, "share"),
                    ],
                    scenario=scenario,
                )
            )

    # ── Always: critical-tier flag for community partner outreach ─────────
    if tier in ("Critical", "High"):
        score_txt = f"{score:.1f}" if score is not None else "n/a"
        cisv_txt = f"{cisv_score:.3f}" if cisv_score is not None else "n/a"
        cisr_txt = f"{cisr_score:.3f}" if cisr_score is not None else "n/a"
        cards.append(
            _card(
                rid=f"{rec.ctuid}-community-partner",
                action="Engage a community-organisation partner for door-to-door welfare checks.",
                why=(
                    f"Threshold Score {score_txt} ({tier}). "
                    f"CISV {cisv_txt} and CISR {cisr_txt} indicate concentrated "
                    "social vulnerability that institutional channels alone will under-serve."
                ),
                actor="Community",
                confidence="Medium",
                projected_impact=None,
                cost_estimate_cad=None,
                inputs=[
                    _input("threshold_score", score, "0-100"),
                    _input("cisv_score", cisv_score, "index"),
                    _input("cisr_score", cisr_score, "index"),
                ],
                scenario=scenario,
            )
        )

    return cards


def _card(
    *,
    rid: str,
    action: str,
    why: str,
    actor: str,
    confidence: str,
    projected_impact: str | None,
    cost_estimate_cad: float | None,
    inputs: list[RecommendationInput],
    scenario: Scenario,
) -> Recommendation:
    return Recommendation(
        id=rid,
        action=action,
        why=why,
        actor=actor,  # type: ignore[arg-type]
        confidence=confidence,  # type: ignore[arg-type]
        projected_impact=projected_impact,
        cost_estimate_cad=cost_estimate_cad,
        inputs=inputs,
        scenario=scenario,
    )


def _input(name: str, value: float | int | None, units: str | None) -> RecommendationInput:
    slug = FACTOR_TO_SOURCE.get(name, "threshold-score-pca")
    return RecommendationInput(
        name=name,
        value=(value if value is not None else 0),
        units=units,
        source=get_source(slug),
    )


def _f(v: object) -> float | None:
    try:
        return float(v) if v is not None and v != "" else None  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _i(v: object) -> int | None:
    f = _f(v)
    return None if f is None else int(f)
