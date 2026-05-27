import React from 'react';
import { Building2, RadioTower, Zap, Train, HeartHandshake, List, ShieldAlert, ClipboardList } from 'lucide-react';
import { useApp } from '../context';
import type { LayerKey } from '../context';

const LAYERS: { key: LayerKey; icon: React.ReactNode; label: string }[] = [
  { key: 'advisories', icon: <ShieldAlert size={14} />,   label: 'Preparedness advisories' },
  { key: 'shelters',   icon: <Building2 size={14} />,     label: 'Cooling / warming centres' },
  { key: 'outages',    icon: <RadioTower size={14} />,    label: 'Active outages' },
  { key: 'hydro',      icon: <Zap size={14} />,           label: 'Hydro transmission' },
  { key: 'transit',    icon: <Train size={14} />,         label: 'Transit lines' },
  { key: 'services',   icon: <HeartHandshake size={14} />,label: 'Social services' },
];

export default function LayerRail() {
  const { layers, toggleLayer, watchlistOpen, setWatchlistOpen, activityOpen, setActivityOpen } = useApp();

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
    </nav>
  );
}
