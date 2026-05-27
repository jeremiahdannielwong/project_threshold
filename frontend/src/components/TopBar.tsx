import React from 'react';
import { useApp, isStale, LENS_LABEL } from '../context';
import { Briefcase, Building2, Users, User, Command, ChevronDown, Clock } from 'lucide-react';
import type { Lens } from '../context';

const LENS_ICON: Record<Lens, React.ReactNode> = {
  operator:  <Briefcase size={11} />,
  municipal: <Building2 size={11} />,
  community: <Users size={11} />,
  resident:  <User size={11} />,
};

/* Operator lens shows a richer label */
const LENS_DISPLAY: Record<Lens, string> = {
  operator:  'Utility · Alectra',
  municipal: 'Municipal',
  community: 'Community',
  resident:  'Resident',
};

function elapsedSeconds(d: Date | null): string {
  if (!d) return '—';
  return `${Math.round((Date.now() - d.getTime()) / 1000)}s ago`;
}

/**
 * Ribbon — 36px operational strip.
 *
 * Left:   Wordmark · Live data indicator · Weather sync
 * Centre: ⌘K · Lens · Scenario
 * Right:  Advisories · Stress Index
 */
export default function TopBar() {
  const {
    scenario, cycleScenario, stress, tracts, feeds, citywideCounts,
    lens, cycleLens, setPaletteOpen,
  } = useApp();

  const baseline = tracts.length
    ? tracts.reduce((s, t) => s + t.threshold_score_baseline * t.population, 0) /
      (tracts.reduce((s, t) => s + t.population, 0) || 1)
    : 0;
  const delta = stress - baseline;
  const deltaStr = (delta >= 0 ? '+' : '') + delta.toFixed(0);

  const { critical, elevated } = citywideCounts;
  const totalActive = critical + elevated;

  const anyStale = isStale(feeds.weather) || isStale(feeds.outages) || isStale(feeds.finance);
  const anyError = !!(feeds.weather.error || feeds.outages.error || feeds.finance.error);
  const pipColor = anyError ? 'var(--alert)' : anyStale ? 'var(--warning)' : 'var(--positive)';
  const liveLabel = anyError ? 'Feed error' : anyStale ? 'Feed stale' : 'Live data active';

  return (
    <header className="ribbon">

      {/* Left: wordmark + live status indicators */}
      <div className="flex items-center gap-4">
        <div className="flex items-baseline gap-2.5">
          <span className="text-[15px] font-medium tracking-tight text-ink">Threshold</span>
          <span className="text-[11px] uppercase tracking-[0.12em] text-ink-3">Brampton · Operational</span>
        </div>

        {/* Live pip + label */}
        <div className="flex items-center gap-1.5">
          <span
            style={{ width: 5, height: 5, background: pipColor, borderRadius: '50%', flexShrink: 0 }}
            title={liveLabel}
            aria-hidden
          />
          <span className="text-[10px] text-ink-3">{liveLabel}</span>
        </div>

        {/* Weather sync elapsed */}
        <div className="flex items-center gap-1 text-[10px] text-ink-3">
          <Clock size={9} />
          <span>Weather sync · {elapsedSeconds(feeds.weather.lastSuccess)}</span>
        </div>
      </div>

      {/* Centre: ⌘K · Lens · Scenario */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setPaletteOpen(true)}
          title="Command palette · ⌘K"
          className="group flex items-center gap-1.5 px-2 h-7 border border-hairline hover:border-ink-3 transition-colors duration-150 cursor-pointer"
        >
          <Command size={11} className="text-ink-3 group-hover:text-ink-2" />
          <span className="text-[11px] tracking-tight text-ink-3 group-hover:text-ink-2">⌘K</span>
        </button>

        <button
          onClick={cycleLens}
          title="Cycle stakeholder lens"
          className="group flex items-center gap-1.5 px-3 h-7 border border-hairline hover:border-ink-3 transition-colors duration-150 cursor-pointer"
        >
          <span className="text-ink-3 group-hover:text-ink-2">{LENS_ICON[lens]}</span>
          <span className="text-[10px] uppercase tracking-[0.14em] text-ink-3 group-hover:text-ink-2">Lens</span>
          <span className="text-[12px] tracking-tight text-ink font-medium">{LENS_DISPLAY[lens]}</span>
          <ChevronDown size={10} className="text-ink-3 group-hover:text-ink-2" />
        </button>

        <button
          onClick={cycleScenario}
          title="Cycle scenario"
          className="group flex items-center gap-1.5 px-3 h-7 border border-hairline hover:border-ink-3 transition-colors duration-150 cursor-pointer"
        >
          <span className="text-[10px] uppercase tracking-[0.14em] text-ink-3 group-hover:text-ink-2">Scenario</span>
          <span className="text-[12px] tracking-tight text-ink font-medium">{scenario}</span>
          <ChevronDown size={10} className="text-ink-3 group-hover:text-ink-2" />
        </button>
      </div>

      {/* Right: advisories + stress index */}
      <div className="flex items-baseline gap-5">
        <div
          className="flex items-baseline gap-2"
          title={`${totalActive} active advisories city-wide`}
        >
          <span className="text-[10px] uppercase tracking-[0.14em] text-ink-3">Advisories</span>
          {totalActive > 0 ? (
            <span className="text-[13px] tabular leading-none" style={{ color: 'var(--alert)' }}>
              {totalActive} active
            </span>
          ) : (
            <span className="text-[11px] text-ink-4">none active</span>
          )}
        </div>

        <span className="h-3 w-px bg-hairline" aria-hidden />

        <div className="flex items-baseline gap-3">
          <span className="text-[10px] uppercase tracking-[0.14em] text-ink-3">Stress Index</span>
          <span className="text-[16px] font-medium tabular text-ink leading-none">{stress.toFixed(0)}</span>
          <span
            className="text-[11px] tabular leading-none"
            style={{ color: delta > 5 ? 'var(--alert)' : delta < -2 ? 'var(--positive)' : 'var(--ink-3)' }}
          >
            {deltaStr}
          </span>
        </div>
      </div>
    </header>
  );
}
