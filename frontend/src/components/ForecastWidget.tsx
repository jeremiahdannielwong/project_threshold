import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useApp } from '../context';

/**
 * Forecast widget — anchored top-left of the map, below the layer rail icons.
 *
 * Shows the 24-hour stress index trajectory in a compact strip. Phase 1 is
 * deterministic; Phase 2 swaps in a trained predictive model. The UI shape
 * stays stable across that swap.
 */
export default function ForecastWidget() {
  const { forecastPoints, lens, watchlistOpen, activityOpen } = useApp();
  if (lens === 'resident') return null;
  if (forecastPoints.length === 0) return null;

  const trayOpen = watchlistOpen || activityOpen;
  // ForecastWidget is now positioned within the map container (left=0 is the map edge).
  // When a 320px tray overlays the map from the left, shift right to clear it.
  const leftOffset = trayOpen ? 320 + 12 : 12;

  const present = forecastPoints[0];
  const peak = forecastPoints.reduce(
    (max, p) => p.citywideStress > max.citywideStress ? p : max,
    present,
  );
  const delta = peak.citywideStress - present.citywideStress;
  const direction = delta > 1.5 ? 'up' : delta < -1.5 ? 'down' : 'flat';
  const directionColor =
    direction === 'up'   ? 'var(--alert-mid)'
    : direction === 'down' ? 'var(--positive)'
    : 'var(--ink-3)';

  return (
    <aside
      className="absolute z-[680] bg-surface border border-hairline"
      style={{
        top: 14,
        left: leftOffset,
        width: 220,
        transition: 'left 180ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
      aria-label="24-hour forecast"
    >
      <div className="px-3 py-2 border-b border-hairline flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.14em] text-ink-3">24h forecast</span>
        <span className="flex items-baseline gap-1 text-[10px] uppercase tracking-[0.12em]" style={{ color: directionColor }}>
          {direction === 'up' && <TrendingUp size={9} />}
          {direction === 'down' && <TrendingDown size={9} />}
          {direction === 'flat' && <Minus size={9} />}
          {delta >= 0 ? '+' : ''}{delta.toFixed(0)}
        </span>
      </div>
      <ul className="m-0 p-0 list-none px-3 py-2">
        {forecastPoints.map(p => (
          <li
            key={p.hoursAhead}
            className="flex items-baseline gap-2 py-0.5"
          >
            <span className="text-[10px] uppercase tracking-[0.12em] text-ink-3 tabular w-9">
              {p.hoursAhead === 0 ? 'now' : `+${p.hoursAhead}h`}
            </span>
            <span className="text-[13px] tabular text-ink w-8">{p.citywideStress.toFixed(0)}</span>
            <span className="text-[10px] text-ink-3 flex-1 truncate" title={p.driver}>{p.driver}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
