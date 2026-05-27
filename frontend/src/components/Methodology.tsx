import React from 'react';
import { X } from 'lucide-react';
import { useApp } from '../context';

/**
 * Methodology overlay — a calm reading surface that explains the engine.
 *
 * Opened with `?` or from the command palette. Designed to be linkable,
 * printable, and defensible to a council member who reads it in a hallway.
 */
export default function Methodology() {
  const { methodologyOpen, setMethodologyOpen } = useApp();
  if (!methodologyOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[850] flex items-start justify-center pt-[6vh] pb-[6vh] px-4 overflow-y-auto"
      style={{ background: 'rgba(15,23,42,0.30)', backdropFilter: 'blur(3px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) setMethodologyOpen(false); }}
    >
      <article
        className="bg-surface border border-hairline w-full"
        style={{ maxWidth: 720 }}
      >
        {/* Header */}
        <header className="px-6 py-4 border-b border-hairline flex items-baseline justify-between sticky top-0 bg-surface">
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-ink-3">Methodology · v0.2</div>
            <h1 className="text-[20px] font-medium tracking-tight mt-1">How Threshold derives its intelligence</h1>
          </div>
          <button
            onClick={() => setMethodologyOpen(false)}
            className="text-ink-3 hover:text-ink transition-colors cursor-pointer"
            aria-label="Close methodology"
          >
            <X size={16} />
          </button>
        </header>

        <div className="px-6 py-5 text-[14px] text-ink-2 leading-[1.7]">
          <p className="mb-4">
            Threshold is a deterministic civic intelligence layer. Every advisory it surfaces is derived from a named threshold being crossed in public data, conditioned by the active scenario and the operator's active stakeholder lens. No language model is invoked in the production of any advisory, recommendation, score, or narrative shown in this product.
          </p>

          <Section title="The composite stress index">
            <p>
              Each Census Tract receives a composite stress score on a 0–100 scale, computed offline by the pipeline (<code className="font-mono text-[12px] text-ink">python -m app.pipeline</code>). The score is the result of principal component analysis across four CISV vulnerability dimensions — racialized &amp; immigration, income &amp; labour, education &amp; Indigenous, dwelling conditions — combined with built-environment exposure factors (pre-1980 housing share, renter share, low-income share) and the CISR resilience score.
            </p>
            <p className="mt-3">
              Three scores are persisted per tract — <code className="font-mono text-[12px] text-ink">threshold_score_baseline</code>, <code className="font-mono text-[12px] text-ink">threshold_score_heatwave</code>, <code className="font-mono text-[12px] text-ink">threshold_score_icestorm</code> — using scenario-specific PCA loadings. The choropleth always displays the score appropriate to the active scenario.
            </p>
          </Section>

          <Section title="The percentile-keyed ramp">
            <p>
              The choropleth colour is not bound to the absolute score. It is bound to each tract's percentile rank within the active scenario. Six stops — `Baseline`, `Elevated`, `Moderate`, `High`, `Critical`, `Severe` — map to a single-hue sequential ramp from `#EFEAE0` (indistinguishable from canvas) to `#7C2D12` (deep ember). Most of the city reads as canvas; vulnerability emerges, it is never declared.
            </p>
          </Section>

          <Section title="Live data sources, with cadences">
            <ul className="list-disc pl-5 mt-2 mb-2 space-y-1">
              <li><strong className="text-ink">Census · Statistics Canada 2021.</strong> Loaded once at boot. Updated when the pipeline rebuilds.</li>
              <li><strong className="text-ink">Weather · Open-Meteo current conditions.</strong> Polled every 5 minutes via the backend proxy. When a non-Baseline scenario is active, the simulate endpoint returns scenario-conditioned values calibrated to a representative real event.</li>
              <li><strong className="text-ink">Outages · Alectra ArcGIS live feed.</strong> Polled every 2 minutes; spatially joined to tract centroids client-side via ray-casting point-in-polygon.</li>
              <li><strong className="text-ink">Finance · Ontario Energy Board RPP + Bank of Canada CPI.</strong> Polled every 60 minutes.</li>
              <li><strong className="text-ink">Facilities · City of Brampton registry.</strong> Loaded once at boot.</li>
            </ul>
            <p>
              Each source's freshness is displayed in the status strip with a small status indicator. A source that has not refreshed within 2.5× its cadence is marked stale.
            </p>
          </Section>

          <Section title="The advisory engine">
            <p>
              The Preparedness Intelligence layer is a small expert system. Each rule is a named threshold cross over the tract's measured values, the active scenario, and the live finance snapshot. When a rule fires, it emits a structured advisory carrying its evidence — the exact values that triggered it and the dataset each value came from.
            </p>
            <p className="mt-3">
              Rules are tagged by audience (resident, community, operator) and by urgency (routine, elevated, critical). The dispatch card partitions them by audience; the active lens controls the order in which audiences are surfaced. Operator-tier advisories carry quantified impact estimates — projected vulnerability delta, population reached, cost per day, time to effect, responsible authority, confidence — for operations and capital-planning use.
            </p>
            <p className="mt-3">
              Rule catalog version 1 ships with 16 rules across three audiences plus 4 city-wide spatial pattern detectors (cooling deserts, vulnerable-senior low-access clusters, outage corridors, renter-pressure zones). Each rule's parameters are versioned; the rule version that produced any past advisory is reconstructible from the audit log.
            </p>
          </Section>

          <Section title="What Threshold does NOT model">
            <ul className="list-disc pl-5 mt-2 mb-2 space-y-1">
              <li>Real-time SAIDI / SAIFI. The EWEI snapshot is an instantaneous equity-weighted exposure measure, not a duration-integrated reliability metric. Proper SAIDI accumulates over months of history.</li>
              <li>Individual residents or households. All data is aggregated to the Census Tract level.</li>
              <li>Predictive forecasting beyond the active scenario. Future versions will calibrate rule thresholds against accumulated history.</li>
              <li>Personally identifiable information of any kind.</li>
            </ul>
          </Section>

          <Section title="Versioning, provenance, audit">
            <p>
              Every numeric value displayed in this product can be traced to a named public dataset with a stable URL. Every operator action — tract selected, scenario changed, lens changed, restoration sequenced, intervention flagged, brief exported, note saved — is recorded to the operational ledger with timestamp, lens, action, target, and operator note. The ledger persists locally in v1 and ports cleanly to a server-side store in v2.
            </p>
            <p className="mt-3">
              Every printable incident brief is stamped with the engine version, rule catalog version, and dataset vintages. A brief printed today is reproducible by someone reading it in fourteen months.
            </p>
          </Section>

          <footer className="mt-6 pt-4 border-t border-hairline text-[11px] text-ink-4 leading-relaxed">
            Threshold v0.2 · Rule catalog v1 · 16 advisory rules · 4 city-pattern detectors.
            Pipeline build date: {new Date().toISOString().slice(0, 10)}.
            Methodology document last revised: {new Date().toISOString().slice(0, 10)}.
            For questions, contact the platform team.
          </footer>
        </div>
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="text-[11px] uppercase tracking-[0.14em] text-ink-3 mb-2">{title}</h2>
      <div className="text-ink-2">{children}</div>
    </section>
  );
}
