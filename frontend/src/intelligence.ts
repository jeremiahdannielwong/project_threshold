/**
 * Proactive intelligence engine — deterministic, lens-aware.
 *
 * Takes the current application state and produces a ranked list of
 * actionable intelligence items tailored to the active stakeholder lens.
 *
 * Design principles:
 *  - Every item is specific: names tracts, cites numbers, explains why.
 *  - Every item has an action: tells the viewer exactly what to do next.
 *  - Items are urgency-sorted: critical → elevated → routine.
 *  - Lens filtering ensures operators, municipalities, and community
 *    organisations each see only the intelligence that's theirs to act on.
 */

import type { Tract, Scenario } from './types';
import type { AdvisoryRollup } from './context';
import type { FinanceSnapshot } from './liveData';
import type { ForecastPoint } from './forecast';
import { scoreFor } from './utils';

/* ─── Types ───────────────────────────────────────────────── */

export type IntelUrgency = 'critical' | 'elevated' | 'routine';
export type IntelLens = 'operator' | 'municipal' | 'community';

export type IntelIconKey =
  | 'zap'
  | 'users'
  | 'home'
  | 'thermometer'
  | 'shield'
  | 'trending-up'
  | 'alert-triangle'
  | 'map-pin'
  | 'dollar-sign'
  | 'activity'
  | 'layers';

export interface IntelItem {
  id: string;
  urgency: IntelUrgency;
  icon: IntelIconKey;
  category: string;
  headline: string;
  /** 2–3 sentence explanation of why this matters and what drives it. */
  detail: string;
  /** One clear action the viewer should take right now. */
  action: string;
  metric?: { label: string; value: string };
  affectedTracts?: string[];
  /** Which lenses should see this item. */
  lens: IntelLens[];
}

/* ─── Urgency helpers ─────────────────────────────────────── */

function urg(n: number, medThresh: number, highThresh: number): IntelUrgency {
  return n >= highThresh ? 'critical' : n >= medThresh ? 'elevated' : 'routine';
}

/* ─── Main builder ────────────────────────────────────────── */

export function buildIntelligence(
  tracts: Tract[],
  percentiles: Map<string, number>,
  rollupByTract: Map<string, AdvisoryRollup>,
  scenario: Scenario,
  finance: FinanceSnapshot | null,
  forecastPoints: ForecastPoint[],
): IntelItem[] {
  const items: IntelItem[] = [];

  /* ── Pre-compute tract segments ────────────────────────── */

  const criticalTracts = tracts.filter(t => (percentiles.get(t.ctuid) ?? 0) >= 0.90);
  const elevatedTracts = tracts.filter(t => (percentiles.get(t.ctuid) ?? 0) >= 0.75);
  const totalAtRisk = elevatedTracts;

  const atRiskPop = totalAtRisk.reduce((s, t) => s + t.population, 0);
  const criticalPop = criticalTracts.reduce((s, t) => s + t.population, 0);

  // Tracts with active outages that are also in elevated+ risk
  const outageSensitiveTracts = tracts.filter(
    t => t.active_outages > 0 && (percentiles.get(t.ctuid) ?? 0) >= 0.75,
  );
  const outageSensitiveCustomers = outageSensitiveTracts.reduce(
    (s, t) => s + t.customers_affected,
    0,
  );

  // Tracts with pre-1980 housing stock AND active outages — restoration risk
  const infraRiskTracts = tracts.filter(
    t => t.active_outages > 0 && t.pct_pre1980 >= 0.40,
  );

  // Cooling gap: elevated risk, zero accessible cooling centres
  const coolingGapTracts = totalAtRisk.filter(t => t.shelterCount === 0);
  const coolingGapPop = coolingGapTracts.reduce((s, t) => s + t.population, 0);

  // Renter-dense tracts with any active advisories
  const renterAdvisoryTracts = totalAtRisk.filter(
    t => t.pct_renters >= 0.45 && (rollupByTract.get(t.ctuid)?.total ?? 0) > 0,
  );

  // Energy poverty: annual energy cost > threshold % of median income
  const energyPovertyTracts = finance
    ? tracts.filter(t => {
        if (t.median_income <= 0) return false;
        const share = (finance.annual_household_energy_cost_cad / t.median_income) * 100;
        return share >= finance.energy_poverty_threshold_pct;
      })
    : [];

  // Door-knock priority: elevated+ & high renters & low income
  const doorKnockTracts = tracts
    .filter(
      t =>
        (percentiles.get(t.ctuid) ?? 0) >= 0.75 &&
        t.pct_renters >= 0.40 &&
        t.pct_low_income >= 0.12,
    )
    .sort((a, b) => (percentiles.get(b.ctuid) ?? 0) - (percentiles.get(a.ctuid) ?? 0))
    .slice(0, 6);

  // Tenant-rights exposure: advisory active + renter-dense
  const tenantRightsTracts = tracts.filter(t => {
    const r = rollupByTract.get(t.ctuid);
    return r && r.total > 0 && t.pct_renters >= 0.35;
  });

  // Forecast trajectory
  const present = forecastPoints[0] ?? null;
  const peak = forecastPoints.length
    ? forecastPoints.reduce(
        (m, p) => (p.citywideStress > m.citywideStress ? p : m),
        forecastPoints[0],
      )
    : null;
  const forecastDelta = peak && present ? peak.citywideStress - present.citywideStress : 0;

  // Worst single tract
  const worstTract = criticalTracts.length
    ? criticalTracts.reduce(
        (w, t) =>
          (percentiles.get(t.ctuid) ?? 0) > (percentiles.get(w.ctuid) ?? 0) ? t : w,
        criticalTracts[0],
      )
    : null;

  /* ════════════════════════════════════════════════════════
     CROSS-LENS: compound vulnerability (all lenses see this)
     ════════════════════════════════════════════════════════ */

  if (worstTract && criticalTracts.length > 0) {
    items.push({
      id: 'all-critical-compound',
      urgency: 'critical',
      icon: 'alert-triangle',
      category: 'Compound Risk',
      headline: `${criticalTracts.length} tract${criticalTracts.length > 1 ? 's' : ''} at critical tier — ${worstTract.neighbourhood} highest`,
      detail:
        `${worstTract.neighbourhood} shows the highest compound vulnerability: ` +
        `${(worstTract.pct_renters * 100).toFixed(0)}% renters, ` +
        `${(worstTract.pct_pre1980 * 100).toFixed(0)}% pre-1980 housing, ` +
        `${(worstTract.pct_low_income * 100).toFixed(0)}% low-income share. ` +
        `Under ${scenario} conditions this combination is associated with the fastest escalation to acute harm.`,
      action:
        'All agencies: coordinate on this tract. Activate multi-agency response protocol if not already underway.',
      metric: {
        label: `Critical tract${criticalTracts.length > 1 ? 's' : ''}`,
        value: `${criticalTracts.length} · ${criticalPop.toLocaleString()} residents`,
      },
      affectedTracts: criticalTracts.map(t => t.neighbourhood),
      lens: ['operator', 'municipal', 'community'],
    });
  }

  /* ════════════════════════════════════════════════════════
     OPERATOR INTELLIGENCE
     ════════════════════════════════════════════════════════ */

  // Forecast-driven demand response window
  if (forecastDelta > 3 && peak) {
    items.push({
      id: 'op-dr-window',
      urgency: forecastDelta > 8 ? 'critical' : 'elevated',
      icon: 'trending-up',
      category: 'Grid Forecast',
      headline: `Stress index tracking +${forecastDelta.toFixed(0)} over ${peak.hoursAhead}h — demand response window open`,
      detail:
        `City-wide stress is forecast to peak at ${peak.citywideStress.toFixed(0)} ` +
        `driven by ${peak.driver}. ` +
        `A ${peak.hoursAhead}-hour activation window exists before load peaks. ` +
        `Confidence: ${peak.confidence}.`,
      action:
        'Alert DR-enrolled customers via Alectra notification. Pre-position restoration standby crews in highest-risk feeders.',
      metric: { label: 'Peak forecast', value: `${peak.citywideStress.toFixed(0)} in +${peak.hoursAhead}h` },
      lens: ['operator'],
    });
  }

  // Outage-vulnerable tract intersection
  if (outageSensitiveTracts.length > 0) {
    const names = outageSensitiveTracts.map(t => t.neighbourhood);
    items.push({
      id: 'op-outage-vuln',
      urgency: urg(outageSensitiveCustomers, 500, 2000),
      icon: 'zap',
      category: 'Infrastructure',
      headline: `${outageSensitiveTracts.length} vulnerable tract${outageSensitiveTracts.length > 1 ? 's' : ''} with active outages — restoration is life-safety priority`,
      detail:
        `Active outages in ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''} overlap ` +
        `with elevated vulnerability. Pre-1980 wiring and high renter concentration reduce residents' ability to self-manage. ` +
        `Every hour of unrestored power amplifies heat or cold risk for susceptible households.`,
      action:
        'Prioritize restoration sequencing by tract vulnerability score. Flag life-support registry households for welfare check.',
      metric: { label: 'Customers in vulnerable tracts', value: outageSensitiveCustomers.toLocaleString() },
      affectedTracts: names,
      lens: ['operator'],
    });
  }

  // Pre-1980 infrastructure risk
  if (infraRiskTracts.length > 0) {
    items.push({
      id: 'op-infra-risk',
      urgency: 'elevated',
      icon: 'activity',
      category: 'Infrastructure Age',
      headline: `${infraRiskTracts.length} outage tract${infraRiskTracts.length > 1 ? 's' : ''} with ≥40% pre-1980 housing — extended restoration expected`,
      detail:
        `Older wiring, knob-and-tube installations, and pre-code load centres slow restoration and increase ` +
        `re-close risk in ${infraRiskTracts.map(t => t.neighbourhood).join(', ')}. ` +
        `Plan for re-energisation inspection hold time.`,
      action:
        'Flag these feeders for extended crew time. Coordinate with field ops on inspection requirements before re-close.',
      metric: { label: 'Impacted feeders', value: infraRiskTracts.length.toString() },
      affectedTracts: infraRiskTracts.map(t => t.neighbourhood),
      lens: ['operator'],
    });
  }

  // Energy poverty / LEAP exposure
  if (energyPovertyTracts.length > 0) {
    const epop = energyPovertyTracts.reduce((s, t) => s + t.population, 0);
    items.push({
      id: 'op-energy-poverty',
      urgency: urg(energyPovertyTracts.length, 3, 8),
      icon: 'dollar-sign',
      category: 'Equity Exposure',
      headline: `${energyPovertyTracts.length} tract${energyPovertyTracts.length > 1 ? 's' : ''} above energy-poverty threshold at current OEB rates`,
      detail:
        `Energy spend exceeds ${finance?.energy_poverty_threshold_pct ?? 6}% of median income ` +
        `under the current blended rate of ${finance?.blended_residential_cents_per_kwh.toFixed(1) ?? '—'}¢/kWh. ` +
        `Every additional degree of cooling load pushes these households further into hardship. ` +
        `This is the LEAP outreach window.`,
      action:
        'Export LEAP roster from Watchlist → Outreach. Activate community energy-hardship liaisons.',
      metric: {
        label: 'LEAP-eligible population',
        value: epop.toLocaleString(),
      },
      affectedTracts: energyPovertyTracts.slice(0, 5).map(t => t.neighbourhood),
      lens: ['operator'],
    });
  }

  /* ════════════════════════════════════════════════════════
     MUNICIPAL INTELLIGENCE
     ════════════════════════════════════════════════════════ */

  // Population at risk summary
  if (atRiskPop > 0) {
    items.push({
      id: 'mun-pop-risk',
      urgency: urg(criticalTracts.length, 1, 4),
      icon: 'users',
      category: 'Population Risk',
      headline: `${atRiskPop.toLocaleString()} residents in elevated-or-higher vulnerability tracts`,
      detail:
        `${criticalTracts.length} tract${criticalTracts.length !== 1 ? 's' : ''} at critical tier, ` +
        `${Math.max(0, totalAtRisk.length - criticalTracts.length)} at elevated. ` +
        `Compound factors — low income, aging housing, high renter share — amplify harm risk beyond what the weather reading alone implies. ` +
        `${scenario !== 'Baseline' ? `${scenario} conditions intensify this risk materially.` : ''}`,
      action:
        'Run Vulnerable Persons Registry check against critical tracts. Coordinate pre-emptive welfare checks with Red Cross.',
      metric: { label: 'Residents at elevated+ risk', value: atRiskPop.toLocaleString() },
      lens: ['municipal'],
    });
  }

  // Cooling centre gap
  if (coolingGapTracts.length > 0) {
    items.push({
      id: 'mun-cooling-gap',
      urgency: urg(coolingGapPop, 3000, 8000),
      icon: 'map-pin',
      category: 'Service Gap',
      headline: `${coolingGapTracts.length} elevated-risk tract${coolingGapTracts.length > 1 ? 's' : ''} with no cooling centre within 2.5 km`,
      detail:
        `${coolingGapPop.toLocaleString()} residents in high-vulnerability areas have no designated ` +
        `cooling/warming centre accessible without a vehicle. ` +
        `Highest concentration in ${coolingGapTracts.slice(0, 2).map(t => t.neighbourhood).join(' and ')}. ` +
        `Without access, heat illness risk rises steeply after 4+ hours of indoor temperature exceedance.`,
      action:
        'Activate overflow cooling at nearest municipal facility. Consider mobile cooling or transit shuttle deployment to gap tracts.',
      metric: { label: 'Residents without cooling access', value: coolingGapPop.toLocaleString() },
      affectedTracts: coolingGapTracts.map(t => t.neighbourhood),
      lens: ['municipal'],
    });
  }

  // Renter concentration + active advisories
  if (renterAdvisoryTracts.length > 0) {
    const renterPop = renterAdvisoryTracts.reduce((s, t) => s + t.population, 0);
    items.push({
      id: 'mun-renter-advisory',
      urgency: 'elevated',
      icon: 'home',
      category: 'Housing',
      headline: `${renterAdvisoryTracts.length} renter-dense tract${renterAdvisoryTracts.length > 1 ? 's' : ''} with active advisories — bylaw response needed`,
      detail:
        `Renter households face structural barriers: no control over A/C installation, ` +
        `fear of reprisal for complaints, limited financial reserves for mitigation. ` +
        `Active advisories in ${renterAdvisoryTracts.map(t => t.neighbourhood).join(', ')} indicate ` +
        `conditions tenants cannot resolve unilaterally.`,
      action:
        'Deploy bylaw inspection team for rental unit compliance. Distribute RTA Section 20 guidance through community channels.',
      metric: { label: 'Renter-impacted population', value: renterPop.toLocaleString() },
      affectedTracts: renterAdvisoryTracts.map(t => t.neighbourhood),
      lens: ['municipal', 'community'],
    });
  }

  // Outage + municipal response
  if (outageSensitiveTracts.length > 0) {
    items.push({
      id: 'mun-outage-response',
      urgency: urg(outageSensitiveCustomers, 300, 1500),
      icon: 'zap',
      category: 'Emergency Support',
      headline: `Active outages in ${outageSensitiveTracts.length} vulnerable tract${outageSensitiveTracts.length > 1 ? 's' : ''} — municipal support required`,
      detail:
        `Outages in elevated-vulnerability areas disproportionately affect households ` +
        `dependent on powered medical devices, those in high-rise buildings where water pumps may fail, ` +
        `and families with young children or elderly members. Municipal services bridge the gap until power restoration.`,
      action:
        'Open emergency warming/cooling centres immediately. Dispatch welfare check teams to vulnerable households.',
      metric: { label: 'Affected customers', value: outageSensitiveCustomers.toLocaleString() },
      affectedTracts: outageSensitiveTracts.map(t => t.neighbourhood),
      lens: ['municipal'],
    });
  }

  /* ════════════════════════════════════════════════════════
     COMMUNITY INTELLIGENCE
     ════════════════════════════════════════════════════════ */

  // Door-knocking priority
  if (doorKnockTracts.length > 0) {
    const dkPop = doorKnockTracts.reduce((s, t) => s + t.population, 0);
    const estimatedHouseholds = Math.round(dkPop * 0.40);
    items.push({
      id: 'comm-doorknock',
      urgency: doorKnockTracts.some(t => (percentiles.get(t.ctuid) ?? 0) >= 0.90)
        ? 'critical'
        : 'elevated',
      icon: 'users',
      category: 'Outreach Priority',
      headline: `${doorKnockTracts.length} high-priority tracts for door-to-door outreach`,
      detail:
        `These tracts combine elevated vulnerability with renter-dense, low-income populations — ` +
        `the profile most likely to under-report distress and least likely to self-refer to services. ` +
        `Proactive contact is statistically more effective than resource posting alone. ` +
        `Top priority: ${doorKnockTracts.slice(0, 2).map(t => t.neighbourhood).join(', ')}.`,
      action:
        'Activate door-knocking protocol. Prioritise units in pre-1980 buildings without A/C. Check in with seniors and households with young children first.',
      metric: { label: 'Estimated households in scope', value: estimatedHouseholds.toLocaleString() },
      affectedTracts: doorKnockTracts.map(t => t.neighbourhood),
      lens: ['community'],
    });
  }

  // Tenant rights exposure
  if (tenantRightsTracts.length > 0) {
    items.push({
      id: 'comm-tenant-rights',
      urgency: 'elevated',
      icon: 'shield',
      category: 'Tenant Rights',
      headline: `Active advisories in ${tenantRightsTracts.length} renter-concentrated tract${tenantRightsTracts.length > 1 ? 's' : ''}`,
      detail:
        `Under Ontario's Residential Tenancies Act s.20, landlords must maintain a habitable temperature ` +
        `(typically ≥20°C in winter, ≤26°C in summer by many municipal by-laws). ` +
        `Many renters in ${tenantRightsTracts.slice(0, 3).map(t => t.neighbourhood).join(', ')} ` +
        `may be unaware of their right to request accommodation or escalate to the Landlord and Tenant Board.`,
      action:
        'Distribute RTA Section 20 guidance cards. Connect affected residents to Brampton housing helpline. Document complaints for potential bylaw enforcement.',
      metric: { label: 'Affected renter tracts', value: tenantRightsTracts.length.toString() },
      affectedTracts: tenantRightsTracts.slice(0, 5).map(t => t.neighbourhood),
      lens: ['community'],
    });
  }

  // Isolation risk — high vulnerability + low income + high pre-1980
  const isolationTracts = tracts.filter(
    t =>
      (percentiles.get(t.ctuid) ?? 0) >= 0.75 &&
      t.pct_low_income >= 0.20 &&
      t.pct_pre1980 >= 0.35,
  );
  if (isolationTracts.length > 0) {
    const isoPop = isolationTracts.reduce((s, t) => s + t.population, 0);
    items.push({
      id: 'comm-isolation',
      urgency: 'elevated',
      icon: 'home',
      category: 'Social Isolation',
      headline: `${isolationTracts.length} high-isolation-risk tract${isolationTracts.length > 1 ? 's' : ''} — peer-check activation recommended`,
      detail:
        `Older housing stock, low income, and high vulnerability scores are proxies for ` +
        `social isolation. Isolated individuals are less likely to call for help and more likely ` +
        `to experience health deterioration before intervention. ` +
        `Tracts affected: ${isolationTracts.slice(0, 3).map(t => t.neighbourhood).join(', ')}.`,
      action:
        'Activate peer-support check-in calls to known high-isolation residents. Coordinate with faith organisations and senior centres in affected areas.',
      metric: { label: 'Population at isolation risk', value: isoPop.toLocaleString() },
      affectedTracts: isolationTracts.map(t => t.neighbourhood),
      lens: ['community'],
    });
  }

  /* ── Sort: critical first, then elevated, then routine ── */
  const order: Record<IntelUrgency, number> = { critical: 0, elevated: 1, routine: 2 };
  return items.sort((a, b) => order[a.urgency] - order[b.urgency]);
}

/* ─── Tract-level priority action (for the left sidebar) ─── */

export interface TractAction {
  icon: IntelIconKey;
  headline: string;
  action: string;
  urgency: IntelUrgency;
}

/**
 * Returns the single most important action for the active lens
 * when viewing a specific tract. Used in the RightPanel header.
 */
export function tractPriorityAction(
  tract: Tract,
  percentile: number,
  rollup: AdvisoryRollup | undefined,
  scenario: Scenario,
  finance: FinanceSnapshot | null,
  lens: 'operator' | 'municipal' | 'community',
): TractAction | null {
  const score = scoreFor(tract, scenario);

  if (lens === 'operator') {
    if (tract.active_outages > 0 && percentile >= 0.75) {
      return {
        icon: 'zap',
        headline: `${tract.customers_affected.toLocaleString()} customers out in a vulnerable tract`,
        action: 'Prioritize restoration. Flag life-support registry households.',
        urgency: percentile >= 0.90 ? 'critical' : 'elevated',
      };
    }
    if (finance) {
      const energyShare = (finance.annual_household_energy_cost_cad / Math.max(tract.median_income, 1)) * 100;
      if (energyShare >= finance.energy_poverty_threshold_pct) {
        return {
          icon: 'dollar-sign',
          headline: `Energy spend is ${energyShare.toFixed(1)}% of median income — above poverty threshold`,
          action: 'Include in LEAP outreach roster. Prioritize energy hardship referrals.',
          urgency: 'elevated',
        };
      }
    }
    if (tract.pct_pre1980 >= 0.50 && score > 60) {
      return {
        icon: 'activity',
        headline: `${(tract.pct_pre1980 * 100).toFixed(0)}% pre-1980 housing — infrastructure strain risk`,
        action: 'Flag for proactive load monitoring. Pre-position restoration resources.',
        urgency: 'routine',
      };
    }
  }

  if (lens === 'municipal') {
    if (tract.shelterCount === 0 && percentile >= 0.75) {
      return {
        icon: 'map-pin',
        headline: 'No cooling centre within 2.5 km — service gap',
        action: 'Activate nearest overflow facility. Consider mobile cooling deployment.',
        urgency: percentile >= 0.90 ? 'critical' : 'elevated',
      };
    }
    if (tract.pct_renters >= 0.50 && (rollup?.total ?? 0) > 0) {
      return {
        icon: 'home',
        headline: `${(tract.pct_renters * 100).toFixed(0)}% renters with active advisories — bylaw response`,
        action: 'Deploy bylaw inspection team. Distribute tenant rights guidance.',
        urgency: 'elevated',
      };
    }
    if (percentile >= 0.90) {
      return {
        icon: 'users',
        headline: `Critical vulnerability — Vulnerable Persons Registry check required`,
        action: 'Run VPR check and initiate proactive welfare contact.',
        urgency: 'critical',
      };
    }
  }

  if (lens === 'community') {
    if (tract.pct_renters >= 0.40 && (rollup?.total ?? 0) > 0) {
      return {
        icon: 'shield',
        headline: `Active tenant advisories — RTA rights outreach needed`,
        action: 'Distribute RTA Section 20 guidance. Connect tenants to housing helpline.',
        urgency: 'elevated',
      };
    }
    if (tract.pct_low_income >= 0.20 && percentile >= 0.75) {
      return {
        icon: 'users',
        headline: `High-isolation-risk profile — door-knocking priority`,
        action: 'Activate door-knocking protocol. Check in with seniors and households with young children.',
        urgency: percentile >= 0.90 ? 'critical' : 'elevated',
      };
    }
  }

  return null;
}
