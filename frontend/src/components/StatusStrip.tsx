import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useApp, isStale } from '../context';
import type { FeedKey, FeedStatus } from '../context';

function relative(then: Date | null, now: number): string {
  if (!then) return '—';
  const s = Math.max(0, Math.round((now - then.getTime()) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m === 1) return '1 min ago';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h === 1 ? '1 hr ago' : `${h} hr ago`;
}

/** Per-source freshness chip with a quiet status dot. */
function Feed({ label, feed, now }: { label: string; feed: FeedStatus; now: number }) {
  const stale = isStale(feed, now);
  const err = !!feed.error;
  const inFlight = feed.inFlight;
  const dot =
    err   ? 'var(--alert)' :
    stale ? 'var(--warning)' :
    inFlight ? 'var(--ink-3)' :
              'var(--positive)';

  return (
    <span
      className="flex items-center gap-1.5"
      title={feed.error ?? (stale ? 'data may be stale' : 'live')}
    >
      <span
        className="inline-block"
        style={{
          width: 5, height: 5,
          background: dot,
          borderRadius: 0,
          opacity: inFlight ? 0.5 : 1,
        }}
        aria-hidden
      />
      <span>
        {label}
        <span className="text-ink-4"> · {relative(feed.lastSuccess, now)}</span>
      </span>
    </span>
  );
}

export default function StatusStrip() {
  const { tracts, scenario, feeds, finance, refreshAll, equity, lens } = useApp();
  // Tick every 10 seconds so relative-time labels update without spamming.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  return (
    <footer className="status-strip">
      <div className="flex items-center gap-5">
        <Feed label="Census · StatsCan" feed={feeds.communities} now={now} />
        <Feed label="Weather · Open-Meteo" feed={feeds.weather} now={now} />
        <Feed label="Outages · Alectra" feed={feeds.outages} now={now} />
        <Feed label="Finance · OEB + BoC" feed={feeds.finance} now={now} />
      </div>
      <div className="flex items-center gap-5 text-ink-4">
        {/* Equity-weighted exposure — utility-relevant metric */}
        {(lens === 'operator' || lens === 'municipal') && equity.customersAffected > 0 && (
          <span title={`Equity-weighted exposure: ${equity.weightedExposure.toFixed(0)} weighted customer-units across ${equity.tractsAffected} affected tracts. Avg vulnerability multiplier ${equity.averageVulnerability.toFixed(2)}×.`}>
            EWEI <span className="text-ink-3 tabular">{equity.weightedExposure.toFixed(0)}</span>
            <span className="text-ink-4"> ({equity.averageVulnerability.toFixed(2)}×)</span>
          </span>
        )}
        {finance && (
          <span title="Bank of Canada total CPI, year-over-year change">
            CPI <span className="text-ink-3 tabular">{finance.cpi_yoy_pct.toFixed(1)}%</span>
          </span>
        )}
        {finance && (
          <span title="Ontario Energy Board — blended residential rate (¢/kWh)">
            Rate <span className="text-ink-3 tabular">{finance.blended_residential_cents_per_kwh.toFixed(1)}¢</span>
          </span>
        )}
        <span>{tracts.length} tracts</span>
        <span>{scenario}</span>
        <button
          onClick={refreshAll}
          title="Resync all live feeds"
          className="flex items-center gap-1 hover:text-ink transition-colors cursor-pointer"
        >
          <RefreshCw size={10} />
          <span>resync</span>
        </button>
      </div>
    </footer>
  );
}
