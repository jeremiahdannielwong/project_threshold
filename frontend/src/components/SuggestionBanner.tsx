import React from 'react';
import { X, ArrowRight } from 'lucide-react';
import { useApp } from '../context';

/**
 * SuggestionBanner — surfaces when current weather has crossed a scenario
 * threshold but the operator is still in Baseline. Dismissible per session;
 * dismissal applies only to the currently-suggested scenario.
 */
export default function SuggestionBanner() {
  const { suggestedScenario, setScenario, dismissSuggestion, logAudit } = useApp();
  if (!suggestedScenario) return null;

  const accept = () => {
    setScenario(suggestedScenario);
    logAudit({ action: 'scenario.change', targetLabel: suggestedScenario, note: 'accepted suggestion' });
  };

  return (
    // Outer div spans the horizontal gap between ForecastWidget (right edge ≈ 276px)
    // and WeatherStation (left edge ≈ 228px from right). Inner div self-centers within
    // that space so the banner never bleeds over either widget.
    <div
      className="absolute z-[680] flex items-center justify-center"
      style={{ top: 14, left: 244, right: 16, pointerEvents: 'none' }}
    >
    <div
      className="flex items-center gap-3 bg-surface border border-hairline px-3 py-2"
      style={{ pointerEvents: 'auto' }}
    >
      <span
        className="text-[10px] uppercase tracking-[0.14em]"
        style={{ color: suggestedScenario === 'Heatwave' ? 'var(--alert)' : 'var(--positive)' }}
      >
        Live conditions suggest
      </span>
      <span className="text-[13px] text-ink">{suggestedScenario} scenario</span>
      <button
        onClick={accept}
        className="ml-2 flex items-center gap-1 text-[11px] uppercase tracking-[0.1em] text-ink hover:bg-surface-2 border border-ink-3 hover:border-ink px-2 h-6 cursor-pointer transition-colors"
      >
        Apply <ArrowRight size={10} />
      </button>
      <button
        onClick={dismissSuggestion}
        className="text-ink-3 hover:text-ink cursor-pointer transition-colors"
        aria-label="Dismiss suggestion"
      >
        <X size={12} />
      </button>
    </div>
    </div>
  );
}
