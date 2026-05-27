import React, { useEffect } from 'react';
import { AppProvider, useApp } from './context';
import TopBar from './components/TopBar';
import LayerRail from './components/LayerRail';
import StatusStrip from './components/StatusStrip';
import MapPanel from './components/MapPanel';
import LeftPanel from './components/LeftPanel';
import RightPanel from './components/RightPanel';
import ActivityTray from './components/ActivityTray';
import ResidentView from './components/ResidentView';
import IntelligencePanel from './components/IntelligencePanel';
import CommandPalette from './components/CommandPalette';
import Methodology from './components/Methodology';
import SuggestionBanner from './components/SuggestionBanner';
import FacilityCard from './components/FacilityCard';
import WallDisplay from './components/WallDisplay';
import SituationReport from './components/SituationReport';
import DecisionReplay from './components/DecisionReplay';
import CrossJurisdiction from './components/CrossJurisdiction';
import ForecastWidget from './components/ForecastWidget';

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}

function Canvas() {
  const {
    loading, error, setSelected,
    cycleScenario,
    setWatchlistOpen, watchlistOpen,
    setActivityOpen, activityOpen,
    paletteOpen, setPaletteOpen,
    methodologyOpen, setMethodologyOpen,
    activeFacility, setActiveFacility,
    wallMode, setWallMode,
    situationReportOpen, setSituationReportOpen,
    replayOpen, setReplayOpen,
    crossJurisdictionOpen, setCrossJurisdictionOpen,
  } = useApp();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Cmd-K / Ctrl-K — palette (works anywhere)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(!paletteOpen);
        return;
      }
      if (isEditable(e.target)) return;

      // Esc walks the dismissal stack.
      if (e.key === 'Escape') {
        if (paletteOpen) return setPaletteOpen(false);
        if (methodologyOpen) return setMethodologyOpen(false);
        if (situationReportOpen) return setSituationReportOpen(false);
        if (crossJurisdictionOpen) return setCrossJurisdictionOpen(false);
        if (replayOpen) return setReplayOpen(false);
        if (activeFacility) return setActiveFacility(null);
        if (wallMode) return setWallMode(false);
        if (activityOpen) return setActivityOpen(false);
        if (watchlistOpen) return setWatchlistOpen(false);
        setSelected(null);
        return;
      }

      // While a modal overlay is open, suspend the global keyboard map.
      // Otherwise typing capital letters etc. cycles scenarios in the background.
      const overlayOpen = methodologyOpen || situationReportOpen
        || crossJurisdictionOpen || replayOpen || !!activeFacility;
      if (overlayOpen) return;

      if (e.key === ' ') {
        e.preventDefault();
        cycleScenario();
        return;
      }
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        setMethodologyOpen(true);
        return;
      }
      if (e.key === 'R' && e.shiftKey) {
        setReplayOpen(true);
        return;
      }
      if (e.key.toLowerCase() === 'r' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        setSituationReportOpen(true);
        return;
      }
      if (e.key === 'C' && e.shiftKey) {
        setCrossJurisdictionOpen(true);
        return;
      }
      if (e.key.toLowerCase() === 'f' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        setWallMode(!wallMode);
        return;
      }
      if (e.key.toLowerCase() === 'w' && !e.metaKey && !e.ctrlKey) {
        setWatchlistOpen(!watchlistOpen);
        if (!watchlistOpen) setActivityOpen(false);
        return;
      }
      if (e.key.toLowerCase() === 'a' && !e.metaKey && !e.ctrlKey) {
        setActivityOpen(!activityOpen);
        if (!activityOpen) setWatchlistOpen(false);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    setSelected, cycleScenario,
    watchlistOpen, setWatchlistOpen,
    activityOpen, setActivityOpen,
    paletteOpen, setPaletteOpen,
    methodologyOpen, setMethodologyOpen,
    activeFacility, setActiveFacility,
    wallMode, setWallMode,
    situationReportOpen, setSituationReportOpen,
    replayOpen, setReplayOpen,
    crossJurisdictionOpen, setCrossJurisdictionOpen,
  ]);

  if (loading) return (
    <div className="flex-1 flex items-center justify-center bg-canvas">
      <div className="text-[10px] uppercase tracking-[0.16em] text-ink-3">Loading civic data</div>
    </div>
  );

  if (error) return (
    <div className="flex-1 flex items-center justify-center bg-canvas">
      <div className="text-[12px] text-alert border border-alert/40 px-4 py-3" style={{ background: 'rgba(154,52,18,0.04)' }}>
        {error}
      </div>
    </div>
  );

  return (
    <div className="flex-1 relative overflow-hidden">
      {/* Base layer: map fills everything */}
      <div className="absolute inset-0 flex flex-col">
        <MapPanel />
        <ForecastWidget />
        <SuggestionBanner />
      </div>

      {/* Floating panels — all absolutely positioned over the map */}
      <LayerRail />
      <LeftPanel />
      <RightPanel />
      <IntelligencePanel />
      <ActivityTray />

      {/* Full-screen overlay modals */}
      <CommandPalette />
      <Methodology />
      <FacilityCard />
      <SituationReport />
      <DecisionReplay />
      <CrossJurisdiction />
    </div>
  );
}

function Shell() {
  const { lens, wallMode } = useApp();

  if (wallMode) {
    return (
      <div data-theme="light" className="flex flex-col h-screen bg-canvas text-ink">
        <WallDisplay />
        <CommandPalette />
        <Methodology />
        <SituationReport />
        <DecisionReplay />
      </div>
    );
  }

  if (lens === 'resident') {
    return (
      <>
        <ResidentView />
        <CommandPalette />
        <Methodology />
        <FacilityCard />
      </>
    );
  }
  return (
    <div data-theme="light" className="flex flex-col h-screen bg-canvas text-ink">
      <TopBar />
      <Canvas />
      <StatusStrip />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
