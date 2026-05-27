import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Map as MapIcon, Thermometer, Snowflake, Sun, Briefcase, Building2,
  Users, User, List, ClipboardList, FileText, BookOpen, Printer, RefreshCw,
  Maximize2, FileSearch, Rewind, Network, Languages, Boxes,
} from 'lucide-react';
import { useApp, LENS_LABEL } from '../context';
import type { Lens } from '../context';
import type { Scenario, Tract } from '../types';
import { printIncidentBrief } from '../exporters';

type CommandKind = 'tract' | 'scenario' | 'lens' | 'surface' | 'action';

interface Command {
  kind: CommandKind;
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  invoke: () => void;
}

/**
 * Cmd-K command palette.
 *
 * Single keystroke surface for the things an operator does most. Search any
 * neighbourhood, switch scenario or lens, open any tray, export the active
 * brief, open the methodology document. Arrow keys to navigate, Enter to
 * invoke, Esc to close.
 */
export default function CommandPalette() {
  const {
    paletteOpen, setPaletteOpen,
    tracts, setSelected,
    setScenario, setLens,
    setWatchlistOpen, setActivityOpen, setMethodologyOpen,
    refreshAll, logAudit,
    setWallMode, setSituationReportOpen, setReplayOpen, setCrossJurisdictionOpen,
    locale, setLocale, setTenant,
  } = useApp();

  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus + reset on open
  useEffect(() => {
    if (paletteOpen) {
      setQuery('');
      setCursor(0);
      // Defer focus until after the DOM updates
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [paletteOpen]);

  const commands = useMemo<Command[]>(() => {
    const c: Command[] = [];

    // Scenarios
    c.push({
      kind: 'scenario', id: 's-base',
      label: 'Switch scenario · Baseline',
      icon: <MapIcon size={13} />,
      invoke: () => {
        setScenario('Baseline');
        logAudit({ action: 'scenario.change', targetLabel: 'Baseline' });
      },
    });
    c.push({
      kind: 'scenario', id: 's-heat',
      label: 'Switch scenario · Heatwave',
      hint: 'Humidex 42, sustained',
      icon: <Thermometer size={13} />,
      invoke: () => {
        setScenario('Heatwave');
        logAudit({ action: 'scenario.change', targetLabel: 'Heatwave' });
      },
    });
    c.push({
      kind: 'scenario', id: 's-ice',
      label: 'Switch scenario · Ice Storm',
      hint: '-12°C, freezing rain',
      icon: <Snowflake size={13} />,
      invoke: () => {
        setScenario('Ice Storm');
        logAudit({ action: 'scenario.change', targetLabel: 'Ice Storm' });
      },
    });

    // Lens
    const lenses: { id: Lens; icon: React.ReactNode }[] = [
      { id: 'operator',  icon: <Briefcase size={13} /> },
      { id: 'municipal', icon: <Building2 size={13} /> },
      { id: 'community', icon: <Users size={13} /> },
      { id: 'resident',  icon: <User size={13} /> },
    ];
    lenses.forEach(l => {
      c.push({
        kind: 'lens', id: `l-${l.id}`,
        label: `Switch lens · ${LENS_LABEL[l.id]}`,
        icon: l.icon,
        invoke: () => setLens(l.id),
      });
    });

    // Surfaces
    c.push({
      kind: 'surface', id: 'surf-watchlist',
      label: 'Open Watchlist', hint: 'w',
      icon: <List size={13} />,
      invoke: () => setWatchlistOpen(true),
    });
    c.push({
      kind: 'surface', id: 'surf-ledger',
      label: 'Open Operational ledger', hint: 'a',
      icon: <ClipboardList size={13} />,
      invoke: () => setActivityOpen(true),
    });
    c.push({
      kind: 'surface', id: 'surf-methodology',
      label: 'Open Methodology', hint: '?',
      icon: <BookOpen size={13} />,
      invoke: () => setMethodologyOpen(true),
    });
    c.push({
      kind: 'surface', id: 'surf-wall',
      label: 'Enter Wall Display mode', hint: 'F',
      icon: <Maximize2 size={13} />,
      invoke: () => setWallMode(true),
    });
    c.push({
      kind: 'surface', id: 'surf-sitrep',
      label: 'Generate 24h Situation Report', hint: 'R',
      icon: <FileSearch size={13} />,
      invoke: () => setSituationReportOpen(true),
    });
    c.push({
      kind: 'surface', id: 'surf-replay',
      label: 'Open Decision Replay', hint: 'shift+R',
      icon: <Rewind size={13} />,
      invoke: () => setReplayOpen(true),
    });
    c.push({
      kind: 'surface', id: 'surf-crossjuris',
      label: 'Open Cross-Jurisdiction comparison', hint: 'shift+C',
      icon: <Network size={13} />,
      invoke: () => setCrossJurisdictionOpen(true),
    });

    // Language
    const localeOptions: { id: 'en' | 'pa' | 'hi'; native: string }[] = [
      { id: 'en', native: 'English' },
      { id: 'pa', native: 'ਪੰਜਾਬੀ' },
      { id: 'hi', native: 'हिन्दी' },
    ];
    localeOptions.forEach(opt => {
      c.push({
        kind: 'action', id: `lang-${opt.id}`,
        label: `Resident language · ${opt.native}`,
        hint: locale === opt.id ? 'active' : undefined,
        icon: <Languages size={13} />,
        invoke: () => setLocale(opt.id),
      });
    });

    // Tenants
    const tenantOptions: { id: string; name: string }[] = [
      { id: 'brampton-pilot',  name: 'Brampton (live)' },
      { id: 'mississauga-demo', name: 'Mississauga (demo)' },
      { id: 'hamilton-demo',    name: 'Hamilton (demo)' },
      { id: 'surrey-demo',      name: 'Surrey (demo)' },
    ];
    tenantOptions.forEach(opt => {
      c.push({
        kind: 'action', id: `tenant-${opt.id}`,
        label: `Switch tenant · ${opt.name}`,
        icon: <Boxes size={13} />,
        invoke: () => setTenant(opt.id),
      });
    });

    // Actions
    c.push({
      kind: 'action', id: 'act-print',
      label: 'Print incident brief', hint: 'requires a selected tract',
      icon: <Printer size={13} />,
      invoke: () => printIncidentBrief(),
    });
    c.push({
      kind: 'action', id: 'act-resync',
      label: 'Resync all live feeds',
      icon: <RefreshCw size={13} />,
      invoke: () => refreshAll(),
    });

    // Tracts — alphabetic
    const tractSorted = [...tracts].sort((a, b) =>
      a.neighbourhood.localeCompare(b.neighbourhood),
    );
    tractSorted.forEach(t => {
      c.push({
        kind: 'tract', id: `t-${t.ctuid}`,
        label: t.neighbourhood,
        hint: `CT ${t.ctuid}`,
        icon: <FileText size={13} />,
        invoke: () => {
          setSelected(t);
          logAudit({ action: 'tract.select', targetLabel: t.neighbourhood, ctuid: t.ctuid });
        },
      });
    });

    return c;
  }, [tracts, setScenario, setLens, setWatchlistOpen, setActivityOpen, setMethodologyOpen, refreshAll, setSelected, logAudit, setWallMode, setSituationReportOpen, setReplayOpen, setCrossJurisdictionOpen, locale, setLocale, setTenant]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands.slice(0, 30);
    return commands
      .filter(cmd => cmd.label.toLowerCase().includes(q) || (cmd.hint ?? '').toLowerCase().includes(q))
      .slice(0, 30);
  }, [query, commands]);

  // Keep cursor inside bounds when filter shrinks
  useEffect(() => {
    if (cursor >= filtered.length) setCursor(Math.max(0, filtered.length - 1));
  }, [filtered, cursor]);

  if (!paletteOpen) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setPaletteOpen(false); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor(c => Math.min(c + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor(c => Math.max(c - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[cursor];
      if (cmd) {
        cmd.invoke();
        setPaletteOpen(false);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-[900] flex items-start justify-center pt-[12vh]"
      style={{ background: 'rgba(15,23,42,0.18)', backdropFilter: 'blur(2px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) setPaletteOpen(false); }}
    >
      <div
        className="bg-surface border border-hairline shadow-none flex flex-col"
        style={{ width: 560, maxHeight: '60vh' }}
      >
        {/* Input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-hairline">
          <Search size={14} className="text-ink-4" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setCursor(0); }}
            onKeyDown={onKeyDown}
            placeholder="Search neighbourhoods, scenarios, lenses, actions…"
            className="flex-1 bg-transparent text-[14px] text-ink placeholder:text-ink-4 outline-none"
          />
          <span className="text-[10px] uppercase tracking-[0.12em] text-ink-4">Esc</span>
        </div>

        {/* Results */}
        <div className="overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-[12px] text-ink-3">No commands match.</div>
          ) : (
            <ul className="m-0 p-0 list-none">
              {filtered.map((cmd, i) => (
                <li key={cmd.id}>
                  <button
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => { cmd.invoke(); setPaletteOpen(false); }}
                    className={`w-full text-left px-4 py-2 flex items-center gap-3 cursor-pointer transition-colors
                      ${i === cursor ? 'bg-surface-2' : 'hover:bg-surface-2/60'}`}
                  >
                    <span className="text-ink-3 shrink-0">{cmd.icon}</span>
                    <span className="text-[13px] text-ink flex-1 truncate">{cmd.label}</span>
                    {cmd.hint && (
                      <span className="text-[11px] text-ink-4 tabular shrink-0">{cmd.hint}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-hairline flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-ink-4">
          <span>↑ ↓ navigate</span>
          <span>↵ invoke</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>
  );
}
