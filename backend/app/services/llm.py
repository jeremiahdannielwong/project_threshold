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
from ..models.briefing import BriefingResponse, SolutionItem
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


class _StructuredSolution(BaseModel):
    headline: str = Field(description="Short title for the solution (6–10 words).")
    actor: str = Field(
        description="One of: City, Alectra, Community, Both. No other strings."
    )
    detail: str = Field(
        description=(
            "One sentence stating the concrete intervention AND its expected "
            "effect on the probability (e.g. 'shifts likelihood from High to Moderate')."
        )
    )
    leverage: str = Field(
        description=(
            "Expected 24h impact on the assessed probability. One of: High, Medium, Low."
        )
    )


class _StructuredBriefing(BaseModel):
    outlook: str = Field(
        description=(
            "1 sentence. Probabilistic forecast for the next 12–24h. Use a "
            "qualitative band (Low / Moderate / High / Very High) followed by a "
            "numeric range in parentheses (e.g. 'High (60–75%)'). State the "
            "single worst plausible outcome the probability refers to."
        )
    )
    drivers: str = Field(
        description=(
            "1 sentence. The 2–3 numeric drivers from the INPUT TABLE that "
            "justify the probability. Cite exact values with units."
        )
    )
    recommended_action: str = Field(
        description=(
            "1 sentence. Begin with EXACTLY ONE bracketed actor: [City], "
            "[Alectra], [Both], or [Hold]. [Hold] = no intervention warranted "
            "yet — name the tripwire to watch. Operational actions must include "
            "a quantity + deadline. Recommend the SINGLE highest-leverage move."
        )
    )
    confidence: str = Field(
        description=(
            "1 sentence beginning with 'Confidence: Low / Medium / High — '. "
            "Justify the level using the data (signal strength, feed currency, "
            "thinness of inputs). Be honest — if the data is sparse, say so."
        )
    )
    watch: str = Field(
        description=(
            "1 sentence beginning with 'Watch:'. A measurable tripwire that, if "
            "crossed in the next 24h, would change the recommendation. Cite a "
            "specific factor + threshold from the data table."
        )
    )
    solutions: list[_StructuredSolution] = Field(
        description=(
            "EXACTLY 3 ranked candidate interventions, ordered by leverage "
            "(highest first). Each must be a distinct lever — do not repeat the "
            "recommended_action. Bias the solution mix toward the operator's "
            "active layers (see OPERATOR FOCUS in the prompt). Mix actors when "
            "appropriate; do not default all three to the same owner."
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
        active_layers: list[str] | None = None,
        *,
        store: DataStore | None = None,
        overrides: dict[str, float | int | None] | None = None,
    ) -> BriefingResponse:
        """Generate a briefing.

        ``active_layers`` are the operator's currently-active map layers; they
        bias the prose and solution mix (lens-aware). ``store`` activates the
        richer Gemini prompt — PCA loadings give us the dominant factor,
        facilities give us nearest-facility context. ``overrides`` lets the
        ambient sweep stamp fresh Tier C values (live humidex, temperature) onto
        the input table without mutating the underlying record.
        """
        # No caching — every request regenerates so the briefing reflects the
        # operator's current scenario AND active layers.
        layer_sig = tuple(sorted({l.strip().lower() for l in (active_layers or []) if l}))
        logger.info(
            "Briefing regenerating for %s / %s / layers=%s",
            rec.ctuid, scenario, layer_sig,
        )
        inp = inputs_for(rec, scenario, store=store, overrides=overrides)
        if self._briefing_agent is None:
            return self._fallback(inp, layer_sig)
        structured = await self._call_briefing_agent(inp, layer_sig)
        if structured is None:
            return self._fallback(inp, layer_sig)
        prose = "\n\n".join([
            structured.outlook,
            structured.drivers,
            structured.recommended_action,
            structured.confidence,
            structured.watch,
        ])
        return BriefingResponse(
            ctuid=inp.ctuid,
            scenario=inp.scenario,
            risk_level=inp.risk_level,
            score=inp.score,
            briefing=prose,
            solutions=[_to_solution_item(s) for s in structured.solutions[:3]],
            inputs=inp.as_dict(),
            used_llm=True,
        )

    async def _call_briefing_agent(
        self, inp: BriefingInputs, active_layers: tuple[str, ...]
    ) -> _StructuredBriefing | None:
        assert self._briefing_agent is not None
        try:
            result = await self._briefing_agent.run(_build_prompt(inp, active_layers))
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
    def _fallback(inp: BriefingInputs, active_layers: tuple[str, ...]) -> BriefingResponse:
        return BriefingResponse(
            ctuid=inp.ctuid,
            scenario=inp.scenario,
            risk_level=inp.risk_level,
            score=inp.score,
            briefing=_deterministic_briefing(inp),
            solutions=_deterministic_solutions(inp, active_layers),
            inputs=inp.as_dict(),
            used_llm=False,
        )


def _to_solution_item(s: _StructuredSolution) -> SolutionItem:
    """Coerce a free-form structured solution from Gemini into the typed model.

    Gemini occasionally returns near-misses like 'city' or 'community partner'.
    Normalise to the SolutionItem literal set, defaulting safely on mismatch.
    """
    actor_raw = (s.actor or "").strip().lower()
    actor = (
        "City" if actor_raw.startswith("city")
        else "Alectra" if actor_raw.startswith("alectra")
        else "Community" if actor_raw.startswith("community")
        else "Both" if actor_raw in ("both", "joint", "city+alectra")
        else "Both"
    )
    leverage_raw = (s.leverage or "").strip().lower()
    leverage = (
        "High" if leverage_raw.startswith("high")
        else "Low" if leverage_raw.startswith("low")
        else "Medium"
    )
    return SolutionItem(
        headline=s.headline.strip(),
        actor=actor,
        detail=s.detail.strip(),
        leverage=leverage,
    )


_LAYER_HINTS: dict[str, str] = {
    "shelters":   "cooling / warming centre access, mobile shelter deployment, transit shuttles",
    "outages":    "feeder restoration priority, crew pre-staging, life-support customer notifications",
    "advisories": "policy + bylaw response, rental-unit compliance, public notifications",
    "services":   "social-services outreach, welfare checks, community-org partnerships",
}


def _build_prompt(inp: BriefingInputs, active_layers: tuple[str, ...]) -> str:
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
    scenario_outcomes = {
        "heatwave": (
            "heat-illness ER visits, indoor temperature exceedance in pre-1980 "
            "stock, A/C-driven feeder overload, mortality risk in seniors / "
            "medical-device households"
        ),
        "icestorm": (
            "extended outage exposure, hypothermia, frozen-pipe damage, "
            "feeder-restoration time, life-support-customer risk"
        ),
        "baseline": (
            "energy-poverty crossings, retrofit eligibility shortfall, "
            "compound vulnerability accumulation"
        ),
    }[inp.scenario]

    if active_layers:
        focus_lines = [
            f"- {layer}: {_LAYER_HINTS[layer]}"
            for layer in active_layers if layer in _LAYER_HINTS
        ]
        operator_focus = (
            "OPERATOR FOCUS — the operator currently has these map layers active. "
            "Bias the SOLUTIONS toward levers that relate to these layers; the "
            "recommended_action can still ignore them if the data demands it.\n"
            + ("\n".join(focus_lines) if focus_lines else "- (none mapped)")
        )
    else:
        operator_focus = (
            "OPERATOR FOCUS — no layers active; surface a balanced solution set "
            "across shelter, outage, advisory, and outreach levers."
        )
    return (
        "You are Threshold, a probabilistic emergency-intelligence engine "
        "briefing the City of Brampton emergency-management lead and senior "
        "planners. You support strategic decisions, not field dispatch — your "
        "job is to give a probability, a confidence, and ONE recommended call.\n\n"
        f"Target neighbourhood: {inp.neighbourhood} (CT {inp.ctuid}).\n"
        f"Active scenario: {SCENARIO_LABELS[inp.scenario]}.\n"
        f"Plausible adverse outcomes to weigh: {scenario_outcomes}.\n\n"
        f"{operator_focus}\n\n"
        "OUTPUT FIELDS (one sentence each — ruthless brevity, except 'solutions'):\n"
        "• outlook — Probabilistic forecast for next 12–24h. Format: "
        "'{Low|Moderate|High|Very High} ({lo–hi}%) likelihood of {outcome} "
        "{time window}.' Pick the single worst plausible outcome.\n"
        "• drivers — Cite the 2–3 numeric drivers from the INPUT TABLE that "
        "produced that probability. Exact values + units.\n"
        "• recommended_action — Begin with EXACTLY ONE of [City] / [Alectra] / "
        "[Both] / [Hold]. Choose the smallest sufficient response. [Hold] when "
        "the probability is Low and no tripwire is near; name the tripwire to "
        "watch. Operational actions must carry a quantity + deadline.\n"
        "• confidence — 'Confidence: {Low|Medium|High} — {data-grounded "
        "justification}.' Lower it when feeds are stale, signals are thin, or "
        "drivers conflict.\n"
        "• watch — 'Watch: {factor} {threshold} → escalate to {actor}.' One "
        "measurable tripwire pulled from the INPUT TABLE factors.\n"
        "• solutions — EXACTLY 3 distinct interventions, ordered by leverage "
        "(highest first). Each has {headline, actor, detail, leverage}. The "
        "detail MUST quantify the probability shift ('shifts likelihood from "
        "High to Moderate', 'cuts ER-visit probability ~30%'). Mix actors when "
        "appropriate. Bias the menu toward the OPERATOR FOCUS layers above.\n\n"
        "STRICT RULES:\n"
        "1. Use ONLY numbers from the INPUT TABLE. No invented statistics.\n"
        "2. Probabilities must be banded (Low/Moderate/High/Very High) with a "
        "numeric range. Never claim a single precise percentage like '73%'.\n"
        "3. Recommend EXACTLY ONE actor. Do NOT default to listing both — "
        "[Both] is only correct when each agency has a discrete, "
        "non-substitutable role at this moment.\n"
        "4. Prefer [Hold] over invented urgency. Saying 'nothing to do yet' is "
        "valuable if the data supports it.\n"
        "5. Reject vague verbs (monitor / review / consider / assess) inside "
        "the action field — except inside the tripwire's escalation clause.\n"
        "6. No disclaimers, no source citations, no markdown, no bullet "
        "characters inside the output fields.\n\n"
        f"Scenario logic: {SCENARIO_DESCRIPTIONS[inp.scenario]}\n"
        f"Derived: Energy cost as % of median income for this CT: {energy_pct}\n\n"
        f"INPUT TABLE:\n{table}\n"
    )


def _deterministic_briefing(inp: BriefingInputs) -> str:
    """Five-paragraph fallback matching the probabilistic LLM schema."""
    pop = inp.population or 0
    renters_pct = (inp.pct_renters or 0) * 100
    pre1980_pct = (inp.pct_pre1980 or 0) * 100
    score = inp.score or 0
    tier = inp.risk_level or "Unknown"

    if inp.scenario == "heatwave":
        humidex = inp.humidex or 0
        if humidex >= 40:
            band, rng = "Very High", "75–90"
        elif humidex >= 36:
            band, rng = "High", "55–75"
        elif humidex >= 32:
            band, rng = "Moderate", "30–50"
        else:
            band, rng = "Low", "10–25"
        outlook = (
            f"{band} ({rng}%) likelihood of heat-illness ER visits originating "
            f"from {inp.neighbourhood} in the next 12–24h."
        )
        drivers = (
            f"Humidex {humidex:.1f}°C; {renters_pct:.0f}% renter households "
            f"(limited A/C control); {pre1980_pct:.0f}% pre-1980 dwellings "
            f"(weak envelopes)."
        )
        if band in ("High", "Very High"):
            action = (
                f"[City] Open the nearest cooling centre with extended hours to "
                f"22:00 tonight; dispatch welfare-check team to seniors-registry "
                f"addresses by 16:00."
            )
        elif band == "Moderate":
            action = (
                f"[Hold] No deployment yet — confirm cooling-centre staffing "
                f"and pre-position outreach roster for the {pop:,} affected residents."
            )
        else:
            action = (
                f"[Hold] No action warranted; baseline outreach posture is sufficient."
            )
        confidence = (
            f"Confidence: Medium — humidex feed is fresh and demographic "
            f"signal is strong, but ER-incidence baselines for this CT are not "
            f"in the input table."
        )
        watch = (
            f"Watch: humidex ≥ 42°C OR an Alectra outage opens inside this CT "
            f"→ escalate to [Both]."
        )
    elif inp.scenario == "icestorm":
        outages = inp.active_outages
        customers = inp.customers_affected
        if outages >= 1 or customers >= 100:
            band, rng = "Very High", "70–90"
        elif renters_pct >= 50 and pre1980_pct >= 40:
            band, rng = "High", "50–70"
        elif score >= 60:
            band, rng = "Moderate", "30–50"
        else:
            band, rng = "Low", "10–25"
        outlook = (
            f"{band} ({rng}%) likelihood of unsafe indoor temperatures or "
            f"hypothermia transports in {inp.neighbourhood} within 12h."
        )
        drivers = (
            f"{outages} active outage polygon(s); {customers:,} customers "
            f"affected; {renters_pct:.0f}% renters with limited backup heat; "
            f"{pre1980_pct:.0f}% pre-1980 dwellings."
        )
        if outages >= 1:
            action = (
                f"[Alectra] Sequence restoration of the feeder serving CT "
                f"{inp.ctuid} (tier {tier}, score {score:.0f}) ahead of "
                f"lower-vulnerability outages; notify life-support registry "
                f"customers within 2h."
            )
        elif band == "High":
            action = (
                f"[City] Open 1 warming centre (60 cots, overnight staffing) "
                f"in {inp.neighbourhood} by 18:00."
            )
        else:
            action = (
                f"[Hold] No action warranted yet — readiness is sufficient at "
                f"current outage count."
            )
        confidence = (
            f"Confidence: Medium — outage feed is current but indoor-temperature "
            f"and backup-heat data are unobserved."
        )
        watch = (
            f"Watch: customers_affected ≥ 250 OR temperature drops below -10°C "
            f"→ escalate to [Both]."
        )
    else:  # baseline
        if score >= 75:
            band, rng = "High", "55–75"
        elif score >= 50:
            band, rng = "Moderate", "30–50"
        else:
            band, rng = "Low", "10–25"
        outlook = (
            f"{band} ({rng}%) likelihood of compound-vulnerability harm during "
            f"the next acute weather advisory; no acute exposure right now."
        )
        drivers = (
            f"Threshold Score {score:.0f} (tier {tier}); {renters_pct:.0f}% "
            f"renters; {(inp.pct_low_income or 0) * 100:.0f}% low-income; "
            f"{pre1980_pct:.0f}% pre-1980 dwellings."
        )
        action = (
            f"[Hold] No acute action — queue CT {inp.ctuid} ({pop:,} residents) "
            f"for the next deep-retrofit incentive round and the LEAP roster."
        )
        confidence = (
            f"Confidence: High — drivers are structural (census 2021) and stable "
            f"over the planning horizon."
        )
        watch = (
            f"Watch: humidex ≥ 35°C OR an Alectra outage opens → re-brief under "
            f"the appropriate acute scenario."
        )

    return "\n\n".join([outlook, drivers, action, confidence, watch])


def _deterministic_solutions(
    inp: BriefingInputs, active_layers: tuple[str, ...]
) -> list[SolutionItem]:
    """Build a layer-aware solution menu when the LLM is unavailable.

    The catalogue is intentionally small and traceable — each entry maps to a
    real lever the City or Alectra has. The active layers re-order which
    levers surface first.
    """
    catalogue: list[SolutionItem] = []

    pop = inp.population or 0
    renters_pct = (inp.pct_renters or 0) * 100
    pre1980_pct = (inp.pct_pre1980 or 0) * 100
    outages = inp.active_outages

    if inp.scenario == "heatwave":
        catalogue.extend([
            SolutionItem(
                headline="Deploy mobile cooling bus to this CT",
                actor="City",
                detail=(
                    f"Stage one cooling bus by 14:00; covers ~{int(pop * 0.05)} "
                    f"residents and shifts ER-visit probability one band lower."
                ),
                leverage="High",
            ),
            SolutionItem(
                headline="Activate demand-response on serving feeder",
                actor="Alectra",
                detail=(
                    "Call DR-enrolled customers during the 16:00–20:00 peak; "
                    "cuts feeder-overload probability by ~25–35%."
                ),
                leverage="Medium",
            ),
            SolutionItem(
                headline="Door-knock seniors-registry households",
                actor="Community",
                detail=(
                    f"Welfare checks on {renters_pct:.0f}% renter share; "
                    "reduces missed-distress incidents materially within 6h."
                ),
                leverage="Medium",
            ),
            SolutionItem(
                headline="Extend nearest cooling-centre hours",
                actor="City",
                detail=(
                    "Hold centre open to 22:00 tonight; minor logistical cost, "
                    "modest probability shift for evening exposure."
                ),
                leverage="Low",
            ),
        ])
    elif inp.scenario == "icestorm":
        catalogue.extend([
            SolutionItem(
                headline=(
                    "Prioritise feeder restoration for this CT"
                    if outages
                    else "Pre-stage restoration crew on serving feeder"
                ),
                actor="Alectra",
                detail=(
                    f"Sequence ahead of lower-vulnerability outages "
                    f"(tier {inp.risk_level}); cuts extended-exposure probability sharply."
                    if outages
                    else f"Position 1 crew within 30 min of CT {inp.ctuid}; "
                    "shaves expected restoration time by ~40%."
                ),
                leverage="High",
            ),
            SolutionItem(
                headline="Open warming centre with 60 cots overnight",
                actor="City",
                detail=(
                    f"Stand up by 18:00 in {inp.neighbourhood}; covers worst-case "
                    f"hypothermia exposure for the {renters_pct:.0f}% renter share."
                ),
                leverage="High",
            ),
            SolutionItem(
                headline="Notify life-support registry customers",
                actor="Alectra",
                detail=(
                    "Direct call within 2h to medical-device households on this "
                    "feeder; removes a critical mortality tail."
                ),
                leverage="Medium",
            ),
            SolutionItem(
                headline="Distribute RTA Section 20 guidance",
                actor="Community",
                detail=(
                    f"Targeted outreach to renters re: minimum-heat law; "
                    f"low cost, addresses {pre1980_pct:.0f}% pre-1980 stock risk."
                ),
                leverage="Low",
            ),
        ])
    else:  # baseline
        catalogue.extend([
            SolutionItem(
                headline="Queue for deep-retrofit incentive round",
                actor="City",
                detail=(
                    f"Add CT {inp.ctuid} ({pop:,} residents, {pre1980_pct:.0f}% "
                    f"pre-1980) to the next intake; long-run probability reducer."
                ),
                leverage="High",
            ),
            SolutionItem(
                headline="Add to LEAP outreach roster",
                actor="Alectra",
                detail=(
                    f"Energy-affordability liaison contacts to "
                    f"low-income households; reduces energy-poverty risk."
                ),
                leverage="Medium",
            ),
            SolutionItem(
                headline="Schedule bylaw rental-stock inspection sweep",
                actor="City",
                detail=(
                    f"Pre-emptive habitability check on {renters_pct:.0f}% renter "
                    "share before the next acute advisory."
                ),
                leverage="Medium",
            ),
        ])

    layers_set = set(active_layers)

    def _priority(item: SolutionItem) -> int:
        h = item.headline.lower()
        score = {"High": 0, "Medium": 1, "Low": 2}[item.leverage]
        if "shelter" in layers_set and ("cool" in h or "warming" in h or "centre" in h):
            score -= 3
        if "outages" in layers_set and ("feeder" in h or "restoration" in h or "demand-response" in h):
            score -= 3
        if "advisories" in layers_set and ("rta" in h or "bylaw" in h or "incentive" in h):
            score -= 3
        if "services" in layers_set and ("door-knock" in h or "outreach" in h or "registry" in h):
            score -= 3
        return score

    catalogue.sort(key=_priority)
    return catalogue[:3]


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
