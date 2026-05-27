import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { useApp } from '../context';
import { TENANTS } from '../tenant';

/**
 * Cross-Jurisdiction Comparison.
 *
 * Anonymized peer-city benchmarking. v1 uses placeholder snapshots for
 * peer cities; the actual data path is a backend aggregation endpoint
 * each tenant opts into. The UI shape is stable across that swap.
 *
 * Network-effect surface: once five cities are in the comparison, the
 * sixth is forced in by board pressure.
 */

interface PeerSnapshot {
  tenantId: string;
  name: string;
  population: number;
  stressIndex: number;
  criticalTracts: number;
  affectedShare: number;       // 0..1
  coolingCentresPer100k: number;
  outageEwei: number;
  /** Source: 'live' if pulled from a connected tenant, 'snapshot' if static placeholder. */
  source: 'live' | 'snapshot';
}

// Placeholder peer snapshots. Calibrated to plausible 2024 figures.
// Production deployment swaps these for live opt-in tenant data.
const PEER_SNAPSHOTS: Record<string, Omit<PeerSnapshot, 'tenantId' | 'name' | 'population' | 'source'>> = {
  'mississauga-demo': { stressIndex: 42, criticalTracts: 6,  affectedShare: 0.12, coolingCentresPer100k: 8.6,  outageEwei: 1840 },
  'hamilton-demo':    { stressIndex: 51, criticalTracts: 11, affectedShare: 0.19, coolingCentresPer100k: 7.2,  outageEwei: 4220 },
  'surrey-demo':      { stressIndex: 47, criticalTracts: 9,  affectedShare: 0.15, coolingCentresPer100k: 6.4,  outageEwei: 2380 },
};

export default function CrossJurisdiction() {
  const {
    crossJurisdictionOpen, setCrossJurisdictionOpen,
    tenant, tracts, stress, citywideCounts, equity,
  } = useApp();

  useEffect(() => {
    if (!crossJurisdictionOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCrossJurisdictionOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [crossJurisdictionOpen, setCrossJurisdictionOpen]);

  if (!crossJurisdictionOpen) return null;

  const self: PeerSnapshot = {
    tenantId: tenant.id,
    name: tenant.name,
    population: tenant.population,
    stressIndex: stress,
    criticalTracts: citywideCounts.critical,
    affectedShare: tracts.length > 0 ? citywideCounts.tractsAffected / tracts.length : 0,
    coolingCentresPer100k:
      tracts.length > 0
        ? (tracts.reduce((s, t) => s + t.shelterCount, 0) / Math.max(tenant.population, 1)) * 100_000
        : 0,
    outageEwei: equity.weightedExposure,
    source: 'live',
  };

  const peers: PeerSnapshot[] = Object.entries(PEER_SNAPSHOTS).map(([id, snap]) => {
    const cfg = TENANTS[id];
    return {
      tenantId: id,
      name: cfg?.name ?? id,
      population: cfg?.population ?? 0,
      ...snap,
      source: 'snapshot',
    };
  });

  const all = [self, ...peers];

  /** Percentile rank of the active tenant within the peer set on a given metric. */
  const percentile = (key: keyof PeerSnapshot, higherIsWorse: boolean): { rank: number; pct: number } => {
    const vals = all.map(x => Number(x[key]) || 0);
    const myVal = Number(self[key]) || 0;
    const sorted = [...vals].sort((a, b) => higherIsWorse ? a - b : b - a);
    const rank = sorted.indexOf(myVal) + 1;
    return { rank, pct: Math.round((1 - (rank - 1) / Math.max(sorted.length - 1, 1)) * 100) };
  };

  const ranks = {
    stress: percentile('stressIndex', false),         // higher is worse, lower rank is "better"
    critical: percentile('criticalTracts', false),
    cooling: percentile('coolingCentresPer100k', true), // higher is better
    ewei: percentile('outageEwei', false),
  };

  return (
    <div
      className="fixed inset-0 z-[850] flex items-start justify-center pt-[6vh] pb-[6vh] px-4 overflow-y-auto"
      style={{ background: 'rgba(15,23,42,0.30)', backdropFilter: 'blur(3px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) setCrossJurisdictionOpen(false); }}
    >
      <article className="bg-surface border border-hairline w-full" style={{ maxWidth: 880 }}>
        <header className="px-6 py-4 border-b border-hairline flex items-baseline justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-ink-3">Cross-jurisdiction</div>
            <h1 className="text-[20px] font-medium tracking-tight mt-1">
              Peer benchmarking · {tenant.name} vs. {peers.length} comparator cities
            </h1>
          </div>
          <button
            onClick={() => setCrossJurisdictionOpen(false)}
            className="text-ink-3 hover:text-ink cursor-pointer"
          >
            <X size={16} />
          </button>
        </header>

        <div className="px-6 py-5">
          {/* Headline ranks */}
          <div className="grid grid-cols-4 gap-6 mb-6 pb-6 border-b border-hairline">
            <Stat label="Stress Index"           value={self.stressIndex.toFixed(0)} sub={`${ranks.stress.pct}th percentile`} better={ranks.stress.pct < 50} />
            <Stat label="Critical tracts"        value={String(self.criticalTracts)} sub={`${ranks.critical.pct}th percentile`} better={ranks.critical.pct < 50} />
            <Stat label="Cooling centres / 100k" value={self.coolingCentresPer100k.toFixed(1)} sub={`${ranks.cooling.pct}th percentile`} better={ranks.cooling.pct < 50} />
            <Stat label="Outage EWEI"            value={self.outageEwei.toFixed(0)} sub={`${ranks.ewei.pct}th percentile`} better={ranks.ewei.pct < 50} />
          </div>

          {/* Comparison table */}
          <h2 className="text-[11px] uppercase tracking-[0.14em] text-ink-3 mb-2">Side-by-side · current conditions</h2>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-hairline">
                <th className="text-left py-2 text-[10px] uppercase tracking-[0.14em] text-ink-3 font-normal">City</th>
                <th className="text-right py-2 text-[10px] uppercase tracking-[0.14em] text-ink-3 font-normal">Pop.</th>
                <th className="text-right py-2 text-[10px] uppercase tracking-[0.14em] text-ink-3 font-normal">Stress</th>
                <th className="text-right py-2 text-[10px] uppercase tracking-[0.14em] text-ink-3 font-normal">Crit. tracts</th>
                <th className="text-right py-2 text-[10px] uppercase tracking-[0.14em] text-ink-3 font-normal">Affected %</th>
                <th className="text-right py-2 text-[10px] uppercase tracking-[0.14em] text-ink-3 font-normal">CC / 100k</th>
                <th className="text-right py-2 text-[10px] uppercase tracking-[0.14em] text-ink-3 font-normal">EWEI</th>
                <th className="text-right py-2 text-[10px] uppercase tracking-[0.14em] text-ink-3 font-normal">Source</th>
              </tr>
            </thead>
            <tbody>
              {all.map(p => (
                <tr
                  key={p.tenantId}
                  className={`border-b border-hairline ${p.tenantId === tenant.id ? 'bg-surface-2' : ''}`}
                >
                  <td className="py-2 text-ink font-medium">{p.name}</td>
                  <td className="py-2 text-right text-ink-2 tabular">{p.population.toLocaleString()}</td>
                  <td className="py-2 text-right text-ink tabular">{p.stressIndex.toFixed(0)}</td>
                  <td className="py-2 text-right text-ink tabular">{p.criticalTracts}</td>
                  <td className="py-2 text-right text-ink-2 tabular">{(p.affectedShare * 100).toFixed(0)}%</td>
                  <td className="py-2 text-right text-ink-2 tabular">{p.coolingCentresPer100k.toFixed(1)}</td>
                  <td className="py-2 text-right text-ink-2 tabular">{p.outageEwei.toFixed(0)}</td>
                  <td className="py-2 text-right text-ink-4 text-[11px] uppercase tracking-[0.1em]">
                    {p.source === 'live' ? 'live' : 'snapshot'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="text-[11px] text-ink-4 mt-4 leading-relaxed">
            Comparator cities use representative snapshot data calibrated to 2024 figures. Live cross-tenant
            comparison activates when peer municipalities opt into the federation. All numeric values are
            tract-level aggregates with no individual or household identifiability.
          </p>
        </div>
      </article>
    </div>
  );
}

function Stat({ label, value, sub, better }: { label: string; value: string; sub: string; better: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.14em] text-ink-3">{label}</div>
      <div className="text-[28px] font-medium tabular tracking-tight text-ink mt-1 leading-none">{value}</div>
      <div className="text-[11px] tabular mt-2" style={{ color: better ? 'var(--positive)' : 'var(--alert-mid)' }}>
        {sub}
      </div>
    </div>
  );
}
