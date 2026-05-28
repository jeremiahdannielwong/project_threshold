import React from 'react';
import { Building2, RadioTower, HeartHandshake, List, ShieldAlert, ClipboardList, Flame, Snowflake, Sun, Cross, BedDouble, Wind } from 'lucide-react';
import { useApp } from '../context';
import type { LayerKey } from '../context';
import type { Scenario } from '../types';

const LAYERS: { key: LayerKey; icon: React.ReactNode; label: string }[] = [
  { key: 'advisories', icon: <ShieldAlert size={14} />,   label: 'Preparedness advisories' },
  { key: 'shelters',   icon: <Building2 size={14} />,     label: 'Cooling / warming centres' },
  { key: 'outages',    icon: <RadioTower size={14} />,    label: 'Active outages' },
  { key: 'services',   icon: <HeartHandshake size={14} />,label: 'Social services' },
  { key: 'hospitals',  icon: <Cross size={14} />,         label: 'Hospitals (ER)' },
  { key: 'ltc',        icon: <BedDouble size={14} />,      label: 'Long-term care homes' },
  { key: 'aqhi',       icon: <Wind size={14} />,           label: 'Air quality (AQHI)' },
];

const SCENARIOS: { value: Scenario; icon: React.ReactNode; label: string }[] = [
  { value: 'Baseline',  icon: <Sun size={14} />,       label: 'Baseline — normal conditions' },
  { value: 'Heatwave',  icon: <Flame size={14} />,     label: 'Simulate: Heatwave' },
  { value: 'Ice Storm', icon: <Snowflake size={14} />, label: 'Simulate: Ice Storm' },
];

export default function LayerRail() {
  const { layers, toggleLayer, watchlistOpen, setWatchlistOpen, activityOpen, setActivityOpen, scenario, setScenario } = useApp();

  return (
    <nav className="layer-rail" aria-label="Layer controls">

      <button
        onClick={() => { setWatchlistOpen(!watchlistOpen); if (!watchlistOpen) setActivityOpen(false); }}
        title="Watchlist"
        className={`mx-1.5 h-8 flex items-center justify-center border transition-colors duration-150 cursor-pointer
          ${watchlistOpen
            ? 'border-ink text-ink bg-surface-2'
            : 'border-transparent text-ink-3 hover:text-ink hover:border-hairline'}`}
      >
        <List size={14} />
      </button>

      <button
        onClick={() => { setActivityOpen(!activityOpen); if (!activityOpen) setWatchlistOpen(false); }}
        title="Operational ledger"
        className={`mx-1.5 h-8 flex items-center justify-center border transition-colors duration-150 cursor-pointer
          ${activityOpen
            ? 'border-ink text-ink bg-surface-2'
            : 'border-transparent text-ink-3 hover:text-ink hover:border-hairline'}`}
      >
        <ClipboardList size={14} />
      </button>

      <div className="mx-2 my-1 border-t border-hairline" />

      {LAYERS.map(({ key, icon, label }) => {
        const on = layers[key];
        return (
          <button
            key={key}
            onClick={() => toggleLayer(key)}
            title={label}
            className={`mx-1.5 h-8 flex items-center justify-center border transition-colors duration-150 cursor-pointer
              ${on
                ? 'border-ink-2 text-ink bg-surface-2'
                : 'border-transparent text-ink-4 hover:text-ink-2 hover:border-hairline'}`}
          >
            {icon}
          </button>
        );
      })}

      {/* Scenario / simulated environment switcher */}
      <div className="flex-1" />
      <div className="mx-2 mb-1 border-t border-hairline" />
      {SCENARIOS.map(({ value, icon, label }) => {
        const active = scenario === value;
        const isHeat = value === 'Heatwave';
        const isIce  = value === 'Ice Storm';
        return (
          <button
            key={value}
            onClick={() => setScenario(value)}
            title={label}
            className="mx-1.5 h-8 flex items-center justify-center border transition-colors duration-150 cursor-pointer"
            style={{
              border: active ? '1px solid' : '1px solid transparent',
              borderColor: active
                ? isHeat ? 'var(--alert-mid)' : isIce ? '#60a5fa' : 'var(--ink-2)'
                : 'transparent',
              color: active
                ? isHeat ? 'var(--alert-mid)' : isIce ? '#60a5fa' : 'var(--ink)'
                : 'var(--ink-4)',
              background: active ? 'var(--surface-2)' : 'transparent',
            }}
          >
            {icon}
          </button>
        );
      })}
    </nav>
  );
}
