import React, { useState } from 'react';
import { useApp } from '../context';
import { getTier, TIER_COLORS, scoreFor, formatIncome, formatPct, weatherLabel } from '../utils';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-b border-border">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex justify-between items-center px-4 py-2.5 hover:bg-hover transition-colors">
        <span className="text-xs font-semibold text-muted uppercase tracking-wide">{title}</span>
        <span className="text-muted text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

function Bar({ label, value, max = 1, color = '#2563EB' }: { label: string; value: number; max?: number; color?: string }) {
  const pct = Math.min(Math.max(value / max, 0), 1) * 100;
  const display = max === 1 ? `${(value * 100).toFixed(0)}%` : value.toFixed(2);
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs text-muted mb-0.5">
        <span>{label}</span>
        <span className="font-mono">{display}</span>
      </div>
      <div className="h-1.5 rounded-full bg-hover">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export default function RightPanel() {
  const { selected, scenario } = useApp();
  const [reportText, setReportText] = useState('');

  if (!selected) {
    return (
      <aside className="w-80 bg-panel border-l border-border flex flex-col items-center justify-center text-center p-6 shrink-0">
        <div className="text-4xl mb-3">🗺</div>
        <div className="text-sm font-medium text-muted mb-1">Select a neighbourhood</div>
        <div className="text-xs text-muted">Click a polygon on the map or a row in the list</div>
      </aside>
    );
  }

  const score = scoreFor(selected, scenario);
  const tier = getTier(score);
  const color = TIER_COLORS[tier];
  const energyPct = selected.median_income > 0 ? ((2400 / selected.median_income) * 100).toFixed(0) : '—';
  const cityMedian = 88000;

  return (
    <aside className="w-80 bg-panel border-l border-border flex flex-col overflow-y-auto shrink-0">
      {/* Score header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-semibold text-sm text-primary">{selected.neighbourhood}</div>
            <div className="text-xs text-muted font-mono">CT {selected.ctuid}</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold font-mono" style={{ color }}>{score.toFixed(0)}</div>
            <div className="text-xs font-medium" style={{ color }}>{tier.charAt(0).toUpperCase() + tier.slice(1)} Risk</div>
          </div>
        </div>
        <div className="mt-2 flex gap-1 flex-wrap">
          <span className="text-xs px-1.5 py-0.5 rounded border border-orange text-orange bg-card">⚡ Alectra</span>
          {selected.active_outages > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded border border-critical text-critical bg-card animate-pulse">
              {selected.active_outages} outage{selected.active_outages > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Live weather */}
      <Section title="Live Weather">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          {([
            ['Temperature', `${selected.temperature_c.toFixed(1)}°C`],
            ['Humidex', `${selected.humidex.toFixed(1)}°C`],
            ['Wind', `${selected.wind_speed_kmh.toFixed(0)} km/h`],
            ['Conditions', weatherLabel(selected.weather_code)],
          ] as [string, string][]).map(([k, v]) => (
            <div key={k}>
              <div className="text-muted">{k}</div>
              <div className="font-mono text-primary">{v}</div>
            </div>
          ))}
        </div>
        {selected.humidex >= 38 && (
          <div className="mt-2 text-xs px-2 py-1 rounded bg-card text-critical border border-critical/30">
            ⚠ Heat stress risk — humidex ≥ 38°C
          </div>
        )}
      </Section>

      {/* Vulnerability breakdown */}
      <Section title="Vulnerability Breakdown">
        <Bar label="Social Vulnerability (CISV)" value={Math.max(selected.cisv_score, 0)} max={1.2} color={color} />
        <Bar label="Renter Households" value={selected.pct_renters} color="#fb923c" />
        <Bar label="Pre-1980 Housing" value={selected.pct_pre1980} color="#f59e0b" />
        <Bar label="Low Income Share" value={selected.pct_low_income} color="#ef4444" />
        <Bar label="Resilience (CISR) ↑ better" value={Math.max(selected.cisr_score, 0)} max={2} color="#4ade80" />
      </Section>

      {/* CISV dimensions */}
      <Section title="Social Vulnerability (CISV)">
        <div className="text-xs text-muted mb-2">
          Quintile <span className="text-primary font-semibold">{selected.cisv_quintile}/5</span> nationally (5 = most vulnerable)
        </div>
        <div className="grid grid-cols-2 gap-2">
          {([
            ['Racialized & Immigration', selected.cisv_dim1],
            ['Income & Labour', selected.cisv_dim2],
            ['Education & Indigenous', selected.cisv_dim3],
            ['Dwelling Conditions', selected.cisv_dim4],
          ] as [string, number][]).map(([label, val]) => {
            const w = Math.min(Math.abs(val) / 1.5, 1) * 100;
            return (
              <div key={label} className="bg-card rounded p-2">
                <div className="text-xs text-muted leading-tight mb-1">{label}</div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-primary">{val.toFixed(2)}</span>
                  <div className="h-1.5 rounded-full bg-hover w-12 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${w}%`, background: val >= 0 ? '#fb923c' : '#4ade80' }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Income */}
      <Section title="Income & Energy Poverty">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div>
            <div className="text-muted">Median Income</div>
            <div className="font-mono text-primary">{formatIncome(selected.median_income)}</div>
          </div>
          <div>
            <div className="text-muted">vs. City ($88k)</div>
            <div className={`font-mono ${selected.median_income < cityMedian ? 'text-critical' : 'text-low'}`}>
              {selected.median_income < cityMedian ? '▼' : '▲'} {formatPct(Math.abs(selected.median_income - cityMedian) / cityMedian)}
            </div>
          </div>
          <div>
            <div className="text-muted">Est. Energy % Income</div>
            <div className={`font-mono ${Number(energyPct) > 6 ? 'text-critical' : 'text-primary'}`}>~{energyPct}%</div>
          </div>
          <div>
            <div className="text-muted">Pre-1980 Homes</div>
            <div className="font-mono text-primary">{formatPct(selected.pct_pre1980)}</div>
          </div>
        </div>
      </Section>

      {/* Shelters */}
      <Section title="Cooling & Warming Centres">
        {selected.shelterCount === 0 ? (
          <div className="text-xs text-critical flex gap-1.5 items-start">
            <span>⚠</span><span>No cooling/warming centre within 2.5 km</span>
          </div>
        ) : (
          <>
            <div className="text-xs text-muted mb-1">{selected.shelterCount} within 2.5 km</div>
            {selected.shelterList.slice(0, 3).map(name => (
              <div key={name} className="text-xs text-primary py-1 border-b border-border last:border-0">
                🏠 {name}
              </div>
            ))}
            {selected.shelterList.length > 3 && (
              <div className="text-xs text-muted mt-1">+{selected.shelterList.length - 3} more</div>
            )}
          </>
        )}
      </Section>

      {/* Community reports */}
      <Section title="Community Reports">
        <div className="text-xs text-muted mb-2">No community reports yet for this area.</div>
        <textarea
          value={reportText}
          onChange={e => setReportText(e.target.value)}
          placeholder="Report a condition in this area…"
          rows={2}
          className="w-full bg-card border border-border rounded px-2 py-1.5 text-xs text-primary resize-none focus:outline-none focus:border-accent"
        />
        <button
          onClick={() => setReportText('')}
          disabled={!reportText.trim()}
          className="mt-1 px-3 py-1 rounded text-xs bg-accent text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Submit
        </button>
      </Section>

      {/* Actions */}
      <Section title="Actions">
        {['📋 Generate outreach plan', '📑 Copy report', '🔗 Find programs'].map(a => (
          <button key={a}
            className="w-full text-xs px-3 py-2 rounded border border-border text-muted hover:bg-hover text-left mb-1 transition-colors last:mb-0">
            {a}
          </button>
        ))}
      </Section>
    </aside>
  );
}
