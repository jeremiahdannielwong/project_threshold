/**
 * Preparedness Intelligence — deterministic advisory engine.
 *
 * Not a chatbot. Not an LLM. Not generative.
 *
 * Each rule is a named threshold cross over the tract's actual values plus
 * scenario and live finance/weather context. When a rule fires, it emits an
 * Advisory carrying the *evidence that triggered it* — so the operator (or
 * resident, or community organizer reading the printout) can see exactly
 * which datasets and which numbers produced the recommendation.
 *
 * Provenance, not generation.
 */

import type { Scenario, Tract } from './types';
import type { FinanceSnapshot } from './liveData';

export type AdvisoryAudience = 'resident' | 'community' | 'operator';
export type AdvisoryUrgency = 'routine' | 'elevated' | 'critical';

/** A single piece of evidence — a fact about the tract that fired the rule. */
export interface AdvisoryTrigger {
  label: string;
  value: string;
  /** Optional: which dataset this fact came from. */
  source?: string;
}

export interface Advisory {
  id: string;
  audience: AdvisoryAudience;
  urgency: AdvisoryUrgency;
  /** One terse imperative line. */
  headline: string;
  /** 1–2 sentences of static context. NEVER generated. */
  detail: string;
  /** Evidence — the actual values that fired the rule. */
  triggers: AdvisoryTrigger[];
  /** Time horizon in plain language. */
  timeframe: string;
  /** Operator-tier advisories carry quantified impact estimates. */
  impact?: {
    projectedDeltaPoints?: number;
    populationReached?: number;
    costCadPerDay?: number;
    timeToEffectMin?: number;
    authority: string;
    confidence: 'low' | 'moderate' | 'high';
  };
  /** Datasets contributing to the rule. */
  sources: string[];
}

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
const fmtPop = (v: number) => new Intl.NumberFormat('en-CA').format(Math.round(v));

/** Returns the full set of advisories for a tract under a scenario. */
export function advisoriesFor(
  tract: Tract,
  scenario: Scenario,
  finance: FinanceSnapshot | null,
): Advisory[] {
  const out: Advisory[] = [];

  const isHeat = scenario === 'Heatwave';
  const isIce  = scenario === 'Ice Storm';

  /* ─── Resident-tier ─────────────────────────────────────── */

  // R1 — Aging rental cooling-access
  if (tract.pct_renters > 0.40 && tract.pct_pre1980 > 0.50) {
    out.push({
      id: 'r1-cooling-walk-plan',
      audience: 'resident',
      urgency: isHeat ? 'elevated' : 'routine',
      headline: 'Identify the nearest cooling facility before the next heat advisory',
      detail: 'Older rental units cool slowly and often lack central air. A walk- or transit-based plan to a cooling centre should be settled before peak temperature days, not during them.',
      triggers: [
        { label: 'Renter share',       value: fmtPct(tract.pct_renters), source: 'StatsCan Census 2021' },
        { label: 'Pre-1980 housing',   value: fmtPct(tract.pct_pre1980), source: 'StatsCan Census 2021' },
        { label: 'Nearest centres',    value: tract.shelterCount === 0 ? 'none < 2.5 km' : `${tract.shelterCount} < 2.5 km`, source: 'City of Brampton facilities' },
      ],
      timeframe: 'Before the next heat advisory',
      sources: ['StatsCan Census 2021', 'City of Brampton facilities registry'],
    });
  }

  // R2 — Medical-device backup
  if (tract.pct_low_income > 0.20 && (tract.active_outages > 0 || isIce)) {
    out.push({
      id: 'r2-medical-backup',
      audience: 'resident',
      urgency: tract.active_outages > 0 ? 'critical' : 'elevated',
      headline: 'Prepare battery backup for life-supporting medical devices',
      detail: 'Restoration in this feeder territory has historically taken longer than the city median. Households relying on oxygen, CPAP, or dialysis should keep one cycle of backup power on hand.',
      triggers: [
        { label: 'Low-income share',   value: fmtPct(tract.pct_low_income), source: 'StatsCan Census 2021' },
        { label: 'Active outages',     value: String(tract.active_outages),  source: 'Alectra live feed' },
        { label: 'Customers affected', value: tract.customers_affected.toLocaleString(), source: 'Alectra live feed' },
      ],
      timeframe: 'Standing readiness',
      sources: ['StatsCan Census 2021', 'Alectra live outage feed'],
    });
  }

  // R3 — Neighbour wellness check (seniors / vulnerable households)
  if (tract.cisv_quintile >= 4 && tract.pct_pre1980 > 0.45) {
    out.push({
      id: 'r3-neighbour-check',
      audience: 'resident',
      urgency: isHeat || isIce ? 'elevated' : 'routine',
      headline: 'Check on elderly or isolated neighbours during multi-day events',
      detail: 'This tract sits in the top two quintiles of social vulnerability with a high concentration of older housing — both proxies for an aging resident population.',
      triggers: [
        { label: 'CISV quintile',      value: `${tract.cisv_quintile}/5`,      source: 'StatsCan CISV 2021' },
        { label: 'Pre-1980 housing',   value: fmtPct(tract.pct_pre1980),       source: 'StatsCan Census 2021' },
      ],
      timeframe: 'During events lasting >48 hours',
      sources: ['StatsCan Census 2021', 'StatsCan Canadian Index of Social Vulnerability'],
    });
  }

  // R4 — Landlord cooling request (tenant rights)
  if (tract.pct_renters > 0.50 && isHeat) {
    out.push({
      id: 'r4-landlord-cooling',
      audience: 'resident',
      urgency: 'elevated',
      headline: 'Request portable cooling from your landlord if your unit lacks AC',
      detail: 'Ontario tenancy guidelines permit this request during active heat advisories. Document the request in writing and reference the advisory date.',
      triggers: [
        { label: 'Renter share', value: fmtPct(tract.pct_renters), source: 'StatsCan Census 2021' },
        { label: 'Scenario',     value: scenario },
      ],
      timeframe: 'During active heat advisory',
      sources: ['StatsCan Census 2021', 'Ontario Residential Tenancies Act'],
    });
  }

  // R5 — Ice-storm alternative heating
  if (isIce && tract.pct_pre1980 > 0.40) {
    out.push({
      id: 'r5-alt-heating',
      audience: 'resident',
      urgency: 'elevated',
      headline: 'Prepare an alternative heating plan',
      detail: 'Older homes lose heat quickly during prolonged outages. Keep a layered sleeping kit accessible and identify a friend or relative on a different feeder.',
      triggers: [
        { label: 'Pre-1980 housing', value: fmtPct(tract.pct_pre1980), source: 'StatsCan Census 2021' },
        { label: 'Scenario',         value: scenario },
      ],
      timeframe: 'Before forecasted ice events',
      sources: ['StatsCan Census 2021', 'Open-Meteo forecast'],
    });
  }

  // R6 — Energy-cost burden (only fires when finance feed says we are over the threshold)
  if (finance && tract.median_income > 0) {
    const sharePct = (finance.annual_household_energy_cost_cad / tract.median_income) * 100;
    if (sharePct >= finance.energy_poverty_threshold_pct) {
      out.push({
        id: 'r6-energy-poverty',
        audience: 'resident',
        urgency: 'elevated',
        headline: 'Apply for the Low-income Energy Assistance Program (LEAP)',
        detail: 'At current Ontario Energy Board rates, the typical electricity bill in this tract exceeds the 6% energy-poverty threshold relative to median income. LEAP grants apply once per calendar year.',
        triggers: [
          { label: 'Median income',           value: `$${tract.median_income.toLocaleString()}`, source: 'StatsCan Census 2021' },
          { label: 'Annual energy cost',      value: `$${finance.annual_household_energy_cost_cad.toLocaleString()}`, source: 'OEB rates + StatsCan SHS' },
          { label: 'Share of income',         value: `${sharePct.toFixed(1)}%`, source: 'computed' },
          { label: 'Threshold',               value: `${finance.energy_poverty_threshold_pct.toFixed(0)}%`, source: 'OEB definition' },
        ],
        timeframe: 'Within the current billing year',
        sources: ['Ontario Energy Board RPP', 'Bank of Canada CPI', 'StatsCan Census 2021'],
      });
    }
  }

  /* ─── Community-tier ────────────────────────────────────── */

  // C1 — Hydration stations
  if (isHeat && tract.shelterCount < 2) {
    out.push({
      id: 'c1-hydration',
      audience: 'community',
      urgency: tract.shelterCount === 0 ? 'critical' : 'elevated',
      headline: 'Deploy temporary hydration stations',
      detail: `Fewer than two designated cooling facilities serve this tract within 2.5 km. A temporary hydration point near a high-foot-traffic node (transit stop, plaza, faith centre) closes the access gap.`,
      triggers: [
        { label: 'Centres within 2.5 km', value: String(tract.shelterCount), source: 'City of Brampton facilities' },
        { label: 'Population',            value: fmtPop(tract.population),   source: 'StatsCan Census 2021' },
        { label: 'Humidex',               value: `${tract.humidex.toFixed(1)}°C`, source: 'Open-Meteo' },
      ],
      timeframe: 'Within 24 hours of advisory',
      sources: ['StatsCan Census 2021', 'City of Brampton facilities registry', 'Open-Meteo'],
    });
  }

  // C2 — Door-to-door wellness coordination
  if ((isHeat || isIce) && tract.cisv_quintile >= 4) {
    out.push({
      id: 'c2-wellness-coord',
      audience: 'community',
      urgency: 'elevated',
      headline: 'Coordinate door-to-door wellness rounds via the community network',
      detail: 'High social vulnerability combined with the active scenario warrants outreach independent of formal request — the most affected residents rarely call for help first.',
      triggers: [
        { label: 'CISV quintile', value: `${tract.cisv_quintile}/5`,  source: 'StatsCan CISV' },
        { label: 'Population',    value: fmtPop(tract.population),    source: 'StatsCan Census 2021' },
      ],
      timeframe: 'Days 1–3 of the event',
      sources: ['StatsCan Census 2021', 'StatsCan CISV 2021'],
    });
  }

  // C3 — Cooling corridor extension along transit
  if (isHeat && tract.shelterCount === 0 && tract.pct_low_income > 0.20) {
    out.push({
      id: 'c3-corridor-extend',
      audience: 'community',
      urgency: 'critical',
      headline: 'Extend cooling-access hours along the nearest transit corridor',
      detail: 'No designated centre lies within reach by foot. Coordinated extension of hours at libraries or community centres on the nearest bus route closes the gap at lower cost than new deployment.',
      triggers: [
        { label: 'Centres within 2.5 km', value: '0', source: 'City of Brampton facilities' },
        { label: 'Low-income share',      value: fmtPct(tract.pct_low_income), source: 'StatsCan Census 2021' },
      ],
      timeframe: 'Within 48 hours of advisory',
      sources: ['City of Brampton facilities registry', 'StatsCan Census 2021'],
    });
  }

  // C4 — Faith / community space activation
  if (tract.shelterCount === 0 && (isHeat || isIce)) {
    out.push({
      id: 'c4-faith-activation',
      audience: 'community',
      urgency: 'elevated',
      headline: 'Coordinate with faith centres and community spaces to host respite hours',
      detail: 'In tracts with no designated cooling or warming centre, faith spaces and community halls have historically served as informal respite. A coordinated MOU formalizes the relationship.',
      triggers: [
        { label: 'Designated centres', value: '0', source: 'City of Brampton facilities' },
        { label: 'Scenario',           value: scenario },
      ],
      timeframe: 'Before the next forecasted event',
      sources: ['City of Brampton facilities registry'],
    });
  }

  // C5 — Tenant rights outreach
  if (tract.pct_renters > 0.40 && tract.pct_low_income > 0.20) {
    out.push({
      id: 'c5-tenant-rights',
      audience: 'community',
      urgency: 'routine',
      headline: 'Distribute tenant-rights guidance on landlord cooling obligations',
      detail: 'Renter-dense, income-constrained tracts have the largest gap between tenancy-act protections and resident awareness. Multilingual flyers near transit nodes have the highest measured reach.',
      triggers: [
        { label: 'Renter share',     value: fmtPct(tract.pct_renters), source: 'StatsCan Census 2021' },
        { label: 'Low-income share', value: fmtPct(tract.pct_low_income), source: 'StatsCan Census 2021' },
      ],
      timeframe: 'Each cooling season',
      sources: ['StatsCan Census 2021', 'Ontario Residential Tenancies Act'],
    });
  }

  /* ─── Operator-tier (quantified) ────────────────────────── */

  // O1 — Restoration priority during outage
  if (tract.active_outages > 0) {
    out.push({
      id: 'o1-restoration-priority',
      audience: 'operator',
      urgency: 'critical',
      headline: 'Elevate this feeder in the restoration queue',
      detail: 'Compounded vulnerability (CISV + housing age + active outage) justifies sequencing this feeder above the baseline restoration order.',
      triggers: [
        { label: 'Active outages',     value: String(tract.active_outages), source: 'Alectra live feed' },
        { label: 'Customers affected', value: tract.customers_affected.toLocaleString(), source: 'Alectra live feed' },
        { label: 'CISV quintile',      value: `${tract.cisv_quintile}/5`,  source: 'StatsCan CISV' },
      ],
      timeframe: 'Within 2 hours',
      impact: {
        projectedDeltaPoints: 22,
        populationReached: tract.customers_affected,
        costCadPerDay: 0,
        timeToEffectMin: 120,
        authority: 'Alectra Utilities · Distribution',
        confidence: 'high',
      },
      sources: ['Alectra live outage feed', 'StatsCan CISV 2021'],
    });
  }

  // O2 — Mobile cooling/warming unit deployment
  if (tract.shelterCount === 0 && (isHeat || isIce)) {
    out.push({
      id: 'o2-mobile-unit',
      audience: 'operator',
      urgency: 'critical',
      headline: isHeat ? 'Deploy mobile cooling unit' : 'Deploy mobile warming unit',
      detail: 'No designated centre lies within 2.5 km. A deployable unit closes the accessibility gap during the event window.',
      triggers: [
        { label: 'Designated centres', value: '0', source: 'City facilities registry' },
        { label: 'Population in tract', value: fmtPop(tract.population), source: 'StatsCan Census 2021' },
      ],
      timeframe: 'Operational within 3 hours',
      impact: {
        projectedDeltaPoints: 18,
        populationReached: Math.round(tract.population * 0.55),
        costCadPerDay: 4800,
        timeToEffectMin: 180,
        authority: 'Emergency Management',
        confidence: 'moderate',
      },
      sources: ['StatsCan Census 2021', 'City of Brampton facilities registry'],
    });
  }

  // O3 — Cooling/warming centre activation
  if (tract.shelterCount >= 1 && (isHeat || isIce)) {
    const nearest = tract.shelterList[0] ?? 'nearest designated centre';
    out.push({
      id: 'o3-centre-extend',
      audience: 'operator',
      urgency: 'elevated',
      headline: isHeat ? `Extend cooling hours · ${nearest}` : `Activate warming centre · ${nearest}`,
      detail: 'A designated centre lies within accessibility range. Extending operational hours costs less than new deployment and uses existing staff rosters.',
      triggers: [
        { label: 'Designated centres', value: String(tract.shelterCount), source: 'City facilities registry' },
        { label: 'Nearest',            value: nearest, source: 'City facilities registry' },
      ],
      timeframe: 'Operational within 90 minutes',
      impact: {
        projectedDeltaPoints: 12,
        populationReached: Math.round(tract.population * 0.42),
        costCadPerDay: 3200,
        timeToEffectMin: 90,
        authority: 'Municipal Recreation Services',
        confidence: 'high',
      },
      sources: ['City of Brampton facilities registry', 'StatsCan Census 2021'],
    });
  }

  // O4 — Transit shuttle to designated centre
  if (tract.shelterCount >= 1 && tract.pct_low_income > 0.20 && (isHeat || isIce)) {
    out.push({
      id: 'o4-shuttle',
      audience: 'operator',
      urgency: 'elevated',
      headline: 'Activate transit shuttle to designated centre',
      detail: 'Income-constrained households without vehicle access benefit most from on-demand shuttle service during multi-day events.',
      triggers: [
        { label: 'Low-income share', value: fmtPct(tract.pct_low_income), source: 'StatsCan Census 2021' },
        { label: 'Nearest centre',   value: tract.shelterList[0] ?? '—',  source: 'City facilities registry' },
      ],
      timeframe: 'Operational within 60 minutes',
      impact: {
        projectedDeltaPoints: 6,
        populationReached: Math.round(tract.population * 0.18),
        costCadPerDay: 1400,
        timeToEffectMin: 60,
        authority: 'Transit Operations',
        confidence: 'high',
      },
      sources: ['StatsCan Census 2021', 'City facilities registry'],
    });
  }

  // O5 — Targeted demand-response enrollment
  if (isHeat && tract.pct_renters > 0.35) {
    out.push({
      id: 'o5-dr-enrol',
      audience: 'operator',
      urgency: 'routine',
      headline: 'Targeted demand-response enrollment campaign',
      detail: 'Renter-dense blocks under heat scenarios benefit most from peak-demand reduction — reduces feeder load and resident bill exposure simultaneously.',
      triggers: [
        { label: 'Renter share', value: fmtPct(tract.pct_renters), source: 'StatsCan Census 2021' },
      ],
      timeframe: 'Within the current cooling season',
      impact: {
        projectedDeltaPoints: 4,
        populationReached: Math.round(tract.population * 0.22),
        costCadPerDay: 800,
        timeToEffectMin: 480,
        authority: 'Alectra Utilities · Programs',
        confidence: 'low',
      },
      sources: ['StatsCan Census 2021', 'Alectra service area'],
    });
  }

  return out.sort(rankAdvisory);
}

/**
 * Sort: critical first, then elevated, then routine; within urgency,
 * resident → community → operator. This preserves human-centered ordering
 * while keeping operator advisories visible.
 */
function rankAdvisory(a: Advisory, b: Advisory): number {
  const urgencyOrder: Record<AdvisoryUrgency, number> = { critical: 0, elevated: 1, routine: 2 };
  const audienceOrder: Record<AdvisoryAudience, number> = { resident: 0, community: 1, operator: 2 };
  return (urgencyOrder[a.urgency] - urgencyOrder[b.urgency])
      || (audienceOrder[a.audience] - audienceOrder[b.audience]);
}

/** Partition advisories by audience for display. */
export function partitionByAudience(advisories: Advisory[]): Record<AdvisoryAudience, Advisory[]> {
  return {
    resident:  advisories.filter(a => a.audience === 'resident'),
    community: advisories.filter(a => a.audience === 'community'),
    operator:  advisories.filter(a => a.audience === 'operator'),
  };
}

export const AUDIENCE_LABEL: Record<AdvisoryAudience, string> = {
  resident:  'Residents',
  community: 'Community organizations',
  operator:  'Municipal & utility operators',
};

export const URGENCY_COLOR: Record<AdvisoryUrgency, string> = {
  routine:  'var(--ink-3)',
  elevated: 'var(--alert-mid)',
  critical: 'var(--alert-deep)',
};

export const URGENCY_LABEL: Record<AdvisoryUrgency, string> = {
  routine:  'Routine',
  elevated: 'Elevated',
  critical: 'Critical',
};

/**
 * Tier-derived preparedness posture sentence. Always returns a sentence —
 * never null — so every tract carries operational language regardless of
 * whether any rules fired.
 *
 * The mapping uses the highest urgency present in the tract's advisories;
 * absent advisories return baseline language. Strings are static, vetted,
 * and never generated.
 */
export function preparednessPosture(
  advisories: Advisory[],
): { tier: 'baseline' | 'elevated' | 'high' | 'critical'; sentence: string } {
  const hasCritical = advisories.some(a => a.urgency === 'critical');
  const hasElevated = advisories.some(a => a.urgency === 'elevated');
  const elevatedCount = advisories.filter(a => a.urgency === 'elevated').length;

  if (hasCritical) {
    return {
      tier: 'critical',
      sentence:
        'Severe compounded vulnerability. Restoration sequencing and door-to-door wellness coordination warranted at first indication of event onset.',
    };
  }
  if (elevatedCount >= 3) {
    return {
      tier: 'high',
      sentence:
        'Elevated exposure detected. Limited cooling accessibility combined with high social vulnerability may increase emergency response pressure during sustained conditions.',
    };
  }
  if (hasElevated) {
    return {
      tier: 'elevated',
      sentence:
        'Localized vulnerability detected among renter households in aging housing stock. Preparedness monitoring recommended during prolonged events.',
    };
  }
  return {
    tier: 'baseline',
    sentence:
      'Preparedness posture stable. Cooling access and infrastructure redundancy remain within tolerance ranges under current conditions.',
  };
}
