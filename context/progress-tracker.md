# Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

- Specification complete. Implementation not yet started in `project_threshold/`. An earlier prototype exists at `/Users/datta/Documents/Threshold` (Vite + JSX + Mapbox + Recharts, baseline/heatwave/ice_storm scenarios on static JSON). Used as a reference only — v2 is a fresh build in this repository.

## Current Goal

- Establish the ontology and the first end-to-end vertical slice: one real source → Neighbourhood entities → composite score → map render → detail panel → one recommendation card with traceable numbers.

## Completed

- Project context drafted: `project-overview.md`, `architecture.md`, `ai-workflow-rules.md`, `code-standards.md`, `ui-context.md`.
- Hackathon docs reviewed and stored under `docs/`: Opening Day slides, Theme 3 Challenge Set 03.
- Pipeline exploration notebook present at `pipeline/EDA.ipynb`.
- Reference prototype at `/Users/datta/Documents/Threshold` reviewed for UX patterns.

## In Progress

- None yet — implementation has not started in this repo.

## Next Up (ordered)

1. **Ontology stub** — define `Neighbourhood`, `Building`, `GridFeeder`, `Shelter`, `WeatherCell`, `PollutionSource` as pydantic models in `backend/app/ontology.py` and as TS types in `frontend/src/lib/ontology.ts`. Source-of-truth lives in `architecture.md`.
2. **Source mapping table** — produce a concrete table mapping every committed data source to the ontology entity and field it populates, with refresh tier (A/B/C). Lives in `context/` as a new file or as a section of `architecture.md`.
3. **First Tier A ingestion** — Toronto Open Data neighbourhood boundaries + StatsCan 2021 Census income → Neighbourhood entities written to `frontend/public/data/neighbourhoods.geojson`.
4. **Scoring engine v0** — port the weighted-composite logic from the reference prototype's `config.js` into `backend/app/services/scoring.py`. Three scenarios (Baseline, Heatwave, Ice Storm).
5. **Frontend scaffold** — Vite + React + TS + Tailwind + shadcn + Mapbox. Render the choropleth from the Tier A GeoJSON. Scenario switcher recolours.
6. **First ML model** — outage probability or vulnerability composite NN. Train in `pipeline/training/`, export ONNX to `backend/models/`, expose via FastAPI.
7. **Detail panel + recommendation card** — radar chart, factor bars, source citations, LLM briefing (Gemini), recommendation card with quantified inputs.
8. **Live overlay** — Environment Canada GeoMet weather as Tier C, toggle on the map.

## Open Questions

- **Outage data availability.** Toronto Hydro does not publish per-feeder historical outages cleanly. Decide before model training: scrape the outage map over the hackathon window, use OEB filings (PDFs), or train on a vulnerability-composite proxy instead.
- **ArcGIS vs Mapbox.** Default is Mapbox for speed and existing familiarity. Esri Canada is a sponsor — switching to ArcGIS Maps SDK would score points but costs time. Decision pending; safe to start on Mapbox and revisit if time permits.
- **DeepSeek critic layer.** Currently stretch. Confirm whether to ship the dual-LLM architecture in MVP or hold for Phase 2.
- **Backend host.** Fly.io vs Railway vs Vercel serverless. Depends on whether FastAPI + Postgres + ONNX fit cleanly in a single platform.
- **Pollution layer (PS3).** Stretch in MVP. If shipped, decide whether it's a 6th scoring factor or an overlay only.
- **Recommendation panel UX.** Slide-in from the right alongside the detail panel, or full-screen mode toggle? Affects information density in the demo.

## Architecture Decisions

- **Three-tier data architecture (A static, B daily, C live).** Adopted to be honest about data vintage. Static structural data is not faked as real-time, and live data is genuinely live.
- **Ontology-first.** All sources normalize to a shared spatial entity model before scoring or ML. This is the Palantir-style fusion move — it is what makes 20+ sources legible together.
- **Numbers from models, prose from LLMs.** Hard invariant. LLMs do not produce probabilities or scores. They wrap prose around model outputs.
- **Frontend computes nothing scored.** All scoring lives in the backend. Frontend renders.
- **Fresh TypeScript build in `frontend/`.** Old JSX prototype at `/Users/datta/Documents/Threshold` is reference only.
- **PyTorch for training, ONNX for inference.** Keeps backend dependency surface small.

## Session Notes

- Hackathon: Seneca Energy Hackathon 2026. Theme 3 (Community Energy, Equity & Sustainability), Challenge Set 03. All three problem statements in CS-03 are addressable by Threshold; PS1 and PS2 are MVP, PS3 stretch.
- Submission deadline: **2026-05-26 23:59 ET.** Qualifier judging 2026-05-27. Finals 2026-05-30.
- Sponsors to align with: Alectra (utility — grid edge, weather-driven outages), Esri Canada (Living Atlas, ArcGIS), Seneca Student Federation.
- Reference prototype lives at `/Users/datta/Documents/Threshold`. It uses Vite + React (JSX) + Mapbox GL + Recharts and renders three scenarios on static curated GeoJSON. Useful for UX patterns: tier colours, radar chart, scenario controls, detail panel. Not to be ported wholesale — v2 is the platform, not the demo.
- Existing reference data files at `/Users/datta/Documents/Threshold/data/`: `neighbourhoods.geojson`, `cooling_centres.json`, `demographics.json`, `dataset_metadata.json`. Vintage and source notes are useful starting points for the Tier A pipeline.
- The reference Vision and PRD docs at `/Users/datta/Downloads/Threshold_Master_Vision.docx` and `/Users/datta/Downloads/Threshold_PRD.docx` are stale relative to this v2 spec. They describe a static visualization tool, not a fusion platform. Use them only for the brand language (Vision §05 product philosophy, §09 UX philosophy, §10 brand identity).
