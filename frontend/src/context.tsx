import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Facility, Scenario, Tract, View } from './types';
import { loadData } from './dataLoader';
import { percentileMap, stressIndex } from './utils';
import {
  CADENCE,
  STALE_MULTIPLIER,
  fetchLiveWeather,
  fetchSimulatedWeather,
  fetchOutages,
  mergeOutages,
  mergeWeather,
  fetchBriefing,
  type FinanceSnapshot,
  type BriefingResult,
} from './liveData';
import { SCENARIO_PROFILE, simulateQuery } from './scenarios';
import { detectCityPatterns, type CityPattern } from './cityAnalysis';
import { advisoriesFor, type Advisory, type AdvisoryUrgency } from './advisories';
import type { FacilityKind } from './facilityDetails';
import {
  appendAudit, listAudit, readAnnotations, writeAnnotation, deleteAnnotation,
  readRestoration, writeRestoration,
  type AuditEntry, type Annotation, type RestorationState,
} from './auditLog';
import { equitySnapshot, restorationQueue, type EquitySnapshot, type RestorationCandidate } from './equity';
import { forecast, type ForecastPoint } from './forecast';
import type { Locale } from './i18n';
import { TENANTS, DEFAULT_TENANT_ID, applyTenantTheme, type TenantConfig } from './tenant';

export type Theme = 'light';
export type LayerKey = 'shelters' | 'outages' | 'advisories' | 'services' | 'hospitals' | 'ltc' | 'aqhi';
export type FeedKey = 'communities' | 'weather' | 'outages' | 'finance';
export type Lens = 'operator' | 'municipal' | 'community' | 'resident';

export const LENS_LABEL: Record<Lens, string> = {
  operator:  'Utility · Alectra',
  municipal: 'Municipal operations',
  community: 'Community network',
  resident:  'Resident view',
};

export const LENS_AUDIENCES: Record<Lens, Array<'resident' | 'community' | 'operator'>> = {
  operator:  ['operator', 'community', 'resident'],
  municipal: ['operator', 'community', 'resident'],
  community: ['community', 'resident', 'operator'],
  resident:  ['resident'],
};

/** A facility opened in the FacilityCard. Normalized across shelters + services. */
export interface OpenedFacility {
  id: string;
  name: string;
  kind: FacilityKind;
  lat: number;
  lng: number;
  address?: string;
  role?: string;
}

/** Per-tract summary of the advisory load. */
export interface AdvisoryRollup {
  ctuid: string;
  total: number;
  byUrgency: Record<AdvisoryUrgency, number>;
  /** Highest urgency observed in this tract's advisory set. */
  maxUrgency: AdvisoryUrgency | null;
  /** The headline of the single highest-priority advisory. */
  topHeadline: string | null;
  /** Number of operator-tier advisories (actionable by city/utility). */
  operatorActions: number;
}

export interface FeedStatus {
  lastSuccess: Date | null;
  lastAttempt: Date | null;
  inFlight: boolean;
  error: string | null;
  cadenceMs: number;
}

interface AppState {
  tracts: Tract[];
  facilities: Facility[];
  loading: boolean;
  error: string | null;
  selected: Tract | null;
  scenario: Scenario;
  view: View;
  theme: Theme;
  layers: Record<LayerKey, boolean>;
  watchlistOpen: boolean;
  percentiles: Map<string, number>;
  stress: number;
  cityPatterns: CityPattern[];
  advisoriesByTract: Map<string, Advisory[]>;
  rollupByTract: Map<string, AdvisoryRollup>;
  citywideCounts: { critical: number; elevated: number; routine: number; total: number; tractsAffected: number };
  feeds: Record<FeedKey, FeedStatus>;
  finance: FinanceSnapshot | null;

  /* ─── Stakeholder lens + institutional state ─── */
  lens: Lens;
  setLens: (l: Lens) => void;
  cycleLens: () => void;

  /* ─── UI surfaces ─── */
  paletteOpen: boolean;
  setPaletteOpen: (b: boolean) => void;
  methodologyOpen: boolean;
  setMethodologyOpen: (b: boolean) => void;

  /* ─── Pinned tracts (operator favourites) ─── */
  pinned: string[]; // ctuids, persisted to localStorage
  togglePin: (ctuid: string) => void;

  /* ─── Active facility card ─── */
  activeFacility: OpenedFacility | null;
  setActiveFacility: (f: OpenedFacility | null) => void;

  /* ─── New billion-dollar surfaces ─── */
  wallMode: boolean;
  setWallMode: (b: boolean) => void;

  situationReportOpen: boolean;
  setSituationReportOpen: (b: boolean) => void;

  replayOpen: boolean;
  setReplayOpen: (b: boolean) => void;
  replayPosition: number;          // 0-1 along the audit timeline
  setReplayPosition: (n: number) => void;

  crossJurisdictionOpen: boolean;
  setCrossJurisdictionOpen: (b: boolean) => void;

  locale: Locale;
  setLocale: (l: Locale) => void;

  forecastPoints: ForecastPoint[];

  tenant: TenantConfig;
  setTenant: (id: string) => void;

  /* ─── Smart scenario suggestion ─── */
  suggestedScenario: Scenario | null;
  dismissSuggestion: () => void;

  /* ─── AI briefing for selected tract ─── */
  briefing: BriefingResult | null;
  briefingLoading: boolean;
  briefingError: string | null;

  equity: EquitySnapshot;
  restoration: RestorationCandidate[];
  restorationState: RestorationState;
  setRestorationStatus: (ctuid: string, status: 'queued' | 'in-progress' | 'restored') => void;

  annotations: Record<string, Annotation>;
  setAnnotation: (ctuid: string, note: string) => void;
  removeAnnotation: (ctuid: string) => void;

  audit: AuditEntry[];
  logAudit: (entry: Omit<AuditEntry, 'id' | 'ts' | 'lens'>) => void;
  activityOpen: boolean;
  setActivityOpen: (b: boolean) => void;
  setSelected: (t: Tract | null) => void;
  setScenario: (s: Scenario) => void;
  setView: (v: View) => void;
  setTheme: (t: Theme) => void;
  toggleLayer: (k: LayerKey) => void;
  setWatchlistOpen: (b: boolean) => void;
  cycleScenario: () => void;
  refreshAll: () => void;
}

const SCENARIOS: Scenario[] = ['Baseline', 'Heatwave', 'Ice Storm'];
const LENS_CYCLE: Lens[] = ['operator', 'municipal', 'community', 'resident'];

const Ctx = createContext<AppState | null>(null);

function initFeed(cadenceMs: number): FeedStatus {
  return { lastSuccess: null, lastAttempt: null, inFlight: false, error: null, cadenceMs };
}

export function isStale(f: FeedStatus, now = Date.now()): boolean {
  if (!f.lastSuccess) return true;
  return now - f.lastSuccess.getTime() > f.cadenceMs * STALE_MULTIPLIER;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [tracts, setTracts] = useState<Tract[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelectedRaw] = useState<Tract | null>(null);
  const [scenario, setScenario] = useState<Scenario>('Baseline');
  const [view, setView] = useState<View>('Map');
  const [theme, setTheme] = useState<Theme>('light');
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    shelters: true,
    outages: true,
    advisories: true,
    services: false,
    hospitals: false,
    ltc: false,
    aqhi: false,
  });
  const [finance, setFinance] = useState<FinanceSnapshot | null>(null);
  const [feeds, setFeeds] = useState<Record<FeedKey, FeedStatus>>({
    communities: initFeed(Infinity),
    weather:     initFeed(CADENCE.weather),
    outages:     initFeed(CADENCE.outages),
    finance:     initFeed(CADENCE.finance),
  });

  /* ─── Stakeholder lens (URL-shareable) ─── */
  const [lens, setLensState] = useState<Lens>(() => {
    const q = new URLSearchParams(window.location.search).get('lens') as Lens | null;
    return (q && LENS_CYCLE.includes(q)) ? q : 'operator';
  });

  const setLens = (l: Lens) => {
    setLensState(l);
    const url = new URL(window.location.href);
    url.searchParams.set('lens', l);
    window.history.replaceState({}, '', url.toString());
    appendAudit({ lens: l, action: 'lens.change', targetLabel: LENS_LABEL[l] });
  };
  const cycleLens = () => setLens(LENS_CYCLE[(LENS_CYCLE.indexOf(lens) + 1) % LENS_CYCLE.length]);

  /* ─── Institutional state (localStorage-backed) ─── */
  const [annotations, setAnnotations] = useState<Record<string, Annotation>>(() => readAnnotations());
  const [restorationState, setRestorationState] = useState<RestorationState>(() => readRestoration());
  const [audit, setAudit] = useState<AuditEntry[]>(() => listAudit());
  const [activityOpenRaw, setActivityOpenRaw] = useState<boolean>(false);
  const [paletteOpen, setPaletteOpen] = useState<boolean>(false);
  const [methodologyOpen, setMethodologyOpen] = useState<boolean>(false);
  const [activeFacility, setActiveFacility] = useState<OpenedFacility | null>(null);
  const [wallMode, setWallMode] = useState<boolean>(false);
  const [situationReportOpen, setSituationReportOpen] = useState<boolean>(false);
  const [replayOpen, setReplayOpen] = useState<boolean>(false);
  const [replayPosition, setReplayPosition] = useState<number>(1);
  const [crossJurisdictionOpen, setCrossJurisdictionOpen] = useState<boolean>(false);
  const [localeRaw, setLocaleRaw] = useState<Locale>(() => {
    const q = new URLSearchParams(window.location.search).get('lang') as Locale | null;
    return (q && (q === 'en' || q === 'pa' || q === 'hi')) ? q : 'en';
  });
  const setLocale = (l: Locale) => {
    setLocaleRaw(l);
    const url = new URL(window.location.href);
    if (l === 'en') url.searchParams.delete('lang');
    else url.searchParams.set('lang', l);
    window.history.replaceState({}, '', url.toString());
  };
  const locale = localeRaw;
  const [tenantId, setTenantId] = useState<string>(() => {
    const q = new URLSearchParams(window.location.search).get('tenant');
    return (q && TENANTS[q]) ? q : DEFAULT_TENANT_ID;
  });
  const tenant = TENANTS[tenantId] ?? TENANTS[DEFAULT_TENANT_ID];

  // Apply tenant theme overrides on mount + change
  useEffect(() => { applyTenantTheme(tenant); }, [tenant]);

  const setTenant = (id: string) => {
    if (!TENANTS[id]) return;
    setTenantId(id);
    const url = new URL(window.location.href);
    url.searchParams.set('tenant', id);
    window.history.replaceState({}, '', url.toString());
  };

  const [pinned, setPinned] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('threshold.pinned.v1');
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const togglePin = (ctuid: string) => {
    setPinned(prev => {
      const next = prev.includes(ctuid) ? prev.filter(c => c !== ctuid) : [...prev, ctuid];
      try { localStorage.setItem('threshold.pinned.v1', JSON.stringify(next)); } catch { /* */ }
      return next;
    });
  };

  /* ─── AI briefing state ─── */
  const [briefing, setBriefing] = useState<BriefingResult | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingError, setBriefingError] = useState<string | null>(null);

  // Stable signature of the active layers so the effect only re-fires when
  // the set of visible layers actually changes (not on unrelated re-renders).
  const activeLayersSig = useMemo(
    () => Object.entries(layers).filter(([, v]) => v).map(([k]) => k).sort().join(','),
    [layers],
  );

  useEffect(() => {
    // Don't blank the briefing when the user deselects or switches tracts —
    // keep the last good briefing visible until the new fetch lands. The UI
    // checks briefing.ctuid against selected to know if it's stale.
    if (!selected) return;
    let cancelled = false;
    const ctrl = new AbortController();
    const activeLayers = activeLayersSig.split(',').filter(Boolean);

    const run = () => {
      setBriefingLoading(true);
      setBriefingError(null);
      fetchBriefing(selected.ctuid, scenario, activeLayers, ctrl.signal)
        .then(result => { if (!cancelled) { setBriefing(result); setBriefingLoading(false); } })
        .catch(e => {
          if (!cancelled && e?.name !== 'AbortError') {
            // On error keep the previous briefing visible — only surface the error string.
            setBriefingError(e?.message ?? 'briefing failed');
            setBriefingLoading(false);
          }
        });
    };

    run();
    // Hourly auto-refresh keeps the prediction current with live feeds.
    const id = setInterval(run, 60 * 60_000);
    return () => { cancelled = true; ctrl.abort(); clearInterval(id); };
  }, [selected?.ctuid, scenario, activeLayersSig]);

  // Smart scenario suggestion: when the live weather crosses an obvious
  // threshold but the operator is still in Baseline, surface a single quiet
  // banner offering a switch. Dismissible per session.
  const [suggestionDismissed, setSuggestionDismissed] = useState<Scenario | null>(null);
  const suggestedScenario: Scenario | null = (() => {
    if (scenario !== 'Baseline' || tracts.length === 0) return null;
    const medianHumidex = (() => {
      const s = [...tracts.map(t => t.humidex)].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)] ?? 0;
    })();
    const medianTemp = (() => {
      const s = [...tracts.map(t => t.temperature_c)].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)] ?? 0;
    })();
    if (medianHumidex >= 35 && suggestionDismissed !== 'Heatwave') return 'Heatwave';
    if (medianTemp <= -5 && suggestionDismissed !== 'Ice Storm') return 'Ice Storm';
    return null;
  })();
  const dismissSuggestion = () => setSuggestionDismissed(suggestedScenario);

  // Mutually exclusive: only one left-edge tray is visible at a time.
  const setActivityOpen = (b: boolean) => {
    setActivityOpenRaw(b);
    if (b) setWatchlistOpen(false);
  };
  // Wrap the existing watchlist setter so opening it closes activity.
  const setWatchlistOpenExclusive = (b: boolean) => {
    setWatchlistOpen(b);
    if (b) setActivityOpenRaw(false);
  };

  // Listen for audit events fired by helpers (so other tabs / direct calls update us).
  useEffect(() => {
    const onAudit = () => setAudit(listAudit());
    const onAnn = () => setAnnotations(readAnnotations());
    const onRest = () => setRestorationState(readRestoration());
    window.addEventListener('threshold:audit', onAudit);
    window.addEventListener('threshold:annotation', onAnn);
    window.addEventListener('threshold:restoration', onRest);
    return () => {
      window.removeEventListener('threshold:audit', onAudit);
      window.removeEventListener('threshold:annotation', onAnn);
      window.removeEventListener('threshold:restoration', onRest);
    };
  }, []);

  const logAudit = (entry: Omit<AuditEntry, 'id' | 'ts' | 'lens'>) => {
    appendAudit({ ...entry, lens });
  };

  const setAnnotation = (ctuid: string, note: string) => {
    const a: Annotation = { ctuid, note, lens, ts: Date.now() };
    writeAnnotation(a);
    logAudit({ action: 'tract.annotate', targetLabel: ctuid, ctuid, note });
  };
  const removeAnnotation = (ctuid: string) => deleteAnnotation(ctuid);

  const setRestorationStatus = (ctuid: string, status: 'queued' | 'in-progress' | 'restored') => {
    setRestorationState(prev => {
      const next = { ...prev };
      const current = next[ctuid];
      const sequence = current?.sequence ?? Object.keys(next).length + 1;
      next[ctuid] = { sequence, status, ts: Date.now() };
      writeRestoration(next);
      return next;
    });
    logAudit({
      action: status === 'restored' ? 'restoration.mark-restored' : 'restoration.sequence',
      targetLabel: ctuid,
      ctuid,
      note: status,
    });
  };

  /** Selected ref so polling can keep it in sync without re-running effects. */
  const selectedRef = useRef<Tract | null>(null);
  selectedRef.current = selected;

  const setSelected = (t: Tract | null) => setSelectedRaw(t);

  const updateFeed = (key: FeedKey, patch: Partial<FeedStatus>) => {
    setFeeds(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  /* ─── Initial boot ────────────────────────────────────── */

  useEffect(() => {
    updateFeed('communities', { inFlight: true, lastAttempt: new Date() });
    loadData()
      .then(({ tracts, facilities }) => {
        setTracts(tracts);
        setFacilities(facilities);
        updateFeed('communities', { inFlight: false, lastSuccess: new Date(), error: null });
      })
      .catch((e: Error) => {
        setError(e.message);
        updateFeed('communities', { inFlight: false, error: e.message });
      })
      .finally(() => setLoading(false));
  }, []);

  /* ─── Live pollers ────────────────────────────────────── */

  // Weather — 5 minutes. Scenario-aware: under Heatwave or Ice Storm the
  // simulate endpoint returns per-tract values calibrated to the event.
  useEffect(() => {
    if (loading || error) return;
    let cancelled = false;
    const ctrl = new AbortController();

    const run = async () => {
      updateFeed('weather', { inFlight: true, lastAttempt: new Date() });
      try {
        const sim = simulateQuery(scenario);
        const deltas = sim
          ? await fetchSimulatedWeather(sim, ctrl.signal)
          : await fetchLiveWeather(ctrl.signal);
        if (cancelled) return;
        setTracts(prev => {
          const next = mergeWeather(prev, deltas);
          const sel = selectedRef.current;
          if (sel) {
            const fresh = next.find(t => t.ctuid === sel.ctuid);
            if (fresh && fresh !== sel) setSelectedRaw(fresh);
          }
          return next;
        });
        updateFeed('weather', { inFlight: false, lastSuccess: new Date(), error: null });
      } catch (e: any) {
        if (cancelled || e?.name === 'AbortError') return;
        updateFeed('weather', { inFlight: false, error: e?.message ?? 'weather fetch failed' });
      }
    };

    run();
    const id = setInterval(run, CADENCE.weather);
    return () => { cancelled = true; ctrl.abort(); clearInterval(id); };
  }, [loading, error, scenario]);

  // Apply scenario weather profile to tracts immediately on scenario change —
  // no waiting for the next poll. Falls through to live values for Baseline.
  useEffect(() => {
    const profile = SCENARIO_PROFILE[scenario];
    if (!profile) return; // Baseline — use whatever is in the tracts state
    setTracts(prev => prev.map(t => ({
      ...t,
      temperature_c:    profile.temperature_c,
      humidex:          profile.humidex,
      precipitation_mm: profile.precipitation_mm,
      wind_speed_kmh:   profile.wind_speed_kmh,
      wind_gusts_kmh:   profile.wind_gusts_kmh,
      weather_code:     profile.weather_code,
    })));
  }, [scenario]);

  // Outages — 2 minutes
  useEffect(() => {
    if (loading || error) return;
    let cancelled = false;
    const ctrl = new AbortController();

    const run = async () => {
      updateFeed('outages', { inFlight: true, lastAttempt: new Date() });
      try {
        const collection = await fetchOutages(ctrl.signal);
        if (cancelled) return;
        setTracts(prev => {
          const next = mergeOutages(prev, collection);
          const sel = selectedRef.current;
          if (sel) {
            const fresh = next.find(t => t.ctuid === sel.ctuid);
            if (fresh && fresh !== sel) setSelectedRaw(fresh);
          }
          return next;
        });
        updateFeed('outages', { inFlight: false, lastSuccess: new Date(), error: null });
      } catch (e: any) {
        if (cancelled || e?.name === 'AbortError') return;
        updateFeed('outages', { inFlight: false, error: e?.message ?? 'outage fetch failed' });
      }
    };

    run();
    const id = setInterval(run, CADENCE.outages);
    return () => { cancelled = true; ctrl.abort(); clearInterval(id); };
  }, [loading, error]);


  /* ─── Derived ─────────────────────────────────────────── */

  const percentiles  = useMemo(() => percentileMap(tracts, scenario), [tracts, scenario]);
  const stress       = useMemo(() => stressIndex(tracts, scenario), [tracts, scenario]);
  const cityPatterns = useMemo(() => detectCityPatterns(tracts, scenario), [tracts, scenario]);

  /* ─── Citywide advisory engine ─────────────────────────── */
  const advisoriesByTract = useMemo(() => {
    const m = new Map<string, Advisory[]>();
    for (const t of tracts) m.set(t.ctuid, advisoriesFor(t, scenario, finance));
    return m;
  }, [tracts, scenario, finance]);

  const rollupByTract = useMemo(() => {
    const m = new Map<string, AdvisoryRollup>();
    advisoriesByTract.forEach((list, ctuid) => {
      const byUrgency = { critical: 0, elevated: 0, routine: 0 } as Record<AdvisoryUrgency, number>;
      let top: Advisory | null = null;
      let operatorActions = 0;
      for (const a of list) {
        byUrgency[a.urgency] += 1;
        if (a.audience === 'operator') operatorActions += 1;
        if (!top) top = a; // list is already urgency-sorted by advisoriesFor()
      }
      const maxUrgency: AdvisoryUrgency | null =
        byUrgency.critical > 0 ? 'critical' :
        byUrgency.elevated > 0 ? 'elevated' :
        byUrgency.routine  > 0 ? 'routine'  : null;
      m.set(ctuid, {
        ctuid,
        total: list.length,
        byUrgency,
        maxUrgency,
        topHeadline: top?.headline ?? null,
        operatorActions,
      });
    });
    return m;
  }, [advisoriesByTract]);

  const equity         = useMemo(() => equitySnapshot(tracts), [tracts]);
  const restoration    = useMemo(() => restorationQueue(tracts), [tracts]);
  const forecastPoints = useMemo(() => forecast(tracts, scenario), [tracts, scenario]);

  const citywideCounts = useMemo(() => {
    let critical = 0, elevated = 0, routine = 0, tractsAffected = 0;
    rollupByTract.forEach(r => {
      critical += r.byUrgency.critical;
      elevated += r.byUrgency.elevated;
      routine  += r.byUrgency.routine;
      if (r.total > 0) tractsAffected += 1;
    });
    return { critical, elevated, routine, total: critical + elevated + routine, tractsAffected };
  }, [rollupByTract]);

  const toggleLayer = (k: LayerKey) => setLayers(prev => ({ ...prev, [k]: !prev[k] }));
  const cycleScenario = () => {
    const i = SCENARIOS.indexOf(scenario);
    setScenario(SCENARIOS[(i + 1) % SCENARIOS.length]);
  };

  /** Force a refresh of all live feeds — used by the manual refresh affordance. */
  const refreshAll = () => {
    Promise.allSettled([
      fetchLiveWeather().then(d => setTracts(p => mergeWeather(p, d))).then(
        () => updateFeed('weather', { inFlight: false, lastSuccess: new Date(), error: null }),
        e => updateFeed('weather', { inFlight: false, error: e?.message ?? 'weather failed' }),
      ),
      fetchOutages().then(c => setTracts(p => mergeOutages(p, c))).then(
        () => updateFeed('outages', { inFlight: false, lastSuccess: new Date(), error: null }),
        e => updateFeed('outages', { inFlight: false, error: e?.message ?? 'outages failed' }),
      ),
    ]);
  };

  return (
    <Ctx.Provider value={{
      tracts, facilities, loading, error, selected, scenario, view, theme,
      layers, watchlistOpen, percentiles, stress, cityPatterns,
      advisoriesByTract, rollupByTract, citywideCounts,
      feeds, finance,
      lens, setLens, cycleLens,
      paletteOpen, setPaletteOpen,
      methodologyOpen, setMethodologyOpen,
      pinned, togglePin,
      activeFacility, setActiveFacility,
      wallMode, setWallMode,
      situationReportOpen, setSituationReportOpen,
      replayOpen, setReplayOpen,
      replayPosition, setReplayPosition,
      crossJurisdictionOpen, setCrossJurisdictionOpen,
      locale, setLocale,
      forecastPoints,
      tenant, setTenant,
      suggestedScenario, dismissSuggestion,
      briefing, briefingLoading, briefingError,
      equity, restoration, restorationState, setRestorationStatus,
      annotations, setAnnotation, removeAnnotation,
      audit, logAudit,
      activityOpen: activityOpenRaw, setActivityOpen,
      setSelected, setScenario, setView, setTheme, toggleLayer,
      setWatchlistOpen: setWatchlistOpenExclusive,
      cycleScenario, refreshAll,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be inside AppProvider');
  return ctx;
}
