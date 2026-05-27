import React, { useMemo } from 'react';
import {
  Sun, Cloud, CloudFog, CloudRain, CloudSnow, CloudLightning, CloudDrizzle,
  CloudHail, Wind, AlertTriangle,
} from 'lucide-react';
import { useApp } from '../context';
import { weatherLabel } from '../utils';
import { SCENARIO_PROFILE } from '../scenarios';

/**
 * Weather station card — anchored top-right of the map area, below the ribbon.
 *
 * Aggregates the citywide weather across tracts (median of each field) and
 * displays it in a register similar to an operational weather station readout.
 * When a scenario is active, the card carries an advisory banner above the
 * readings and the data shown is the scenario-simulated profile.
 */

/** WMO weather code → restrained pictogram. */
function iconForCode(code: number): React.ReactNode {
  if (code === 0) return <Sun size={20} strokeWidth={1.5} />;
  if (code <= 3)  return <Cloud size={20} strokeWidth={1.5} />;
  if (code <= 48) return <CloudFog size={20} strokeWidth={1.5} />;
  if (code <= 57) return <CloudDrizzle size={20} strokeWidth={1.5} />;
  if (code <= 67) return <CloudHail size={20} strokeWidth={1.5} />;
  if (code <= 77) return <CloudSnow size={20} strokeWidth={1.5} />;
  if (code <= 82) return <CloudRain size={20} strokeWidth={1.5} />;
  return <CloudLightning size={20} strokeWidth={1.5} />;
}

/** Median of an array of numbers; 0 if empty. */
function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export default function WeatherStation() {
  const { tracts, scenario, lens } = useApp();

  const readings = useMemo(() => ({
    temperature_c: median(tracts.map(t => t.temperature_c)),
    humidex:       median(tracts.map(t => t.humidex)),
    wind:          median(tracts.map(t => t.wind_speed_kmh)),
    gusts:         median(tracts.map(t => t.wind_gusts_kmh)),
    code:          Math.round(median(tracts.map(t => t.weather_code))),
  }), [tracts]);

  // Don't render the station card inside the resident lens — the resident
  // view manages its own layout.
  if (lens === 'resident') return null;

  const profile = SCENARIO_PROFILE[scenario];
  const isCold = readings.temperature_c < 5;
  const feelsLabel = isCold ? 'Wind chill' : 'Humidex';

  return (
    <aside
      className="absolute top-4 right-4 z-[700] bg-surface border border-hairline"
      style={{ width: 220 }}
      aria-label="Weather station"
    >
      {/* Scenario advisory banner — only when not Baseline */}
      {profile && (
        <div
          className="flex items-start gap-2 px-3 py-2 border-b border-hairline"
          style={{ background: isCold ? 'rgba(63,98,18,0.04)' : 'rgba(154,52,18,0.04)' }}
        >
          <AlertTriangle
            size={11}
            className="mt-0.5 shrink-0"
            style={{ color: isCold ? 'var(--positive)' : 'var(--alert)' }}
          />
          <div>
            <div
              className="text-[10px] uppercase tracking-[0.14em] font-medium"
              style={{ color: isCold ? 'var(--positive)' : 'var(--alert)' }}
            >
              {profile.banner}
            </div>
            <div className="text-[11px] text-ink-3 leading-snug mt-0.5">
              {profile.advisory}
            </div>
          </div>
        </div>
      )}

      {/* Reading */}
      <div className="px-4 pt-3 pb-3">
        <div className="flex items-start justify-between mb-2">
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-ink-3">
              Brampton · {profile ? 'simulated' : 'live'}
            </div>
            <div className="text-[13px] text-ink-2 mt-0.5">{weatherLabel(readings.code)}</div>
          </div>
          <div className="text-ink-2 shrink-0">{iconForCode(readings.code)}</div>
        </div>

        {/* Temperature */}
        <div className="flex items-baseline gap-1 mt-1">
          <span className="text-[34px] font-medium tabular leading-none tracking-tight text-ink">
            {readings.temperature_c.toFixed(0)}
          </span>
          <span className="text-[14px] text-ink-3 tabular leading-none">°C</span>
        </div>

        {/* Feels-like */}
        <div className="text-[11px] text-ink-3 mt-1.5 tabular">
          {feelsLabel}{' '}
          <span className="text-ink-2">
            {readings.humidex.toFixed(0)}°C
          </span>
        </div>

        {/* Wind */}
        <div className="text-[11px] text-ink-3 mt-1 flex items-center gap-1.5 tabular">
          <Wind size={10} className="text-ink-4" />
          <span>
            <span className="text-ink-2">{readings.wind.toFixed(0)}</span> km/h
            {readings.gusts > readings.wind + 5 && (
              <> · gusts <span className="text-ink-2">{readings.gusts.toFixed(0)}</span></>
            )}
          </span>
        </div>
      </div>
    </aside>
  );
}
