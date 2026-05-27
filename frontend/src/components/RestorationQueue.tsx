import React from 'react';
import { Download, CheckCircle2, Clock, ListOrdered } from 'lucide-react';
import { useApp } from '../context';
import { downloadFile, toCsv } from '../exporters';

const STATUS_LABEL = {
  queued:        'queued',
  'in-progress': 'in progress',
  restored:      'restored',
};
const STATUS_COLOR = {
  queued:        'var(--ink-3)',
  'in-progress': 'var(--alert-mid)',
  restored:      'var(--positive)',
};

/**
 * Restoration Queue — Alectra's operator surface.
 *
 * Ranks tracts with active outages by a vulnerability-weighted composite:
 * customers affected (log-scaled), CISV score, aging housing, income
 * constraint, lack of cooling access, current heat-stress. Provides
 * mark-in-progress / mark-restored actions that write to the audit log.
 */
export default function RestorationQueue() {
  const {
    restoration, restorationState, setRestorationStatus,
    setSelected, selected, logAudit, equity,
  } = useApp();

  const exportCsv = () => {
    const rows = restoration.map((c, i) => ({
      sequence: i + 1,
      ctuid: c.tract.ctuid,
      neighbourhood: c.tract.neighbourhood,
      customers_affected: c.tract.customers_affected,
      cisv_quintile: c.tract.cisv_quintile,
      shelter_access: c.tract.shelterCount > 0 ? 'within 2.5km' : 'none < 2.5km',
      priority_score: c.priority.toFixed(1),
      reasons: c.reasons.join('; '),
      current_status: restorationState[c.tract.ctuid]?.status ?? 'queued',
    }));
    downloadFile(`restoration-queue-${new Date().toISOString().slice(0,16).replace(/[:T]/g,'-')}.csv`, toCsv(rows));
    logAudit({ action: 'export.roster', targetLabel: 'Restoration queue CSV' });
  };

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      {/* Summary strip */}
      <div className="px-4 py-2 border-b border-hairline text-[12px] text-ink-2 leading-snug flex items-baseline justify-between">
        <div>
          <span className="text-ink tabular">{restoration.length}</span> active outage{restoration.length === 1 ? '' : 's'} ·{' '}
          <span className="text-ink tabular">{equity.customersAffected.toLocaleString()}</span> customers
        </div>
        <button
          onClick={exportCsv}
          disabled={restoration.length === 0}
          className="flex items-center gap-1 text-[11px] uppercase tracking-[0.1em] text-ink-3 hover:text-ink disabled:opacity-40 cursor-pointer disabled:cursor-default transition-colors"
          title="Export queue as CSV"
        >
          <Download size={11} />Export
        </button>
      </div>

      {restoration.length === 0 ? (
        <div className="px-4 py-6 text-[12px] text-ink-3 leading-relaxed">
          No active outages in the territory. The queue is empty.
        </div>
      ) : (
        <ol className="m-0 p-0 list-none">
          {restoration.map((c, i) => {
            const t = c.tract;
            const isSel = selected?.ctuid === t.ctuid;
            const st = restorationState[t.ctuid]?.status ?? 'queued';
            return (
              <li
                key={t.ctuid}
                className={`px-4 py-2.5 border-b border-hairline transition-colors
                  ${isSel ? 'bg-surface-2' : 'hover:bg-surface-2/60'}`}
              >
                <div className="flex items-baseline gap-3">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-ink-3 tabular w-6 shrink-0 mt-0.5">
                    #{i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => setSelected(isSel ? null : t)}
                      className="block w-full text-left text-[14px] text-ink leading-snug truncate cursor-pointer hover:underline"
                    >
                      {t.neighbourhood}
                    </button>
                    <div className="text-[11px] text-ink-2 mt-1 flex flex-wrap gap-x-2 gap-y-0.5 tabular">
                      {c.reasons.map((r, j) => (
                        <span key={j} className={j === 0 ? 'text-ink' : 'text-ink-3'}>
                          {j > 0 && <span className="text-ink-4 mr-1">·</span>}{r}
                        </span>
                      ))}
                    </div>

                    {/* Status + actions */}
                    <div className="mt-2 flex items-center gap-3">
                      <span
                        className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.12em]"
                        style={{ color: STATUS_COLOR[st] }}
                      >
                        {st === 'restored' && <CheckCircle2 size={10} />}
                        {st === 'in-progress' && <Clock size={10} />}
                        {st === 'queued' && <ListOrdered size={10} />}
                        {STATUS_LABEL[st]}
                      </span>
                      <div className="flex gap-1 ml-auto">
                        {st !== 'in-progress' && st !== 'restored' && (
                          <button
                            onClick={() => setRestorationStatus(t.ctuid, 'in-progress')}
                            className="text-[10px] uppercase tracking-[0.1em] text-ink-3 hover:text-ink border border-hairline hover:border-ink-3 px-1.5 py-0.5 transition-colors cursor-pointer"
                          >
                            mark in progress
                          </button>
                        )}
                        {st !== 'restored' && (
                          <button
                            onClick={() => setRestorationStatus(t.ctuid, 'restored')}
                            className="text-[10px] uppercase tracking-[0.1em] text-ink-3 hover:text-ink border border-hairline hover:border-ink-3 px-1.5 py-0.5 transition-colors cursor-pointer"
                          >
                            mark restored
                          </button>
                        )}
                        {st === 'restored' && (
                          <button
                            onClick={() => setRestorationStatus(t.ctuid, 'queued')}
                            className="text-[10px] uppercase tracking-[0.1em] text-ink-4 hover:text-ink-2 px-1.5 py-0.5 transition-colors cursor-pointer"
                          >
                            reopen
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
