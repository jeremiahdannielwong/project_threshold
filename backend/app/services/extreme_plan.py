"""City-wide / utility-wide strategic plan composer for extreme scenarios.

Aggregates a user-selected set of Census Tracts under a heatwave or ice storm
and emits a prioritised, audience-tailored action plan. Rules-based — the
numeric values in every action are traceable to a public dataset, in keeping
with the product axiom. The LLM (handled by BriefingService) layers prose on
top but never invents numbers.
"""

from __future__ import annotations

from ..models.extreme_plan import (
    Audience,
    ExtremeScenario,
    PlanTotals,
    PriorityAction,
    SelectedCommunity,
)
from ..models.recommendation import RecommendationInput
from ..sources import FACTOR_TO_SOURCE, get_source
from .data_loader import CommunityRecord, DataStore
from .scoring import risk_tier, score_for

# Heuristics for "this CT belongs in this action bucket". Tuned to the synthetic
# fixtures but reasonable for real Brampton data — easy to tune later.
HUMIDEX_HEAT_THRESHOLD = 28.0           # °C apparent temperature
RENTER_HEAT_THRESHOLD = 0.40            # share renters
PRE1980_RETROFIT_THRESHOLD = 0.30       # share pre-1980 dwellings
LOW_INCOME_THRESHOLD = 0.15             # LIM share
RENTER_ICESTORM_THRESHOLD = 0.50        # renters need warming capacity
OUTAGE_PRESSURE_CUSTOMERS = 50          # min customers affected for crew pre-stage

# Cost ballparks (CAD). Same numbers used by recommendations.py per-CT cards.
COST_COOLING_BUS = 1800.0
COST_WARMING_CENTRE = 2500.0
COST_FEEDER_PRECHECK = 1200.0
COST_CREW_PRESTAGE = 6500.0


def build_plan(
    store: DataStore,
    ctuids: list[str],
    scenario: ExtremeScenario,
    audience: Audience,
) -> tuple[PlanTotals, list[SelectedCommunity], list[PriorityAction], list[str]]:
    """Return totals, selected-community summary, ranked actions, and missing CTUIDs."""
    found: list[CommunityRecord] = []
    missing: list[str] = []
    for ctuid in ctuids:
        rec = store.get(ctuid)
        if rec is None:
            missing.append(ctuid)
        else:
            found.append(rec)

    # Sort by scenario score descending so "top of the list" = highest risk.
    found.sort(key=lambda r: score_for(r, scenario) or -1.0, reverse=True)

    selected = [_summary(r, scenario) for r in found]
    totals = _totals(found, scenario)
    actions = _actions(found, scenario, audience)
    return totals, selected, actions, missing


def _summary(rec: CommunityRecord, scenario: ExtremeScenario) -> SelectedCommunity:
    score = score_for(rec, scenario)
    return SelectedCommunity(
        ctuid=rec.ctuid,
        neighbourhood=str(rec.properties.get("neighbourhood") or "Brampton"),
        score=score,
        risk_level=risk_tier(score),
        population=_i(rec.properties.get("population")),
        customers_affected=_i(rec.properties.get("customers_affected")) or 0,
    )


def _totals(recs: list[CommunityRecord], scenario: ExtremeScenario) -> PlanTotals:
    population = 0
    customers = 0
    scores: list[float] = []
    for r in recs:
        population += _i(r.properties.get("population")) or 0
        customers += _i(r.properties.get("customers_affected")) or 0
        s = score_for(r, scenario)
        if s is not None:
            scores.append(s)
    # Cost estimate: sum of all action costs across actions emitted for this set.
    # Computed in a second pass below to avoid divergence.
    return PlanTotals(
        ct_count=len(recs),
        population_at_risk=population,
        customers_at_risk=customers,
        est_cost_cad=0.0,  # filled in by caller via the actions list
        max_score=max(scores) if scores else None,
        avg_score=(sum(scores) / len(scores)) if scores else None,
    )


def _actions(
    recs: list[CommunityRecord],
    scenario: ExtremeScenario,
    audience: Audience,
) -> list[PriorityAction]:
    if scenario == "heatwave":
        return _heatwave_actions(recs, audience)
    return _icestorm_actions(recs, audience)


# ─────────────────────────── Heatwave ──────────────────────────────


def _heatwave_actions(recs: list[CommunityRecord], audience: Audience) -> list[PriorityAction]:
    out: list[PriorityAction] = []

    if audience == "city":
        bus_recs = [
            r for r in recs
            if (_f(r.properties.get("humidex")) or 0) >= HUMIDEX_HEAT_THRESHOLD
            and (_f(r.properties.get("pct_renters")) or 0) >= RENTER_HEAT_THRESHOLD
        ]
        if bus_recs:
            out.append(_bucket(
                rid="heatwave-city-cooling-bus",
                action="Pre-position mobile cooling buses before 4 PM.",
                actor="City",
                confidence="High",
                target=bus_recs,
                why=(
                    f"{len(bus_recs)} selected CT(s) combine humidex ≥ {HUMIDEX_HEAT_THRESHOLD:.0f}°C with "
                    f"≥ {RENTER_HEAT_THRESHOLD * 100:.0f}% renter share — indoor heat-stress risk concentrates here."
                ),
                cost_per_ct=COST_COOLING_BUS,
                input_keys=("humidex", "pct_renters"),
            ))

        retrofit_recs = [
            r for r in recs
            if (_f(r.properties.get("pct_pre1980")) or 0) >= PRE1980_RETROFIT_THRESHOLD
            and (_f(r.properties.get("pct_low_income")) or 0) >= LOW_INCOME_THRESHOLD
        ]
        if retrofit_recs:
            out.append(_bucket(
                rid="heatwave-city-retrofit",
                action="Prioritise these CTs in the next deep-retrofit incentive round.",
                actor="City",
                confidence="Medium",
                target=retrofit_recs,
                why=(
                    f"{len(retrofit_recs)} selected CT(s) have ≥ {PRE1980_RETROFIT_THRESHOLD * 100:.0f}% pre-1980 "
                    f"dwellings and ≥ {LOW_INCOME_THRESHOLD * 100:.0f}% low-income households — envelope upgrades "
                    "produce the largest per-dollar heat-resilience gain."
                ),
                cost_per_ct=None,
                input_keys=("pct_pre1980", "pct_low_income", "median_income"),
            ))

    if audience == "alectra":
        feeder_recs = [
            r for r in recs
            if (_f(r.properties.get("humidex")) or 0) >= HUMIDEX_HEAT_THRESHOLD
            and (_i(r.properties.get("population")) or 0) >= 3000
        ]
        if feeder_recs:
            out.append(_bucket(
                rid="heatwave-alectra-feeder",
                action="Run feeder-capacity pre-check and ready voltage-stabilization standby.",
                actor="Alectra",
                confidence="High",
                target=feeder_recs,
                why=(
                    f"{len(feeder_recs)} selected CT(s) have humidex ≥ {HUMIDEX_HEAT_THRESHOLD:.0f}°C and population "
                    "≥ 3000 — AC load on these feeders will spike during the event."
                ),
                cost_per_ct=COST_FEEDER_PRECHECK,
                input_keys=("humidex", "population"),
            ))

        notif_recs = [r for r in recs if risk_tier(score_for(r, "heatwave")) in ("Critical", "High")]
        if notif_recs:
            out.append(_bucket(
                rid="heatwave-alectra-customer-notify",
                action="Push peak-load shed advisory to customers in these CTs.",
                actor="Alectra",
                confidence="Medium",
                target=notif_recs,
                why=(
                    f"{len(notif_recs)} selected CT(s) sit in Critical/High Threshold tier under the heatwave "
                    "scenario — customer cooperation on peak shed has the largest grid impact here."
                ),
                cost_per_ct=None,
                input_keys=("humidex",),
            ))

    return out


# ─────────────────────────── Ice storm ─────────────────────────────


def _icestorm_actions(recs: list[CommunityRecord], audience: Audience) -> list[PriorityAction]:
    out: list[PriorityAction] = []

    if audience == "city":
        warming_recs = [
            r for r in recs
            if (_i(r.properties.get("active_outages")) or 0) >= 1
            or (_i(r.properties.get("customers_affected")) or 0) >= OUTAGE_PRESSURE_CUSTOMERS
            or (_f(r.properties.get("pct_renters")) or 0) >= RENTER_ICESTORM_THRESHOLD
        ]
        if warming_recs:
            out.append(_bucket(
                rid="icestorm-city-warming-centre",
                action="Pre-stage warming centres and confirm overnight staffing.",
                actor="City",
                confidence="High",
                target=warming_recs,
                why=(
                    f"{len(warming_recs)} selected CT(s) show active outage pressure or ≥ "
                    f"{RENTER_ICESTORM_THRESHOLD * 100:.0f}% renter share — limited backup-heat options for "
                    "displaced households."
                ),
                cost_per_ct=COST_WARMING_CENTRE,
                input_keys=("active_outages", "customers_affected", "pct_renters"),
            ))

        outreach_recs = [r for r in recs if risk_tier(score_for(r, "icestorm")) in ("Critical", "High")]
        if outreach_recs:
            out.append(_bucket(
                rid="icestorm-city-outreach",
                action="Engage community partners for door-to-door welfare checks in these CTs.",
                actor="Community",
                confidence="Medium",
                target=outreach_recs,
                why=(
                    f"{len(outreach_recs)} selected CT(s) sit in Critical/High tier — institutional channels "
                    "will under-serve socially-isolated residents during an extended outage."
                ),
                cost_per_ct=None,
                input_keys=("cisv_score", "cisr_score"),
            ))

    if audience == "alectra":
        crew_recs = [
            r for r in recs
            if (_i(r.properties.get("active_outages")) or 0) >= 1
            or (_i(r.properties.get("customers_affected")) or 0) >= OUTAGE_PRESSURE_CUSTOMERS
        ]
        if crew_recs:
            out.append(_bucket(
                rid="icestorm-alectra-crew-prestage",
                action="Pre-stage line crews and bucket trucks adjacent to these feeders.",
                actor="Alectra",
                confidence="High",
                target=crew_recs,
                why=(
                    f"{len(crew_recs)} selected CT(s) already show active outage pressure — pre-staging "
                    "shortens MTTR once the storm front lands."
                ),
                cost_per_ct=COST_CREW_PRESTAGE,
                input_keys=("active_outages", "customers_affected"),
            ))

        priority_recs = [r for r in recs if risk_tier(score_for(r, "icestorm")) in ("Critical", "High")]
        if priority_recs:
            out.append(_bucket(
                rid="icestorm-alectra-restore-priority",
                action="Add these CTs to the restoration-priority list (medical baseline + vulnerable households).",
                actor="Alectra",
                confidence="High",
                target=priority_recs,
                why=(
                    f"{len(priority_recs)} selected CT(s) sit in Critical/High tier — restoration sequencing here "
                    "drives the largest reduction in cold-exposure exposure-hours."
                ),
                cost_per_ct=None,
                input_keys=("pct_renters", "cisv_score"),
            ))

    return out


# ────────────────────────────── helpers ─────────────────────────────


def _bucket(
    *,
    rid: str,
    action: str,
    actor: str,
    confidence: str,
    target: list[CommunityRecord],
    why: str,
    cost_per_ct: float | None,
    input_keys: tuple[str, ...],
) -> PriorityAction:
    affected = sum((_i(r.properties.get("population")) or 0) for r in target)
    est_cost = cost_per_ct * len(target) if cost_per_ct is not None else None
    inputs = _aggregate_inputs(target, input_keys)
    return PriorityAction(
        id=rid,
        action=action,
        actor=actor,  # type: ignore[arg-type]
        confidence=confidence,  # type: ignore[arg-type]
        target_ctuids=[r.ctuid for r in target],
        affected_population=affected,
        est_cost_cad=est_cost,
        why=why,
        inputs=inputs,
    )


def _aggregate_inputs(
    target: list[CommunityRecord],
    keys: tuple[str, ...],
) -> list[RecommendationInput]:
    """For each input key, surface the cohort average (or sum, for outages)."""
    out: list[RecommendationInput] = []
    for key in keys:
        slug = FACTOR_TO_SOURCE.get(key, "threshold-score-pca")
        if key in ("active_outages", "customers_affected"):
            total = sum((_i(r.properties.get(key)) or 0) for r in target)
            value: float | int = total
            units = "customers" if key == "customers_affected" else "polygons"
        elif key == "population":
            total = sum((_i(r.properties.get(key)) or 0) for r in target)
            value = total
            units = "people"
        elif key == "median_income":
            vals = [_f(r.properties.get(key)) for r in target]
            clean = [v for v in vals if v is not None]
            value = (sum(clean) / len(clean)) if clean else 0.0
            units = "CAD"
        else:
            vals = [_f(r.properties.get(key)) for r in target]
            clean = [v for v in vals if v is not None]
            value = (sum(clean) / len(clean)) if clean else 0.0
            if key.startswith("pct_"):
                units = "share"
            elif key == "humidex":
                units = "°C"
            else:
                units = "index"
        out.append(RecommendationInput(name=key, value=value, units=units, source=get_source(slug)))
    return out


def total_cost(actions: list[PriorityAction]) -> float:
    return float(sum(a.est_cost_cad or 0.0 for a in actions))


def _f(v: object) -> float | None:
    try:
        return float(v) if v is not None and v != "" else None  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _i(v: object) -> int | None:
    f = _f(v)
    return None if f is None else int(f)


__all__ = ["build_plan", "total_cost"]
