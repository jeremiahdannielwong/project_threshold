import React, { useMemo, useState } from 'react';
import {
  X, Printer, MessageSquare,
  Shield, Users, Home, TrendingDown, TrendingUp, DollarSign,
  Thermometer, Droplets, Wind, Snowflake, Flame, MapPin,
  ChevronRight, Wrench, Zap, AlertTriangle, Activity, Layers, Minus,
  Sparkles, Loader2,
} from 'lucide-react';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import { tractPriorityAction, buildIntelligence, type IntelIconKey, type TractAction, type IntelLens, type IntelItem } from '../intelligence';
import { useApp, isStale, LENS_AUDIENCES } from '../context';
import {
  scoreFor, rampColor, rampLabel,
  formatIncome, formatPct, formatPop,
  narrative,
} from '../utils';
import {
  advisoriesFor, partitionByAudience, preparednessPosture,
  AUDIENCE_LABEL, URGENCY_COLOR, URGENCY_LABEL,
  type Advisory, type AdvisoryAudience,
} from '../advisories';
import { printIncidentBrief } from '../exporters';
import type { ForecastPoint } from '../forecast';
import type { Annotation } from '../auditLog';
import type { FinanceSnapshot } from '../liveData';
import type { Scenario, Tract } from '../types';

/**
 * Left sidebar — tract detail panel.
 *
 * Renders as a 420px flex child when a tract is selected;
 * returns null otherwise (the map fills the vacated space).
 *
 * Header background and badge colors follow the vulnerability tier.
 * No absolute positioning — this is a proper flex sidebar.
 */

/* ─── Header theme ──────────────────────────────────────────── */
interface HeaderTheme {
  bg: string;
  fg: string;
  fg2: string;
  scoreBg: string;
  dot: string;
}

const HEADER_THEMES: Record<string, HeaderTheme> = {
  'Baseline': { bg: 'rgba(82,168,115,0.12)',  fg: '#0F172A', fg2: '#71717A', scoreBg: 'rgba(82,168,115,0.18)',  dot: '#52A873' },
  'Elevated': { bg: 'rgba(141,184,74,0.12)',  fg: '#0F172A', fg2: '#71717A', scoreBg: 'rgba(141,184,74,0.18)',  dot: '#8DB84A' },
  'Moderate': { bg: 'rgba(200,168,60,0.12)',  fg: '#0F172A', fg2: '#71717A', scoreBg: 'rgba(200,168,60,0.18)',  dot: '#C8A83C' },
  'High':     { bg: 'rgba(192,120,64,0.12)',  fg: '#0F172A', fg2: '#71717A', scoreBg: 'rgba(192,120,64,0.18)',  dot: '#C07840' },
  'Critical': { bg: 'rgba(191,64,64,0.12)',   fg: '#0F172A', fg2: '#71717A', scoreBg: 'rgba(191,64,64,0.18)',   dot: '#BF4040' },
  'Severe':   { bg: 'rgba(140,32,32,0.12)',   fg: '#0F172A', fg2: '#71717A', scoreBg: 'rgba(140,32,32,0.18)',   dot: '#8C2020' },
};
function getTheme(label: string): HeaderTheme {
  return HEADER_THEMES[label] ?? HEADER_THEMES['Baseline'];
}

/* ─── Contributing factor row with leading icon + bar ───────── */
function FactorRow({
  icon,
  label,
  value,
  pct,
  barColor,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  pct: number;        // 0–100
  barColor: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-2 py-2.5 border-b border-hairline last:border-0">
      <span className="w-4 shrink-0 flex justify-center" style={{ color: 'var(--ink-4)' }}>{icon}</span>
      <span className="text-[12px] text-ink-2 flex-1 min-w-0 truncate">{label}</span>
      <div className="w-20 shrink-0 h-[3px] rounded-full overflow-hidden mx-2" style={{ background: 'var(--hairline)' }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: barColor }} />
      </div>
      <div className="text-right shrink-0">
        <div className="text-[13px] tabular text-ink">{value}</div>
        {hint && <div className="text-[10px] text-ink-4 mt-0.5">{hint}</div>}
      </div>
    </div>
  );
}

/* ─── 4-tile horizontal condition grid ──────────────────────── */
function CondTile({
  icon,
  label,
  value,
  sub,
  stale,
  muted,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  stale?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className="flex-1 flex flex-col p-2.5 border-r border-hairline last:border-0"
      style={{ background: 'var(--surface-2)', minWidth: 0 }}
    >
      <span className="mb-1" style={{ color: 'var(--ink-3)' }}>{icon}</span>
      <div className="text-[9px] uppercase tracking-[0.12em] mb-1" style={{ color: 'var(--ink-3)' }}>
        {label}
        {stale && <span className="ml-1" style={{ color: 'var(--warning)' }}>·</span>}
      </div>
      <div
        className="text-[16px] font-medium tabular leading-none"
        style={{ color: muted ? 'var(--ink-4)' : 'var(--ink)' }}
      >
        {value}
      </div>
      {sub && <div className="text-[9px] mt-1 leading-tight" style={{ color: 'var(--ink-4)' }}>{sub}</div>}
    </div>
  );
}

/* ─── Compact advisory item ─────────────────────────────────── */
function CompactAdvisory({ a }: { a: Advisory }) {
  const urgColor = URGENCY_COLOR[a.urgency];
  return (
    <li className="flex items-center gap-2 py-2 border-b border-hairline last:border-0 hover:bg-surface-2/40 transition-colors cursor-pointer">
      <span
        className="w-[2px] self-stretch shrink-0 rounded-full"
        style={{ background: urgColor }}
        aria-hidden
      />
      <span className="text-[12px] text-ink leading-snug flex-1 min-w-0">{a.headline}</span>
      <span
        className="text-[9px] uppercase tracking-[0.12em] shrink-0 px-1.5 py-0.5"
        style={{ color: urgColor, background: `${urgColor}18`, borderRadius: 3 }}
      >
        {URGENCY_LABEL[a.urgency]}
      </span>
      <ChevronRight size={10} className="shrink-0" style={{ color: 'var(--ink-4)' }} />
    </li>
  );
}

/* ─── Audience block ─────────────────────────────────────────── */
const AUDIENCE_ICON: Record<AdvisoryAudience, React.ReactNode> = {
  community: <Users size={11} />,
  resident:  <Home size={11} />,
  operator:  <Wrench size={11} />,
};

function AudienceBlock({ audience, items }: { audience: AdvisoryAudience; items: Advisory[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-center gap-1.5 mb-1" style={{ color: 'var(--ink-3)' }}>
        {AUDIENCE_ICON[audience]}
        <span className="text-[10px] uppercase tracking-[0.14em]">
          {AUDIENCE_LABEL[audience]} · {items.length}
        </span>
      </div>
      <ol className="m-0 p-0 list-none">
        {items.map(a => <CompactAdvisory key={a.id} a={a} />)}
      </ol>
    </div>
  );
}

/* ─── Intel icon map ─────────────────────────────────────────── */
const INTEL_ICON: Record<IntelIconKey, React.ReactNode> = {
  'zap':            <Zap size={13} />,
  'users':          <Users size={13} />,
  'home':           <Home size={13} />,
  'thermometer':    <Thermometer size={13} />,
  'shield':         <Shield size={13} />,
  'trending-up':    <TrendingUp size={13} />,
  'alert-triangle': <AlertTriangle size={13} />,
  'map-pin':        <MapPin size={13} />,
  'dollar-sign':    <DollarSign size={13} />,
  'activity':       <Activity size={13} />,
  'layers':         <Layers size={13} />,
};

const URGENCY_BG: Record<TractAction['urgency'], string> = {
  critical: 'rgba(154,52,18,0.06)',
  elevated: 'rgba(184,108,63,0.06)',
  routine:  'rgba(15,23,42,0.03)',
};
const URGENCY_BORDER: Record<TractAction['urgency'], string> = {
  critical: 'var(--alert)',
  elevated: 'var(--warning)',
  routine:  'var(--ink-4)',
};

function PriorityActionStrip({ tractAction }: { tractAction: TractAction }) {
  const borderColor = URGENCY_BORDER[tractAction.urgency];
  const bg = URGENCY_BG[tractAction.urgency];
  return (
    <section
      className="px-4 py-3 border-b border-hairline"
      style={{ background: bg }}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <span style={{ color: borderColor }}>{INTEL_ICON[tractAction.icon]}</span>
        <span
          className="text-[10px] uppercase tracking-[0.14em]"
          style={{ color: borderColor }}
        >
          Priority action
        </span>
        <span
          className="ml-auto text-[9px] uppercase tracking-[0.12em] px-1.5 py-0.5"
          style={{
            color: borderColor,
            background: `${borderColor === 'var(--alert)' ? 'rgba(154,52,18,0.10)' : borderColor === 'var(--warning)' ? 'rgba(184,108,63,0.10)' : 'rgba(15,23,42,0.05)'}`,
            borderRadius: 3,
          }}
        >
          {tractAction.urgency}
        </span>
      </div>
      <p className="text-[12px] text-ink leading-snug mb-2">{tractAction.headline}</p>
      <div
        className="text-[11px] leading-relaxed px-2.5 py-2"
        style={{
          borderLeft: `2px solid ${borderColor}`,
          color: 'var(--ink-2)',
          background: 'var(--surface)',
          borderRadius: '0 4px 4px 0',
        }}
      >
        {tractAction.action}
      </div>
    </section>
  );
}

/* ─── Print-only comprehensive report ───────────────────────── */
function PrintReport({
  selected, scenario, advisories, recommendations, tractAction,
  forecastPoints, annotation, finance, energyPctIncome, energyPoor,
  score, label, color,
}: {
  selected: Tract;
  scenario: Scenario;
  advisories: Advisory[];
  recommendations: IntelItem[];
  tractAction: TractAction | null;
  forecastPoints: ForecastPoint[];
  annotation?: Annotation;
  finance: FinanceSnapshot | null;
  energyPctIncome: number | null;
  energyPoor: boolean;
  score: number;
  label: string;
  color: string;
}) {
  const sectionTitle: React.CSSProperties = {
    fontSize: '7.5pt', fontWeight: 700, letterSpacing: '0.18em',
    textTransform: 'uppercase', color: '#71717A',
    borderBottom: '0.5pt solid #E8E4D8', paddingBottom: '4pt', marginBottom: '8pt',
    marginTop: '14pt',
  };
  const row: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
    padding: '3pt 0', borderBottom: '0.5pt solid #F1EDE4', fontSize: '10pt',
    gap: '8pt',
  };
  const rowLbl: React.CSSProperties = { color: '#64748B', flex: 1, minWidth: 0 };
  const rowVal: React.CSSProperties = { fontVariantNumeric: 'tabular-nums', color: '#0F172A', fontWeight: 500, flexShrink: 0 };
  const hint: React.CSSProperties = { fontSize: '8pt', color: '#94A3B8', marginLeft: '6pt' };

  const Tr = ({ label: l, value: v, sub, alert }: { label: string; value: string; sub?: string; alert?: boolean }) => (
    <div style={row}>
      <span style={rowLbl}>{l}{sub ? <span style={hint}>{sub}</span> : null}</span>
      <span style={{ ...rowVal, color: alert ? '#9A3412' : rowVal.color }}>{v}</span>
    </div>
  );

  return (
    <div className="print-only" style={{ fontFamily: 'system-ui, -apple-system, sans-serif', color: '#0F172A', padding: '0' }}>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8pt', marginTop: '10pt' }}>
        {[
          { lbl: 'Population', val: selected.population.toLocaleString('en-CA'), clr: '#0F172A' },
          { lbl: 'Risk tier', val: label, clr: color },
          { lbl: 'Active scenario', val: scenario, clr: '#0F172A' },
          { lbl: 'Risk level', val: selected.risk_level, clr: '#0F172A' },
        ].map(c => (
          <div key={c.lbl} style={{ border: '0.5pt solid #E8E4D8', borderRadius: '4pt', padding: '7pt 9pt' }}>
            <div style={{ fontSize: '7pt', textTransform: 'uppercase', letterSpacing: '0.14em', color: '#94A3B8', marginBottom: '3pt' }}>{c.lbl}</div>
            <div style={{ fontSize: '13pt', fontWeight: 600, color: c.clr }}>{c.val}</div>
          </div>
        ))}
      </div>

      {/* Demographics */}
      <div style={sectionTitle}>Demographics &amp; Social Profile</div>
      <Tr label="Population" value={selected.population.toLocaleString('en-CA')} />
      <Tr label="Median income" value={formatIncome(selected.median_income)} sub="vs. city median $88,000" />
      <Tr label="Low-income share" value={formatPct(selected.pct_low_income)} />
      <Tr label="Renter households" value={formatPct(selected.pct_renters)} />
      <Tr label="Pre-1980 housing" value={formatPct(selected.pct_pre1980)} />

      {/* Vulnerability + Resilience — two columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18pt' }}>
        <div>
          <div style={sectionTitle}>Vulnerability Index (CISV · StatsCan 2021)</div>
          <Tr label="Overall score" value={selected.cisv_score.toFixed(3)} />
          <Tr label="Quintile" value={`${selected.cisv_quintile}/5`} sub="5 = most vulnerable" />
          <Tr label="Dim 1 · Material deprivation" value={selected.cisv_dim1.toFixed(3)} />
          <Tr label="Dim 2 · Social deprivation" value={selected.cisv_dim2.toFixed(3)} />
          <Tr label="Dim 3 · Health deprivation" value={selected.cisv_dim3.toFixed(3)} />
          <Tr label="Dim 4 · Residential instability" value={selected.cisv_dim4.toFixed(3)} />
        </div>
        <div>
          <div style={sectionTitle}>Resilience Index (CISR · StatsCan)</div>
          <div style={row}>
            <span style={rowLbl}>Score</span>
            <span style={{ ...rowVal, color: selected.cisr_score >= 0 ? '#166534' : '#9A3412' }}>
              {selected.cisr_score > 0 ? '+' : ''}{selected.cisr_score.toFixed(3)}
            </span>
          </div>
          <Tr label="Quintile" value={`${selected.cisr_quintile}/5`} sub="5 = most resilient" />
        </div>
      </div>

      {/* Current conditions */}
      <div style={sectionTitle}>Current Conditions (Live · Open-Meteo)</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6pt', marginBottom: '6pt' }}>
        {([
          ['Temperature', `${selected.temperature_c.toFixed(1)}°C`],
          ['Humidex', `${selected.humidex.toFixed(0)}°C`],
          ['Precipitation', `${selected.precipitation_mm.toFixed(1)} mm`],
          ['Wind speed', `${selected.wind_speed_kmh.toFixed(0)} km/h`],
          ['Wind gusts', `${selected.wind_gusts_kmh.toFixed(0)} km/h`],
          ['Active outages', selected.active_outages > 0 ? String(selected.active_outages) : 'None'],
        ] as [string, string][]).map(([lbl, val]) => (
          <div key={lbl} style={{ border: '0.5pt solid #E8E4D8', borderRadius: '3pt', padding: '6pt 8pt' }}>
            <div style={{ fontSize: '7pt', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '2pt' }}>{lbl}</div>
            <div style={{ fontSize: '12pt', fontWeight: 500 }}>{val}</div>
          </div>
        ))}
      </div>
      {selected.active_outages > 0 && (
        <div style={{ padding: '5pt 9pt', background: 'rgba(154,52,18,0.06)', borderRadius: '3pt', fontSize: '10pt', marginBottom: '2pt' }}>
          <span style={{ color: '#9A3412', fontWeight: 500 }}>{selected.active_outages} outage{selected.active_outages > 1 ? 's' : ''} active · </span>
          <span style={{ color: '#64748B' }}>{selected.customers_affected.toLocaleString('en-CA')} customers affected</span>
        </div>
      )}

      {/* Cooling centres & shelters */}
      <div style={sectionTitle}>Cooling Centres &amp; Shelters ({selected.shelterCount} within 2.5 km)</div>
      {selected.shelterList.length === 0 ? (
        <p style={{ fontSize: '10pt', color: '#9A3412', margin: 0 }}>No designated centres within 2.5 km of this tract.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4pt' }}>
          {selected.shelterList.map((nm, i) => (
            <div key={i} style={{ fontSize: '10pt', padding: '4pt 8pt', border: '0.5pt solid #E8E4D8', borderRadius: '3pt', color: '#0F172A' }}>
              {nm}
            </div>
          ))}
        </div>
      )}

      {/* Active advisories */}
      {advisories.length > 0 && (<>
        <div style={sectionTitle}>Active Advisories ({advisories.length})</div>
        {advisories.map(a => (
          <div key={a.id} style={{ borderBottom: '0.5pt solid #E8E4D8', padding: '7pt 0' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8pt', marginBottom: '3pt' }}>
              <span style={{
                fontSize: '7pt', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
                padding: '1pt 5pt', borderRadius: '2pt',
                color: a.urgency === 'critical' ? '#9A3412' : a.urgency === 'elevated' ? '#92400E' : '#374151',
                background: a.urgency === 'critical' ? 'rgba(154,52,18,0.1)' : a.urgency === 'elevated' ? 'rgba(146,64,14,0.1)' : 'rgba(55,65,81,0.07)',
              }}>{a.urgency}</span>
              <span style={{ fontSize: '11pt', fontWeight: 500 }}>{a.headline}</span>
            </div>
            <p style={{ fontSize: '9.5pt', color: '#475569', margin: '0 0 4pt', lineHeight: 1.5 }}>{a.detail}</p>
            {a.triggers.length > 0 && (
              <div style={{ display: 'flex', gap: '10pt', flexWrap: 'wrap' }}>
                {a.triggers.map((trig, i) => (
                  <span key={i} style={{ fontSize: '8.5pt', color: '#64748B' }}>
                    {trig.label}: <span style={{ color: '#334155', fontWeight: 500 }}>{trig.value}</span>
                    {trig.source ? ` · ${trig.source}` : ''}
                  </span>
                ))}
              </div>
            )}
            {a.timeframe && (
              <div style={{ fontSize: '8pt', color: '#94A3B8', marginTop: '3pt' }}>Timeframe: {a.timeframe}</div>
            )}
          </div>
        ))}
      </>)}

      {/* Priority action */}
      {tractAction && (<>
        <div style={sectionTitle}>Priority Action</div>
        <p style={{ fontSize: '11pt', fontWeight: 500, margin: '0 0 4pt' }}>{tractAction.headline}</p>
        <p style={{ fontSize: '10pt', color: '#475569', margin: 0 }}>{tractAction.action}</p>
      </>)}

      {/* Intelligence recommendations */}
      {recommendations.length > 0 && (<>
        <div style={sectionTitle}>Intelligence Recommendations</div>
        {recommendations.map(item => (
          <div key={item.id} style={{ borderBottom: '0.5pt solid #E8E4D8', padding: '6pt 0' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8pt', marginBottom: '2pt' }}>
              <span style={{
                fontSize: '7pt', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
                color: item.urgency === 'critical' ? '#9A3412' : item.urgency === 'elevated' ? '#92400E' : '#374151',
              }}>{item.category}</span>
              <span style={{ fontSize: '10pt' }}>{item.headline}</span>
            </div>
            {item.metric && (
              <div style={{ fontSize: '8.5pt', color: '#64748B', paddingLeft: '4pt' }}>
                {item.metric.label}: {item.metric.value}
              </div>
            )}
          </div>
        ))}
      </>)}

      {/* Energy-cost exposure */}
      {finance && (<>
        <div style={sectionTitle}>Energy-Cost Exposure (OEB · Bank of Canada)</div>
        <Tr label="Blended electricity rate" value={`${finance.blended_residential_cents_per_kwh.toFixed(1)}¢/kWh`} />
        <Tr label="Typical annual cost" value={`$${finance.annual_household_energy_cost_cad.toLocaleString()}`} sub={`${finance.typical_household_kwh_per_year.toLocaleString()} kWh/yr`} />
        {energyPctIncome != null && (
          <Tr
            label="Energy share of income"
            value={`${energyPctIncome.toFixed(1)}%`}
            sub={energyPoor ? `above ${finance.energy_poverty_threshold_pct.toFixed(0)}% threshold` : `below ${finance.energy_poverty_threshold_pct.toFixed(0)}% threshold`}
            alert={energyPoor}
          />
        )}
        <Tr label="CPI year-over-year" value={`${finance.cpi_yoy_pct.toFixed(1)}%`} sub={`Bank of Canada · ${finance.cpi_vintage}`} />
      </>)}

      {/* 24h forecast */}
      {forecastPoints.length > 0 && (<>
        <div style={sectionTitle}>24-Hour Stress Forecast</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6pt' }}>
          {forecastPoints.map(pt => (
            <div key={pt.hoursAhead} style={{ border: '0.5pt solid #E8E4D8', borderRadius: '3pt', padding: '6pt 8pt', textAlign: 'center' }}>
              <div style={{ fontSize: '8pt', color: '#94A3B8', marginBottom: '2pt' }}>
                {pt.hoursAhead === 0 ? 'Now' : `+${pt.hoursAhead}h`}
              </div>
              <div style={{ fontSize: '14pt', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {pt.citywideStress.toFixed(0)}
              </div>
              <div style={{ fontSize: '7.5pt', color: '#64748B', marginTop: '2pt' }}>{pt.driver}</div>
            </div>
          ))}
        </div>
      </>)}

      {/* Operator note */}
      {annotation && (<>
        <div style={sectionTitle}>Operator Note</div>
        <p style={{ fontSize: '11pt', color: '#334155', whiteSpace: 'pre-wrap', margin: '0 0 4pt', lineHeight: 1.6 }}>{annotation.note}</p>
        <p style={{ fontSize: '8pt', color: '#94A3B8', margin: 0 }}>
          Recorded: {new Date(annotation.ts).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}
        </p>
      </>)}

      {/* Sources */}
      <div style={{ borderTop: '0.5pt solid #E8E4D8', paddingTop: '8pt', marginTop: '14pt', fontSize: '7.5pt', color: '#94A3B8', lineHeight: 1.7 }}>
        Sources: Statistics Canada Census 2021 · StatsCan CISV · StatsCan CISR · Alectra live outage feed · Open-Meteo · Ontario Energy Board · Bank of Canada · City of Brampton facilities registry · Ontario Residential Tenancies Act. Intelligence is rule-derived; no language model is invoked.
      </div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────── */
export default function RightPanel() {
  const {
    selected: _selected, scenario, percentiles, setSelected, finance, feeds,
    lens, annotations, setAnnotation, removeAnnotation, logAudit,
    pinned, togglePin, rollupByTract, forecastPoints, tracts,
    briefing, briefingLoading, briefingError,
  } = useApp();

  // Keep the last non-null tract so we can render during the exit animation
  const lastTractRef = React.useRef<typeof _selected>(null);
  if (_selected) lastTractRef.current = _selected;
  const isOpen = !!_selected;

  const advisories = useMemo(
    () => _selected ? advisoriesFor(_selected, scenario, finance) : [],
    [_selected, scenario, finance],
  );
  const byAudience = useMemo(() => partitionByAudience(advisories), [advisories]);
  const audienceOrder = LENS_AUDIENCES[lens];

  const annotation = _selected ? annotations[_selected.ctuid] : undefined;
  const [draftNote, setDraftNote] = useState<string>('');
  const [editingNote, setEditingNote] = useState<boolean>(false);

  React.useEffect(() => {
    setDraftNote(annotation?.note ?? '');
    setEditingNote(false);
  }, [_selected?.ctuid, annotation?.ts]);

  // Lens-specific priority action for this tract
  // Must be before the early return to satisfy Rules of Hooks
  const tractAction = useMemo(() => {
    if (!_selected || lens === 'resident') return null;
    const pct = percentiles.get(_selected.ctuid) ?? 0;
    return tractPriorityAction(
      _selected,
      pct,
      rollupByTract.get(_selected.ctuid),
      scenario,
      finance,
      lens as 'operator' | 'municipal' | 'community',
    );
  }, [_selected, lens, percentiles, rollupByTract, scenario, finance]);

  // Neighbourhood-specific intelligence recommendations
  const recommendations = useMemo(() => {
    if (!_selected || lens === 'resident') return [];
    const all = buildIntelligence(tracts, percentiles, rollupByTract, scenario, finance, forecastPoints);
    const lensFiltered = all.filter(i => i.lens.includes(lens as IntelLens));
    const name = _selected.neighbourhood;
    const tractItems = lensFiltered.filter(i => i.affectedTracts?.includes(name));
    return (tractItems.length > 0 ? tractItems : lensFiltered).slice(0, 3);
  }, [_selected, lens, tracts, percentiles, rollupByTract, scenario, finance, forecastPoints]);

  // Use last known tract for rendering during exit animation; return null only on cold start
  const selected = _selected ?? lastTractRef.current;
  if (!selected) return null;

  // 24h forecast computations
  const forecastPresent = forecastPoints[0] ?? null;
  const forecastPeak = forecastPoints.length > 0
    ? forecastPoints.reduce((max, pt) => pt.citywideStress > max.citywideStress ? pt : max, forecastPoints[0])
    : null;
  const forecastDelta = forecastPeak && forecastPresent
    ? forecastPeak.citywideStress - forecastPresent.citywideStress
    : 0;
  const forecastDir = forecastDelta > 1.5 ? 'up' : forecastDelta < -1.5 ? 'down' : 'flat';
  const forecastDirColor =
    forecastDir === 'up'   ? 'var(--alert-mid)'
    : forecastDir === 'down' ? 'var(--positive)'
    : 'var(--ink-3)';

  const score   = scoreFor(selected, scenario);
  const p       = percentiles.get(selected.ctuid) ?? 0;
  const label   = rampLabel(p);
  const color   = rampColor(p);
  const theme   = getTheme(label);
  const story   = narrative(selected, scenario, p);
  const posture = preparednessPosture(advisories);
  const isPinned = pinned.includes(selected.ctuid);

  const energyAnnualCost = finance?.annual_household_energy_cost_cad ?? null;
  const energyPctIncome =
    energyAnnualCost != null && selected.median_income > 0
      ? (energyAnnualCost / selected.median_income) * 100
      : null;
  const energyPoor =
    energyPctIncome != null &&
    finance?.energy_poverty_threshold_pct != null &&
    energyPctIncome >= finance.energy_poverty_threshold_pct;

  const weatherStale = isStale(feeds.weather);
  const outagesStale = isStale(feeds.outages);
  const barColor = color;

  /* Cooling icon varies by scenario */
  const coolingIcon =
    scenario === 'Heatwave'  ? <Snowflake size={14} /> :
    scenario === 'Ice Storm' ? <Flame size={14} /> :
    <MapPin size={14} />;

  return (
    <aside
      className={`dispatch-card${isOpen ? '' : ' panel-closed'}`}
      data-print-stamp={new Date().toLocaleString('en-CA')}
    >

      {/* ── Colored header ──────────────────────────────────── */}
      <header style={{ background: theme.bg, padding: '14px 16px 16px', flexShrink: 0, borderBottom: '0.5px solid var(--hairline)' }}>

        {/* Row 1: bullet · name · [actions] · score */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
          <span
            style={{ width: 6, height: 6, background: theme.dot, borderRadius: 1, flexShrink: 0, marginTop: 6 }}
            aria-hidden
          />
          <h2
            style={{
              fontSize: 17, fontWeight: 600, color: '#0F172A',
              letterSpacing: '-0.01em', lineHeight: 1.2,
              flex: 1, margin: 0, minWidth: 0,
            }}
          >
            {selected.neighbourhood}
          </h2>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            <button
              onClick={() => togglePin(selected.ctuid)}
              title={isPinned ? 'Unpin' : 'Pin tract'}
              style={{ color: isPinned ? theme.dot : 'var(--ink-3)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 1 }}
            >
              {isPinned ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}
            </button>
            <button
              onClick={() => {
                logAudit({ action: 'export.brief', targetLabel: selected.neighbourhood, ctuid: selected.ctuid });
                printIncidentBrief();
              }}
              title="Print incident brief"
              style={{ color: 'var(--ink-3)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 1 }}
            >
              <Printer size={13} />
            </button>
            <button
              onClick={() => setSelected(null)}
              style={{ color: 'var(--ink-3)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 1 }}
              aria-label="Close"
            >
              <X size={13} />
            </button>
          </div>

          {/* Score — uses accent colour */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 26, fontWeight: 500, color: theme.dot, lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
              {score.toFixed(0)}
            </div>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--ink-4)', marginTop: 3 }}>
              Score
            </div>
          </div>
        </div>

        {/* Row 2: CT number · tier badge */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>
            CT {selected.ctuid}
          </span>
          <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: theme.dot, background: theme.scoreBg, padding: '4px 10px', borderRadius: 12 }}>
            {label}
          </span>
        </div>

        {/* Narrative */}
        <p style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.65, margin: 0 }}>
          {story}
        </p>
      </header>

      {/* ── Scroll body ─────────────────────────────────────── */}
      <div className="overflow-y-auto flex-1 print:hidden">

        {/* 24h Forecast */}
        {forecastPoints.length > 0 && (
          <section className="px-4 py-3 border-b border-hairline">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--ink-3)' }}>
                24h forecast
              </span>
              <span className="flex items-center gap-1 text-[10px] uppercase tracking-[0.12em]" style={{ color: forecastDirColor }}>
                {forecastDir === 'up'   && <TrendingUp size={9} />}
                {forecastDir === 'down' && <TrendingDown size={9} />}
                {forecastDir === 'flat' && <Minus size={9} />}
                {forecastDelta >= 0 ? '+' : ''}{forecastDelta.toFixed(0)}
              </span>
            </div>
            <ul className="m-0 p-0 list-none">
              {forecastPoints.map(pt => (
                <li key={pt.hoursAhead} className="flex items-baseline gap-2 py-1.5 border-b border-hairline last:border-0">
                  <span className="text-[10px] uppercase tracking-[0.12em] tabular w-9" style={{ color: 'var(--ink-3)' }}>
                    {pt.hoursAhead === 0 ? 'now' : `+${pt.hoursAhead}h`}
                  </span>
                  <span className="text-[13px] tabular w-8" style={{ color: 'var(--ink)' }}>
                    {pt.citywideStress.toFixed(0)}
                  </span>
                  <span className="text-[10px] flex-1 truncate" style={{ color: 'var(--ink-3)' }} title={pt.driver}>
                    {pt.driver}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Lens-specific priority action strip */}
        {tractAction && <PriorityActionStrip tractAction={tractAction} />}

        {/* AI-powered Preparedness Intelligence + Recommendations */}
        <section className="px-4 py-3 border-b border-hairline">
          {(() => {
            const matchesSelection =
              briefing &&
              briefing.ctuid === selected.ctuid &&
              briefing.scenario === scenario;
            const showFirstLoad = briefingLoading && !briefing;
            const showStaleBadge = briefing && !matchesSelection && briefingLoading;
            return (
              <>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-1.5">
                    <Sparkles size={12} style={{ color: briefing?.used_llm ? 'var(--positive)' : 'var(--ink-3)' }} />
                    <span className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--ink-3)' }}>
                      AI Intelligence
                    </span>
                    {briefingLoading && briefing && (
                      <Loader2 size={11} className="animate-spin" style={{ color: 'var(--ink-4)' }} />
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {showStaleBadge && (
                      <span
                        className="text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5"
                        style={{ borderRadius: 3, color: 'var(--warning)', background: 'rgba(202,138,4,0.10)' }}
                      >
                        Showing last
                      </span>
                    )}
                    {briefing?.used_llm && (
                      <span
                        className="text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5"
                        style={{ borderRadius: 3, color: 'var(--positive)', background: 'rgba(63,98,18,0.08)' }}
                      >
                        Gemini · live
                      </span>
                    )}
                    {briefing && !briefing.used_llm && (
                      <span
                        className="text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5"
                        style={{ borderRadius: 3, color: 'var(--ink-3)', background: 'var(--surface-2)' }}
                      >
                        Fallback
                      </span>
                    )}
                  </div>
                </div>

                {showFirstLoad && (
                  <div className="flex items-center gap-2 py-2" style={{ color: 'var(--ink-3)' }}>
                    <Loader2 size={12} className="animate-spin" />
                    <span className="text-[11px]">Generating briefing…</span>
                  </div>
                )}

                {briefingError && !briefing && (
                  <p className="text-[11px]" style={{ color: 'var(--alert)' }}>
                    Briefing unavailable — check backend connection.
                  </p>
                )}

                {briefingError && briefing && (
                  <p className="text-[10px] mb-2" style={{ color: 'var(--warning)' }}>
                    Refresh failed — showing last successful briefing.
                  </p>
                )}
              </>
            );
          })()}

          {briefing && (() => {
            // Detect probability band + actor from text
            const out = briefing.outlook.toLowerCase();
            const band: 'low' | 'moderate' | 'high' | 'very high' =
              out.startsWith('very high') ? 'very high'
              : out.startsWith('high') ? 'high'
              : out.startsWith('moderate') ? 'moderate'
              : 'low';
            const bandColor =
              band === 'very high' ? 'var(--alert)'
              : band === 'high' ? 'var(--alert-mid)'
              : band === 'moderate' ? 'var(--warning)'
              : 'var(--positive)';
            const bandBg =
              band === 'very high' ? 'rgba(154,52,18,0.08)'
              : band === 'high' ? 'rgba(194,65,12,0.08)'
              : band === 'moderate' ? 'rgba(202,138,4,0.08)'
              : 'rgba(63,98,18,0.06)';

            const actionRaw = briefing.recommended_action.trim();
            const actorMatch = actionRaw.match(/^\[(City|Alectra|Both|Hold)\]/i);
            const actor = (actorMatch?.[1] ?? 'Both') as 'City' | 'Alectra' | 'Both' | 'Hold';
            const actorBody = actionRaw.replace(/^\[(City|Alectra|Both|Hold)\]\s*/i, '');
            const actorTheme: Record<typeof actor, { fg: string; bg: string; bar: string; label: string }> = {
              City:    { fg: '#3F6212', bg: 'rgba(82,168,115,0.07)',  bar: '#52A873', label: 'City of Brampton' },
              Alectra: { fg: '#9A3412', bg: 'rgba(192,120,64,0.07)',  bar: '#C07840', label: 'Alectra Utilities' },
              Both:    { fg: '#1E3A8A', bg: 'rgba(59,130,246,0.07)',  bar: '#3B82F6', label: 'City + Alectra' },
              Hold:    { fg: 'var(--ink-3)', bg: 'var(--surface-2)',  bar: 'var(--ink-4)', label: 'Hold · no action' },
            };
            const at = actorTheme[actor];

            const confBand =
              /high/i.test(briefing.confidence) ? 'high'
              : /medium/i.test(briefing.confidence) ? 'medium'
              : 'low';
            const confColor =
              confBand === 'high' ? 'var(--positive)'
              : confBand === 'medium' ? 'var(--warning)'
              : 'var(--alert-mid)';

            return (
              <div className="flex flex-col gap-2.5">
                {/* Probability headline */}
                <div className="px-3 py-2.5" style={{ background: bandBg, borderLeft: `2px solid ${bandColor}`, borderRadius: '0 4px 4px 0' }}>
                  <div className="text-[9px] uppercase tracking-[0.14em] mb-1" style={{ color: bandColor }}>
                    Probability · next 12–24h
                  </div>
                  <p className="text-[12px] leading-relaxed m-0" style={{ color: 'var(--ink)' }}>
                    {briefing.outlook}
                  </p>
                </div>

                {/* Drivers */}
                {briefing.drivers && (
                  <div>
                    <div className="text-[9px] uppercase tracking-[0.14em] mb-1" style={{ color: 'var(--ink-4)' }}>
                      Why · drivers
                    </div>
                    <p className="text-[12px] leading-relaxed m-0" style={{ color: 'var(--ink-2)' }}>
                      {briefing.drivers}
                    </p>
                  </div>
                )}

                {/* Single recommended action */}
                {briefing.recommended_action && (
                  <div className="px-3 py-2.5" style={{ background: at.bg, borderLeft: `2px solid ${at.bar}`, borderRadius: '0 4px 4px 0' }}>
                    <div className="text-[9px] uppercase tracking-[0.14em] mb-1" style={{ color: at.fg }}>
                      Recommended · {at.label}
                    </div>
                    <p className="text-[12px] font-medium leading-snug m-0" style={{ color: 'var(--ink)' }}>
                      {actorBody || actionRaw}
                    </p>
                  </div>
                )}

                {/* Confidence */}
                {briefing.confidence && (
                  <div className="flex items-start gap-2">
                    <span
                      className="text-[9px] uppercase tracking-[0.14em] shrink-0 mt-0.5 px-1.5 py-0.5"
                      style={{ color: confColor, background: `${confColor}14`, borderRadius: 3 }}
                    >
                      {confBand}
                    </span>
                    <p className="text-[11px] leading-snug m-0" style={{ color: 'var(--ink-2)' }}>
                      {briefing.confidence}
                    </p>
                  </div>
                )}

                {/* Tripwire */}
                {briefing.watch && (
                  <div className="px-3 py-2" style={{ background: 'var(--surface-2)', borderRadius: 4 }}>
                    <p className="text-[11px] leading-snug m-0" style={{ color: 'var(--ink-2)' }}>
                      {briefing.watch}
                    </p>
                  </div>
                )}

                {/* Potential solutions — ranked menu */}
                {briefing.solutions && briefing.solutions.length > 0 && (
                  <div className="pt-1">
                    <div className="text-[9px] uppercase tracking-[0.14em] mb-1.5" style={{ color: 'var(--ink-4)' }}>
                      Potential solutions · {briefing.solutions.length}
                    </div>
                    <ol className="m-0 p-0 list-none flex flex-col gap-1.5">
                      {briefing.solutions.map((s, i) => {
                        const actorTheme: Record<typeof s.actor, { fg: string; bg: string }> = {
                          City:      { fg: '#3F6212', bg: 'rgba(82,168,115,0.10)' },
                          Alectra:   { fg: '#9A3412', bg: 'rgba(192,120,64,0.10)' },
                          Community: { fg: '#1E40AF', bg: 'rgba(59,130,246,0.10)' },
                          Both:      { fg: 'var(--ink-2)', bg: 'var(--surface-2)' },
                        };
                        const levTheme: Record<typeof s.leverage, string> = {
                          High:   'var(--alert)',
                          Medium: 'var(--warning)',
                          Low:    'var(--ink-3)',
                        };
                        const at = actorTheme[s.actor];
                        return (
                          <li
                            key={i}
                            className="px-2.5 py-2 border border-hairline"
                            style={{ borderRadius: 4, background: 'var(--surface)' }}
                          >
                            <div className="flex items-baseline justify-between gap-2 mb-1">
                              <span className="text-[12px] font-medium leading-snug flex-1" style={{ color: 'var(--ink)' }}>
                                {s.headline}
                              </span>
                              <span
                                className="text-[9px] uppercase tracking-[0.1em] shrink-0 px-1.5 py-0.5"
                                style={{ color: levTheme[s.leverage], background: `${levTheme[s.leverage]}14`, borderRadius: 2 }}
                              >
                                {s.leverage}
                              </span>
                            </div>
                            <div className="flex items-baseline gap-2">
                              <span
                                className="text-[9px] uppercase tracking-[0.1em] shrink-0 px-1.5 py-0.5"
                                style={{ color: at.fg, background: at.bg, borderRadius: 2 }}
                              >
                                {s.actor}
                              </span>
                              <span className="text-[11px] leading-snug" style={{ color: 'var(--ink-2)' }}>
                                {s.detail}
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}

                {/* Refresh stamp */}
                <div className="text-[9px] uppercase tracking-[0.12em] pt-1" style={{ color: 'var(--ink-4)' }}>
                  Generated {new Date(briefing.generated_at).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}
                  {briefing.active_layers.length > 0 && ` · layers: ${briefing.active_layers.join(', ')}`}
                  {' · regenerates on layer / scenario change'}
                </div>
              </div>
            );
          })()}
        </section>

        {/* Contributing Factors */}
        <section className="px-4 py-3 border-b border-hairline">
          <div className="text-[10px] uppercase tracking-[0.14em] mb-1" style={{ color: 'var(--ink-3)' }}>
            Contributing factors
          </div>
          <FactorRow
            icon={<Users size={12} />}
            label="Renter households"
            value={formatPct(selected.pct_renters)}
            pct={selected.pct_renters * 100}
            barColor={barColor}
          />
          <FactorRow
            icon={<Home size={12} />}
            label="Pre-1980 housing"
            value={formatPct(selected.pct_pre1980)}
            pct={selected.pct_pre1980 * 100}
            barColor={barColor}
          />
          <FactorRow
            icon={<TrendingDown size={12} />}
            label="Low-income share"
            value={formatPct(selected.pct_low_income)}
            pct={selected.pct_low_income * 100}
            barColor={barColor}
          />
          {/* Median income — no bar */}
          <div className="flex items-center gap-2 py-2.5 border-b border-hairline">
            <span className="w-4 shrink-0 flex justify-center" style={{ color: 'var(--ink-4)' }}>
              <DollarSign size={12} />
            </span>
            <span className="text-[12px] flex-1 min-w-0" style={{ color: 'var(--ink-2)' }}>Median income</span>
            <div className="text-right shrink-0">
              <div className="text-[13px] tabular" style={{ color: 'var(--ink)' }}>{formatIncome(selected.median_income)}</div>
              <div className="text-[10px] mt-0.5" style={{ color: 'var(--ink-4)' }}>vs. city median $88,000</div>
            </div>
          </div>
          {/* Resilience — no bar */}
          <div className="flex items-center gap-2 py-2.5">
            <span className="w-4 shrink-0 flex justify-center" style={{ color: 'var(--ink-4)' }}>
              <Shield size={12} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[12px]" style={{ color: 'var(--ink-2)' }}>Resilience (CISR)</div>
              <div className="text-[10px]" style={{ color: 'var(--ink-4)' }}>higher is better</div>
            </div>
            <span
              className="text-[13px] tabular shrink-0"
              style={{ color: selected.cisr_score < 0 ? 'var(--alert-mid)' : 'var(--positive)' }}
            >
              {selected.cisr_score > 0 ? '+' : ''}{selected.cisr_score.toFixed(2)}
            </span>
          </div>
        </section>

        {/* Current Conditions — 4-tile horizontal row */}
        <section className="px-4 py-3 border-b border-hairline">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--ink-3)' }}>
              Current conditions
            </span>
            {weatherStale && (
              <span
                style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--warning)', flexShrink: 0 }}
                title="Weather data stale"
                aria-hidden
              />
            )}
          </div>
          <div className="flex border border-hairline overflow-hidden" style={{ borderRadius: 6 }}>
            <CondTile
              icon={<Thermometer size={13} />}
              label="Temperature"
              value={`${selected.temperature_c.toFixed(1)}°C`}
              stale={weatherStale}
            />
            <CondTile
              icon={<Droplets size={13} />}
              label="Humidex"
              value={`${selected.humidex.toFixed(0)}°C`}
              sub={selected.humidex >= 38 ? 'heat-stress' : undefined}
              stale={weatherStale}
            />
            <CondTile
              icon={<Wind size={13} />}
              label="Wind"
              value={`${selected.wind_speed_kmh.toFixed(0)} km/h`}
              stale={weatherStale}
            />
            <CondTile
              icon={coolingIcon}
              label="Cooling access"
              value={selected.shelterCount > 0 ? `${selected.shelterCount} within 2.5 km` : 'None'}
              muted={selected.shelterCount === 0}
            />
          </div>

          {/* Outage row */}
          {selected.active_outages > 0 && (
            <div
              className="mt-2 px-3 py-2 flex items-center justify-between text-[11px]"
              style={{ background: 'rgba(154,52,18,0.05)', borderRadius: 6, color: outagesStale ? 'var(--warning)' : 'var(--alert)' }}
            >
              <span>{selected.active_outages} active outage{selected.active_outages !== 1 ? 's' : ''}</span>
              <span style={{ color: 'var(--ink-4)' }}>{selected.customers_affected.toLocaleString()} customers</span>
            </div>
          )}
        </section>

        {/* Energy-cost exposure */}
        {finance && (
          <section className="px-4 py-3 border-b border-hairline">
            <div className="text-[10px] uppercase tracking-[0.14em] mb-2" style={{ color: 'var(--ink-3)' }}>
              Energy-cost exposure
            </div>
            <div className="flex items-baseline justify-between py-1.5 border-b border-hairline">
              <div>
                <div className="text-[12px]" style={{ color: 'var(--ink-2)' }}>Blended electricity rate</div>
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--ink-4)' }}>
                  OEB · {finance.ontario_electricity_rates[0]?.effective_from ?? '—'}
                </div>
              </div>
              <span className="text-[13px] tabular" style={{ color: 'var(--ink)' }}>
                {finance.blended_residential_cents_per_kwh.toFixed(1)}¢/kWh
              </span>
            </div>
            <div className="flex items-baseline justify-between py-1.5 border-b border-hairline">
              <div>
                <div className="text-[12px]" style={{ color: 'var(--ink-2)' }}>Typical annual cost</div>
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--ink-4)' }}>
                  {finance.typical_household_kwh_per_year.toLocaleString()} kWh
                </div>
              </div>
              <span className="text-[13px] tabular" style={{ color: 'var(--ink)' }}>
                ${finance.annual_household_energy_cost_cad.toLocaleString()}
              </span>
            </div>
            {energyPctIncome != null && (
              <div className="flex items-baseline justify-between py-1.5 border-b border-hairline">
                <div>
                  <div className="text-[12px]" style={{ color: 'var(--ink-2)' }}>Energy share of income</div>
                  <div className="text-[10px] mt-0.5" style={{ color: energyPoor ? 'var(--alert-mid)' : 'var(--ink-4)' }}>
                    {energyPoor
                      ? `above ${finance.energy_poverty_threshold_pct.toFixed(0)}% poverty threshold`
                      : `below ${finance.energy_poverty_threshold_pct.toFixed(0)}% threshold`}
                  </div>
                </div>
                <span className="text-[13px] tabular" style={{ color: energyPoor ? 'var(--alert-mid)' : 'var(--ink)' }}>
                  {energyPctIncome.toFixed(1)}%
                </span>
              </div>
            )}
            <div className="flex items-baseline justify-between pt-1.5">
              <div>
                <div className="text-[12px]" style={{ color: 'var(--ink-2)' }}>CPI year-over-year</div>
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--ink-4)' }}>Bank of Canada · {finance.cpi_vintage}</div>
              </div>
              <span className="text-[13px] tabular" style={{ color: 'var(--ink)' }}>
                {finance.cpi_yoy_pct.toFixed(1)}%
              </span>
            </div>
          </section>
        )}

        {/* Operator annotation */}
        <section className="px-4 py-3 border-b border-hairline print:hidden">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare size={11} style={{ color: 'var(--ink-3)' }} />
            <span className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--ink-3)' }}>Operator note</span>
            {annotation && (
              <span className="ml-auto text-[10px]" style={{ color: 'var(--ink-4)' }}>
                {new Date(annotation.ts).toLocaleString('en-CA', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
            )}
          </div>
          {editingNote ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={draftNote}
                onChange={e => setDraftNote(e.target.value)}
                rows={3}
                placeholder="Note context, decision, or follow-up."
                className="w-full text-[12px] text-ink bg-transparent border border-hairline focus:border-ink p-2 outline-none resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (draftNote.trim()) setAnnotation(selected.ctuid, draftNote.trim());
                    else removeAnnotation(selected.ctuid);
                    setEditingNote(false);
                  }}
                  className="text-[10px] uppercase tracking-[0.1em] text-ink border border-ink px-2 py-1 cursor-pointer hover:bg-surface-2"
                >
                  Save
                </button>
                <button
                  onClick={() => { setDraftNote(annotation?.note ?? ''); setEditingNote(false); }}
                  className="text-[10px] uppercase tracking-[0.1em] text-ink-3 hover:text-ink px-2 py-1 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : annotation ? (
            <div>
              <p className="text-[12px] text-ink-2 leading-relaxed whitespace-pre-wrap">{annotation.note}</p>
              <div className="flex gap-3 mt-2">
                <button onClick={() => setEditingNote(true)} className="text-[10px] uppercase tracking-[0.1em] text-ink-3 hover:text-ink cursor-pointer">Edit</button>
                <button onClick={() => removeAnnotation(selected.ctuid)} className="text-[10px] uppercase tracking-[0.1em] text-ink-4 hover:text-alert cursor-pointer">Remove</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setEditingNote(true)} className="text-[12px] text-ink-3 hover:text-ink-2 cursor-pointer flex items-center gap-1">
              <span style={{ fontSize: 14 }}>+</span> Add a note for this tract
            </button>
          )}
        </section>

        {/* Provenance */}
        <section className="px-4 py-3 text-[10px] leading-relaxed" style={{ color: 'var(--ink-4)' }}>
          Sources: Statistics Canada Census 2021 · StatsCan CISR · Alectra live outage feed ·
          Open-Meteo · Ontario Energy Board · Bank of Canada · City of Brampton facilities registry ·
          Ontario Residential Tenancies Act.{' '}
          {briefing?.used_llm
            ? 'AI briefing generated by Gemini 2.0 Flash — grounded in the input table above; no invented numbers.'
            : 'AI briefing unavailable — deterministic fallback used.'}
        </section>
      </div>

      {/* ── Print-only full report ─────────────────────────────── */}
      <PrintReport
        selected={selected}
        scenario={scenario}
        advisories={advisories}
        recommendations={recommendations}
        tractAction={tractAction}
        forecastPoints={forecastPoints}
        annotation={annotation}
        finance={finance}
        energyPctIncome={energyPctIncome}
        energyPoor={energyPoor ?? false}
        score={score}
        label={label}
        color={color}
      />
    </aside>
  );
}
