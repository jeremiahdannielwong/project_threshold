import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { useApp } from '../context';
import MapPanel from './MapPanel';
import { URGENCY_COLOR } from '../advisories';

/**
 * Wall Display mode — projector / EOC-wall full-screen view.
 *
 * Strips ribbon, layer rail, status strip. Map fills 70% of the width;
 * the right column carries large-type advisory headlines + forecast
 * + citywide stress. Designed to be projected onto an Emergency
 * Operations Centre wall during an active event.
 *
 * The "looks expensive, looks inevitable" surface.
 */
export default function WallDisplay() {
  const {
    wallMode, setWallMode,
    tracts, scenario, citywideCounts, stress, equity,
    rollupByTract, forecastPoints, tenant,
  } = useApp();

  // Esc to exit wall mode
  useEffect(() => {
    if (!wallMode) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setWallMode(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [wallMode, setWallMode]);

  if (!wallMode) return null;

  // Top six tracts by max-urgency, with their top advisory headline
  const topTracts = tracts
    .map(t => ({ t, r: rollupByTract.get(t.ctuid) }))
    .filter(({ r }) => r && r.maxUrgency)
    .sort((a, b) => {
      const order: Record<string, number> = { critical: 0, elevated: 1, routine: 2 };
      return order[a.r!.maxUrgency!] - order[b.r!.maxUrgency!];
    })
    .slice(0, 6);

  return (
    <div className="fixed inset-0 z-[950] bg-canvas flex flex-col">
      {/* Minimal top strip — wordmark + exit */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-hairline">
        <div className="flex items-baseline gap-4">
          <span className="text-[22px] font-medium tracking-tight">{tenant.wordmark}</span>
          <span className="text-[12px] uppercase tracking-[0.18em] text-ink-3">
            {tenant.subtitle} · {scenario}
          </span>
        </div>
        <div className="flex items-baseline gap-8 text-ink-3">
          <span className="text-[11px] uppercase tracking-[0.14em]">EOC Wall · Live</span>
          <button
            onClick={() => setWallMode(false)}
            className="hover:text-ink transition-colors cursor-pointer flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em]"
            title="Exit wall mode · Esc"
          >
            <X size={14} /> Exit
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Map fills the left 70% */}
        <div className="flex-1 relative">
          <MapPanel />
        </div>

        {/* Right column — large editorial summary */}
        <aside
          className="border-l border-hairline overflow-y-auto bg-surface px-8 py-7"
          style={{ width: '30%', minWidth: 380 }}
        >
          {/* Citywide stress */}
          <div className="mb-7">
            <div className="text-[11px] uppercase tracking-[0.18em] text-ink-3">Citywide Stress Index</div>
            <div className="flex items-baseline gap-3 mt-2">
              <span className="text-[64px] font-medium tracking-tight tabular text-ink leading-none">
                {stress.toFixed(0)}
              </span>
              <span className="text-[14px] text-ink-3 tabular">
                EWEI {equity.weightedExposure.toFixed(0)}
              </span>
            </div>
          </div>

          {/* Advisory counts */}
          <div className="mb-7 pb-7 border-b border-hairline">
            <div className="text-[11px] uppercase tracking-[0.18em] text-ink-3 mb-2">Active advisories</div>
            <div className="flex items-baseline gap-6">
              <div>
                <span className="text-[36px] font-medium tabular tracking-tight" style={{ color: 'var(--alert-deep)' }}>
                  {citywideCounts.critical}
                </span>
                <span className="text-[11px] uppercase tracking-[0.14em] text-ink-3 ml-2">critical</span>
              </div>
              <div>
                <span className="text-[36px] font-medium tabular tracking-tight" style={{ color: 'var(--alert-mid)' }}>
                  {citywideCounts.elevated}
                </span>
                <span className="text-[11px] uppercase tracking-[0.14em] text-ink-3 ml-2">elevated</span>
              </div>
            </div>
            <div className="text-[12px] text-ink-3 mt-2 tabular">
              {citywideCounts.tractsAffected} of {tracts.length} tracts affected
            </div>
          </div>

          {/* Top tracts */}
          <div className="mb-7 pb-7 border-b border-hairline">
            <div className="text-[11px] uppercase tracking-[0.18em] text-ink-3 mb-3">Highest urgency</div>
            <ol className="m-0 p-0 list-none space-y-3">
              {topTracts.map(({ t, r }) => (
                <li key={t.ctuid} className="flex items-start gap-3">
                  <span
                    className="w-[3px] mt-1.5 shrink-0"
                    style={{ height: 36, background: URGENCY_COLOR[r!.maxUrgency!] }}
                    aria-hidden
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[17px] text-ink leading-tight">{t.neighbourhood}</div>
                    {r?.topHeadline && (
                      <div className="text-[12px] text-ink-2 mt-1 leading-snug line-clamp-2">{r.topHeadline}</div>
                    )}
                  </div>
                </li>
              ))}
              {topTracts.length === 0 && (
                <li className="text-[13px] text-ink-3">No tracts above threshold.</li>
              )}
            </ol>
          </div>

          {/* Forecast */}
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-ink-3 mb-3">24-hour forecast</div>
            <ul className="m-0 p-0 list-none space-y-2.5">
              {forecastPoints.map(p => (
                <li key={p.hoursAhead} className="flex items-baseline gap-3">
                  <span className="text-[11px] uppercase tracking-[0.12em] text-ink-3 tabular w-12">
                    {p.hoursAhead === 0 ? 'now' : `+${p.hoursAhead}h`}
                  </span>
                  <span className="text-[18px] tabular tracking-tight text-ink w-12">{p.citywideStress.toFixed(0)}</span>
                  <span className="text-[12px] text-ink-3 flex-1">{p.driver}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      {/* Bottom status */}
      <div className="px-8 py-3 border-t border-hairline flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-ink-3">
        <span>Threshold · {tenant.id} · {new Date().toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}</span>
        <span>Esc to exit wall mode</span>
      </div>
    </div>
  );
}
