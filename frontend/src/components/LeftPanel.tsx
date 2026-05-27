import React, { useMemo, useState } from 'react';
import { X, Search, Download } from 'lucide-react';
import { useApp } from '../context';
import type { AdvisoryRollup } from '../context';
import { scoreFor, rampColor, rampLabel } from '../utils';
import { PATTERN_LABEL, type CityPattern } from '../cityAnalysis';
import { buildLeapRoster, buildDrTargetingRoster, downloadFile, toCsv } from '../exporters';
import RestorationQueue from './RestorationQueue';

type Mode = 'tracts' | 'advisories' | 'restoration' | 'outreach';
type SortKey = 'score' | 'advisories';

const MODE_LABEL: Record<Mode, string> = {
  tracts:       'tracts',
  advisories:   'advisories',
  restoration:  'restoration',
  outreach:     'outreach',
};

/**
 * Watchlist tray — left-edge, ~320px.
 *
 * Two modes:
 *   1. Tracts — ranked list of tracts (sort by score or by advisory load)
 *   2. Advisories — city-wide patterns + per-tract advisory roster
 */
export default function LeftPanel() {
  const {
    tracts, selected, setSelected, scenario,
    percentiles, watchlistOpen, setWatchlistOpen,
    cityPatterns, rollupByTract, citywideCounts,
    finance, lens, logAudit, restoration,
  } = useApp();

  const [mode, setMode] = useState<Mode>('tracts');
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<'all' | 'elevated' | 'critical'>('elevated');
  const [sortBy, setSortBy] = useState<SortKey>('score');

  // Reset mode if the current lens no longer offers it.
  React.useEffect(() => {
    if (mode === 'restoration' && lens !== 'operator' && lens !== 'municipal') {
      setMode('tracts');
    }
  }, [lens, mode]);

  const sortedTracts = useMemo(() => {
    const rows = tracts.map(t => ({
      t,
      score: scoreFor(t, scenario),
      p: percentiles.get(t.ctuid) ?? 0,
      rollup: rollupByTract.get(t.ctuid),
    }));
    const filtered = rows.filter(({ t, p }) => {
      if (q && !t.neighbourhood.toLowerCase().includes(q.toLowerCase())) return false;
      if (scope === 'elevated') return p >= 0.75;
      if (scope === 'critical') return p >= 0.90;
      return true;
    });
    if (sortBy === 'advisories') {
      filtered.sort((a, b) => {
        const ac = a.rollup?.byUrgency.critical ?? 0;
        const bc = b.rollup?.byUrgency.critical ?? 0;
        if (ac !== bc) return bc - ac;
        const ae = a.rollup?.byUrgency.elevated ?? 0;
        const be = b.rollup?.byUrgency.elevated ?? 0;
        if (ae !== be) return be - ae;
        return (b.rollup?.total ?? 0) - (a.rollup?.total ?? 0);
      });
    } else {
      filtered.sort((a, b) => b.score - a.score);
    }
    return filtered;
  }, [tracts, scenario, percentiles, rollupByTract, q, scope, sortBy]);

  const tractsWithAdvisories = useMemo(() => {
    return tracts
      .map(t => ({ t, rollup: rollupByTract.get(t.ctuid) }))
      .filter(r => r.rollup && r.rollup.total > 0)
      .sort((a, b) => {
        const ac = a.rollup!.byUrgency.critical;
        const bc = b.rollup!.byUrgency.critical;
        if (ac !== bc) return bc - ac;
        const ae = a.rollup!.byUrgency.elevated;
        const be = b.rollup!.byUrgency.elevated;
        if (ae !== be) return be - ae;
        return b.rollup!.total - a.rollup!.total;
      });
  }, [tracts, rollupByTract]);

  if (!watchlistOpen) return null;

  return (
    <aside
      className="watchlist-tray"
      style={{
        top: 10,
        left: 56,
        bottom: 10,
        borderRadius: 8,
        border: '0.5px solid var(--hairline)',
        boxShadow: '0 4px 24px rgba(15,23,42,0.10)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div className="px-4 pt-3 pb-2 border-b border-hairline">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[11px] uppercase tracking-[0.14em] text-ink-3 font-medium">Watchlist</h2>
          <button
            onClick={() => setWatchlistOpen(false)}
            className="text-ink-3 hover:text-ink transition-colors cursor-pointer"
            aria-label="Close watchlist"
          >
            <X size={14} />
          </button>
        </div>
        {mode === 'tracts' ? (
          <div className="text-[13px] text-ink-2 mt-1 leading-snug">
            {sortedTracts.length} tract{sortedTracts.length === 1 ? '' : 's'} above threshold under <span className="text-ink">{scenario}</span>.
          </div>
        ) : (
          <div className="text-[13px] text-ink-2 mt-1 leading-snug">
            <span className="text-ink">{citywideCounts.critical}</span> critical · <span className="text-ink">{citywideCounts.elevated}</span> elevated advisories across <span className="text-ink">{citywideCounts.tractsAffected}</span> tracts.
          </div>
        )}
      </div>

      {/* Mode switch — restoration only shown in operator/municipal lens */}
      <div className="px-4 py-2 border-b border-hairline flex gap-3 overflow-x-auto">
        {(['tracts', 'advisories', 'restoration', 'outreach'] as const)
          .filter(m => {
            if (m === 'restoration') return lens === 'operator' || lens === 'municipal';
            return true;
          })
          .map(m => {
            const restorationBadge = m === 'restoration' && restoration.length > 0
              ? <span className="ml-1 tabular text-[10px]" style={{ color: 'var(--alert-deep)' }}>{restoration.length}</span>
              : null;
            return (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`whitespace-nowrap text-[12px] uppercase tracking-[0.1em] transition-colors cursor-pointer pb-1
                  ${mode === m ? 'text-ink border-b border-ink' : 'text-ink-3 hover:text-ink-2'}`}
              >
                {MODE_LABEL[m]}{restorationBadge}
              </button>
            );
          })}
      </div>

      {mode === 'tracts' ? (
        <TractsMode
          rows={sortedTracts}
          selected={selected}
          setSelected={setSelected}
          q={q}
          setQ={setQ}
          scope={scope}
          setScope={setScope}
          sortBy={sortBy}
          setSortBy={setSortBy}
        />
      ) : mode === 'advisories' ? (
        <AdvisoriesMode
          patterns={cityPatterns}
          tractsWithAdvisories={tractsWithAdvisories}
          selected={selected}
          setSelected={setSelected}
        />
      ) : mode === 'restoration' ? (
        <RestorationQueue />
      ) : (
        <OutreachMode
          tracts={tracts}
          finance={finance}
          setSelected={setSelected}
          logAudit={logAudit}
        />
      )}
    </aside>
  );
}

/* ─── Tracts mode ──────────────────────────────────────────── */

function TractsMode({
  rows, selected, setSelected, q, setQ, scope, setScope, sortBy, setSortBy,
}: {
  rows: { t: any; score: number; p: number; rollup?: AdvisoryRollup }[];
  selected: any;
  setSelected: (t: any) => void;
  q: string;
  setQ: (v: string) => void;
  scope: 'all' | 'elevated' | 'critical';
  setScope: (s: 'all' | 'elevated' | 'critical') => void;
  sortBy: SortKey;
  setSortBy: (s: SortKey) => void;
}) {
  return (
    <>
      {/* Scope */}
      <div className="px-4 py-2 border-b border-hairline flex gap-1">
        {(['critical', 'elevated', 'all'] as const).map(s => (
          <button
            key={s}
            onClick={() => setScope(s)}
            className={`px-2 h-6 text-[11px] uppercase tracking-[0.1em] transition-colors cursor-pointer
              ${scope === s ? 'text-ink border-b border-ink' : 'text-ink-3 hover:text-ink-2'}`}
          >
            {s}
          </button>
        ))}
        <span className="ml-auto flex gap-1">
          {(['score', 'advisories'] as const).map(k => (
            <button
              key={k}
              onClick={() => setSortBy(k)}
              className={`px-2 h-6 text-[10px] uppercase tracking-[0.1em] transition-colors cursor-pointer
                ${sortBy === k ? 'text-ink border-b border-ink' : 'text-ink-3 hover:text-ink-2'}`}
              title={k === 'advisories' ? 'Sort by advisory urgency' : 'Sort by score'}
            >
              by {k}
            </button>
          ))}
        </span>
      </div>

      {/* Search */}
      <div className="px-4 py-2 border-b border-hairline flex items-center gap-2">
        <Search size={12} className="text-ink-4" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Filter by neighbourhood…"
          className="flex-1 bg-transparent text-[13px] text-ink placeholder:text-ink-4 focus:outline-none"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="px-4 py-6 text-[12px] text-ink-3">No tracts match.</div>
        ) : (
          rows.map(({ t, score, p, rollup }) => {
            const isSel = selected?.ctuid === t.ctuid;
            const color = rampColor(p);
            const label = rampLabel(p);
            return (
              <button
                key={t.ctuid}
                onClick={() => setSelected(isSel ? null : t)}
                className={`w-full text-left px-4 py-2.5 border-b border-hairline transition-colors duration-150 cursor-pointer
                  ${isSel ? 'bg-surface-2' : 'hover:bg-surface-2/60'}`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-1 h-10 shrink-0" style={{ background: color }} aria-hidden />
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] text-ink truncate">{t.neighbourhood}</div>
                    <div className="text-[11px] text-ink-3 mt-0.5 flex items-center gap-2">
                      <span className="tabular">{score.toFixed(0)}</span>
                      <span className="text-ink-4">·</span>
                      <span>{label}</span>
                      {t.active_outages > 0 && (
                        <>
                          <span className="text-ink-4">·</span>
                          <span style={{ color: 'var(--alert)' }}>
                            {t.customers_affected.toLocaleString()} without power
                          </span>
                        </>
                      )}
                    </div>
                    {rollup && rollup.total > 0 && (
                      <div className="text-[10px] text-ink-3 mt-1 flex items-center gap-2 tabular">
                        {rollup.byUrgency.critical > 0 && (
                          <span style={{ color: 'var(--alert-deep)' }}>
                            {rollup.byUrgency.critical} critical
                          </span>
                        )}
                        {rollup.byUrgency.elevated > 0 && (
                          <span style={{ color: 'var(--alert-mid)' }}>
                            {rollup.byUrgency.elevated} elevated
                          </span>
                        )}
                        {rollup.byUrgency.routine > 0 && (
                          <span className="text-ink-3">
                            {rollup.byUrgency.routine} routine
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </>
  );
}

/* ─── Advisories mode ────────────────────────────────────── */

const URGENCY_COLOR: Record<'routine' | 'elevated' | 'critical', string> = {
  routine:  'var(--ink-3)',
  elevated: 'var(--alert-mid)',
  critical: 'var(--alert-deep)',
};

function AdvisoriesMode({
  patterns, tractsWithAdvisories, selected, setSelected,
}: {
  patterns: CityPattern[];
  tractsWithAdvisories: { t: any; rollup?: AdvisoryRollup }[];
  selected: any;
  setSelected: (t: any) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto">
      {/* City-wide patterns */}
      <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-[0.14em] text-ink-3">
        City patterns · {patterns.length}
      </div>
      {patterns.length === 0 ? (
        <div className="px-4 py-3 text-[12px] text-ink-3 leading-relaxed">
          No city-wide spatial patterns currently above threshold.
        </div>
      ) : (
        patterns.map(p => (
          <article key={p.id} className="px-4 py-3 border-b border-hairline">
            <div className="flex items-baseline gap-2 mb-1">
              <span
                className="inline-block w-[2px] h-4 mt-1"
                style={{ background: URGENCY_COLOR[p.urgency] }}
                aria-hidden
              />
              <div className="flex-1">
                <div className="text-[10px] uppercase tracking-[0.12em] text-ink-3">
                  {PATTERN_LABEL[p.kind]}
                </div>
                <h3 className="text-[14px] text-ink mt-0.5 leading-snug">{p.headline}</h3>
              </div>
            </div>
            <p className="text-[12px] text-ink-3 leading-relaxed mt-1">{p.detail}</p>

            {p.metric && (
              <div className="text-[11px] tabular text-ink-2 mt-2">
                <span className="text-ink-4">{p.metric.label} </span>{p.metric.value}
              </div>
            )}

            <div className="mt-2 flex flex-wrap gap-1">
              {p.members.slice(0, 6).map(m => (
                <button
                  key={m.ctuid}
                  onClick={() => setSelected(m)}
                  className="text-[10px] tabular text-ink-2 hover:text-ink border border-hairline hover:border-ink-3 px-1.5 py-0.5 transition-colors cursor-pointer"
                  title={m.neighbourhood}
                >
                  {m.neighbourhood.length > 18 ? m.neighbourhood.slice(0, 16) + '…' : m.neighbourhood}
                </button>
              ))}
              {p.members.length > 6 && (
                <span className="text-[10px] text-ink-4 px-1.5 py-0.5">
                  +{p.members.length - 6} more
                </span>
              )}
            </div>
          </article>
        ))
      )}

      {/* Per-tract roster header (kept) */}
      <div className="px-4 pt-4 pb-1 text-[10px] uppercase tracking-[0.14em] text-ink-3 border-t border-hairline">
        Per-tract roster · {tractsWithAdvisories.length}
      </div>
      {tractsWithAdvisories.length === 0 ? (
        <div className="px-4 py-3 text-[12px] text-ink-3">
          No tracts currently carry active advisories.
        </div>
      ) : (
        tractsWithAdvisories.map(({ t, rollup }) => {
          const r = rollup!;
          const urg = r.maxUrgency ?? 'routine';
          const isSel = selected?.ctuid === t.ctuid;
          return (
            <button
              key={t.ctuid}
              onClick={() => setSelected(isSel ? null : t)}
              className={`w-full text-left px-4 py-2.5 border-b border-hairline transition-colors cursor-pointer
                ${isSel ? 'bg-surface-2' : 'hover:bg-surface-2/60'}`}
            >
              <div className="flex items-baseline gap-3">
                <span className="w-1 h-10 shrink-0" style={{ background: URGENCY_COLOR[urg] }} aria-hidden />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-ink truncate">{t.neighbourhood}</div>
                  <div className="text-[10px] text-ink-3 mt-0.5 flex flex-wrap gap-2 tabular">
                    {r.byUrgency.critical > 0 && (
                      <span style={{ color: 'var(--alert-deep)' }}>{r.byUrgency.critical} critical</span>
                    )}
                    {r.byUrgency.elevated > 0 && (
                      <span style={{ color: 'var(--alert-mid)' }}>{r.byUrgency.elevated} elevated</span>
                    )}
                    {r.byUrgency.routine > 0 && (
                      <span>{r.byUrgency.routine} routine</span>
                    )}
                    {r.operatorActions > 0 && (
                      <>
                        <span className="text-ink-4">·</span>
                        <span className="text-ink-3">{r.operatorActions} operator action{r.operatorActions === 1 ? '' : 's'}</span>
                      </>
                    )}
                  </div>
                  {r.topHeadline && (
                    <div className="text-[11px] text-ink-2 mt-1 leading-snug line-clamp-2">
                      {r.topHeadline}
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}

/* ─── Outreach mode — LEAP + DR targeting rosters ─────────── */

function OutreachMode({
  tracts, finance, setSelected, logAudit,
}: {
  tracts: import('../types').Tract[];
  finance: import('../liveData').FinanceSnapshot | null;
  setSelected: (t: import('../types').Tract | null) => void;
  logAudit: (e: { action: 'export.roster'; targetLabel: string; note?: string }) => void;
}) {
  const leap = useMemo(
    () => finance
      ? buildLeapRoster(tracts, finance.annual_household_energy_cost_cad, finance.energy_poverty_threshold_pct)
      : [],
    [tracts, finance],
  );
  const dr = useMemo(() => buildDrTargetingRoster(tracts), [tracts]);

  const exportLeap = () => {
    downloadFile(
      `leap-outreach-roster-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(leap),
    );
    logAudit({ action: 'export.roster', targetLabel: 'LEAP outreach roster CSV', note: `${leap.length} tracts` });
  };

  const exportDr = () => {
    downloadFile(
      `dr-targeting-roster-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(dr),
    );
    logAudit({ action: 'export.roster', targetLabel: 'DR/CDM targeting roster CSV', note: `${dr.length} tracts` });
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {/* LEAP — hardship-program outreach */}
      <div className="px-4 pt-3 pb-2 border-b border-hairline">
        <div className="flex items-baseline justify-between">
          <div className="text-[10px] uppercase tracking-[0.14em] text-ink-3">
            LEAP outreach · {leap.length}
          </div>
          <button
            onClick={exportLeap}
            disabled={leap.length === 0}
            className="flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] text-ink-3 hover:text-ink disabled:opacity-40 cursor-pointer disabled:cursor-default transition-colors"
          >
            <Download size={10} />CSV
          </button>
        </div>
        <div className="text-[12px] text-ink-2 mt-1 leading-snug">
          Tracts above the {finance?.energy_poverty_threshold_pct ?? 6}% energy-poverty threshold at current OEB rates.
        </div>
      </div>
      {!finance ? (
        <div className="px-4 py-3 text-[12px] text-ink-3">Finance feed unavailable.</div>
      ) : leap.length === 0 ? (
        <div className="px-4 py-3 text-[12px] text-ink-3">No tracts currently cross the energy-poverty threshold.</div>
      ) : (
        leap.slice(0, 12).map(row => {
          const tract = tracts.find(t => t.ctuid === row.ctuid);
          return (
            <button
              key={row.ctuid}
              onClick={() => tract && setSelected(tract)}
              className="w-full text-left px-4 py-2 border-b border-hairline hover:bg-surface-2/60 transition-colors cursor-pointer"
            >
              <div className="text-[13px] text-ink truncate">{row.neighbourhood}</div>
              <div className="text-[10px] text-ink-3 mt-0.5 tabular flex flex-wrap gap-x-2">
                <span>{row.estimated_energy_share_of_income_pct}% energy share</span>
                <span className="text-ink-4">·</span>
                <span>{row.pct_low_income_share} low-income</span>
                <span className="text-ink-4">·</span>
                <span>{row.population.toLocaleString()} pop</span>
              </div>
            </button>
          );
        })
      )}

      {/* DR / CDM targeting */}
      <div className="px-4 pt-3 pb-2 border-b border-hairline border-t mt-2">
        <div className="flex items-baseline justify-between">
          <div className="text-[10px] uppercase tracking-[0.14em] text-ink-3">
            DR / CDM targeting · {dr.length}
          </div>
          <button
            onClick={exportDr}
            disabled={dr.length === 0}
            className="flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] text-ink-3 hover:text-ink disabled:opacity-40 cursor-pointer disabled:cursor-default transition-colors"
          >
            <Download size={10} />CSV
          </button>
        </div>
        <div className="text-[12px] text-ink-2 mt-1 leading-snug">
          Renter-dense tracts where demand-response enrollment closes both a load and an equity gap.
        </div>
      </div>
      {dr.length === 0 ? (
        <div className="px-4 py-3 text-[12px] text-ink-3">No qualifying tracts under current criteria.</div>
      ) : (
        dr.slice(0, 12).map(row => {
          const tract = tracts.find(t => t.ctuid === row.ctuid);
          return (
            <button
              key={row.ctuid}
              onClick={() => tract && setSelected(tract)}
              className="w-full text-left px-4 py-2 border-b border-hairline hover:bg-surface-2/60 transition-colors cursor-pointer"
            >
              <div className="text-[13px] text-ink truncate">{row.neighbourhood}</div>
              <div className="text-[10px] text-ink-3 mt-0.5 tabular flex flex-wrap gap-x-2">
                <span>{row.pct_renters} renter</span>
                <span className="text-ink-4">·</span>
                <span>{row.pct_pre1980} pre-1980</span>
                <span className="text-ink-4">·</span>
                <span>~{row.estimated_enrollment_population.toLocaleString()} reachable</span>
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}
