import type { Facility, Tract } from './types';
import { haversineKm } from './utils';

function centroid(coords: number[][][]): [number, number] {
  const ring = coords[0];
  const lat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
  const lng = ring.reduce((s, c) => s + c[0], 0) / ring.length;
  return [lat, lng];
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

export async function loadData(): Promise<{ tracts: Tract[]; facilities: Facility[] }> {
  const [tractsGJ, facilsGJ] = await Promise.all([
    fetch('/data/brampton_full.geojson').then(r => r.json()),
    fetch('/data/brampton_facilities.geojson').then(r => r.json()),
  ]);

  const facilities: Facility[] = (facilsGJ.features as { geometry: { coordinates: number[] }; properties: Record<string, string> }[]).map(f => ({
    name: f.properties.name ?? '',
    address: f.properties.address ?? '',
    role: f.properties.role ?? '',
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
  }));

  const tracts: Tract[] = (tractsGJ.features as { geometry: { type: 'Polygon'; coordinates: number[][][] }; properties: Record<string, unknown> }[]).map(f => {
    const p = f.properties;
    const [lat, lng] = centroid(f.geometry.coordinates);
    const nearby = facilities.filter(fac => haversineKm(lat, lng, fac.lat, fac.lng) <= 2.5);

    return {
      ctuid: String(p.CTUID ?? ''),
      neighbourhood: String(p.neighbourhood ?? p.CTUID ?? ''),
      lat,
      lng,
      geometry: f.geometry,
      population: num(p.population),
      median_income: num(p.median_income),
      pct_renters: num(p.pct_renters),
      pct_pre1980: num(p.pct_pre1980),
      pct_low_income: Math.min(num(p.pct_low_income), 1),
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
      risk_level: String(p.risk_level ?? 'Moderate'),
      shelterCount: nearby.length,
      shelterList: nearby.map(fac => fac.name),
    };
  });

  return { tracts, facilities };
}
