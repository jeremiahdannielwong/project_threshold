import React from 'react';
import { X, Printer } from 'lucide-react';
import { useApp } from '../context';
import { rampLabel } from '../utils';
import { interventionsFor } from '../utils';
import { projectedCriticalCrossings } from '../forecast';

/**
 * 24-hour Situation Report.
 *
 * A printable, six-section institutional briefing document. Designed to be
 * the document the operations chief brings to the morning briefing.
 *
 * Triggered from the command palette or the `R` key. Uses the browser's
 * native print pipeline so the output is identical to screen and editable
 * via page setup.
 */
export default function SituationReport() {
  const {
    situationReportOpen, setSituationReportOpen,
    tracts, scenario, stress, equity, citywideCounts,
    forecastPoints, cityPatterns, restoration, tenant,
    logAudit,
  } = useApp();

  React.useEffect(() => {
    if (!situationReportOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSituationReportOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [situationReportOpen, setSituationReportOpen]);

  if (!situationReportOpen) return null;

  const peakForecast = forecastPoints.reduce(
    (max, p) => p.citywideStress > max.citywideStress ? p : max,
    forecastPoints[0],
  );
  const peakDelta = peakForecast.citywideStress - stress;

  // Tracts projected to cross critical in the next 12 hours
  const projectedCrossings = projectedCriticalCrossings(tracts, scenario, 12);

  // Top 6 most-impactful operator interventions across the city
  const topInterventions = tracts
    .flatMap(t =>
      interventionsFor(t, scenario)
        .filter(i => i.confidence !== 'low')
        .map(i => ({ tract: t, intervention: i })),
    )
    .sort((a, b) =>
      (b.intervention.projectedDelta / Math.max(b.intervention.costCadPerDay, 1)) -
      (a.intervention.projectedDelta / Math.max(a.intervention.costCadPerDay, 1)),
    )
    .slice(0, 6);

  const doPrint = () => {
    logAudit({ action: 'export.brief', targetLabel: '24-hour situation report' });
    document.body.setAttribute('data-print-mode', 'sitrep');
    requestAnimationFrame(() => {
      window.print();
      document.body.removeAttribute('data-print-mode');
    });
  };

  return (
    <div
      className="fixed inset-0 z-[860] bg-canvas overflow-y-auto"
      role="document"
      data-sitrep
    >
      {/* Non-print controls */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-3 border-b border-hairline bg-surface print:hidden">
        <div className="text-[11px] uppercase tracking-[0.14em] text-ink-3">
          24-hour situation report · {tenant.name}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={doPrint}
            className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-ink hover:bg-surface-2 border border-ink-3 hover:border-ink px-2.5 py-1 cursor-pointer transition-colors"
          >
            <Printer size={11} /> Print / Save PDF
          </button>
          <button
            onClick={() => setSituationReportOpen(false)}
            className="text-ink-3 hover:text-ink cursor-pointer"
            aria-label="Close situation report"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Document body — designed to print to ~6 letter pages */}
      <article className="max-w-[820px] mx-auto px-12 py-12 text-ink">
        {/* Cover */}
        <header className="border-b border-hairline pb-8 mb-8">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-3">
            {tenant.name} · {scenario} scenario
          </div>
          <h1 className="text-[36px] font-medium tracking-tight mt-3 leading-tight">
            24-hour Situation Report
          </h1>
          <div className="text-[14px] text-ink-2 mt-3 tabular">
            Issued {new Date().toLocaleString('en-CA', { dateStyle: 'long', timeStyle: 'short' })}
          </div>
          <div className="text-[12px] text-ink-3 mt-1 tabular">
            Threshold v0.2 · Rule catalog v1 · Tenant {tenant.id}
          </div>
        </header>

        {/* Executive summary */}
        <Section title="Executive summary">
          <p className="text-[14px] leading-[1.7] text-ink-2">
            Citywide composite stress index is currently <strong className="text-ink tabular">{stress.toFixed(0)}</strong>{' '}
            under the active {scenario.toLowerCase()} scenario. Projected peak over the next 24 hours is{' '}
            <strong className="text-ink tabular">{peakForecast.citywideStress.toFixed(0)}</strong>
            {' '}({peakDelta >= 0 ? '+' : ''}{peakDelta.toFixed(0)} vs. current, {peakForecast.hoursAhead}h ahead).
            {' '}<strong className="text-ink tabular">{citywideCounts.critical}</strong> critical and{' '}
            <strong className="text-ink tabular">{citywideCounts.elevated}</strong> elevated advisories are active across{' '}
            <strong className="text-ink tabular">{citywideCounts.tractsAffected}</strong> of <strong className="text-ink tabular">{tracts.length}</strong> tracts.
            {' '}<strong className="text-ink tabular">{equity.tractsAffected}</strong> tracts carry active outages affecting{' '}
            <strong className="text-ink tabular">{equity.customersAffected.toLocaleString()}</strong> customers, with an equity-weighted exposure of{' '}
            <strong className="text-ink tabular">{equity.weightedExposure.toFixed(0)}</strong>{' '}
            (average vulnerability multiplier {equity.averageVulnerability.toFixed(2)}×).
          </p>
        </Section>

        {/* Forecast */}
        <Section title="Forecast · next 24 hours">
          <table className="w-full text-[13px] mt-2">
            <thead>
              <tr className="border-b border-hairline">
                <th className="text-left py-2 text-[10px] uppercase tracking-[0.14em] text-ink-3 font-normal">Horizon</th>
                <th className="text-right py-2 text-[10px] uppercase tracking-[0.14em] text-ink-3 font-normal">Stress</th>
                <th className="text-right py-2 text-[10px] uppercase tracking-[0.14em] text-ink-3 font-normal">EWEI</th>
                <th className="text-left py-2 text-[10px] uppercase tracking-[0.14em] text-ink-3 font-normal pl-6">Driver</th>
                <th className="text-right py-2 text-[10px] uppercase tracking-[0.14em] text-ink-3 font-normal">Conf.</th>
              </tr>
            </thead>
            <tbody>
              {forecastPoints.map(p => (
                <tr key={p.hoursAhead} className="border-b border-hairline">
                  <td className="py-2 text-ink tabular">{p.hoursAhead === 0 ? 'Now' : `+${p.hoursAhead}h`}</td>
                  <td className="py-2 text-right text-ink tabular">{p.citywideStress.toFixed(0)}</td>
                  <td className="py-2 text-right text-ink tabular">{p.citywideEwei.toFixed(0)}</td>
                  <td className="py-2 text-ink-2 pl-6">{p.driver}</td>
                  <td className="py-2 text-right text-ink-3 text-[11px] tabular uppercase">{p.confidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {projectedCrossings.length > 0 && (
            <p className="text-[13px] text-ink-2 mt-3 leading-relaxed">
              Projected to cross critical threshold within 12 hours:{' '}
              <strong className="text-ink">
                {projectedCrossings.slice(0, 5).map(t => t.neighbourhood).join(', ')}
                {projectedCrossings.length > 5 && ` and ${projectedCrossings.length - 5} other tract${projectedCrossings.length - 5 === 1 ? '' : 's'}`}.
              </strong>
            </p>
          )}
        </Section>

        {/* City patterns */}
        <Section title="City-wide patterns">
          {cityPatterns.length === 0 ? (
            <p className="text-[13px] text-ink-3">No city-wide spatial patterns above threshold under the active scenario.</p>
          ) : (
            <ol className="m-0 p-0 list-none">
              {cityPatterns.map(p => (
                <li key={p.id} className="py-3 border-b border-hairline last:border-0">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-ink-3">{p.kind.replace(/-/g, ' ')}</div>
                  <div className="text-[15px] text-ink mt-1">{p.headline}</div>
                  <p className="text-[12px] text-ink-2 mt-1 leading-relaxed">{p.detail}</p>
                  {p.metric && (
                    <div className="text-[11px] text-ink-3 mt-1 tabular">
                      {p.metric.label}: <span className="text-ink">{p.metric.value}</span>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Section>

        {/* Recommended interventions */}
        <Section title="Recommended interventions · top six by impact per dollar">
          {topInterventions.length === 0 ? (
            <p className="text-[13px] text-ink-3">No operator-tier interventions triggered under current conditions.</p>
          ) : (
            <ol className="m-0 p-0 list-none">
              {topInterventions.map(({ tract, intervention }, i) => (
                <li key={`${tract.ctuid}-${intervention.id}`} className="py-3 border-b border-hairline last:border-0">
                  <div className="flex items-baseline gap-3">
                    <span className="text-[10px] tabular text-ink-3 w-4 shrink-0">{i + 1}.</span>
                    <div className="flex-1">
                      <div className="text-[14px] text-ink leading-snug">{intervention.name}</div>
                      <div className="text-[12px] text-ink-3 mt-0.5">{tract.neighbourhood}</div>
                      <div className="text-[11px] text-ink-2 mt-1 tabular flex flex-wrap gap-x-4 gap-y-0.5">
                        <span>−{intervention.projectedDelta} pts</span>
                        <span>${intervention.costCadPerDay.toLocaleString()}/day</span>
                        <span>{intervention.timeToEffectMin} min to effect</span>
                        <span className="text-ink-4 uppercase tracking-[0.1em]">{intervention.confidence}</span>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Section>

        {/* Restoration queue summary */}
        {restoration.length > 0 && (
          <Section title="Active restoration queue">
            <p className="text-[13px] text-ink-2 mb-3">
              {restoration.length} feeder{restoration.length === 1 ? '' : 's'} with active outages, ranked by vulnerability-weighted priority.
            </p>
            <ol className="m-0 p-0 list-none">
              {restoration.slice(0, 5).map((c, i) => (
                <li key={c.tract.ctuid} className="py-2 border-b border-hairline last:border-0 flex items-baseline gap-3">
                  <span className="text-[10px] tabular text-ink-3 w-4 shrink-0">{i + 1}.</span>
                  <div className="flex-1">
                    <div className="text-[14px] text-ink">{c.tract.neighbourhood}</div>
                    <div className="text-[11px] text-ink-3 mt-0.5 tabular">{c.reasons.join(' · ')}</div>
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        )}

        {/* Sign-off */}
        <footer className="mt-10 pt-6 border-t border-hairline text-[11px] text-ink-4 leading-relaxed">
          Issued by Threshold · Civic Preparedness Intelligence · {tenant.name}.
          Methodology: deterministic rule engine over public datasets — Statistics Canada Census 2021,
          Canadian Index of Social Vulnerability, Alectra live outage feed, Open-Meteo current conditions,
          Ontario Energy Board RPP, Bank of Canada CPI.
          Every numeric figure in this document is reproducible from those sources at the listed timestamp.
          No language model is invoked in the production of this brief.
        </footer>
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="text-[11px] uppercase tracking-[0.16em] text-ink-3 border-b border-hairline pb-2 mb-3">
        {title}
      </h2>
      {children}
    </section>
  );
}
