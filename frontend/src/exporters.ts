/**
 * Export primitives — printable briefs and CSV rosters.
 *
 * PDF generation uses the browser's native print pipeline rather than a
 * client-side PDF library: keeps the bundle small, the output editable
 * by the operator (page setup, scaling), and the result identical to what
 * appears on screen.
 */

import type { Tract } from './types';

/* ─── CSV ─────────────────────────────────────────────────── */

function csvEscape(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv<T extends object>(rows: T[]): string {
  if (rows.length === 0) return '';
  const headers = Array.from(
    rows.reduce<Set<string>>((set, r) => {
      Object.keys(r as object).forEach(k => set.add(k));
      return set;
    }, new Set())
  );
  const lines = [headers.join(',')];
  for (const r of rows) {
    const obj = r as Record<string, unknown>;
    lines.push(headers.map(h => csvEscape(obj[h])).join(','));
  }
  return lines.join('\n');
}

export function downloadFile(filename: string, content: string, mime = 'text/csv'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ─── LEAP outreach roster ──────────────────────────────── */

export interface LeapRow {
  ctuid: string;
  neighbourhood: string;
  population: number;
  median_income: number;
  pct_low_income_share: string;
  estimated_energy_share_of_income_pct: string;
  cooling_centres_within_2_5km: number;
}

export function buildLeapRoster(
  tracts: Tract[],
  annualEnergyCost: number,
  thresholdPct: number,
): LeapRow[] {
  return tracts
    .filter(t => t.median_income > 0)
    .map(t => {
      const share = (annualEnergyCost / t.median_income) * 100;
      return { t, share };
    })
    .filter(r => r.share >= thresholdPct)
    .sort((a, b) => b.share - a.share)
    .map(({ t, share }) => ({
      ctuid: t.ctuid,
      neighbourhood: t.neighbourhood,
      population: t.population,
      median_income: t.median_income,
      pct_low_income_share: `${Math.round(t.pct_low_income * 100)}%`,
      estimated_energy_share_of_income_pct: share.toFixed(1),
      cooling_centres_within_2_5km: t.shelterCount,
    }));
}

/* ─── DR / CDM targeting roster ─────────────────────────── */

export interface DrTargetingRow {
  ctuid: string;
  neighbourhood: string;
  population: number;
  pct_renters: string;
  pct_pre1980: string;
  estimated_enrollment_population: number;
}

export function buildDrTargetingRoster(tracts: Tract[]): DrTargetingRow[] {
  return tracts
    .filter(t => t.pct_renters > 0.35)
    .sort((a, b) => (b.population * b.pct_renters) - (a.population * a.pct_renters))
    .map(t => ({
      ctuid: t.ctuid,
      neighbourhood: t.neighbourhood,
      population: t.population,
      pct_renters: `${Math.round(t.pct_renters * 100)}%`,
      pct_pre1980: `${Math.round(t.pct_pre1980 * 100)}%`,
      estimated_enrollment_population: Math.round(t.population * 0.22),
    }));
}

/* ─── Restoration sequence export ──────────────────────── */

export interface RestorationRow {
  sequence: number;
  ctuid: string;
  neighbourhood: string;
  customers_affected: number;
  cisv_quintile: number;
  shelter_access: 'within 2.5km' | 'none < 2.5km';
  reasons: string;
}

/* ─── Print incident brief ────────────────────────────── */

/** Triggers the browser's print dialog. The print stylesheet handles layout. */
export function printIncidentBrief(): void {
  document.body.setAttribute('data-print-mode', 'brief');
  // requestAnimationFrame so the style is applied before printing
  requestAnimationFrame(() => {
    window.print();
    document.body.removeAttribute('data-print-mode');
  });
}
