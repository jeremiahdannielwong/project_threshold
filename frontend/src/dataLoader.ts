import type { Facility, Tract } from './types';
import { haversineKm } from './utils';

interface CommunitySummary {
  ctuid: string;
  neighbourhood: string;
  population: number | null;
  median_income: number | null;
  pct_renters: number | null;
  pct_pre1980: number | null;
  pct_low_income: number | null;
  cisv_score: number | null;
  cisv_dim1: number | null;
  cisv_dim2: number | null;
  cisv_dim3: number | null;
  cisv_dim4: number | null;
  cisv_quintile: number | null;
  cisr_score: number | null;
  cisr_quintile: number | null;
  humidex: number | null;
  temperature_c: number | null;
  precipitation_mm: number | null;
  wind_speed_kmh: number | null;
  wind_gusts_kmh: number | null;
  weather_code: number | null;
  active_outages: number;
  customers_affected: number;
  threshold_score_baseline: number | null;
  threshold_score_heatwave: number | null;
  threshold_score_icestorm: number | null;
  risk_level: string | null;
}

interface CommunityFeature {
  type: 'Feature';
  id: string;
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][][] } | null;
  properties: CommunitySummary;
}

interface Envelope<T> {
  data: T;
  sources: unknown[];
  generated_at: string;
}

function centroid(geometry: CommunityFeature['geometry']): [number, number] {
  if (!geometry) return [43.73, -79.76];
  const ring = (geometry.type === 'Polygon' ? geometry.coordinates[0] : geometry.coordinates[0][0]) as number[][];
  const lat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
  const lng = ring.reduce((s, c) => s + c[0], 0) / ring.length;
  return [lat, lng];
}

/**
 * Append a cardinal-direction suffix to every CT that shares a SPA name with
 * another CT. Brampton's Secondary Plan Areas are far coarser than census
 * tracts — 21 CTs collapse into a single "Flowertown" name — so the panel
 * and brief showed multiple identical labels. We disambiguate by computing
 * each duplicate CT's bearing from the SPA's centroid and slotting it into
 * one of 8 compass octants (N/NE/E/SE/S/SW/W/NW). If two CTs land in the
 * same octant we append an ordinal so every label remains unique.
 */
function disambiguateNeighbourhoods(tracts: Tract[]): void {
  const groups = new Map<string, Tract[]>();
  for (const t of tracts) {
    const list = groups.get(t.neighbourhood);
    if (list) list.push(t);
    else groups.set(t.neighbourhood, [t]);
  }

  const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

  for (const [name, group] of groups) {
    if (group.length <= 1) continue;

    const centLat = group.reduce((s, t) => s + t.lat, 0) / group.length;
    const centLng = group.reduce((s, t) => s + t.lng, 0) / group.length;

    const labelled = group.map(t => {
      const dLat = t.lat - centLat;
      const dLng = t.lng - centLng;
      let bearing = Math.atan2(dLng, dLat) * 180 / Math.PI;
      if (bearing < 0) bearing += 360;
      const idx = Math.floor(((bearing + 22.5) % 360) / 45);
      return { tract: t, direction: DIRS[idx] };
    });

    const byDir = new Map<string, typeof labelled>();
    for (const item of labelled) {
      const arr = byDir.get(item.direction);
      if (arr) arr.push(item);
      else byDir.set(item.direction, [item]);
    }

    for (const [dir, items] of byDir) {
      if (items.length === 1) {
        items[0].tract.neighbourhood = `${name} (${dir})`;
      } else {
        items.sort((a, b) => b.tract.lat - a.tract.lat || a.tract.lng - b.tract.lng);
        items.forEach((item, i) => {
          item.tract.neighbourhood = `${name} (${dir}-${i + 1})`;
        });
      }
    }
  }
}

function num(v: number | null | undefined, fallback = 0): number {
  return v == null || Number.isNaN(v) ? fallback : v;
}

/**
 * Normalize a percentage field to a proportion in [0, 1].
 *
 * The upstream census feed returns these as percentages (e.g., 23.4 meaning
 * 23.4%). The pipeline divides by 100 before persisting, but the previous
 * `Math.min(value, 1)` defence silently clamped every value to 1.0 whenever
 * the pipeline regressed — producing the "100% across all tracts" symptom.
 *
 * This normalizer handles both units transparently: anything ≥ 1.5 is assumed
 * to be a percentage and is divided by 100; anything below is assumed to be a
 * proportion. Either way the result is clamped to [0, 1].
 */
function normPct(v: number | null | undefined): number {
  const n = num(v);
  if (n <= 0) return 0;
  const proportion = n >= 1.5 ? n / 100 : n;
  return Math.min(Math.max(proportion, 0), 1);
}

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → ${r.status} ${r.statusText}`);
  return r.json() as Promise<T>;
}

export async function loadData(): Promise<{ tracts: Tract[]; facilities: Facility[] }> {
  const [commRes, facilRes] = await Promise.all([
    fetchJson<Envelope<{ type: string; features: CommunityFeature[] }>>('/api/communities/features'),
    fetchJson<Envelope<{ type: string; features: { geometry: { coordinates: number[] }; properties: Record<string, string> }[] }>>('/api/facilities'),
  ]);

  const facilities: Facility[] = (facilRes.data?.features ?? []).map(f => ({
    name: f.properties.name ?? '',
    address: f.properties.address ?? '',
    role: f.properties.role ?? '',
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
  }));

  const tracts: Tract[] = (commRes.data?.features ?? []).map(f => {
    const p = f.properties;
    const [lat, lng] = centroid(f.geometry);
    const nearby = facilities.filter(fac => haversineKm(lat, lng, fac.lat, fac.lng) <= 2.5);

    return {
      ctuid: p.ctuid,
      neighbourhood: p.neighbourhood || p.ctuid,
      lat,
      lng,
      geometry: f.geometry as unknown as Tract['geometry'],
      population: num(p.population),
      median_income: num(p.median_income),
      pct_renters: normPct(p.pct_renters),
      pct_pre1980: normPct(p.pct_pre1980),
      pct_low_income: normPct(p.pct_low_income),
      cisv_score: num(p.cisv_score),
      cisv_dim1: num(p.cisv_dim1),
      cisv_dim2: num(p.cisv_dim2),
      cisv_dim3: num(p.cisv_dim3),
      cisv_dim4: num(p.cisv_dim4),
      cisv_quintile: num(p.cisv_quintile),
      cisr_score: num(p.cisr_score),
      cisr_quintile: num(p.cisr_quintile),
      temperature_c: num(p.temperature_c, 20),
      humidex: num(p.humidex, 20),
      precipitation_mm: num(p.precipitation_mm),
      wind_speed_kmh: num(p.wind_speed_kmh),
      wind_gusts_kmh: num(p.wind_gusts_kmh),
      weather_code: num(p.weather_code),
      active_outages: num(p.active_outages),
      customers_affected: num(p.customers_affected),
      threshold_score_baseline: num(p.threshold_score_baseline),
      threshold_score_heatwave: num(p.threshold_score_heatwave),
      threshold_score_icestorm: num(p.threshold_score_icestorm),
      risk_level: p.risk_level ?? 'Moderate',
      shelterCount: nearby.length,
      shelterList: nearby.map(fac => fac.name),
    };
  });

  disambiguateNeighbourhoods(tracts);

  return { tracts, facilities };
}
