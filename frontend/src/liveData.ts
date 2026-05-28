/**
 * Live-data layer.
 *
 * Polls volatile feeds at infrastructure-grade cadences:
 *   - weather (Open-Meteo, via backend proxy)     → 5 min
 *   - outages (Alectra ArcGIS, via backend)       → 2 min
 *   - finance (OEB rates + BoC CPI, via backend)  → 60 min
 *
 * Returns deltas to merge into the existing tracts state without losing
 * geometry, demographics, or precomputed PCA scores. The static feeds
 * (communities, facilities) are loaded once at boot and never refetched
 * here — those change on the order of years.
 */

import type { Tract } from './types';

export interface CTWeatherDelta {
  ctuid: string;
  temperature_c: number | null;
  humidex: number | null;
  precipitation_mm: number | null;
  wind_speed_kmh: number | null;
  wind_gusts_kmh: number | null;
  weather_code: number | null;
}

export interface OutageProperties {
  CUSTOMERS_AFFECTED?: number;
  CUSTOUT?: number;
  OUTTYPE?: string;
  OUTSTART?: number; // epoch ms
  ETOR?: number;
  CauseDescription?: string;
}

export interface OutageFeature {
  type: 'Feature';
  geometry: { type: string; coordinates: number[][][] | number[][] } | null;
  properties: OutageProperties;
}

export interface OutageCollection {
  type: 'FeatureCollection';
  features: OutageFeature[];
}

export interface ElectricityRate {
  plan: string;
  tier: string;
  cents_per_kwh: number;
  effective_from: string;
}

export interface FinanceSnapshot {
  cpi_yoy_pct: number;
  cpi_vintage: string;
  ontario_electricity_rates: ElectricityRate[];
  blended_residential_cents_per_kwh: number;
  typical_household_kwh_per_year: number;
  annual_household_energy_cost_cad: number;
  energy_poverty_threshold_pct: number;
  rate_source_url: string;
  cpi_source_url: string;
}

interface Envelope<T> {
  data: T;
  sources?: unknown[];
  generated_at?: string;
}

/* ─── Polling cadences (ms) ───────────────────────────────── */

export const CADENCE = {
  weather: 5 * 60_000,
  outages: 2 * 60_000,
  finance: 60 * 60_000,
} as const;

/** Maximum interval beyond cadence before a source is marked stale. */
export const STALE_MULTIPLIER = 2.5;

/* ─── Fetch primitives ────────────────────────────────────── */

async function fetchEnvelope<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  const env = (await r.json()) as Envelope<T>;
  return env.data;
}

export async function fetchLiveWeather(signal?: AbortSignal): Promise<CTWeatherDelta[]> {
  return fetchEnvelope<CTWeatherDelta[]>('/api/weather?live=true', signal);
}

export async function fetchSimulatedWeather(query: string, signal?: AbortSignal): Promise<CTWeatherDelta[]> {
  return fetchEnvelope<CTWeatherDelta[]>(`/api/weather?${query}`, signal);
}

export async function fetchOutages(signal?: AbortSignal): Promise<OutageCollection> {
  return fetchEnvelope<OutageCollection>('/api/outages', signal);
}

export async function fetchFinance(signal?: AbortSignal): Promise<FinanceSnapshot> {
  return fetchEnvelope<FinanceSnapshot>('/api/finance', signal);
}

export interface BriefingSolution {
  headline: string;
  actor: 'City' | 'Alectra' | 'Community' | 'Both';
  detail: string;
  leverage: 'High' | 'Medium' | 'Low';
}

export interface BriefingResult {
  ctuid: string;
  scenario: string;
  active_layers: string[];
  outlook: string;
  drivers: string;
  recommended_action: string;
  confidence: string;
  watch: string;
  solutions: BriefingSolution[];
  used_llm: boolean;
  generated_at: number;
}

const SCENARIO_API: Record<string, string> = {
  'Baseline':   'baseline',
  'Heatwave':   'heatwave',
  'Ice Storm':  'icestorm',
};

export async function fetchBriefing(
  ctuid: string,
  scenario: string,
  activeLayers: string[],
  signal?: AbortSignal,
): Promise<BriefingResult> {
  const apiScenario = SCENARIO_API[scenario] ?? 'baseline';
  const r = await fetch('/api/briefing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ctuid, scenario: apiScenario, active_layers: activeLayers }),
    signal,
  });
  if (!r.ok) throw new Error(`/api/briefing → ${r.status}`);
  const env = (await r.json()) as Envelope<{
    briefing: string;
    used_llm: boolean;
    solutions?: BriefingSolution[];
  }>;
  const { briefing, used_llm, solutions } = env.data;
  const parts = briefing.split('\n\n').map(s => s.trim()).filter(Boolean);
  return {
    ctuid,
    scenario,
    active_layers:      activeLayers,
    outlook:            parts[0] ?? briefing,
    drivers:            parts[1] ?? '',
    recommended_action: parts[2] ?? '',
    confidence:         parts[3] ?? '',
    watch:              parts[4] ?? '',
    solutions:          solutions ?? [],
    used_llm,
    generated_at:       Date.now(),
  };
}

/* ─── Merge helpers ───────────────────────────────────────── */

/** Apply a list of weather deltas to existing tracts (immutable). */
export function mergeWeather(tracts: Tract[], deltas: CTWeatherDelta[]): Tract[] {
  if (!deltas.length) return tracts;
  const map = new Map(deltas.map(d => [d.ctuid, d]));
  return tracts.map(t => {
    const d = map.get(t.ctuid);
    if (!d) return t;
    return {
      ...t,
      temperature_c: d.temperature_c ?? t.temperature_c,
      humidex: d.humidex ?? t.humidex,
      precipitation_mm: d.precipitation_mm ?? t.precipitation_mm,
      wind_speed_kmh: d.wind_speed_kmh ?? t.wind_speed_kmh,
      wind_gusts_kmh: d.wind_gusts_kmh ?? t.wind_gusts_kmh,
      weather_code: d.weather_code ?? t.weather_code,
    };
  });
}

/**
 * Spatial join outage features to tracts by centroid containment.
 * The Alectra feed returns polygons. For each tract, we count how many
 * outage polygons cover its centroid and sum their customers_affected.
 */
export function mergeOutages(tracts: Tract[], outages: OutageCollection): Tract[] {
  if (!outages.features?.length) {
    // Clear stale outages
    return tracts.map(t => ({ ...t, active_outages: 0, customers_affected: 0 }));
  }

  // For each tract, test polygon containment.
  return tracts.map(t => {
    let count = 0;
    let affected = 0;
    for (const f of outages.features) {
      if (!f.geometry) continue;
      if (pointInPolygon([t.lng, t.lat], f.geometry)) {
        count += 1;
        affected += f.properties.CUSTOMERS_AFFECTED ?? f.properties.CUSTOUT ?? 0;
      }
    }
    if (count === t.active_outages && affected === t.customers_affected) return t;
    return { ...t, active_outages: count, customers_affected: affected };
  });
}

/* ─── Point-in-polygon (ray casting, supports Polygon + MultiPolygon) ── */

function pointInPolygon(
  point: number[],
  geometry: { type: string; coordinates: any },
): boolean {
  if (geometry.type === 'Polygon') {
    return pipRings(point, geometry.coordinates as number[][][]);
  }
  if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates as number[][][][]) {
      if (pipRings(point, poly)) return true;
    }
  }
  return false;
}

function pipRings(point: number[], rings: number[][][]): boolean {
  if (!rings.length) return false;
  // Outer ring first
  if (!pipRing(point, rings[0])) return false;
  // Holes
  for (let i = 1; i < rings.length; i++) {
    if (pipRing(point, rings[i])) return false;
  }
  return true;
}

function pipRing(point: number[], ring: number[][]): boolean {
  let inside = false;
  const [x, y] = point;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
