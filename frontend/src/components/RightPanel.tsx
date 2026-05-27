import React, { useMemo, useState } from 'react';
import {
  X, Printer, MessageSquare,
  Shield, Users, Home, TrendingDown, TrendingUp, DollarSign,
  Thermometer, Droplets, Wind, Snowflake, Flame, MapPin,
  ChevronRight, Wrench, Zap, AlertTriangle, Activity, Layers,
} from 'lucide-react';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import { tractPriorityAction, type IntelIconKey, type TractAction } from '../intelligence';
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
  'Baseline': { bg: '#D6EDE0', fg: '#1A4A30', fg2: '#2D6645', scoreBg: 'rgba(26,74,48,0.08)',  dot: '#52A873' },
  'Elevated': { bg: '#DDE8C4', fg: '#2E3E10', fg2: '#4A5C20', scoreBg: 'rgba(46,62,16,0.08)',  dot: '#8DB84A' },
  'Moderate': { bg: '#EDE0B4', fg: '#4A3510', fg2: '#6B4E18', scoreBg: 'rgba(74,53,16,0.08)',  dot: '#C8A83C' },
  'High':     { bg: '#E8C8A8', fg: '#4A2010', fg2: '#6B3018', scoreBg: 'rgba(74,32,16,0.08)',  dot: '#C07840' },
  'Critical': { bg: '#BF4040', fg: '#FFFFFF', fg2: 'rgba(255,255,255,0.72)', scoreBg: 'rgba(255,255,255,0.16)', dot: '#FFFFFF' },
  'Severe':   { bg: '#8C2020', fg: '#FFFFFF', fg2: 'rgba(255,255,255,0.68)', scoreBg: 'rgba(255,255,255,0.14)', dot: '#FFFFFF' },
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

/* ─── Main component ─────────────────────────────────────────── */
export default function RightPanel() {
  const {
    selected, scenario, percentiles, setSelected, finance, feeds,
    lens, annotations, setAnnotation, removeAnnotation, logAudit,
    pinned, togglePin, rollupByTract,
  } = useApp();

  const advisories = useMemo(
    () => selected ? advisoriesFor(selected, scenario, finance) : [],
    [selected, scenario, finance],
  );
  const byAudience = useMemo(() => partitionByAudience(advisories), [advisories]);
  const audienceOrder = LENS_AUDIENCES[lens];

  const annotation = selected ? annotations[selected.ctuid] : undefined;
  const [draftNote, setDraftNote] = useState<string>('');
  const [editingNote, setEditingNote] = useState<boolean>(false);

  React.useEffect(() => {
    setDraftNote(annotation?.note ?? '');
    setEditingNote(false);
  }, [selected?.ctuid, annotation?.ts]);

  // Lens-specific priority action for this tract
  // Must be before the early return to satisfy Rules of Hooks
  const tractAction = useMemo(() => {
    if (!selected || lens === 'resident') return null;
    const pct = percentiles.get(selected.ctuid) ?? 0;
    return tractPriorityAction(
      selected,
      pct,
      rollupByTract.get(selected.ctuid),
      scenario,
      finance,
      lens as 'operator' | 'municipal' | 'community',
    );
  }, [selected, lens, percentiles, rollupByTract, scenario, finance]);

  if (!selected) return null;

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
      className="dispatch-card"
      data-print-stamp={new Date().toLocaleString('en-CA')}
    >

      {/* ── Colored header ──────────────────────────────────── */}
      <header style={{ background: theme.bg, padding: '14px 16px 16px', flexShrink: 0 }}>

        {/* Row 1: bullet · name · [actions] · score */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
          <span
            style={{ width: 6, height: 6, background: theme.dot, borderRadius: 1, flexShrink: 0, marginTop: 6 }}
            aria-hidden
          />
          <h2
            style={{
              fontSize: 17, fontWeight: 600, color: theme.fg,
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
              style={{ color: isPinned ? theme.fg : theme.fg2, background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 1 }}
            >
              {isPinned ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}
            </button>
            <button
              onClick={() => {
                logAudit({ action: 'export.brief', targetLabel: selected.neighbourhood, ctuid: selected.ctuid });
                printIncidentBrief();
              }}
              title="Print incident brief"
              style={{ color: theme.fg2, background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 1 }}
            >
              <Printer size={13} />
            </button>
            <button
              onClick={() => setSelected(null)}
              style={{ color: theme.fg2, background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 1 }}
              aria-label="Close"
            >
              <X size={13} />
            </button>
          </div>

          {/* Score */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 26, fontWeight: 500, color: theme.fg, lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
              {score.toFixed(0)}
            </div>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', color: theme.fg2, marginTop: 3 }}>
              Score
            </div>
          </div>
        </div>

        {/* Row 2: CT number · tier badge */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: theme.fg2, fontVariantNumeric: 'tabular-nums' }}>
            CT {selected.ctuid}
          </span>
          <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: theme.fg, background: theme.scoreBg, padding: '4px 10px', borderRadius: 12 }}>
            {label}
          </span>
        </div>

        {/* Narrative */}
        <p style={{ fontSize: 12, color: theme.fg2, lineHeight: 1.65, margin: 0 }}>
          {story}
        </p>
      </header>

      {/* ── Scroll body ─────────────────────────────────────── */}
      <div className="overflow-y-auto flex-1">

        {/* Lens-specific priority action strip */}
        {tractAction && <PriorityActionStrip tractAction={tractAction} />}

        {/* Preparedness Intelligence */}
        <section className="px-4 py-3 border-b border-hairline">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-1.5">
              <Shield size={12} style={{ color: 'var(--ink-3)' }} />
              <span className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--ink-3)' }}>
                Preparedness intelligence
              </span>
            </div>
            <span
              className="text-[10px] uppercase tracking-[0.1em] px-2 py-0.5"
              style={{
                borderRadius: 4,
                color: advisories.length > 0 ? 'var(--alert)' : 'var(--positive)',
                background: advisories.length > 0 ? 'rgba(154,52,18,0.07)' : 'rgba(63,98,18,0.06)',
              }}
            >
              {advisories.length} {advisories.length === 1 ? 'advisory' : 'advisories'}
            </span>
          </div>

          {advisories.length === 0 ? (
            <p className="text-[12px] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
              {posture.sentence || 'No thresholds crossed under the active scenario. Standing readiness applies.'}
            </p>
          ) : (
            <>
              {posture.sentence && (
                <p className="text-[13px] text-ink leading-snug mb-3">{posture.sentence}</p>
              )}
              {audienceOrder.map(aud => (
                <AudienceBlock key={aud} audience={aud} items={byAudience[aud]} />
              ))}
            </>
          )}
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
          Ontario Residential Tenancies Act. Intelligence is rule-derived; no language model is invoked.
        </section>
      </div>
    </aside>
  );
}
