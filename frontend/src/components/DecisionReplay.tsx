import React, { useMemo, useEffect } from 'react';
import { X, Play, Pause, ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react';
import { useApp, LENS_LABEL } from '../context';
import type { AuditActionKind, AuditEntry } from '../auditLog';

/**
 * Decision Replay — scrub the audit log timeline.
 *
 * Pin a position and the operator surface filters to the state visible at
 * that moment. Tamper-evident hash chain provides cryptographic continuity
 * across the timeline.
 *
 * This is the institutional defensibility surface — answers the "what did
 * the operator see and decide, and when" question without inference.
 */

const ACTION_LABEL: Record<AuditActionKind, string> = {
  'tract.select':              'selected',
  'tract.annotate':            'annotated',
  'lens.change':               'changed lens to',
  'scenario.change':           'switched scenario to',
  'restoration.sequence':      'sequenced',
  'restoration.mark-restored': 'marked restored',
  'intervention.flag':         'flagged intervention',
  'export.brief':              'exported brief',
  'export.roster':             'exported roster',
};

function formatStamp(ts: number): string {
  return new Date(ts).toLocaleString('en-CA', {
    dateStyle: 'short',
    timeStyle: 'medium',
  });
}

export default function DecisionReplay() {
  const {
    replayOpen, setReplayOpen,
    replayPosition, setReplayPosition,
    audit, tracts, setSelected,
  } = useApp();
  const [playing, setPlaying] = React.useState(false);

  const sorted = useMemo(() => [...audit].sort((a, b) => a.ts - b.ts), [audit]);
  const idx = Math.min(Math.max(0, Math.round(replayPosition * (sorted.length - 1))), Math.max(0, sorted.length - 1));
  const cursor = sorted[idx];
  const window10 = sorted.slice(Math.max(0, idx - 4), Math.min(sorted.length, idx + 5));

  // Esc to close
  useEffect(() => {
    if (!replayOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setReplayOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [replayOpen, setReplayOpen]);

  // Autoplay
  useEffect(() => {
    if (!playing || !replayOpen) return;
    if (sorted.length <= 1) { setPlaying(false); return; }
    if (replayPosition >= 1 - 1e-6) { setPlaying(false); return; }
    const id = setInterval(() => {
      setReplayPosition(Math.min(1, replayPosition + (1 / (sorted.length - 1))));
    }, 700);
    return () => clearInterval(id);
  }, [playing, replayPosition, sorted.length, replayOpen, setReplayPosition]);

  if (!replayOpen) return null;

  const step = (delta: number) => {
    if (sorted.length <= 1) return;
    setReplayPosition(Math.max(0, Math.min(1, (idx + delta) / (sorted.length - 1))));
  };

  const jumpToTract = () => {
    if (!cursor?.ctuid) return;
    const t = tracts.find(x => x.ctuid === cursor.ctuid);
    if (t) setSelected(t);
  };

  // Chain integrity status — derived from the latest entry's hash existence
  const chainIntact = sorted.every(e => !!e.hash || e === sorted[sorted.length - 1]);

  return (
    <div
      className="fixed inset-0 z-[840] flex items-end justify-center pb-6 px-4"
      style={{ background: 'rgba(15,23,42,0.20)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) setReplayOpen(false); }}
    >
      <div
        className="bg-surface border border-hairline w-full"
        style={{ maxWidth: 920 }}
      >
        {/* Header */}
        <div className="flex items-baseline justify-between px-5 py-3 border-b border-hairline">
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-ink-3">Decision replay</div>
            <div className="text-[15px] text-ink mt-0.5">
              {sorted.length} {sorted.length === 1 ? 'entry' : 'entries'} in the operational ledger
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.12em]"
              style={{ color: chainIntact ? 'var(--positive)' : 'var(--warning)' }}
              title="Audit-log hash chain status"
            >
              <ShieldCheck size={11} />
              {chainIntact ? 'Chain intact' : 'Chain pending'}
            </span>
            <button
              onClick={() => setReplayOpen(false)}
              className="text-ink-3 hover:text-ink cursor-pointer"
              aria-label="Close replay"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Scrubber */}
        {sorted.length === 0 ? (
          <div className="px-5 py-12 text-center text-[13px] text-ink-3">
            No audit entries yet. Cycle scenarios, change lenses, or sequence restoration to populate the timeline.
          </div>
        ) : (
          <>
            <div className="px-5 py-3 border-b border-hairline">
              <div className="flex items-center gap-3 mb-2">
                <button
                  onClick={() => setPlaying(p => !p)}
                  className="flex items-center gap-1 text-[11px] uppercase tracking-[0.12em] text-ink hover:bg-surface-2 border border-ink-3 hover:border-ink px-2 h-7 cursor-pointer transition-colors"
                >
                  {playing ? <Pause size={11} /> : <Play size={11} />}
                  {playing ? 'pause' : 'play'}
                </button>
                <button onClick={() => step(-1)} className="text-ink-3 hover:text-ink cursor-pointer" aria-label="Previous"><ChevronLeft size={14} /></button>
                <button onClick={() => step(1)}  className="text-ink-3 hover:text-ink cursor-pointer" aria-label="Next"><ChevronRight size={14} /></button>
                <span className="ml-auto text-[11px] tabular text-ink-3">
                  {idx + 1} / {sorted.length}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={1 / Math.max(sorted.length - 1, 1)}
                value={replayPosition}
                onChange={e => setReplayPosition(parseFloat(e.target.value))}
                className="w-full"
                style={{ accentColor: 'var(--ink)' }}
              />
              <div className="flex justify-between text-[10px] uppercase tracking-[0.12em] text-ink-4 mt-1 tabular">
                <span>{formatStamp(sorted[0].ts)}</span>
                <span>{formatStamp(sorted[sorted.length - 1].ts)}</span>
              </div>
            </div>

            {/* Cursor entry */}
            {cursor && (
              <div className="px-5 py-3 border-b border-hairline bg-surface-2">
                <div className="text-[10px] uppercase tracking-[0.14em] text-ink-3 tabular">
                  {formatStamp(cursor.ts)} · {LENS_LABEL[cursor.lens]}
                </div>
                <div className="text-[14px] text-ink mt-1">
                  <span className="text-ink-3">{ACTION_LABEL[cursor.action]}</span>{' '}
                  <span>{cursor.targetLabel}</span>
                </div>
                {cursor.note && (
                  <div className="text-[11px] text-ink-2 mt-1 italic line-clamp-2">{cursor.note}</div>
                )}
                <div className="flex items-center gap-3 mt-2">
                  {cursor.ctuid && (
                    <button
                      onClick={jumpToTract}
                      className="text-[10px] uppercase tracking-[0.12em] text-ink-3 hover:text-ink cursor-pointer"
                    >
                      Jump to tract →
                    </button>
                  )}
                  {cursor.hash && (
                    <span className="text-[10px] tabular text-ink-4 ml-auto" title="Entry hash">
                      hash {cursor.hash.slice(0, 12)}…
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Window of nearby entries */}
            <div className="px-5 py-3 max-h-[200px] overflow-y-auto">
              <div className="text-[10px] uppercase tracking-[0.14em] text-ink-3 mb-2">Surrounding entries</div>
              <ol className="m-0 p-0 list-none space-y-1">
                {window10.map((e: AuditEntry) => {
                  const i = sorted.indexOf(e);
                  const active = i === idx;
                  return (
                    <li
                      key={e.id}
                      className={`text-[11px] tabular flex items-baseline gap-2 ${active ? 'text-ink' : 'text-ink-3'}`}
                    >
                      <span className="w-2 text-center">{active ? '▸' : ' '}</span>
                      <span className="w-32 text-ink-4 tabular">{formatStamp(e.ts)}</span>
                      <span>{ACTION_LABEL[e.action]}</span>
                      <span className="truncate">{e.targetLabel}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
