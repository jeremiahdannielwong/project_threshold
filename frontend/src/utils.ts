import type { Scenario, Tier, Tract } from './types';

type ScoredTract = Pick<Tract, 'threshold_score_baseline' | 'threshold_score_heatwave' | 'threshold_score_icestorm'>;

export function scoreFor(tract: ScoredTract, scenario: Scenario): number {
  switch (scenario) {
    case 'Heatwave':
      return tract.threshold_score_heatwave;
    case 'Ice Storm':
      return tract.threshold_score_icestorm;
    default:
      return tract.threshold_score_baseline;
  }
}

/* ─── Sequential single-hue ramp keyed off percentile ───────── */

const RAMP_STOPS: { p: number; color: string; tier: Tier; label: string }[] = [
  { p: 0.25, color: '#52A873', tier: 'low',      label: 'Baseline' },
  { p: 0.50, color: '#8DB84A', tier: 'low',      label: 'Elevated' },
  { p: 0.75, color: '#C8A83C', tier: 'moderate', label: 'Moderate' },
  { p: 0.90, color: '#C07840', tier: 'high',     label: 'High' },
  { p: 0.97, color: '#BF4040', tier: 'critical', label: 'Critical' },
  { p: 1.01, color: '#8C2020', tier: 'critical', label: 'Severe' },
];

export function rampColor(percentile: number): string {
  for (const s of RAMP_STOPS) if (percentile <= s.p) return s.color;
  return RAMP_STOPS[RAMP_STOPS.length - 1].color;
}

export function rampTier(percentile: number): Tier {
  for (const s of RAMP_STOPS) if (percentile <= s.p) return s.tier;
  return 'critical';
}

export function rampLabel(percentile: number): string {
  for (const s of RAMP_STOPS) if (percentile <= s.p) return s.label;
  return 'Severe';
}

/** Compute percentile-rank map for tracts under active scenario. */
export function percentileMap(tracts: Tract[], scenario: Scenario): Map<string, number> {
  const ranked = [...tracts]
    .map(t => ({ ctuid: t.ctuid, s: scoreFor(t, scenario) }))
    .sort((a, b) => a.s - b.s);
  const n = ranked.length || 1;
  const m = new Map<string, number>();
  ranked.forEach((r, i) => m.set(r.ctuid, (i + 1) / n));
  return m;
}

/** Aggregate city-wide stress index (0–100). */
export function stressIndex(tracts: Tract[], scenario: Scenario): number {
  if (!tracts.length) return 0;
  const weighted = tracts.reduce((sum, t) => sum + scoreFor(t, scenario) * t.population, 0);
  const totalPop = tracts.reduce((sum, t) => sum + t.population, 0) || 1;
  return weighted / totalPop;
}

/* ─── Legacy categorical tier (still used for thresholds) ───── */

export function getTier(score: number): Tier {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'moderate';
  return 'low';
}

export const TIER_COLORS: Record<Tier, string> = {
  low:      '#52A873',
  moderate: '#C8A83C',
  high:     '#C07840',
  critical: '#BF4040',
};

export const TIER_LABELS: Record<Tier, string> = {
  low:      'Baseline',
  moderate: 'Moderate',
  high:     'High',
  critical: 'Critical',
};

/* ─── Formatters ────────────────────────────────────────────── */

export function formatIncome(v: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(v);
}

export function formatPct(v: number): string {
  return `${(v * 100).toFixed(0)}%`;
}

export function formatPop(v: number): string {
  return new Intl.NumberFormat('en-CA').format(Math.round(v));
}

export function weatherLabel(code: number): string {
  if (code === 0) return 'Clear';
  if (code <= 3) return 'Partly cloudy';
  if (code <= 48) return 'Foggy';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Showers';
  return 'Thunderstorm';
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ─── Narrative composition ─────────────────────────────────── */

/** Composes a sentence-first dispatch paragraph from a tract + scenario. */
export function narrative(t: Tract, scenario: Scenario, percentile: number): string {
  const pop = formatPop(t.population);
  const renter = formatPct(t.pct_renters);
  const pre1980 = formatPct(t.pct_pre1980);
  const tier = rampLabel(percentile).toLowerCase();
  const baselineTier = rampLabel(0.5).toLowerCase();

  const shelter = t.shelterCount === 0
    ? 'No designated cooling or warming centre lies within reachable distance.'
    : t.shelterCount === 1
      ? 'One designated cooling or warming centre lies within 2.5 km.'
      : `${t.shelterCount} designated centres lie within 2.5 km.`;

  const outage = t.active_outages > 0
    ? ` ${t.customers_affected.toLocaleString()} customers are currently without power.`
    : '';

  const scenarioFrame =
    scenario === 'Heatwave'
      ? `Under the active heatwave scenario, projected vulnerability registers as ${tier}.`
      : scenario === 'Ice Storm'
        ? `Under the active ice-storm scenario, projected vulnerability registers as ${tier}.`
        : `Under baseline conditions, vulnerability registers as ${tier}.`;

  return `${pop} residents. ${renter} renter households. ${pre1980} of housing predates 1980. ${shelter}${outage} ${scenarioFrame}`;
}

/* ─── Intervention catalog ──────────────────────────────────── */

export interface Intervention {
  id: string;
  name: string;
  authority: string;
  projectedDelta: number;          // points reduction in vulnerability score
  populationServed: number;        // approx residents reached
  costCadPerDay: number;
  timeToEffectMin: number;
  confidence: 'low' | 'moderate' | 'high';
  rationale: string;
  scenarios: Scenario[];
}

/** Returns ranked interventions for a tract under a scenario. */
export function interventionsFor(t: Tract, scenario: Scenario): Intervention[] {
  const list: Intervention[] = [];

  // Cooling/warming centre activation
  if (t.shelterCount >= 1) {
    const nearest = t.shelterList[0] || 'nearest designated centre';
    const isHeat = scenario === 'Heatwave';
    list.push({
      id: 'centre-extend',
      name: isHeat
        ? `Extend cooling hours · ${nearest}`
        : `Activate warming centre · ${nearest}`,
      authority: 'Municipal Recreation Services',
      projectedDelta: 12,
      populationServed: Math.round(t.population * 0.42),
      costCadPerDay: 3200,
      timeToEffectMin: 90,
      confidence: 'high',
      rationale: 'Reduces unmet thermal exposure for population within 1.5 km isochrone.',
      scenarios: ['Heatwave', 'Ice Storm'],
    });
  }

  // Mobile cooling/warming when no centre
  if (t.shelterCount === 0) {
    list.push({
      id: 'mobile-centre',
      name: scenario === 'Ice Storm'
        ? 'Deploy mobile warming unit'
        : 'Deploy mobile cooling unit',
      authority: 'Emergency Management',
      projectedDelta: 18,
      populationServed: Math.round(t.population * 0.55),
      costCadPerDay: 4800,
      timeToEffectMin: 180,
      confidence: 'moderate',
      rationale: 'Closes the 2.5 km accessibility gap with deployable infrastructure.',
      scenarios: ['Heatwave', 'Ice Storm'],
    });
  }

  // Transit shuttle to existing centres
  if (t.shelterCount >= 1 && t.pct_low_income > 0.2) {
    list.push({
      id: 'shuttle',
      name: 'Activate transit shuttle to designated centre',
      authority: 'Transit Operations',
      projectedDelta: 6,
      populationServed: Math.round(t.population * 0.18),
      costCadPerDay: 1400,
      timeToEffectMin: 60,
      confidence: 'high',
      rationale: 'Targets income-constrained households with reduced mobility.',
      scenarios: ['Baseline', 'Heatwave', 'Ice Storm'],
    });
  }

  // Wellness check
  if (t.pct_pre1980 > 0.4 || t.cisv_score > 0.5) {
    list.push({
      id: 'wellness',
      name: 'Door-to-door wellness check',
      authority: 'Public Health · Paramedic Services',
      projectedDelta: 8,
      populationServed: Math.round(t.population * 0.12),
      costCadPerDay: 2600,
      timeToEffectMin: 240,
      confidence: 'moderate',
      rationale: 'Focuses on at-risk households in older housing stock.',
      scenarios: ['Heatwave', 'Ice Storm'],
    });
  }

  // Restoration priority during outage
  if (t.active_outages > 0) {
    list.push({
      id: 'restore-priority',
      name: 'Prioritize restoration sequencing',
      authority: 'Alectra Utilities · Distribution',
      projectedDelta: 22,
      populationServed: t.customers_affected,
      costCadPerDay: 0,
      timeToEffectMin: 120,
      confidence: 'high',
      rationale: 'Elevates this feeder in restoration queue based on compounded vulnerability.',
      scenarios: ['Baseline', 'Heatwave', 'Ice Storm'],
    });
  }

  // Demand response during heat
  if (scenario === 'Heatwave' && t.pct_renters > 0.35) {
    list.push({
      id: 'dr-enroll',
      name: 'Targeted demand-response enrollment',
      authority: 'Alectra Utilities · Programs',
      projectedDelta: 4,
      populationServed: Math.round(t.population * 0.22),
      costCadPerDay: 800,
      timeToEffectMin: 480,
      confidence: 'low',
      rationale: 'Reduces feeder load and bill exposure in renter-dense blocks.',
      scenarios: ['Heatwave'],
    });
  }

  return list
    .filter(i => i.scenarios.includes(scenario) || scenario === 'Baseline')
    .sort((a, b) => (b.projectedDelta / Math.max(b.costCadPerDay, 1)) - (a.projectedDelta / Math.max(a.costCadPerDay, 1)));
}
