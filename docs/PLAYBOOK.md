# Project Threshold — Master Playbook

**Version:** 1.0
**Generated:** 2026-05-25
**Deadline:** 2026-05-26 23:59 ET (Seneca Energy Hackathon 2026)
**Status:** Operational — Data pipeline complete. Application layer in build.

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [System Overview](#2-system-overview)
3. [Architecture Summary](#3-architecture-summary)
4. [Team Responsibilities](#4-team-responsibilities)
   - [Engineering](#41-engineering-responsibilities)
   - [Frontend](#42-frontend-responsibilities)
   - [Backend](#43-backend-responsibilities)
   - [AI / Data](#44-aidata-responsibilities)
   - [Infrastructure](#45-infrastructure-responsibilities)
   - [Demo](#46-demo-responsibilities)
5. [Deployment Flow](#5-deployment-flow)
6. [Development Workflow](#6-development-workflow)
7. [Branching Strategy](#7-branching-strategy)
8. [Testing Strategy](#8-testing-strategy)
9. [Risk Areas](#9-risk-areas)
10. [Known Technical Debt](#10-known-technical-debt)
11. [Demo-Day Critical Paths](#11-demo-day-critical-paths)
12. [MVP Priorities](#12-mvp-priorities)
13. [Post-Hackathon Roadmap](#13-post-hackathon-roadmap)
14. [Scaling Opportunities](#14-scaling-opportunities)
15. [Suggested Operational Improvements](#15-suggested-operational-improvements)
16. [Suggested Future Enhancements](#16-suggested-future-enhancements)

---

## 1. Product Overview

**Threshold** is a civic data fusion platform for community energy vulnerability. It ingests structural, seasonal, and real-time data — siloed across Alectra Utilities, the City of Brampton, Statistics Canada, and Environment Canada — normalises them into a shared spatial ontology, and produces traceable, quantitative vulnerability assessments and recommendations that emergency managers, utility planners, and community organisations can act on.

**The product is a dark, mission-control choropleth** of Brampton's 122 Census Tracts, coloured by a Threshold Vulnerability Score derived from 10 data factors across three scenario modes: Baseline, Heatwave, and Ice Storm.

**Product axiom (architectural constraint, not marketing):**
> Every recommendation Threshold makes is traceable to a number, and every number is traceable to a public dataset.

LLMs write prose around numbers — they never invent them. ML models produce numbers — they cite the data they trained on. The map renders numbers — any colour can be traced to its source in two clicks or fewer.

**Target users:**
- Municipal emergency managers (pre-positioning resources before climate events)
- Utility operations planners (Alectra — equity-weighted outage restoration prioritisation)
- Community organisation program directors (energy poverty outreach targeting)

**Sponsor alignment:**
- Alectra Utilities — live outage feed is Tier C data; product demonstrates what their ArcGIS Hub data enables when fused with civic data
- Esri Canada — primary ingestion mechanism is ArcGIS REST throughout the pipeline

**Pitch sentence:** *"Threshold is the community equity and vulnerability layer that Alectra's innovation portfolio doesn't have yet, built on Esri Canada infrastructure."*

**Hackathon context:**
- Competition: Seneca Energy Hackathon 2026
- Theme: 3 — Community Energy, Equity and Sustainability
- Challenge Set: 03, Problem Statements 1, 2, and 3
- Deadline: 2026-05-26 23:59 ET

---

## 2. System Overview

The system has three independent layers that communicate through files and APIs — they are never coupled at runtime.

```
┌─────────────────────────────────────────────────────────┐
│  pipeline/EDA.ipynb                                     │
│  (Python: pandas, geopandas, scikit-learn, httpx)       │
│  Ingests 9 public APIs → spatial joins → PCA scoring    │
│  Output: brampton_full.geojson, brampton_facilities.geojson │
└───────────────────────┬─────────────────────────────────┘
                        │ writes GeoJSON files
          ┌─────────────▼──────────────────────────────┐
          │  frontend/public/data/                     │
          │  Tier A flat GeoJSON (baked at deploy time)│
          └─────────────┬──────────────────────────────┘
                        │ HTTP
┌───────────────────────▼──────────────────────────────┐
│  User Browser (Vercel CDN — static SPA)              │
│  React 18 + TypeScript + Vite                        │
│  Mapbox GL JS  ·  Recharts  ·  Tailwind + shadcn/ui  │
└───────────────────────┬──────────────────────────────┘
                        │ HTTP REST
          ┌─────────────▼──────────────────────────────┐
          │  Fly.io (FastAPI — Python 3.11+)           │
          │  /api/communities  /api/outages            │
          │  /api/briefing  /api/weather               │
          │  /api/recommendations                      │
          └─────────────┬──────────────────────────────┘
                        │ SQL
          ┌─────────────▼──────────────────────────────┐
          │  PostgreSQL + PostGIS (persistent volume)  │
          │  Tier B seasonal tables                    │
          │  Tier C outage archive                     │
          └────────────────────────────────────────────┘
```

**Three-tier data model:**

| Tier | Refresh | Storage | Examples |
|------|---------|---------|---------|
| A — Structural | Yearly / per pipeline run | Flat GeoJSON in repo, deployed with frontend | StatsCan CT boundaries, CISV/CISR, Brampton 2021 Census |
| B — Seasonal | Daily cron | PostgreSQL + PostGIS | Open-Meteo weather, Brampton facilities |
| C — Live | 5–15 min polling | In-memory + Postgres archive | Alectra live outages, weather advisories |

**Current build state (2026-05-25):**
- Pipeline (Tier A + B data, PCA scoring): COMPLETE and verified
- FastAPI backend: NOT STARTED
- React frontend: NOT STARTED
- Deployment: NOT STARTED
- ~24 hours remain to build and ship the application layer

---

## 3. Architecture Summary

### Stack

| Layer | Technology | Role |
|-------|-----------|------|
| Frontend | React 18 + TypeScript + Vite | Map UI, scenario controls, detail panel, recommendation panel |
| UI Styling | Tailwind CSS + shadcn/ui | Dark mission-control design system |
| Map | Mapbox GL JS | Choropleth, overlays, hover/click interactions |
| Charts | Recharts | Radar chart, factor bars in detail panel |
| Backend | FastAPI (Python 3.11+) | API surface, LLM orchestration, Tier C live endpoints |
| ML | scikit-learn (PCA) + ONNX | Scoring engine, portable inference |
| LLM Primary | Gemini 2.x | Briefing synthesis — prose wrapping pre-computed numbers |
| LLM Critic | DeepSeek R1/V3 | Chain-of-thought critique (stretch goal) |
| Pipeline | Python — pandas, geopandas, httpx | Ingest, normalise, spatial joins, scoring, write GeoJSON |
| Storage A | Flat GeoJSON (repo) | Structural ontology, baked at build time |
| Storage B/C | PostgreSQL + PostGIS | Seasonal cache, live outage archive |
| Frontend Host | Vercel | Static SPA + CDN |
| Backend Host | Fly.io | FastAPI service with persistent volume |

### Data File Map

| File | Location | CTs | Purpose |
|------|----------|-----|---------|
| `brampton_full.geojson` | `pipeline/data/` → `frontend/public/data/` | 122 | Primary app dataset — all Brampton CTs, all scores, all fields |
| `brampton_facilities.geojson` | `pipeline/data/` → `frontend/public/data/` | — | 45 cooling/warming centre point locations |
| `master_cts.geojson` | `pipeline/data/` | 569 | All Alectra-territory CTs (Brampton real, others partial) |
| `loadings.csv` | `pipeline/data/` | — | PCA factor loadings for all 3 scenarios |
| `real_cisr_cisv.csv` | `pipeline/data/` | 1,432 | StatsCan CISV + CISR for all Ontario CTs |
| `weather_ct.csv` | `pipeline/data/` | 684 | Current weather per CT centroid |

### System Invariants (non-negotiable)

1. **Numbers from models, prose from LLMs.** LLMs never output probabilities, scores, or projections they did not receive as numeric input.
2. **Every score traceable in ≤2 clicks** to input numbers and source datasets.
3. **Pipeline work does not happen in the request path.** Ingestion and scoring run in `pipeline/`.
4. **Tier A data is immutable per deploy.** Regenerated by pipeline run, never written at runtime.
5. **Frontend computes nothing scored.** All scoring in the backend.
6. **Sources are first-class.** Every persisted entity row records source slug and vintage.
7. **Honest data vintage.** Real-time means real-time. Annual means annual.
8. **Community = Census Tract.** Municipal neighbourhood labels are overlays only.

### Scoring Engine

- Method: Principal Component Analysis (PCA), PC1 rescaled 0–100
- Input: 10 factors (CISV score, CISV dims 1–4, pct_pre1980, pct_renters, humidex, CISR score, median_income)
- PC1 explained variance: ~35% across 122 Brampton CTs
- Scenarios: Baseline (equal weights), Heatwave (humidex ×2.5, pct_renters ×1.2), Ice Storm (active_outages ×3.0, customers_affected ×2.0, pct_renters ×1.5)
- Risk buckets: Low (0–25), Moderate (25–50), High (50–75), Critical (75–100)

### API Contracts

All response payloads use the wrapper `{ data, sources, generated_at }`. Entity IDs are string slugs. Scores are floats in [0, 100]. Tiers are `"Critical" | "High" | "Moderate" | "Low"`. Timestamps are ISO 8601 with timezone.

### Environment Variables Required

| Variable | Service | Notes |
|---------|---------|-------|
| `GEMINI_API_KEY` | Fly.io backend | Gemini 2.x API |
| `DATABASE_URL` | Fly.io backend | PostgreSQL connection string |
| `MAPBOX_TOKEN` | Vercel frontend | Mapbox GL JS rendering |

---

## 4. Team Responsibilities

### 4.1 Engineering Responsibilities

- Read all context files in `context/` before writing any code
- One feature unit at a time — a unit is a vertical slice that produces something user-visible
- Do not cross folder boundaries (`frontend/`, `backend/`, `pipeline/`) in a single commit unless cross-cutting
- Verify every unit end-to-end before marking complete: frontend builds, backend boots, notebook runs top-to-bottom
- Keep `context/progress-tracker.md` updated in the same commit as the implementation change
- The product axiom overrides every other implementation instinct

### 4.2 Frontend Responsibilities

**Stack:** React 18 + TypeScript (strict mode) + Vite + Tailwind CSS + shadcn/ui + Mapbox GL JS + Recharts + Lucide React

**Owns:**
- Mapbox GL choropleth of all 122 Brampton CTs, dark theme, four-tier colour ramp
- Scenario switcher (Baseline / Heatwave / Ice Storm) — client-side recolour under 200ms
- Detail panel (radar chart, factor bars, source citations, LLM briefing)
- Recommendation panel (ranked cards per CT)
- Overlay toggles (outages, facilities, weather, advisories)
- Sidebar top-10 list

**Does NOT own:**
- Score computation (backend)
- Data ingestion (pipeline)
- LLM calls (backend proxies to Gemini)

**Code rules:**
- `"strict": true` in `tsconfig.json`, no `any`
- Validate all backend data with Zod before trusting it
- Functional components and hooks only
- Throttle/debounce all map hover handlers
- Reference CSS custom properties — never hardcoded hex values
- Dark theme only; no light-mode variants
- Components live in `frontend/src/components/` (PascalCase, one per file)
- Pure utilities in `frontend/src/lib/`, custom hooks in `frontend/src/hooks/`

**File paths:**
- Components: `frontend/src/components/`
- UI primitives: `frontend/src/components/ui/` (shadcn-generated, do not hand-edit)
- Tier A GeoJSON: `frontend/public/data/` (deployed with app, served from Vercel CDN)

**Performance targets:**
- Initial map render: < 3 seconds on LTE
- Scenario recolour: < 200ms (client-side only, no network call)
- Detail panel open: < 500ms
- LLM briefing: < 10 seconds (streaming SSE)
- Overlay toggle: < 2 seconds

### 4.3 Backend Responsibilities

**Stack:** FastAPI (Python 3.11+) + pydantic v2 + httpx + ONNX Runtime + PostgreSQL + PostGIS

**Owns:**
- `/api/communities` — serves `brampton_full.geojson` pre-computed scores
- `/api/outages` — proxies Alectra feed, 5-min TTL in-memory cache
- `/api/weather` — proxies Open-Meteo, 15-min TTL
- `/api/briefing` — Gemini API orchestration, 10-second timeout, structured fallback
- `/api/recommendations` — ranked recommendation cards per CT and scenario
- ML inference (ONNX Runtime, no PyTorch in production)
- Tier C polling and Postgres archiving of Alectra outages

**Code rules:**
- All request/response models use pydantic v2
- Route handlers are thin — business logic in `backend/app/services/`
- Every response carries `{ data, sources, generated_at }` wrapper
- LLM-backed routes have explicit timeout and graceful fallback
- Use `httpx` for all outbound HTTP; no `requests`
- Format with `ruff format`, lint with `ruff check`
- Rate limit LLM-backed routes (60 req/hr per IP)

**ML artifact ownership:**
- ONNX files in `backend/models/`, version-pinned
- Sibling `<model>.json` per artifact with training provenance, accuracy, feature names
- Backend loads model at process start — never re-trains at runtime

**File paths:**
- Routes: `backend/app/routes/`
- Services: `backend/app/services/`
- ONNX models: `backend/models/`

### 4.4 AI/Data Responsibilities

**Pipeline (completed):**
- `pipeline/EDA.ipynb` is the single source of truth for all data ingestion, joins, and scoring
- Runs top-to-bottom to regenerate all outputs from scratch
- All 9 data sources fetched, verified, and joined into `brampton_full.geojson`
- PCA scoring complete for all 3 scenarios, 122 Brampton CTs

**LLM integration (to build):**
- Gemini 2.x for per-community briefings — injected numeric context, prose output
- Hard constraint: no numeric value may appear in briefing unless it was in the input prompt
- Backend validates this constraint before returning response
- DeepSeek R1/V3 critique layer is a stretch goal — do not build until MVP is green

**Model artifact export (to build):**
- Export scaler and PCA objects from notebook as `.pkl` files to `backend/models/`
- Export metadata JSON per artifact (training source, vintage, PC1 variance, min/max for rescaling)
- These are currently computed in the notebook — need to be persisted for backend inference

**Data stewardship rules:**
- `pipeline/data/raw/` is gitignored — treat as immutable input
- All pipeline outputs are reproducible from live public APIs
- Source provenance recorded on every derived field
- Never substitute placeholder numbers for missing data — the feature does not ship without real data

### 4.5 Infrastructure Responsibilities

**Frontend deployment — Vercel:**
- Static SPA + Tier A GeoJSON served from CDN
- `MAPBOX_TOKEN` as a build-time environment variable in Vercel project settings
- No server-side secrets exposed in the frontend bundle

**Backend deployment — Fly.io:**
- FastAPI service with persistent volume for PostgreSQL
- `GEMINI_API_KEY` and `DATABASE_URL` managed in Fly.io secrets
- PostgreSQL not publicly exposed — accessed only by FastAPI on the same Fly.io network

**Build pipeline (in order):**
1. Re-run `pipeline/EDA.ipynb` top-to-bottom to regenerate Tier A GeoJSON
2. Copy `brampton_full.geojson` and `brampton_facilities.geojson` to `frontend/public/data/`
3. `cd frontend && npm run build` — produces `dist/`
4. `vercel --prod` — deploys `dist/` to Vercel CDN
5. `cd backend && docker build -t threshold-backend . && fly deploy`

**Monitoring (MVP):**
- FastAPI request logging to stdout (captured by Fly.io)
- Fly.io metrics dashboard for CPU and memory
- Manual check: reload Alectra outage endpoint every 15 min during demo

### 4.6 Demo Responsibilities

**Opening line (mandatory):**
> "Threshold is the community equity and vulnerability layer that Alectra's innovation portfolio doesn't have yet, built on Esri Canada infrastructure."

**Demo script — golden path (5 minutes):**

1. Open Threshold at the public URL. Map loads with all 122 Brampton CTs coloured by vulnerability score. Call out Critical-tier tracts (red) immediately.
2. Hover a CT to show the tooltip (neighbourhood name, tier, score).
3. Click the top Critical-tier CT to open the detail panel — show the radar chart, factor bars, and source citations. State: "Every number here is traceable to a public dataset."
4. Switch scenario to Heatwave — map recolours instantly. Explain that humidex weight tripled — watch Brampton's west-end tracts shift.
5. Switch to Ice Storm — show that outage weighting creates a different priority ordering.
6. Toggle the Alectra outage overlay. Show the live polygon feed. "We archive every poll — Alectra publishes the present, Threshold gives them the past."
7. Toggle cooling/warming centres — 45 Brampton facilities appear.
8. Open the Recommendations panel — show the ranked cards with quantitative inputs.
9. Click the LLM briefing button for the top CT — Gemini generates prose citing the exact numbers in the panel.
10. Close on the score traceability: click any source citation to show the dataset name and vintage.

**Demo-day mentor strategy:**
- Keith Hemingway (Alectra, 10:00 AM May 26): lead with live outage overlay and the archival angle
- Daniel Carr (Alectra, 11:00 AM May 26): lead with Ice Storm scenario and feeder topology gap
- Judges will look for: real data, explainability, sponsor integration, and actionability — hit all four

**Backup demo (if frontend not ready):**
- Add interactive Folium map cell to `pipeline/EDA.ipynb` and export self-contained HTML
- Host on any static URL (GitHub Pages, Netlify drop, or `vercel deploy`)
- Preserves the data, scoring, and choropleth — the core product value

---

## 5. Deployment Flow

### Full Production Deployment

```bash
# Step 1: Regenerate Tier A data
cd pipeline
jupyter nbconvert --to notebook --execute EDA.ipynb --output EDA_executed.ipynb

# Step 2: Copy outputs to frontend
cp pipeline/data/brampton_full.geojson frontend/public/data/
cp pipeline/data/brampton_facilities.geojson frontend/public/data/

# Step 3: Build and deploy frontend
cd frontend
npm install
npm run build
vercel --prod

# Step 4: Build and deploy backend
cd backend
docker build -t threshold-backend .
fly deploy
```

### Required Secrets (set before deploy)

```bash
# Vercel — set in project settings dashboard
MAPBOX_TOKEN=<your_mapbox_token>

# Fly.io — set via CLI
fly secrets set GEMINI_API_KEY=<your_gemini_key>
fly secrets set DATABASE_URL=postgresql://...
```

### Fallback Deployment (minimum viable for submission)

If the full stack cannot be deployed before the deadline, the minimum viable demo:

```bash
# Add Folium interactive map cell to notebook, then:
jupyter nbconvert --to html --execute pipeline/EDA.ipynb --output threshold_demo.html
# Host threshold_demo.html on any static service
```

---

## 6. Development Workflow

### Working Principles

- Work on one feature unit at a time. A unit produces something user-visible or verifiably working.
- If a unit takes more than 3 hours without a demonstrable result, the scope is too broad — split it.
- Prefer wiring a vertical slice end-to-end over horizontal completeness.
- Do not combine `frontend/` and `backend/` work in a single commit unless genuinely cross-cutting.

### Definition of Done

Before marking any unit complete:
1. The unit works end-to-end within its defined scope, demonstrated in the running app or notebook
2. No architecture invariant was violated
3. `context/progress-tracker.md` Completed section updated
4. Frontend: `npm run build` passes
5. Backend: `uvicorn` boots clean, `pytest` passes if tests exist
6. Pipeline: notebook runs top-to-bottom without errors

### Context File Sync (mandatory)

Update the relevant context file in the same commit as any implementation change:
- New data source → `architecture.md` + `source-catalogue.md`
- New ML model → `architecture.md` stack table + `project-overview.md` features
- New UI surface → `ui-context.md` + `project-overview.md` user flow
- New invariant or convention → `architecture.md` invariants or `code-standards.md`
- Any completed unit → `progress-tracker.md` Completed section

---

## 7. Branching Strategy

**Given the 24-hour hackathon window, simplicity is the rule.**

- `main` is the single deployable branch. All work merges to `main`.
- Short-lived feature branches are acceptable for parallel work across folders.
- Naming convention: `feat/<folder>/<short-description>` (e.g. `feat/frontend/choropleth`, `feat/backend/communities-endpoint`)
- Merge to `main` only when the unit passes its definition of done.
- Never push broken `main` — the fallback demo must always deploy from `main`.
- Commit messages follow the convention: `<folder>: <description>` (e.g., `frontend: add choropleth scenario switcher`)

---

## 8. Testing Strategy

### Pipeline Testing (Implemented)

Each data source in `pipeline/EDA.ipynb` has an assertion cell immediately after the fetch cell. Assertions verify:
- Row count bounds (e.g., `len(gdf_cts) >= 400`)
- CRS integrity (`assert gdf.crs.to_epsg() == 4326`)
- Required column presence
- Null rate thresholds
- Spot-check values against known-correct live-source values

All 9 assertion cells currently pass on the verified notebook run.

**Regression test:** delete `pipeline/data/` and re-run the notebook top-to-bottom. All assertions should pass. If any fail, the pipeline has regressed.

### Backend Testing (To Build)

- `pytest` + `httpx.AsyncClient` for FastAPI routes
- One test per endpoint verifying response schema matches pydantic model
- Test data: subset of `brampton_full.geojson` with known pre-computed scores
- Mock Gemini API responses in CI to avoid quota and latency
- Test the LLM constraint: verify that numeric values in briefing responses were all present in input

### Frontend Testing (To Build)

- Vitest unit tests for score colour mapping functions (critical path: tier colour assignment)
- Component tests for `TierChip`, `ScoreDisplay`, `FactorBar`
- No E2E browser testing in MVP — time constraint

### Integration Testing

- Smoke test (manual before demo): notebook → output files → backend serves them → frontend renders correctly
- Verify all 3 scenarios produce different map colour distributions
- Verify detail panel shows correct factor values for a known CT (e.g., CT 5350528.20, population 5,726)
- Verify Alectra outage overlay renders without error (even if 0 active outages in Ontario)

### Data Quality Gates

Before any deploy, verify these spot-checks pass:
| Check | Expected |
|-------|---------|
| CT count in `brampton_full.geojson` | 122 exactly |
| Census population CT 5350528.20 | 5,726 |
| CISV score CT 5350528.20 | 0.0335 |
| Weather temperature (current) | Within 5°C of live Open-Meteo |
| Score range (baseline) | All values in [0, 100] |
| Risk levels | Only `Critical/High/Moderate/Low` present |

---

## 9. Risk Areas

### Critical — Will Break Demo If Not Addressed

**R1: Application layer not started**
- Probability: N/A — this is the current state
- Impact: No public URL, no submission
- Mitigation: Build Folium fallback demo first (< 2 hours), then React frontend in parallel

**R2: Mapbox token not obtained**
- Probability: Low
- Impact: Frontend map cannot render
- Mitigation: Obtain token before starting frontend build; store in `.env.local`; add to Vercel env before deploy

**R3: Gemini API key not obtained or quota exhausted**
- Probability: Medium
- Impact: LLM briefings unavailable
- Mitigation: LLM briefing has a structural fallback — factor breakdown renders regardless; demo still functional

**R4: No active Alectra outages on demo day**
- Probability: High (no Ontario outages were active at last check)
- Impact: Ice Storm scenario overlay appears empty
- Mitigation: Explain during demo that the feed is live and real — the query ran, Ontario was fine. Show customers_affected column in the detail panel instead. Prepare the verbal fallback: "The feed is live — right now Ontario is clear, which is exactly what a real operational system should show."

**R5: Vercel or Fly.io deployment fails under time pressure**
- Probability: Medium
- Impact: No public URL
- Mitigation: Have the Folium HTML export ready and a Netlify Drop URL as backup

### High — Significant Impact If Not Addressed

**R6: Model artifacts not exported from notebook to backend**
- The PCA scaler and PCA model objects are computed in the notebook but not yet serialised to `backend/models/`. The backend scoring endpoint cannot run without them.
- Mitigation: Export `scaler_baseline.pkl`, `pca_baseline.pkl`, etc. as the first backend build step

**R7: GeoJSON not copied to `frontend/public/data/`**
- The pipeline outputs live in `pipeline/data/`. The frontend expects them in `frontend/public/data/`. This is a manual copy step in the build pipeline.
- Mitigation: Make the copy step explicit in CI and in the deployment checklist

**R8: CTUID format mismatch between pipeline output and API response**
- Pipeline uses `CTUID` (e.g., `5350528.20`). Backend must use the same string. Any type coercion (float, int) will break the join key.
- Mitigation: Validate CTUID format in pydantic model; test with a known CTUID before demo

### Medium — Worth Monitoring

**R9: Open-Meteo weather data staleness**
- Weather data in `weather_ct.csv` was fetched at notebook run time, not live in the frontend
- Mitigation: Backend `/api/weather` endpoint re-fetches live from Open-Meteo; frontend shows weather from API, not baked GeoJSON

**R10: Alectra FeatureServer intermittent availability**
- Probability: Low — has been reliable across all pipeline runs
- Mitigation: Backend caches the last successful response; overlay shows "last updated" timestamp

---

## 10. Known Technical Debt

| Item | Impact | Priority |
|------|--------|---------|
| PCA explains only 35% of variance | Score does not capture 65% of factor variation | Phase 2 — switch to gradient boosted tree with 569 CTs |
| No active Ontario outages in current output | Ice Storm scenario has `active_outages = 0` for all CTs | N/A — live feed is correct; real event would populate |
| NRCan flood zones returned 0 features | `in_flood_zone` uniformly False | Post-MVP — likely correct for geography; not a demo blocker |
| Historical weather mostly null | Cannot compute `heat_days_per_yr` | Not used in PCA; future enhancement |
| Mississauga/Hamilton demographic data absent | `master_cts.geojson` is partial outside Brampton | Phase 2 geographic expansion |
| Recommendation engine not implemented | No projected impact numbers | Phase 2 — numbers specified, impact model not built |
| DeepSeek critique layer not wired | No chain-of-thought critique of ML outputs | Stretch — do not build until MVP is green |
| No test suite for backend | Regressions in API layer undetected | Address immediately post-hackathon |
| No Folium interactive map cell | Fallback demo path requires code to be written | Build this first — it is the hedge |
| Model artifacts not serialised from notebook | Backend cannot do inference without manual export step | Address before any backend build begins |

---

## 11. Demo-Day Critical Paths

There are two viable demo paths. Build both — the React path is primary, Folium is the hedge.

### Path A — Full Stack (Primary)

```
Step 1: Export model artifacts from notebook (30 min)
  → scaler_*.pkl + pca_*.pkl + metadata.json into backend/models/

Step 2: Build FastAPI backend (3 hours)
  → /api/communities (serves brampton_full.geojson)
  → /api/outages (Alectra feed proxy, 5-min TTL)
  → /api/weather (Open-Meteo proxy, 15-min TTL)
  → /api/briefing (Gemini proxy, 10-sec timeout, fallback)
  → /api/recommendations (ranked cards, heuristic for MVP)

Step 3: Build React frontend (5 hours)
  → Mapbox choropleth loading brampton_full.geojson from /public/data/
  → Scenario switcher (client-side, no network call)
  → Hover tooltip + click-to-detail-panel
  → Radar chart + factor bars (Recharts)
  → Overlay toggles (outages, facilities, weather)
  → Recommendation panel

Step 4: Wire frontend to backend (1 hour)
  → /api/outages → outage overlay
  → /api/briefing → LLM briefing in detail panel
  → /api/recommendations → recommendation cards

Step 5: Deploy (1 hour)
  → Copy GeoJSON to frontend/public/data/
  → npm run build → vercel --prod
  → fly deploy

Step 6: Smoke test at public URL (30 min)
  → All 122 CTs render
  → Scenario switching works
  → Detail panel opens on click
  → Overlays toggle without error
```

**Total estimated time: 11 hours**

### Path B — Folium Notebook (Fallback Hedge)

```
Step 1: Add interactive Folium map cell to pipeline/EDA.ipynb (1.5 hours)
  → Load brampton_full.geojson
  → Render choropleth with three scenario layer groups
  → Add facility markers
  → Export to threshold_demo.html (self-contained)

Step 2: Host HTML file (15 min)
  → vercel deploy threshold_demo.html
  OR: netlify drop
  OR: GitHub Pages on a new gh-pages branch

Step 3: Verify mobile rendering
```

**Total estimated time: 2 hours. Build this first.**

### Critical Path for Judges

The judges' minimum bar for a valid demo:
1. A public URL that renders a map
2. Real data visible (not placeholders)
3. Some form of community-level detail on click or hover
4. Evidence that the data is traceable to real public sources
5. Verbal explanation of the scoring methodology

All five are achievable with Path B alone. Path A exceeds all five.

---

## 12. MVP Priorities

Rank-ordered build sequence given the 24-hour constraint. Build in this order. Do not start a lower-priority item until the one above is green.

| # | Item | Why First | Time Estimate |
|---|------|-----------|--------------|
| 1 | Folium interactive map in notebook | Hedge — ensures a demo exists at all times | 1.5 hr |
| 2 | Model artifact export (pkl files) | Backend cannot run inference without these | 30 min |
| 3 | FastAPI `/api/communities` | Frontend primary data source — unblocks all frontend work | 1 hr |
| 4 | React choropleth rendering `brampton_full.geojson` | The product, visually | 2 hr |
| 5 | Scenario switcher (client-side) | Core differentiator — recolours in < 200ms | 1 hr |
| 6 | Hover tooltip + click to detail panel | Core user flow — two of the three user flows | 1.5 hr |
| 7 | Radar chart + factor bars | Traceability requirement — every score one click from its factors | 1 hr |
| 8 | Deploy frontend to Vercel | Public URL requirement | 30 min |
| 9 | FastAPI `/api/outages` + overlay toggle | Sponsor (Alectra) live data demo moment | 1 hr |
| 10 | Cooling centres overlay (static GeoJSON) | Second overlay; minimal backend work | 30 min |
| 11 | Deploy backend to Fly.io | Live overlays and briefings require backend | 30 min |
| 12 | FastAPI `/api/briefing` + Gemini wiring | LLM briefing in detail panel | 1.5 hr |
| 13 | `/api/recommendations` + recommendation panel | Recommendation cards | 1 hr |
| 14 | Source citation two-click flow | Traceability invariant in the UI | 30 min |
| 15 | Sidebar top-10 list | Polish — not in the golden path | 30 min |

### Explicit Non-Priorities (do not touch until all of the above are green)

- DeepSeek critique layer
- Methodology explanation modal
- Compare-scenarios view
- AQHI / air quality layer
- Hamilton or Mississauga geographic expansion
- Keyboard map navigation / accessibility enhancements
- User accounts or annotation features

---

## 13. Post-Hackathon Roadmap

### Phase 2 — Immediate (1–2 weeks post-hackathon)

**Geographic expansion — Mississauga and Hamilton**
- Resolve programmatic access to Mississauga CT-level census data (StatsCan GeoEnrichment or Esri Canada Living Atlas enrichment)
- Fetch Hamilton census data (~80 CTs in Alectra territory)
- Add Mississauga and Hamilton cooling/warming centre facilities
- All pipeline stages already cover these CTs — only the census data fetch needs to be added
- Estimated effort: 2–4 days once data access is resolved

**Neural network scoring model**
- 122 Brampton CTs is too small for a defensible NN; 569+ CTs is viable
- Train a shallow feedforward network (2–3 layers) on the same 10 factors
- Export to `backend/models/threshold_nn.onnx`
- Cross-validate on a held-out CT subset, document accuracy in `model_metadata.json`
- Replace PCA scoring endpoint with ONNX inference; preserve PCA as the explainable fallback

**Backend test suite**
- `pytest` + `httpx.AsyncClient` for all routes
- Mock Gemini in CI
- CI on GitHub Actions running tests on every push to `main`

### Phase 3 — Medium-Term (1–3 months)

**Recommendation engine with real impact numbers**
- Impact estimation model per intervention type (cooling bus, welfare check, facility activation)
- Cost database per intervention
- Confidence intervals on impact estimates
- Integration with Alectra demand response data for grid-side recommendations

**Full Alectra service territory (all 17 communities)**
- StatsCan CISV/CISR already covers all Canadian CTs — no pipeline work needed for the vulnerability index layer
- Open-data CT-level census access varies by municipality — resolve per community
- Estimated effort: 1–2 weeks per new city cluster with data access

**DeepSeek critique layer**
- Route recommendation cards through DeepSeek chain-of-thought critique
- Challenge projected impact numbers against historical base rates
- Annotate cards with confidence-adjusted language
- Novel pattern in civic tech — a differentiator in a productised version

### Phase 4 — Long-Term (3–12 months)

**AQHI / Environmental Justice layer (PS3 full coverage)**
- Environment Canada AQHI data feed integration
- `cisv_dim1` (racialized populations) is a partial proxy already in the score
- Full PS3 coverage: add `pollution_burden` as an additional PCA/NN factor

**Productisation as a data service**
- SLA-backed API with versioned data contracts
- Bulk export (CSV, GeoJSON) for offline analysis
- Webhook alerts when a CT's risk tier changes (e.g., heat event pushes Moderate → High)
- White-label deployment for individual municipalities
- Integration with Alectra's Centricity DSO system for equity-weighted demand response dispatch

---

## 14. Scaling Opportunities

### Geographic Scale

| Phase | CTs | Cities | Blocker |
|-------|-----|--------|---------|
| MVP | 122 | Brampton | None — fully real data |
| Phase 2 | 569 | Brampton + Mississauga + Hamilton | Mississauga and Hamilton census data access |
| Phase 3 | ~1,200 | All 17 Alectra communities | Open data availability varies |
| Vision | All Canadian utility territories | National | Reuse StatsCan CISV/CISR (already national); per-utility ArcGIS REST integration |

**Pipeline design is already expansion-ready.** StatsCan CISV/CISR covers all Canadian CTs. CT boundary files cover all CMAs. Adding a new city means adding one ESRI FeatureServer endpoint for census demographics and one for facilities.

### Data Volume Scale

- At 569 CTs, `master_cts.geojson` is estimated 8–12 MB — still browser-deliverable as flat GeoJSON
- Beyond ~1,000 CTs: switch to Mapbox Vector Tiles (MVT) or `pmtiles` for tile-based delivery
- PostgreSQL + PostGIS backend is designed for full Alectra scale from day one — no schema changes needed

### Compute Scale

- Tier A GeoJSON is served statically from Vercel CDN — zero backend load for map rendering
- FastAPI with asyncio handles concurrent Tier C requests without blocking
- LLM route rate-limiting prevents Gemini quota exhaustion
- Phase 2 ONNX inference is O(n) per CT, negligible at 569 CTs

### Team Scale

The single-notebook pipeline and strict folder-boundary ownership make it possible to split work across more engineers without coordination overhead:
- One engineer owns `pipeline/` and never touches `frontend/` or `backend/`
- One engineer owns `frontend/` and consumes backend via agreed API contracts
- One engineer owns `backend/` and models
- Context files in `context/` are the coordination mechanism — not Slack, not meetings

---

## 15. Suggested Operational Improvements

**Immediately actionable (no additional development):**

1. **Automate the GeoJSON copy step.** The step that copies `pipeline/data/brampton_full.geojson` to `frontend/public/data/` is manual and easy to forget. Add a `Makefile` target or a `justfile` task: `just build-pipeline` that runs the notebook and copies outputs.

2. **Add a data freshness indicator to the UI.** The `brampton_full.geojson` has a baked-in pipeline run timestamp. Surface this in the UI footer as "Data last updated: [date]" so users know when the structural data was generated.

3. **Pin exact environment in requirements.txt.** The current `requirements.txt` uses `>=` version bounds. Pin exact versions (`==`) before the final deploy to prevent library incompatibility if a dependency releases during the hackathon window.

4. **Add a `verify_data.py` script.** A five-line Python script that loads `brampton_full.geojson` and checks CT count, column presence, score range, and the known spot-check values. Run before every deploy.

5. **Add a `DEPLOYMENT.md` checklist.** A single-page ordered checklist covering: notebook re-run, GeoJSON copy, model artifact export, `npm run build`, `vercel --prod`, `fly deploy`, post-deploy smoke test. Eliminates the risk of a step being missed under time pressure.

**Post-hackathon operations:**

6. **Cron job for Tier B refresh.** Set up a daily GitHub Actions workflow that re-runs the weather fetch cells in the notebook and upserts to the Postgres Tier B tables.

7. **Alectra outage archival automation.** The backend polls and archives Alectra outages, but the archive is only useful if polling runs continuously. Deploy the backend with a background task that polls every 5 minutes and writes to the Postgres archive — not just on API calls.

8. **Structured logging.** Add `ctuid`, `scenario`, `endpoint`, and `duration_ms` to every FastAPI request log. This enables per-CT usage analytics without user tracking.

9. **Gemini response caching.** LLM briefings are not cached in MVP. Cache by `(ctuid, scenario)` with a 24-hour TTL. Dramatically reduces Gemini quota usage and latency after the first request per community.

10. **Automated notebook regression test.** Add a GitHub Actions workflow that runs `jupyter nbconvert --execute EDA.ipynb` on every commit to `main` that touches `pipeline/`. If the notebook halts with an assertion failure, the workflow fails and blocks the merge.

---

## 16. Suggested Future Enhancements

These are enhancements to the existing product direction — not redesigns.

**Scoring and intelligence:**

- **Temporal scoring trends.** Store `threshold_score` per CT per pipeline run. After 4+ weeks of data, surface a trend arrow (↑ / ↓ / →) on the detail panel showing whether a community's vulnerability is worsening or improving.
- **Confidence intervals on scores.** PCA produces a point estimate. Bootstrap resampling across the 122 CTs can produce a confidence interval on PC1. Surface this in the detail panel as a score range rather than a single number.
- **Outage recurrence index.** Count how many times a CT's grid feeder has been outage-affected across the polling archive. Add as an additional factor: communities with high outage recurrence are structurally at higher risk even when no outage is active.

**User experience:**

- **Community comparison mode.** Select two CTs and see their factor radars side-by-side. Useful for emergency managers deciding between two at-risk locations.
- **Methodology modal.** One-click explanation of how the Threshold Score is computed — factor weights, PCA rationale, scenario definitions. Builds trust with technically literate judges and future users.
- **Export / print view.** Generate a one-page PDF briefing for a selected CT: score, radar, factor bars, LLM briefing, and source citations. Useful for emergency managers who need to share situational awareness without screen sharing.
- **Historical score animation.** When outage archive data accumulates, animate how scenario scores changed across a past weather event. Demonstrates the temporal value of the archival strategy.

**Data and coverage:**

- **Alectra feeder topology overlay.** If Alectra exposes feeder boundary data during a future engagement, overlay feeder polygons on the choropleth. This completes the `GridFeeder` entity in the ontology and enables true grid-side recommendation cards.
- **Real-time welfare check station integration.** If municipal emergency management systems expose an API, wire the location and capacity of active welfare check stations as a Tier C overlay — closing the loop from vulnerability identification to resource deployment visibility.
- **Social media signal layer (stretch).** Heat of social media distress signals (Twitter/X, Reddit) per neighbourhood during a weather event as a real-time proxy for community distress. Highly experimental — but Threshold's architecture can absorb it as a new Tier C source without structural changes.

**Platform:**

- **Webhook notification service.** When a CT's risk tier changes (e.g., heat event pushes Moderate → High), emit a webhook to a configured endpoint. Enables emergency managers to integrate Threshold into their existing alert systems without polling the UI.
- **Alectra DSO integration.** Centricity is Alectra's DSO system. If Threshold's vulnerability scores could inform Centricity's demand response dispatch prioritisation — equity-weighting which feeders to restore first — that is the long-term commercial value proposition made real.

---

*This playbook operationalises the project as built. It does not redesign the product. All priorities, risks, and responsibilities reflect the actual state of `pipeline/EDA.ipynb` and the architecture documented in `context/` as of 2026-05-25.*

*For the scoring specification, see `context/source-catalogue.md` and `docs/PRD.md` Section 17.*
*For the data inventory, see `context/source-catalogue.md`.*
*For the UI design system, see `context/ui-context.md`.*
*For code standards, see `context/code-standards.md`.*
*For the submission checklist, see `context/progress-tracker.md`.*
