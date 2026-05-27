import React, { useMemo } from 'react';
import { useApp } from '../context';
import { scoreFor, rampLabel, formatPct, formatPop, narrative } from '../utils';
import { advisoriesFor, URGENCY_COLOR, URGENCY_LABEL } from '../advisories';
import { t, LOCALE_LABEL, type Locale } from '../i18n';

/**
 * Resident View — public-facing surface.
 *
 * No ribbon, no layer rail, no watchlist, no dispatch card. The same engine
 * that drives the operator surface drives this one, but only resident-tier
 * advisories are surfaced, and the visual register matches a municipal
 * public-health notice rather than a control-room dashboard.
 *
 * Active when the URL carries ?lens=resident&ctuid=… or the lens is set to
 * "resident" in the app provider. Mobile-first layout (max-width 640px,
 * centered).
 */
export default function ResidentView() {
  const { tracts, selected, setSelected, scenario, finance, percentiles, setLens, locale, setLocale, tenant } = useApp();

  // If the URL carries a ctuid, prefer it. One-shot: run only when tracts
  // first land, never re-fire on selection changes.
  const ctuidApplied = React.useRef(false);
  React.useEffect(() => {
    if (ctuidApplied.current) return;
    if (tracts.length === 0) return;
    ctuidApplied.current = true;
    const q = new URLSearchParams(window.location.search).get('ctuid');
    if (q && !selected) {
      const t = tracts.find(x => x.ctuid === q);
      if (t) setSelected(t);
    }
  }, [tracts, selected, setSelected]);

  const tract = selected;
  const advisories = useMemo(
    () => tract ? advisoriesFor(tract, scenario, finance).filter(a => a.audience === 'resident') : [],
    [tract, scenario, finance],
  );
  const operatorActions = useMemo(
    () => tract ? advisoriesFor(tract, scenario, finance)
        .filter(a => a.audience === 'community' || a.audience === 'operator')
      : [],
    [tract, scenario, finance],
  );

  if (!tract) return <ResidentEmpty tracts={tracts} setSelected={setSelected} />;

  const p = percentiles.get(tract.ctuid) ?? 0;

  return (
    <div className="resident-view min-h-screen bg-canvas text-ink overflow-y-auto">
      {/* Wordmark */}
      <header className="border-b border-hairline">
        <div className="max-w-[640px] mx-auto px-5 py-4 flex items-baseline justify-between gap-3 flex-wrap">
          <span className="text-[16px] font-medium tracking-tight">{t(locale, 'brand')}</span>
          <div className="flex items-baseline gap-4 flex-wrap">
            <span className="text-[10px] uppercase tracking-[0.12em] text-ink-3">{tenant.name} · {t(locale, 'subtitle').split(' · ')[1] ?? 'Preparedness'}</span>
            <LocaleSwitcher locale={locale} setLocale={setLocale} />
            <button
              onClick={() => setLens('operator')}
              className="text-[10px] uppercase tracking-[0.12em] text-ink-4 hover:text-ink-2 cursor-pointer"
              title="Switch to operator view"
            >
              {t(locale, 'backToOperator')}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[640px] mx-auto px-5 py-7">
        {/* Place identity */}
        <div className="text-[10px] uppercase tracking-[0.14em] text-ink-3">
          {scenario} · {rampLabel(p)}
        </div>
        <h1 className="text-[28px] font-medium tracking-tight mt-1 leading-tight">{tract.neighbourhood}</h1>
        <div className="text-[12px] text-ink-3 mt-1 tabular">
          CT {tract.ctuid} · {formatPop(tract.population)} residents
        </div>

        {/* Narrative */}
        <p className="text-[15px] leading-[1.7] text-ink-2 mt-5">
          {narrative(tract, scenario, p)}
        </p>

        {/* Resident advisories */}
        <section className="mt-7">
          <h2 className="text-[11px] uppercase tracking-[0.14em] text-ink-3">
            {t(locale, 'preparednessForResidents')} · {advisories.length}
          </h2>
          {advisories.length === 0 ? (
            <p className="text-[13px] text-ink-3 leading-relaxed mt-3">
              {t(locale, 'noAdvisories')}
            </p>
          ) : (
            <ol className="m-0 p-0 list-none mt-3">
              {advisories.map(a => (
                <li
                  key={a.id}
                  className="relative pl-4 py-4 border-b border-hairline last:border-0"
                >
                  <span
                    className="absolute left-0 top-4 bottom-4 w-[2px]"
                    style={{ background: URGENCY_COLOR[a.urgency] }}
                    aria-hidden
                  />
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="text-[16px] text-ink leading-snug">{a.headline}</div>
                    <div
                      className="text-[10px] uppercase tracking-[0.12em] shrink-0"
                      style={{ color: URGENCY_COLOR[a.urgency] }}
                    >
                      {URGENCY_LABEL[a.urgency]}
                    </div>
                  </div>
                  <p className="text-[13px] text-ink-2 leading-relaxed mt-2">{a.detail}</p>
                  <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
                    {a.triggers.map((t, i) => (
                      <span key={i} className="text-[11px] tabular text-ink-2" title={t.source}>
                        <span className="text-ink-4">{t.label} </span>{t.value}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 text-[10px] uppercase tracking-[0.12em] text-ink-4">
                    {a.timeframe}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* What is being done */}
        {operatorActions.length > 0 && (
          <section className="mt-8">
            <h2 className="text-[11px] uppercase tracking-[0.14em] text-ink-3">
              {t(locale, 'whatIsBeingDone')}
            </h2>
            <p className="text-[12px] text-ink-3 leading-relaxed mt-2">
              {t(locale, 'whatIsBeingDoneDesc')}
            </p>
            <ul className="m-0 p-0 list-none mt-3">
              {operatorActions.slice(0, 6).map(a => (
                <li key={a.id} className="py-2 border-b border-hairline last:border-0">
                  <div className="text-[14px] text-ink leading-snug">{a.headline}</div>
                  <div className="text-[10px] uppercase tracking-[0.12em] text-ink-4 mt-1">
                    {a.audience === 'operator' ? 'Municipal / utility' : 'Community organization'}
                    {a.impact?.authority && ` · ${a.impact.authority}`}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Tract overview */}
        <section className="mt-8">
          <h2 className="text-[11px] uppercase tracking-[0.14em] text-ink-3">
            {t(locale, 'aboutYourNeighbourhood')}
          </h2>
          <dl className="mt-3 text-[14px]">
            <Row label={t(locale, 'renterHouseholds')} value={formatPct(tract.pct_renters)} />
            <Row label={t(locale, 'pre1980Housing')}   value={formatPct(tract.pct_pre1980)} />
            <Row label={t(locale, 'lowIncomeShare')}   value={formatPct(tract.pct_low_income)} />
            <Row label={t(locale, 'coolingCentres')}
                 value={tract.shelterCount === 0 ? t(locale, 'none') : String(tract.shelterCount)} />
          </dl>
        </section>

        {/* Provenance */}
        <footer className="mt-10 pt-6 border-t border-hairline text-[11px] text-ink-3 leading-relaxed">
          <p>{t(locale, 'provenance')}</p>
        </footer>
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-hairline last:border-0">
      <dt className="text-ink-2">{label}</dt>
      <dd className="text-ink tabular">{value}</dd>
    </div>
  );
}

/** Three-button language selector — pure native scripts. */
function LocaleSwitcher({ locale, setLocale }: { locale: Locale; setLocale: (l: Locale) => void }) {
  return (
    <div className="flex gap-1 items-baseline">
      {(['en', 'pa', 'hi'] as Locale[]).map(loc => (
        <button
          key={loc}
          onClick={() => setLocale(loc)}
          title={LOCALE_LABEL[loc].label}
          className={`text-[11px] px-1.5 py-0.5 transition-colors cursor-pointer
            ${locale === loc ? 'text-ink border-b border-ink' : 'text-ink-4 hover:text-ink-2'}`}
        >
          {LOCALE_LABEL[loc].native}
        </button>
      ))}
    </div>
  );
}

function ResidentEmpty({ tracts, setSelected }: { tracts: any[]; setSelected: (t: any) => void }) {
  const { setLens, locale, setLocale, tenant } = useApp();
  const [q, setQ] = React.useState('');
  const matches = useMemo(() => {
    const term = q.toLowerCase().trim();
    if (!term) return tracts.slice(0, 12);
    return tracts.filter(t => t.neighbourhood.toLowerCase().includes(term)).slice(0, 12);
  }, [tracts, q]);

  return (
    <div className="min-h-screen bg-canvas text-ink overflow-y-auto">
      <header className="border-b border-hairline">
        <div className="max-w-[640px] mx-auto px-5 py-4 flex items-baseline justify-between gap-3 flex-wrap">
          <span className="text-[16px] font-medium tracking-tight">{t(locale, 'brand')}</span>
          <div className="flex items-baseline gap-4 flex-wrap">
            <span className="text-[10px] uppercase tracking-[0.12em] text-ink-3">{tenant.name} · {t(locale, 'subtitle').split(' · ')[1] ?? 'Preparedness'}</span>
            <LocaleSwitcher locale={locale} setLocale={setLocale} />
            <button
              onClick={() => setLens('operator')}
              className="text-[10px] uppercase tracking-[0.12em] text-ink-4 hover:text-ink-2 cursor-pointer"
              title="Switch to operator view"
            >
              {t(locale, 'backToOperator')}
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-[640px] mx-auto px-5 py-7">
        <h1 className="text-[24px] font-medium tracking-tight leading-tight">{t(locale, 'findNeighbourhood')}</h1>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={t(locale, 'searchPlaceholder')}
          className="w-full mt-5 px-3 py-2 border border-hairline focus:border-ink text-[14px] outline-none bg-transparent"
        />
        <ul className="m-0 p-0 list-none mt-3">
          {matches.map(t => (
            <li key={t.ctuid}>
              <button
                onClick={() => setSelected(t)}
                className="w-full text-left px-3 py-2.5 border-b border-hairline hover:bg-surface-2 transition-colors cursor-pointer text-[14px] text-ink"
              >
                {t.neighbourhood}
              </button>
            </li>
          ))}
          {matches.length === 0 && (
            <li className="px-3 py-3 text-[12px] text-ink-3">No matches.</li>
          )}
        </ul>
      </main>
    </div>
  );
}
