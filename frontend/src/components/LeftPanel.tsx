import React, { useMemo, useState } from 'react';
import { X, Search } from 'lucide-react';
import { useApp } from '../context';
import type { AdvisoryRollup } from '../context';
import { scoreFor, rampColor, rampLabel } from '../utils';

type LevelFilter = 'All' | 'Baseline' | 'Elevated' | 'Moderate' | 'High' | 'Critical' | 'Severe';

const LEVEL_MIN_P: Record<LevelFilter, number> = {
  All:      0,
  Baseline: 0,
  Elevated: 0.25,
  Moderate: 0.50,
  High:     0.75,
  Critical: 0.90,
  Severe:   0.97,
};

const LEVEL_COLOR: Record<LevelFilter, string> = {
  All:      'var(--ink-3)',
  Baseline: '#52A873',
  Elevated: '#8DB84A',
  Moderate: '#C8A83C',
  High:     '#C07840',
  Critical: '#BF4040',
  Severe:   '#8C2020',
};

export default function LeftPanel() {
  const {
    tracts, selected, setSelected, scenario,
    percentiles, watchlistOpen, setWatchlistOpen,
    rollupByTract,
  } = useApp();

  const [q,     setQ]     = useState('');
  const [level, setLevel] = useState<LevelFilter>('All');

  const rows = useMemo(() => {
    const minP = LEVEL_MIN_P[level];
    const mapped = tracts.map(t => ({
      t,
      score:  scoreFor(t, scenario),
      p:      percentiles.get(t.ctuid) ?? 0,
      rollup: rollupByTract.get(t.ctuid),
    }));
    const filtered = mapped.filter(({ t, p }) => {
      if (q && !t.neighbourhood.toLowerCase().includes(q.toLowerCase())) return false;
      if (level === 'Baseline') return p <= 0.25;
      return p >= minP;
    });
    filtered.sort((a, b) => {
      const ac = a.rollup?.byUrgency.critical ?? 0;
      const bc = b.rollup?.byUrgency.critical ?? 0;
      if (ac !== bc) return bc - ac;
      const ae = a.rollup?.byUrgency.elevated ?? 0;
      const be = b.rollup?.byUrgency.elevated ?? 0;
      if (ae !== be) return be - ae;
      return b.p - a.p;
    });
    return filtered;
  }, [tracts, scenario, percentiles, rollupByTract, q, level]);

  return (
    <aside className={`watchlist-tray${watchlistOpen ? '' : ' panel-closed'}`}>

      {/* ── Wordmark ────────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-2.5 border-b border-hairline flex-shrink-0 flex items-baseline gap-2">
        <span className="text-[14px] font-medium tracking-tight" style={{ color: 'var(--ink)' }}>Threshold</span>
        <span className="text-[10px] uppercase tracking-[0.13em]" style={{ color: 'var(--ink-3)' }}>Brampton · Operational</span>
      </div>

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-2.5 border-b border-hairline flex-shrink-0">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-[11px] uppercase tracking-[0.14em] font-medium" style={{ color: 'var(--ink-3)' }}>
            Watchlist
          </h2>
          <button
            onClick={() => setWatchlistOpen(false)}
            className="transition-colors cursor-pointer"
            style={{ color: 'var(--ink-3)', background: 'none', border: 'none', padding: 0, lineHeight: 1 }}
            aria-label="Close watchlist"
          >
            <X size={14} />
          </button>
        </div>
        <div className="text-[12px]" style={{ color: 'var(--ink-2)' }}>
          <span style={{ color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{rows.length}</span> tracts
          {level !== 'All' && (
            <> · <span style={{ color: LEVEL_COLOR[level] }}>{level}</span>{level !== 'Baseline' ? ' & above' : ''}</>
          )}
        </div>
      </div>

      {/* ── Level filter tabs ───────────────────────────────── */}
      <div className="px-3 py-2 border-b border-hairline flex-shrink-0 flex flex-wrap gap-1">
        {(['All', 'Baseline', 'Elevated', 'Moderate', 'High', 'Critical', 'Severe'] as LevelFilter[]).map(lv => {
          const active = level === lv;
          const col = LEVEL_COLOR[lv];
          return (
            <button
              key={lv}
              onClick={() => setLevel(lv)}
              className="text-[10px] uppercase tracking-[0.08em] px-2 py-0.5 cursor-pointer transition-colors"
              style={{
                borderRadius: 3,
                background: active ? `${col}18` : 'transparent',
                color: active ? col : 'var(--ink-4)',
                border: `0.5px solid ${active ? col : 'var(--hairline)'}`,
                fontWeight: active ? 600 : 400,
              }}
            >
              {lv}
            </button>
          );
        })}
      </div>

      {/* ── Search ─────────────────────────────────────────── */}
      <div className="px-4 py-2 border-b border-hairline flex items-center gap-2 flex-shrink-0">
        <Search size={12} style={{ color: 'var(--ink-4)', flexShrink: 0 }} />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Filter by neighbourhood…"
          className="flex-1 bg-transparent text-[12px] focus:outline-none"
          style={{ color: 'var(--ink)' }}
        />
      </div>

      {/* ── Tract list ─────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="px-4 py-6 text-[12px]" style={{ color: 'var(--ink-3)' }}>
            No tracts match the current filter.
          </div>
        ) : (
          rows.map(({ t, score, p, rollup }) => {
            const isSel = selected?.ctuid === t.ctuid;
            const color = rampColor(p);
            const label = rampLabel(p);
            return (
              <button
                key={t.ctuid}
                onClick={() => setSelected(isSel ? null : t)}
                className="w-full text-left px-4 py-3 border-b border-hairline transition-colors duration-150 cursor-pointer"
                style={{ background: isSel ? `${color}10` : undefined }}
              >
                <div className="flex items-center gap-3">
                  {/* Urgency bar */}
                  <span
                    className="shrink-0 rounded-full"
                    style={{ width: 3, height: 36, background: color }}
                    aria-hidden
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className="text-[13px] font-medium truncate"
                        style={{ color: isSel ? color : 'var(--ink)' }}
                      >
                        {t.neighbourhood}
                      </span>
                      <span
                        className="text-[15px] tabular shrink-0 font-medium"
                        style={{ color, fontVariantNumeric: 'tabular-nums' }}
                      >
                        {score.toFixed(0)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className="text-[10px] uppercase tracking-[0.1em] px-1.5 py-0.5"
                        style={{ color, background: `${color}14`, borderRadius: 3 }}
                      >
                        {label}
                      </span>
                      {t.active_outages > 0 && (
                        <span className="text-[10px]" style={{ color: 'var(--alert)' }}>
                          {t.customers_affected.toLocaleString()} without power
                        </span>
                      )}
                    </div>
                    {rollup && rollup.total > 0 && (
                      <div className="flex items-center gap-2 mt-1 text-[10px] tabular">
                        {rollup.byUrgency.critical > 0 && (
                          <span style={{ color: 'var(--alert-deep)' }}>{rollup.byUrgency.critical} critical</span>
                        )}
                        {rollup.byUrgency.elevated > 0 && (
                          <span style={{ color: 'var(--alert-mid)' }}>{rollup.byUrgency.elevated} elevated</span>
                        )}
                        {rollup.byUrgency.routine > 0 && (
                          <span style={{ color: 'var(--ink-3)' }}>{rollup.byUrgency.routine} routine</span>
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
    </aside>
  );
}
