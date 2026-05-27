/**
 * Predictive stress accumulation — deterministic forecast.
 *
 * Phase-1 model. Not ML. Each tract's projected stress at horizon t is
 * a weighted composite of: current scenario-conditioned score, expected
 * weather pressure at horizon t (from a simple climatological model
 * conditioned on the active scenario), the tract's social vulnerability
 * coefficient, and a degradation term from currently active outages.
 *
 * Phase-2 will swap this for an LSTM trained on historical event-by-event
 * data. The shape of the forecast object stays stable across that swap,
 * so the UI and the situation-report consumer don't change.
 */

import type { Scenario, Tract } from './types';
import { scoreFor, stressIndex } from './utils';
import { SCENARIO_PROFILE } from './scenarios';

export interface ForecastPoint {
  hoursAhead: number;          // 0, 6, 12, 24
  ts: Date;
  citywideStress: number;       // 0–100
  citywideEwei: number;         // equity-weighted exposure index
  driver: string;               // one-sentence reason
  confidence: 'low' | 'moderate' | 'high';
}

const HORIZONS = [0, 6, 12, 24] as const;

/**
 * Compute a 24-hour forecast at 6-hour intervals.
 *
 * The model: for each horizon, we project a scenario-pressure coefficient
 * that ramps from 1.0 at the present to a scenario-specific peak and back.
 * Heatwaves typically peak 12–18 hours into a day cycle; ice storms ramp
 * over 6 hours and persist 24+. We multiply the present stress index by
 * this coefficient plus a small additive for current outage acceleration.
 */
export function forecast(
  tracts: Tract[],
  scenario: Scenario,
): ForecastPoint[] {
  if (tracts.length === 0) {
    return HORIZONS.map(h => ({
      hoursAhead: h,
      ts: new Date(Date.now() + h * 3600_000),
      citywideStress: 0,
      citywideEwei: 0,
      driver: '—',
      confidence: 'low',
    }));
  }

  const current = stressIndex(tracts, scenario);
  const presentOutages = tracts.reduce((s, t) => s + t.customers_affected, 0);
  const presentOutageTracts = tracts.filter(t => t.active_outages > 0).length;

  return HORIZONS.map(h => {
    const ts = new Date(Date.now() + h * 3600_000);
    const coef = pressureCoefficient(h, scenario);
    const stress = clamp(current * coef + outageAddend(h, presentOutages), 0, 100);
    const ewei = stress * (1 + (presentOutageTracts > 0 ? 0.18 : 0));
    return {
      hoursAhead: h,
      ts,
      citywideStress: stress,
      citywideEwei: ewei,
      driver: driverPhrase(h, scenario, presentOutages),
      confidence: h <= 6 ? 'high' : h <= 12 ? 'moderate' : 'low',
    };
  });
}

function pressureCoefficient(h: number, scenario: Scenario): number {
  if (scenario === 'Heatwave') {
    // Peak around hour 12 (mid-afternoon if event started 6 hours ago)
    if (h === 0)  return 1.00;
    if (h === 6)  return 1.18;
    if (h === 12) return 1.32;
    if (h === 24) return 1.08;
  } else if (scenario === 'Ice Storm') {
    // Ramps fast, persists
    if (h === 0)  return 1.00;
    if (h === 6)  return 1.45;
    if (h === 12) return 1.55;
    if (h === 24) return 1.40;
  }
  // Baseline — slight diurnal variation only
  if (h === 0)  return 1.00;
  if (h === 6)  return 1.02;
  if (h === 12) return 1.05;
  if (h === 24) return 1.00;
  return 1.0;
}

function outageAddend(h: number, customersAffected: number): number {
  // Outage pressure decays over time as restoration progresses.
  if (customersAffected < 100) return 0;
  const factor = Math.log10(customersAffected) * 0.6;
  const decay = h === 0 ? 1 : h === 6 ? 0.6 : h === 12 ? 0.3 : 0.1;
  return factor * decay;
}

function driverPhrase(h: number, scenario: Scenario, customers: number): string {
  if (h === 0) {
    if (customers > 100) return `${customers.toLocaleString()} customers currently without power`;
    if (scenario === 'Heatwave') return 'Heat conditions active';
    if (scenario === 'Ice Storm') return 'Ice-storm conditions active';
    return 'Baseline civic conditions';
  }
  if (scenario === 'Heatwave') {
    if (h <= 12) return 'Projected mid-afternoon humidex peak';
    return 'Conditions easing overnight';
  }
  if (scenario === 'Ice Storm') {
    if (h <= 12) return 'Freezing-rain accumulation projected to peak';
    return 'Sustained ice loading, restoration constrained';
  }
  return 'No significant change forecast';
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/** Identify which tracts are projected to cross critical at the next horizon. */
export function projectedCriticalCrossings(
  tracts: Tract[],
  scenario: Scenario,
  horizonHours: number,
): Tract[] {
  const coef = pressureCoefficient(horizonHours, scenario);
  return tracts
    .map(t => ({ t, projected: scoreFor(t, scenario) * coef }))
    .filter(({ projected, t }) => projected >= 75 && scoreFor(t, scenario) < 75)
    .map(({ t }) => t);
}
