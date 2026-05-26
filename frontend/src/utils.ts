import type { Scenario, Tier } from './types';

export function scoreFor(tract: { threshold_score_baseline: number; threshold_score_heatwave: number; threshold_score_icestorm: number }, scenario: Scenario): number {
  if (scenario === 'Heatwave') return tract.threshold_score_heatwave;
  if (scenario === 'Ice Storm') return tract.threshold_score_icestorm;
  return tract.threshold_score_baseline;
}

export function getTier(score: number): Tier {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'moderate';
  return 'low';
}

export const TIER_COLORS: Record<Tier, string> = {
  low:      '#4ade80',
  moderate: '#facc15',
  high:     '#fb923c',
  critical: '#ef4444',
};

export const TIER_LABELS: Record<Tier, string> = {
  low:      'Low',
  moderate: 'Moderate',
  high:     'High',
  critical: 'Critical',
};

export function formatIncome(v: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(v);
}

export function formatPct(v: number): string {
  return `${(v * 100).toFixed(0)}%`;
}

export function weatherLabel(code: number): string {
  if (code === 0) return 'Clear';
  if (code <= 3) return 'Partly Cloudy';
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
