import React from 'react';
import { X } from 'lucide-react';
import { useApp, LENS_LABEL } from '../context';
import type { AuditActionKind } from '../auditLog';

const ACTION_LABEL: Record<AuditActionKind, string> = {
  'tract.select':            'selected tract',
  'tract.annotate':          'annotated tract',
  'lens.change':             'changed lens to',
  'scenario.change':         'changed scenario to',
  'restoration.sequence':    'sequenced for restoration',
  'restoration.mark-restored': 'marked restored',
  'intervention.flag':       'flagged intervention',
  'export.brief':            'exported incident brief',
  'export.roster':           'exported roster',
};

function ago(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.round(h / 24)} d ago`;
}

export default function ActivityTray() {
  const { activityOpen, setActivityOpen, audit, tracts, setSelected } = useApp();
  const [now, setNow] = React.useState(Date.now());

  React.useEffect(() => {
    if (!activityOpen) return;
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, [activityOpen]);

  if (!activityOpen) return null;

  return (
    <aside
      data-activity-tray
      className="absolute top-0 bottom-0 z-[700] bg-surface border-r border-hairline flex flex-col"
      style={{ left: 0, width: 320 }}
    >
      <div className="px-4 pt-3 pb-2 border-b border-hairline">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[11px] uppercase tracking-[0.14em] text-ink-3 font-medium">Operational ledger</h2>
          <button
            onClick={() => setActivityOpen(false)}
            className="text-ink-3 hover:text-ink transition-colors cursor-pointer"
            aria-label="Close activity"
          >
            <X size={14} />
          </button>
        </div>
        <div className="text-[12px] text-ink-3 mt-1 leading-snug">
          {audit.length} {audit.length === 1 ? 'entry' : 'entries'} · this device
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ maxHeight: 'calc(100% - 60px)' }}>
        {audit.length === 0 ? (
          <div className="px-4 py-6 text-[12px] text-ink-3 leading-relaxed">
            No operator actions recorded yet. Selecting a tract, changing scenario, sequencing restoration, or exporting will populate this log.
          </div>
        ) : (
          audit.map(e => {
            const tract = e.ctuid ? tracts.find(t => t.ctuid === e.ctuid) : null;
            return (
              <button
                key={e.id}
                onClick={() => tract && setSelected(tract)}
                disabled={!tract}
                className={`w-full text-left px-4 py-2.5 border-b border-hairline transition-colors
                  ${tract ? 'hover:bg-surface-2/60 cursor-pointer' : 'cursor-default'}`}
              >
                <div className="text-[11px] uppercase tracking-[0.1em] text-ink-3 tabular">
                  {ago(e.ts, now)} · {LENS_LABEL[e.lens]}
                </div>
                <div className="text-[13px] text-ink-2 mt-1 leading-snug">
                  <span className="text-ink-3">{ACTION_LABEL[e.action]}</span>{' '}
                  <span className="text-ink">{e.targetLabel}</span>
                </div>
                {e.note && (
                  <div className="text-[11px] text-ink-3 mt-1 italic line-clamp-2">{e.note}</div>
                )}
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
