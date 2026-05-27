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
from pydantic_ai.models.google import GoogleModel as GeminiModel

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
from .data_loader import CommunityRecord
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
    cisr_score: float | None
    humidex: float | None
    temperature_c: float | None
    active_outages: int
    customers_affected: int

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
            "cisr_score": self.cisr_score,
            "humidex": self.humidex,
            "temperature_c": self.temperature_c,
            "active_outages": self.active_outages,
            "customers_affected": self.customers_affected,
        }


def inputs_for(rec: CommunityRecord, scenario: Scenario) -> BriefingInputs:
    p = rec.properties
    score = score_for(rec, scenario)
    return BriefingInputs(
        ctuid=rec.ctuid,
        neighbourhood=str(p.get("neighbourhood") or "Brampton"),
        scenario=scenario,
        score=score,
        risk_level=risk_tier(score),
        population=_i(p.get("population")),
        median_income=_f(p.get("median_income")),
        pct_renters=_f(p.get("pct_renters")),
        pct_pre1980=_f(p.get("pct_pre1980")),
        pct_low_income=_f(p.get("pct_low_income")),
        cisv_score=_f(p.get("cisv_score")),
        cisr_score=_f(p.get("cisr_score")),
        humidex=_f(p.get("humidex")),
        temperature_c=_f(p.get("temperature_c")),
        active_outages=_i(p.get("active_outages")) or 0,
        customers_affected=_i(p.get("customers_affected")) or 0,
    )


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
            _model = GeminiModel(settings.gemini_model, api_key=settings.gemini_api_key)
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

    async def brief(self, rec: CommunityRecord, scenario: Scenario) -> BriefingResponse:
        inp = inputs_for(rec, scenario)
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
    differently, do not introduce statistics that are not in the table.
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
        ("CISR Composite", inp.cisr_score, "StatsCan 2021 — high = resilient"),
        ("Current Humidex", inp.humidex, "°C, Open-Meteo"),
        ("Current Air Temp", inp.temperature_c, "°C, Open-Meteo"),
        ("Active Alectra Outages (overlap)", inp.active_outages, "polygon count"),
        ("Customers Affected (overlap)", inp.customers_affected, "Alectra CUSTOUT sum"),
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
