/**
 * City-wide pattern detection.
 *
 * Spatial clustering over the tract set to surface emergent patterns the
 * tract-level advisory engine cannot see — cooling deserts that span
 * several adjacent tracts, isolated senior clusters, outage corridors,
 * renter-pressure zones.
 *
 * Deterministic. No models, no inference. Adjacency by centroid distance
 * (a 2 km threshold approximates first-degree CT adjacency in Brampton);
 * for production, replace with topological adjacency from the boundary
 * polygons.
 */

import type { Scenario, Tract } from './types';
import { haversineKm, scoreFor } from './utils';

export type CityPatternKind =
  | 'cooling-desert'
  | 'senior-burdened-low-access'
  | 'outage-corridor'
  | 'renter-pressure-zone';

export interface CityPattern {
  id: string;
  kind: CityPatternKind;
  headline: string;
  detail: string;
  /** Tracts that participate in the cluster. */
  members: Tract[];
  /** Aggregate population implicated. */
  population: number;
  /** Optional aggregate metric (e.g. customers affected). */
  metric?: { label: string; value: string };
  urgency: 'routine' | 'elevated' | 'critical';
  sources: string[];
}

const ADJACENCY_KM = 2.0;
const MIN_CLUSTER_SIZE = 2;

/** Returns clusters of tracts satisfying `predicate`, joined by adjacency. */
function cluster(tracts: Tract[], predicate: (t: Tract) => boolean): Tract[][] {
  const matching = tracts.filter(predicate);
  if (matching.length < MIN_CLUSTER_SIZE) return [];

  const visited = new Set<string>();
  const clusters: Tract[][] = [];

  for (const seed of matching) {
    if (visited.has(seed.ctuid)) continue;
    const queue: Tract[] = [seed];
    const group: Tract[] = [];
    while (queue.length) {
      const cur = queue.shift()!;
      if (visited.has(cur.ctuid)) continue;
      visited.add(cur.ctuid);
      group.push(cur);
      for (const other of matching) {
        if (visited.has(other.ctuid)) continue;
        if (haversineKm(cur.lat, cur.lng, other.lat, other.lng) <= ADJACENCY_KM) {
          queue.push(other);
        }
      }
    }
    if (group.length >= MIN_CLUSTER_SIZE) clusters.push(group);
  }
  return clusters;
}

export function detectCityPatterns(
  tracts: Tract[],
  scenario: Scenario,
): CityPattern[] {
  const out: CityPattern[] = [];
  if (tracts.length === 0) return out;

  /* ─── Cooling deserts ─── */
  const coolingDeserts = cluster(tracts, t => t.shelterCount === 0);
  coolingDeserts.forEach((group, i) => {
    const pop = group.reduce((s, t) => s + t.population, 0);
    out.push({
      id: `cooling-desert-${i}`,
      kind: 'cooling-desert',
      headline: `Cooling desert · ${group.length} adjacent tracts`,
      detail: `${fmtPop(pop)} residents live in a contiguous zone with no designated cooling or warming centre within 2.5 km. Mobile-unit placement here serves the highest population per deployment.`,
      members: group,
      population: pop,
      metric: { label: 'Population without access', value: fmtPop(pop) },
      urgency: scenario === 'Heatwave' ? 'critical' : 'elevated',
      sources: ['City of Brampton facilities registry', 'StatsCan Census 2021'],
    });
  });

  /* ─── Senior-burdened low-access ─── */
  const seniorBurdened = cluster(
    tracts,
    t => t.cisv_quintile >= 4 && t.pct_pre1980 > 0.45 && t.shelterCount <= 1,
  );
  seniorBurdened.forEach((group, i) => {
    const pop = group.reduce((s, t) => s + t.population, 0);
    out.push({
      id: `senior-burdened-${i}`,
      kind: 'senior-burdened-low-access',
      headline: `Vulnerable seniors · low access · ${group.length} tracts`,
      detail: `Adjacent tracts combining top-quintile social vulnerability, older housing stock, and at most one cooling centre within reach. Door-to-door coordination is most effective when sequenced across these tracts together.`,
      members: group,
      population: pop,
      metric: { label: 'Residents in cluster', value: fmtPop(pop) },
      urgency: 'elevated',
      sources: ['StatsCan CISV 2021', 'StatsCan Census 2021', 'City facilities registry'],
    });
  });

  /* ─── Outage corridors ─── */
  const outageCorridors = cluster(tracts, t => t.active_outages > 0);
  outageCorridors.forEach((group, i) => {
    const affected = group.reduce((s, t) => s + t.customers_affected, 0);
    if (affected < 100) return; // ignore trivial residual outages
    const pop = group.reduce((s, t) => s + t.population, 0);
    out.push({
      id: `outage-corridor-${i}`,
      kind: 'outage-corridor',
      headline: `Outage corridor · ${group.length} adjacent tracts`,
      detail: `Active outages cluster across adjacent tracts. Restoration sequencing should consider the corridor as a single dispatch rather than individual feeders.`,
      members: group,
      population: pop,
      metric: { label: 'Customers without power', value: affected.toLocaleString() },
      urgency: affected > 5000 ? 'critical' : 'elevated',
      sources: ['Alectra live outage feed', 'StatsCan Census 2021'],
    });
  });

  /* ─── Renter-pressure zones ─── */
  const renterPressure = cluster(
    tracts,
    t => t.pct_renters > 0.45 && t.pct_low_income > 0.20,
  );
  renterPressure.forEach((group, i) => {
    if (group.length < 3) return; // require at least 3 tracts for a "zone"
    const pop = group.reduce((s, t) => s + t.population, 0);
    out.push({
      id: `renter-pressure-${i}`,
      kind: 'renter-pressure-zone',
      headline: `Renter-pressure zone · ${group.length} tracts`,
      detail: `A contiguous zone of renter-dense, income-constrained tracts. Tenant-rights outreach and demand-response enrollment land best when treated as a single targeted campaign across the whole zone.`,
      members: group,
      population: pop,
      metric: { label: 'Residents in zone', value: fmtPop(pop) },
      urgency: 'routine',
      sources: ['StatsCan Census 2021'],
    });
  });

  return out.sort((a, b) => urgRank(a.urgency) - urgRank(b.urgency) || b.population - a.population);
}

const fmtPop = (v: number) => new Intl.NumberFormat('en-CA').format(Math.round(v));

function urgRank(u: CityPattern['urgency']): number {
  return u === 'critical' ? 0 : u === 'elevated' ? 1 : 2;
}

export const PATTERN_LABEL: Record<CityPatternKind, string> = {
  'cooling-desert':              'Cooling desert',
  'senior-burdened-low-access':  'Vulnerable seniors · low access',
  'outage-corridor':             'Outage corridor',
  'renter-pressure-zone':        'Renter-pressure zone',
};

/** Selector helper for the watchlist — count patterns by kind. */
export function summarizePatterns(patterns: CityPattern[]): { kind: CityPatternKind; count: number }[] {
  const counts = new Map<CityPatternKind, number>();
  for (const p of patterns) counts.set(p.kind, (counts.get(p.kind) ?? 0) + 1);
  return Array.from(counts.entries()).map(([kind, count]) => ({ kind, count }));
}

// Re-export scoreFor as a courtesy if components need it from this module.
export { scoreFor };
