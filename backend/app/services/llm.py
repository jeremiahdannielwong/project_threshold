"""LLM briefing orchestration with deterministic fallback.

Invariant: the LLM never invents numbers. Every numeric value that may appear
in the prose has to be present in the prompt's structured input table. When the
LLM is unavailable (no key, timeout, network error) we emit a deterministic
prose briefing built from the same numbers. The product axiom holds either
way.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from pydantic import BaseModel, Field
from pydantic_ai import Agent
from pydantic_ai.models.google import GoogleModel
from pydantic_ai.models.google import GoogleModel as GeminiModel
from pydantic_ai.providers.google import GoogleProvider

from ..config import Settings
from ..models.briefing import BriefingResponse
from ..models.community import Scenario
from ..models.extreme_plan import (
    Audience,
    ExtremeScenario,
    PlanTotals,
    PriorityAction,
    SelectedCommunity,
)
from .data_loader import (
    FACTOR_LABELS,
    PCA_FACTORS,
    CommunityRecord,
    DataStore,
)
from .scoring import (
    SCENARIO_DESCRIPTIONS,
    SCENARIO_LABELS,
    risk_tier,
    score_for,
)

logger = logging.getLogger(__name__)


class _StructuredBriefing(BaseModel):
    snapshot: str = Field(
        description=(
            "Paragraph 1: Threshold Score, risk tier, population. "
            "Name the top 2 vulnerability drivers from the data table."
        )
    )
    scenario_risk: str = Field(
        description=(
            "Paragraph 2: What this specific scenario means for this neighbourhood. "
            "Be concrete — use exact numbers from the data table only."
        )
    )
    action: str = Field(
        description=(
            "Paragraph 3: One specific, immediately actionable recommendation. "
            "Name the actor (City / Alectra / community org) and frame the impact using data."
        )
    )


class _StructuredPlanSummary(BaseModel):
    summary: str = Field(
        description=(
            "4-6 sentence executive summary. Lead with CT count and population at risk. "
            "Name the top 2-3 neighbourhoods by name. End with the single highest-leverage action."
        )
    )


@dataclass
class BriefingInputs:
    ctuid: str
    neighbourhood: str
    scenario: Scenario
    score: float | None
    risk_level: str | None
    population: int | None
    median_income: float | None
    pct_renters: float | None
    pct_pre1980: float | None
    pct_low_income: float | None
    cisv_score: float | None
    cisv_dim1: float | None
    cisv_dim2: float | None
    cisv_dim3: float | None
    cisv_dim4: float | None
    cisr_score: float | None
    cisr_dim1: float | None
    cisr_dim2: float | None
    cisr_dim3: float | None
    humidex: float | None
    temperature_c: float | None
    active_outages: int
    customers_affected: int
    # Derived signals — the pipeline's richer outputs that sharpen the prose.
    score_baseline: float | None
    score_heatwave: float | None
    score_icestorm: float | None
    score_delta_heatwave: float | None
    score_delta_icestorm: float | None
    dominant_factor_name: str | None
    dominant_factor_label: str | None
    dominant_factor_value: float | None
    nearest_facility_name: str | None
    nearest_facility_kind: str | None
    nearest_facility_km: float | None
    secondary_plan_area: str | None

    def as_dict(self) -> dict[str, float | int | str | None]:
        return {
            "ctuid": self.ctuid,
            "neighbourhood": self.neighbourhood,
            "scenario": self.scenario,
            "score": self.score,
            "risk_level": self.risk_level,
            "population": self.population,
            "median_income": self.median_income,
            "pct_renters": self.pct_renters,
            "pct_pre1980": self.pct_pre1980,
            "pct_low_income": self.pct_low_income,
            "cisv_score": self.cisv_score,
            "cisv_dim1": self.cisv_dim1,
            "cisv_dim2": self.cisv_dim2,
            "cisv_dim3": self.cisv_dim3,
            "cisv_dim4": self.cisv_dim4,
            "cisr_score": self.cisr_score,
            "cisr_dim1": self.cisr_dim1,
            "cisr_dim2": self.cisr_dim2,
            "cisr_dim3": self.cisr_dim3,
            "humidex": self.humidex,
            "temperature_c": self.temperature_c,
            "active_outages": self.active_outages,
            "customers_affected": self.customers_affected,
            "score_baseline": self.score_baseline,
            "score_heatwave": self.score_heatwave,
            "score_icestorm": self.score_icestorm,
            "score_delta_heatwave": self.score_delta_heatwave,
            "score_delta_icestorm": self.score_delta_icestorm,
            "dominant_factor_name": self.dominant_factor_name,
            "dominant_factor_label": self.dominant_factor_label,
            "dominant_factor_value": self.dominant_factor_value,
            "nearest_facility_name": self.nearest_facility_name,
            "nearest_facility_kind": self.nearest_facility_kind,
            "nearest_facility_km": self.nearest_facility_km,
            "secondary_plan_area": self.secondary_plan_area,
        }


def inputs_for(
    rec: CommunityRecord,
    scenario: Scenario,
    *,
    store: DataStore | None = None,
    overrides: dict[str, float | int | None] | None = None,
) -> BriefingInputs:
    """Assemble the structured input table Gemini will see.

    ``store`` unlocks the richer signals — PCA loadings (dominant factor) and
    nearest facility — by giving us the data the pipeline has already produced
    but that the slim properties view never surfaces. Passing ``None`` keeps
    backward compatibility with callers that just want the lean view.

    ``overrides`` lets the sweep stamp fresh Tier C signals (live humidex,
    temperature) onto the inputs without mutating the underlying record.
    """
    p = dict(rec.properties)
    if overrides:
        p.update({k: v for k, v in overrides.items() if v is not None})

    baseline = score_for(rec, "baseline")
    heatwave = score_for(rec, "heatwave")
    icestorm = score_for(rec, "icestorm")
    chosen = {"baseline": baseline, "heatwave": heatwave, "icestorm": icestorm}[scenario]

    dom_name, dom_label, dom_value = _dominant_factor(rec, store, scenario)
    near = _nearest_facility(rec, store) if store else None

    return BriefingInputs(
        ctuid=rec.ctuid,
        neighbourhood=str(p.get("neighbourhood") or "Brampton"),
        scenario=scenario,
        score=chosen,
        risk_level=risk_tier(chosen),
        population=_i(p.get("population")),
        median_income=_f(p.get("median_income")),
        pct_renters=_f(p.get("pct_renters")),
        pct_pre1980=_f(p.get("pct_pre1980")),
        pct_low_income=_f(p.get("pct_low_income")),
        cisv_score=_f(p.get("cisv_score")),
        cisv_dim1=_f(p.get("cisv_dim1")),
        cisv_dim2=_f(p.get("cisv_dim2")),
        cisv_dim3=_f(p.get("cisv_dim3")),
        cisv_dim4=_f(p.get("cisv_dim4")),
        cisr_score=_f(p.get("cisr_score")),
        cisr_dim1=_f(p.get("cisr_dim1")),
        cisr_dim2=_f(p.get("cisr_dim2")),
        cisr_dim3=_f(p.get("cisr_dim3")),
        humidex=_f(p.get("humidex")),
        temperature_c=_f(p.get("temperature_c")),
        active_outages=_i(p.get("active_outages")) or 0,
        customers_affected=_i(p.get("customers_affected")) or 0,
        score_baseline=baseline,
        score_heatwave=heatwave,
        score_icestorm=icestorm,
        score_delta_heatwave=_delta(heatwave, baseline),
        score_delta_icestorm=_delta(icestorm, baseline),
        dominant_factor_name=dom_name,
        dominant_factor_label=dom_label,
        dominant_factor_value=dom_value,
        nearest_facility_name=near[0] if near else None,
        nearest_facility_kind=near[1] if near else None,
        nearest_facility_km=near[2] if near else None,
        secondary_plan_area=_secondary_plan_area(p),
    )


def _delta(a: float | None, b: float | None) -> float | None:
    if a is None or b is None:
        return None
    return round(a - b, 1)


def _secondary_plan_area(p: dict) -> str | None:
    for key in ("secondary_plan_area", "secondary_plan", "spa_name", "ward_name"):
        val = p.get(key)
        if val:
            return str(val)
    return None


def _dominant_factor(
    rec: CommunityRecord,
    store: DataStore | None,
    scenario: Scenario,
) -> tuple[str | None, str | None, float | None]:
    """Identify the factor with the largest |loading × raw_value| contribution.

    This is the single biggest driver of *this* CT's score under *this*
    scenario. Loadings come from the pipeline's PCA fit; raw values come from
    the CT record. No new numbers are invented — the contribution is a
    composition of two already-traceable values.
    """
    if store is None or not store.loadings:
        return None, None, None
    loading_attr = f"loading_{scenario}"
    best_name: str | None = None
    best_label: str | None = None
    best_value: float | None = None
    best_score = -1.0
    for name in PCA_FACTORS:
        loading_obj = store.loadings.get(name)
        if loading_obj is None:
            continue
        loading = getattr(loading_obj, loading_attr, 0.0) or 0.0
        raw = _f(rec.properties.get(name))
        if raw is None:
            continue
        contribution = abs(loading * raw)
        if contribution > best_score:
            best_score = contribution
            best_name = name
            best_label = FACTOR_LABELS.get(name, name)
            best_value = raw
    return best_name, best_label, best_value


def _nearest_facility(
    rec: CommunityRecord,
    store: DataStore,
) -> tuple[str, str, float] | None:
    """Return (name, kind, distance_km) of the closest facility to this CT.

    Uses CT centroid → facility-point haversine distance. Pipeline-grade sjoin
    isn't worth the dependency cost here — facilities are points, CTs are
    polygons, and we just want to name a reasonable nearby option.
    """
    if not store.facilities:
        return None
    try:
        cx, cy = _centroid_of(rec.geometry)
    except (ValueError, TypeError):
        return None

    best: tuple[str, str, float] | None = None
    for feat in store.facilities:
        coords = (feat.get("geometry") or {}).get("coordinates")
        props = feat.get("properties") or {}
        if not coords or len(coords) < 2:
            continue
        try:
            lon, lat = float(coords[0]), float(coords[1])
        except (TypeError, ValueError):
            continue
        d = _haversine_km(cx, cy, lon, lat)
        name = str(props.get("NAME") or props.get("Name") or props.get("name") or "Facility")
        kind = str(props.get("_source_layer") or "facility")
        if best is None or d < best[2]:
            best = (name, kind, round(d, 2))
    return best


def _centroid_of(geometry: dict | None) -> tuple[float, float]:
    if not geometry:
        raise ValueError("missing geometry")
    geom_type = geometry.get("type")
    coords = geometry.get("coordinates")
    if not coords:
        raise ValueError("empty geometry")
    if geom_type == "Polygon":
        ring = coords[0]
    elif geom_type == "MultiPolygon":
        ring = coords[0][0]
    else:
        raise ValueError(f"unsupported geometry: {geom_type!r}")
    xs = [pt[0] for pt in ring]
    ys = [pt[1] for pt in ring]
    return sum(xs) / len(xs), sum(ys) / len(ys)


def _haversine_km(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    from math import asin, cos, radians, sin, sqrt

    r = 6371.0
    lat1r, lat2r = radians(lat1), radians(lat2)
    dlat = lat2r - lat1r
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(lat1r) * cos(lat2r) * sin(dlon / 2) ** 2
    return 2 * r * asin(sqrt(a))


class BriefingService:
    """Orchestrates LLM briefings via pydantic-ai with deterministic fallback.

    When GEMINI_API_KEY is set, uses a pydantic-ai Agent with structured output
    (guaranteed JSON schema) backed by Gemini. Falls back to deterministic prose
    when the key is absent or the model call fails — the product axiom holds
    either way.
    """

    def __init__(self, settings: Settings, client: object = None) -> None:
        # client parameter kept for API compatibility with main.py lifespan;
        # pydantic-ai manages its own HTTP connections.
        self._settings = settings
        self._briefing_agent: Agent | None = None
        self._plan_agent: Agent | None = None
        if settings.gemini_api_key:
            _model = GoogleModel(
                settings.gemini_model,
                provider=GoogleProvider(api_key=settings.gemini_api_key),
            )
            self._briefing_agent = Agent(
                _model,
                output_type=_StructuredBriefing,
                model_settings={"temperature": 0.2},
            )
            self._plan_agent = Agent(
                _model,
                output_type=_StructuredPlanSummary,
                model_settings={"temperature": 0.2},
            )

    async def brief(
        self,
        rec: CommunityRecord,
        scenario: Scenario,
        *,
        store: DataStore | None = None,
        overrides: dict[str, float | int | None] | None = None,
    ) -> BriefingResponse:
        """Generate a briefing.

        ``store`` activates the richer Gemini prompt — PCA loadings give us the
        dominant factor, facilities give us nearest-facility context. ``overrides``
        lets the ambient sweep stamp fresh Tier C values (live humidex, temperature)
        onto the input table without mutating the underlying record.
        """
        inp = inputs_for(rec, scenario, store=store, overrides=overrides)
        if self._briefing_agent is None:
            return self._fallback(inp)
        structured = await self._call_briefing_agent(inp)
        if structured is None:
            return self._fallback(inp)
        prose = "\n\n".join([structured.snapshot, structured.scenario_risk, structured.action])
        return BriefingResponse(
            ctuid=inp.ctuid,
            scenario=inp.scenario,
            risk_level=inp.risk_level,
            score=inp.score,
            briefing=prose,
            inputs=inp.as_dict(),
            used_llm=True,
        )

    async def _call_briefing_agent(self, inp: BriefingInputs) -> _StructuredBriefing | None:
        assert self._briefing_agent is not None
        try:
            result = await self._briefing_agent.run(_build_prompt(inp))
            return result.output
        except Exception as exc:
            logger.warning("Gemini briefing agent failed: %s — falling back.", exc)
            return None

    async def extreme_plan_summary(
        self,
        scenario: ExtremeScenario,
        audience: Audience,
        totals: PlanTotals,
        selected: list[SelectedCommunity],
        actions: list[PriorityAction],
    ) -> tuple[str, bool]:
        """Executive summary for a city- or utility-wide extreme-scenario plan.

        Returns ``(prose, used_llm)``. Falls back to a deterministic narrative
        when the LLM is unavailable so the response always carries prose
        grounded in the same numbers the rules surfaced.
        """
        if self._plan_agent is None:
            return _deterministic_extreme_summary(scenario, audience, totals, selected, actions), False
        prose = await self._call_plan_agent(scenario, audience, totals, selected, actions)
        if prose is None:
            return _deterministic_extreme_summary(scenario, audience, totals, selected, actions), False
        return prose, True

    async def _call_plan_agent(
        self,
        scenario: ExtremeScenario,
        audience: Audience,
        totals: PlanTotals,
        selected: list[SelectedCommunity],
        actions: list[PriorityAction],
    ) -> str | None:
        assert self._plan_agent is not None
        try:
            result = await self._plan_agent.run(
                _build_extreme_prompt(scenario, audience, totals, selected, actions)
            )
            return result.output.summary
        except Exception as exc:
            logger.warning("Gemini extreme-plan agent failed: %s — falling back.", exc)
            return None

    async def aclose(self) -> None:
        pass  # pydantic-ai manages its own HTTP connections

    @staticmethod
    def _fallback(inp: BriefingInputs) -> BriefingResponse:
        return BriefingResponse(
            ctuid=inp.ctuid,
            scenario=inp.scenario,
            risk_level=inp.risk_level,
            score=inp.score,
            briefing=_deterministic_briefing(inp),
            inputs=inp.as_dict(),
            used_llm=False,
        )


def _build_prompt(inp: BriefingInputs) -> str:
    """Hand the LLM the *exact* numbers it is allowed to reference.

    The system instruction is explicit: do not invent numbers, do not round
    differently, do not introduce statistics that are not in the table. The
    table is wide on purpose — Gemini's prose accuracy is bounded by the
    richness of the pipeline outputs surfaced here.
    """
    rows = [
        ("Threshold Score", inp.score, "0–100 PCA composite"),
        ("Risk Tier", inp.risk_level, "Critical / High / Moderate / Low"),
        ("Population", inp.population, "people, 2021 Census"),
        ("Median Household Income", inp.median_income, "CAD, 2020"),
        ("Renter Households (%)", inp.pct_renters, "share of households"),
        ("Pre-1980 Dwellings (%)", inp.pct_pre1980, "share of dwellings"),
        ("Low-Income Households (%)", inp.pct_low_income, "LIM, 2020"),
        ("CISV Composite", inp.cisv_score, "StatsCan 2021"),
        ("CISV Dim 1 — Racialized & Immigrant", inp.cisv_dim1, "StatsCan 2021 sub-dimension"),
        ("CISV Dim 2 — Income & Labour", inp.cisv_dim2, "StatsCan 2021 sub-dimension"),
        ("CISV Dim 3 — Education", inp.cisv_dim3, "StatsCan 2021 sub-dimension"),
        ("CISV Dim 4 — Dwelling Conditions", inp.cisv_dim4, "StatsCan 2021 sub-dimension"),
        ("CISR Composite", inp.cisr_score, "StatsCan 2021 — high = resilient"),
        ("CISR Dim 1", inp.cisr_dim1, "StatsCan 2021 resilience sub-dimension"),
        ("CISR Dim 2", inp.cisr_dim2, "StatsCan 2021 resilience sub-dimension"),
        ("CISR Dim 3", inp.cisr_dim3, "StatsCan 2021 resilience sub-dimension"),
        ("Current Humidex", inp.humidex, "°C, Open-Meteo"),
        ("Current Air Temp", inp.temperature_c, "°C, Open-Meteo"),
        ("Active Alectra Outages (overlap)", inp.active_outages, "polygon count"),
        ("Customers Affected (overlap)", inp.customers_affected, "Alectra CUSTOUT sum"),
        ("Score · Baseline", inp.score_baseline, "0–100"),
        ("Score · Heatwave", inp.score_heatwave, "0–100"),
        ("Score · Ice Storm", inp.score_icestorm, "0–100"),
        ("Heat-Sensitivity (Δ vs baseline)", inp.score_delta_heatwave, "+ = heat-amplified"),
        ("Cold-Sensitivity (Δ vs baseline)", inp.score_delta_icestorm, "+ = cold-amplified"),
        ("Dominant Driver", inp.dominant_factor_label, "factor name"),
        ("Dominant Driver — raw value", inp.dominant_factor_value, "see factor definition"),
        ("Nearest Facility", inp.nearest_facility_name, "name from Brampton ESRI"),
        ("Nearest Facility — Distance", inp.nearest_facility_km, "km from CT centroid"),
        ("Secondary Plan Area", inp.secondary_plan_area, "municipal label"),
    ]
    table = "\n".join(
        f"- {name}: {('—' if value is None else value)}  ({unit})"
        for name, value, unit in rows
    )
    energy_pct = (
        f"{(2400 / inp.median_income * 100):.0f}%"
        if inp.median_income and inp.median_income > 0 else "unknown"
    )
    return (
        "You are Threshold, a civic emergency-intelligence briefing engine. "
        "Write a THREE-PARAGRAPH operational briefing for an emergency manager "
        f"about {inp.neighbourhood} (Census Tract {inp.ctuid}) under the "
        f"{SCENARIO_LABELS[inp.scenario]} scenario.\n\n"
        "PARAGRAPH STRUCTURE — map to the three output fields:\n"
        "• snapshot: State the Threshold Score, risk tier, and population. "
        "Name the top 2 vulnerability drivers from the data table.\n"
        "• scenario_risk: Explain what the "
        f"{SCENARIO_LABELS[inp.scenario]} scenario specifically means for this "
        "neighbourhood given its exact factor values. Be concrete — use numbers.\n"
        "• action: Give one specific, immediately actionable recommendation with "
        "a clear actor (City / Alectra / community org) and a plausible impact "
        "framing grounded in the data.\n\n"
        "STRICT RULES:\n"
        "1. Use ONLY numbers from the INPUT TABLE below. Do not invent, estimate, "
        "or reference any figure not listed.\n"
        "2. No disclaimers, caveats, or source citations — the UI handles that.\n"
        "3. Each paragraph is one output field — three fields total.\n\n"
        f"Scenario: {SCENARIO_LABELS[inp.scenario]}\n"
        f"Logic: {SCENARIO_DESCRIPTIONS[inp.scenario]}\n"
        f"Estimated energy cost as % of median income: {energy_pct} "
        "(derived from $2,400/yr avg hydro cost — already in the table)\n\n"
        f"INPUT TABLE:\n{table}\n"
    )


def _deterministic_briefing(inp: BriefingInputs) -> str:
    """Prose path used when the LLM is unavailable. Numbers only — no flourish."""
    parts: list[str] = []
    score_txt = f"{inp.score:.1f}" if inp.score is not None else "n/a"
    tier_txt = inp.risk_level or "Unknown"
    parts.append(
        f"Census Tract {inp.ctuid} ({inp.neighbourhood}) scores {score_txt} on the "
        f"{SCENARIO_LABELS[inp.scenario]} scenario — risk tier: {tier_txt}."
    )

    drivers: list[str] = []
    if inp.dominant_factor_label and inp.dominant_factor_value is not None:
        drivers.append(f"{inp.dominant_factor_label} = {inp.dominant_factor_value:.3f} (the largest contributor here)")
    if inp.cisv_score is not None:
        drivers.append(f"CISV composite {inp.cisv_score:.3f}")
    if inp.pct_renters is not None:
        drivers.append(f"{inp.pct_renters * 100:.0f}% renter households")
    if inp.pct_pre1980 is not None:
        drivers.append(f"{inp.pct_pre1980 * 100:.0f}% pre-1980 dwellings")
    if inp.humidex is not None and inp.scenario == "heatwave":
        drivers.append(f"humidex {inp.humidex:.1f}°C")
    if inp.active_outages and inp.scenario == "icestorm":
        drivers.append(f"{inp.active_outages} active outage polygon(s)")
    if drivers:
        parts.append("Primary drivers: " + ", ".join(drivers) + ".")

    if inp.median_income is not None:
        parts.append(f"Median household income is CAD {inp.median_income:,.0f}.")
    if inp.population is not None:
        parts.append(f"Resident population: {inp.population:,}.")

    if inp.nearest_facility_name and inp.nearest_facility_km is not None:
        parts.append(
            f"Nearest facility: {inp.nearest_facility_name} ({inp.nearest_facility_km:.1f} km from the CT centroid)."
        )

    if inp.scenario == "heatwave":
        parts.append("Operational implication: prioritise cooling-centre outreach for high-renter pre-1980 stock.")
    elif inp.scenario == "icestorm":
        parts.append("Operational implication: pre-stage warming capacity ahead of forecast outages.")
    else:
        parts.append("Operational implication: structural vulnerability persists year-round; review retrofit eligibility.")

    return " ".join(parts)


def _build_extreme_prompt(
    scenario: ExtremeScenario,
    audience: Audience,
    totals: PlanTotals,
    selected: list[SelectedCommunity],
    actions: list[PriorityAction],
) -> str:
    """Prompt for the city/utility executive summary.

    Same axiom as `_build_prompt`: only the numbers in the input table may
    appear in the prose. The audience controls which framing the LLM uses.
    """
    audience_label = "City of Brampton emergency-management staff" if audience == "city" else "Alectra utility operations staff"
    audience_focus = (
        "cooling/warming centre deployment, retrofit prioritisation, and community-outreach coordination"
        if audience == "city"
        else "feeder capacity, crew pre-staging, customer notifications, and restoration sequencing"
    )

    totals_rows = [
        ("Selected CT count", totals.ct_count, "neighbourhoods"),
        ("Population at risk", totals.population_at_risk, "people"),
        ("Customers already without power", totals.customers_at_risk, "Alectra customers"),
        ("Estimated mobilisation cost", f"{totals.est_cost_cad:,.0f}", "CAD"),
        ("Highest scenario score", totals.max_score, "0–100"),
        ("Average scenario score", totals.avg_score, "0–100"),
    ]
    totals_table = "\n".join(
        f"- {name}: {('—' if value is None else value)}  ({unit})"
        for name, value, unit in totals_rows
    )

    top = selected[:5]
    top_table = "\n".join(
        f"- {s.neighbourhood} ({s.ctuid}): score "
        f"{('n/a' if s.score is None else f'{s.score:.1f}')}, tier {s.risk_level or 'Unknown'}, "
        f"pop {s.population or 0}"
        for s in top
    )

    action_lines = []
    for a in actions:
        cost_txt = "—" if a.est_cost_cad is None else f"{a.est_cost_cad:,.0f} CAD"
        action_lines.append(
            f"- [{a.actor}] {a.action} → targets {len(a.target_ctuids)} CT(s), "
            f"affects {a.affected_population:,} people, cost {cost_txt}"
        )
    action_table = "\n".join(action_lines) if action_lines else "- (no priority actions matched the rules)"

    return (
        f"You are Threshold, a civic-data briefing engine. Write a 4–6 sentence executive summary for "
        f"{audience_label} planning for a {SCENARIO_LABELS[scenario]} event across the selected "
        f"neighbourhoods of Brampton.\n\n"
        "STRICT RULES:\n"
        "1. You may only reference the numbers in the tables below. Do not invent, round differently, "
        "or import other statistics.\n"
        "2. Do not output disclaimers or source citations — the UI handles citations.\n"
        f"3. Frame the summary around {audience_focus}.\n"
        "4. Lead with the headline (count of CTs, total population at risk). Then call out the top 2-3 "
        "neighbourhoods by name. End with the single highest-leverage action.\n\n"
        f"Scenario: {SCENARIO_LABELS[scenario]}\n"
        f"Scenario logic: {SCENARIO_DESCRIPTIONS[scenario]}\n\n"
        f"TOTALS:\n{totals_table}\n\n"
        f"TOP NEIGHBOURHOODS (up to 5, ranked by score):\n{top_table}\n\n"
        f"PRIORITY ACTIONS:\n{action_table}\n"
    )


def _deterministic_extreme_summary(
    scenario: ExtremeScenario,
    audience: Audience,
    totals: PlanTotals,
    selected: list[SelectedCommunity],
    actions: list[PriorityAction],
) -> str:
    """Fallback prose used when the LLM is unavailable. Numbers only."""
    scenario_label = SCENARIO_LABELS[scenario]
    audience_label = "City" if audience == "city" else "Alectra"
    parts: list[str] = []

    parts.append(
        f"{audience_label} {scenario_label} plan covers {totals.ct_count} selected neighbourhood(s) with "
        f"{totals.population_at_risk:,} residents at risk and {totals.customers_at_risk:,} Alectra "
        f"customers already affected."
    )
    if totals.max_score is not None and totals.avg_score is not None:
        parts.append(
            f"Highest {scenario_label} score in the selection is {totals.max_score:.1f}; "
            f"average is {totals.avg_score:.1f}."
        )

    top = selected[:3]
    if top:
        top_names = ", ".join(
            f"{s.neighbourhood} ({'n/a' if s.score is None else f'{s.score:.1f}'})"
            for s in top
        )
        parts.append(f"Top neighbourhoods by score: {top_names}.")

    if actions:
        lead = actions[0]
        cost_txt = "" if lead.est_cost_cad is None else f" Estimated cost: CAD {lead.est_cost_cad:,.0f}."
        parts.append(
            f"Highest-leverage action: \"{lead.action}\" — targets {len(lead.target_ctuids)} CT(s) "
            f"reaching {lead.affected_population:,} residents.{cost_txt}"
        )
        if totals.est_cost_cad is not None and totals.est_cost_cad > 0:
            parts.append(f"Total estimated mobilisation cost across all actions: CAD {totals.est_cost_cad:,.0f}.")
    else:
        parts.append("No rule-based priority actions matched the selection — review the per-CT recommendation cards instead.")

    return " ".join(parts)


def _f(v: object) -> float | None:
    try:
        return float(v) if v is not None and v != "" else None  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _i(v: object) -> int | None:
    f = _f(v)
    return None if f is None else int(f)
