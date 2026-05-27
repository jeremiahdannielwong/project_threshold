/**
 * Equity-weighted reliability + restoration priority.
 *
 * Real SAIDI/SAIFI accumulate over months. With only a current snapshot,
 * we expose an *instantaneous equity-weighted exposure index*: the customers
 * currently without power, weighted by tract-level social vulnerability.
 *
 * The metric is named EWEI (Equity-Weighted Exposure Index) explicitly to
 * avoid implying we have computed traditional SAIDI. Same architectural
 * pattern accumulates into proper SAIDI once historical data is in place.
 */

import type { Tract } from './types';

export interface EquitySnapshot {
  /** Customers currently affected, citywide. */
  customersAffected: number;
  /** Sum of customers_affected × (1 + cisv_score). */
  weightedExposure: number;
  /** weightedExposure / customersAffected — average vulnerability of affected pop. */
  averageVulnerability: number;
  /** How many tracts have any active outage. */
  tractsAffected: number;
}

export function equitySnapshot(tracts: Tract[]): EquitySnapshot {
  let customers = 0;
  let weighted = 0;
  let tractsAffected = 0;
  for (const t of tracts) {
    if (t.active_outages <= 0 || t.customers_affected <= 0) continue;
    const c = t.customers_affected;
    customers += c;
    weighted += c * (1 + Math.max(t.cisv_score, 0));
    tractsAffected += 1;
  }
  return {
    customersAffected: customers,
    weightedExposure: weighted,
    averageVulnerability: customers > 0 ? weighted / customers : 0,
    tractsAffected,
  };
}

/* ─── Restoration priority ─── */

export interface RestorationCandidate {
  tract: Tract;
  /** Vulnerability-weighted composite score for sequencing. Higher = restore sooner. */
  priority: number;
  /** Reasons for the priority, surfaced in the queue UI. */
  reasons: string[];
}

export function restorationQueue(tracts: Tract[]): RestorationCandidate[] {
  const candidates: RestorationCandidate[] = [];
  for (const t of tracts) {
    if (t.active_outages <= 0) continue;
    const reasons: string[] = [];

    const customers = t.customers_affected;
    // Logarithmic so that scale matters but does not dominate equity factors.
    const customerComponent = Math.log10(customers + 1);
    let priority = customerComponent * 10;

    const cisv = Math.max(t.cisv_score, 0);
    priority += cisv * 8;
    if (cisv >= 0.5) reasons.push(`CISV ${t.cisv_quintile}/5`);

    if (t.pct_pre1980 > 0.45) {
      priority += 4;
      reasons.push('aging housing');
    }
    if (t.pct_low_income > 0.20) {
      priority += 3;
      reasons.push('income-constrained');
    }
    if (t.shelterCount === 0) {
      priority += 5;
      reasons.push('no nearby centre');
    }
    if (t.humidex >= 38) {
      priority += 6;
      reasons.push('heat-stress conditions');
    }

    reasons.unshift(`${customers.toLocaleString()} customers`);
    candidates.push({ tract: t, priority, reasons });
  }

  return candidates.sort((a, b) => b.priority - a.priority);
}
