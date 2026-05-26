# Progress Tracker

Last updated: 2026-05-25. Hackathon deadline: **2026-05-26 23:59 ET.**

---

## Current Phase

**Data pipeline industrialized into a medallion-layered Python package. `raw → staging → curated → ml → public` schemas in Postgres, owned by Alembic migrations. Six chained stages (ingest / clean / features / train / score / publish) under [backend/app/pipeline/stages/](../backend/app/pipeline/stages/), each idempotently re-runnable. PCA training writes versioned sklearn `Pipeline` artifacts to `ml.models` and logs to MLflow. Per-CT scores in `ml.community_scores` carry `model_id` provenance. Prefect flow ([flow.py](../backend/app/pipeline/flow.py)) wraps each stage as a `@task` with retries; Prefect UI on `:4200`, MLflow UI on `:5000`. Pandera schemas validate at stage boundaries. Backend still reads `public.communities / facilities / pca_loadings` — no API changes. Full design in [pipeline.md](./pipeline.md).**

---

## Completed

### Data Pipeline (medallion-layered Python package — `backend/app/pipeline/`)

The pipeline is a six-stage chain over five Postgres schemas. Each stage reads from one schema and writes to the next. Run with `python -m app.pipeline` (full chain), `python -m app.pipeline --stage <name>` (single stage), or `python -m app.pipeline --prefect [--serve]` (via Prefect). Writes everything to Postgres; no file output. The cache dir `pipeline/data/` holds upstream zip/CSV downloads only.

**Source loaders** under [backend/app/pipeline/sources/](../backend/app/pipeline/sources/):
- ✅ **CT Boundaries** ([sources/boundaries.py](../backend/app/pipeline/sources/boundaries.py)) — StatsCan 2021 boundary file
- ✅ **Brampton Census 2021** ([sources/census.py](../backend/app/pipeline/sources/census.py)) — 122 CTs, Brampton ESRI ArcGIS FeatureServer
- ✅ **CISV + CISR** ([sources/cimd.py](../backend/app/pipeline/sources/cimd.py)) — StatsCan 2021 indices, DA→CT crosswalk
- ✅ **Alectra Service Area** ([sources/alectra.py](../backend/app/pipeline/sources/alectra.py)) — 18 polygons, clips to served-by-Alectra CTs
- ✅ **Facilities** ([sources/facilities.py](../backend/app/pipeline/sources/facilities.py)) — recreation centres + libraries from Brampton ESRI
- ✅ **Neighbourhood Names** ([sources/neighbourhoods.py](../backend/app/pipeline/sources/neighbourhoods.py)) — Secondary Plan Areas spatial-joined to CT centroids

**Stages** under [backend/app/pipeline/stages/](../backend/app/pipeline/stages/):
- ✅ **ingest** ([stages/ingest.py](../backend/app/pipeline/stages/ingest.py)) — upstream APIs → `raw.*` (6 tables)
- ✅ **clean** ([stages/clean.py](../backend/app/pipeline/stages/clean.py)) — `raw.*` → `staging.*` (4 tables); Pandera-validated
- ✅ **features** ([stages/features.py](../backend/app/pipeline/stages/features.py)) — `staging.*` → `curated.community_features`
- ✅ **train** ([stages/train.py](../backend/app/pipeline/stages/train.py)) — fits sklearn `Pipeline([StandardScaler, PCA])` per scenario, persists pickle + loadings + metrics to `ml.models`, logs to MLflow
- ✅ **score** ([stages/score.py](../backend/app/pipeline/stages/score.py)) — applies latest model per scenario → `ml.community_scores` (with `model_id` FK)
- ✅ **publish** ([stages/publish.py](../backend/app/pipeline/stages/publish.py)) — promotes into `public.communities / facilities / pca_loadings` in a single transaction

**Orchestration + tracking + migrations**:
- ✅ **Prefect** ([flow.py](../backend/app/pipeline/flow.py)) — `@flow` + per-stage `@task` with retries; UI on `:4200`
- ✅ **MLflow** — tracking server on `:5000`; every training run logs params, metrics, sklearn artifact, and `run_id` (stored back in `ml.models`)
- ✅ **Alembic** ([backend/alembic/](../backend/alembic/)) — owns the four medallion schemas; `0001_pipeline_layers.py` creates them
- ✅ **Pandera schemas** ([schemas.py](../backend/app/pipeline/schemas.py)) — contract enforcement at `clean → staging` and `features → curated` boundaries

The legacy notebook [pipeline/EDA.ipynb](../pipeline/EDA.ipynb) is retained as a demo / exploratory artifact but is no longer the build path. Full design in [pipeline.md](./pipeline.md).

### Data Verified Real (Spot-Checked 2026-05-25)

| Check | Result |
|-------|--------|
| Census population CT 5350528.20 | 5,726 — exact match to live ESRI |
| CISV score CT 5350528.20 | 0.0335 — exact match to raw StatsCan zip |
| Weather temperature | 19.8°C — matches live Open-Meteo |
| All 122 Brampton CTs present | 122/122 — none missing, none extra |
| Facility names | All match live ESRI |
| Income range | $61K–$172K — realistic, real StatsCan 2021 values |

### Repo Structure

- ✅ Pipeline moved out of the notebook into [backend/app/pipeline/](../backend/app/pipeline/) — one module per upstream source plus a `build.py` orchestrator
- ✅ `pipeline/data/` is the gitignored upstream-source cache only — neither backend nor frontend reads from it
- ✅ Postgres is the system of record for the ontology; backend boots by querying tables, never by reading files

### Backend Persistence (Postgres + SQLAlchemy async)

Opt-in archival layer for live + computed values. App still boots without `THRESHOLD_DATABASE_URL` — helpers no-op when DB is disabled.

- ✅ **SQLAlchemy 2.x async + asyncpg** added to `backend/requirements.txt`
- ✅ **`backend/app/db.py`** — `Database` wrapper owns engine + sessionmaker; `connect()` runs `Base.metadata.create_all()` on startup
- ✅ **`backend/app/models/db.py`** — six ORM tables: ontology (`communities`, `facilities`, `pca_loadings`) and capture (`weather_observations`, `flood_observations`, `threshold_scores`)
- ✅ **`backend/app/services/persistence.py`** — `PersistenceService` with `record_weather` / `record_weather_batch` / `recent_weather`, `record_flood` / `record_flood_batch` / `recent_flood`, `record_score` / `latest_score`. Every method short-circuits when DB is off.
- ✅ Wired into FastAPI lifespan ([backend/app/main.py](../backend/app/main.py)) and exposed via `get_db` / `get_persistence` in [backend/app/deps.py](../backend/app/deps.py)

### Tier C Live Services

- ✅ **Outages** ([services/outages.py](../backend/app/services/outages.py)) — Alectra ArcGIS FeatureServer/7, spatial-joined to CT polygons at request time, 5-min TTL cache
- ✅ **Weather** ([services/weather.py](../backend/app/services/weather.py)) — Open-Meteo current conditions, per-CT batched, 15-min TTL cache, baked + live + simulate modes for scenario preview
- ✅ **Flood** ([services/flood.py](../backend/app/services/flood.py)) — Open-Meteo Flood (GloFAS v4), per-CT centroid lookup, 1-hour TTL cache. **Persists `flood_observations` rows on every cold-cache fetch** (today's discharge, 30-day mean, 7-day forecast peak, anomaly ratio, raw payload).

### Local Docker Stack

- ✅ **`docker-compose.yml`** — four services:
  - `db` — postgres:16-alpine with healthcheck, named volume `threshold_pgdata`
  - `backend` — FastAPI app, waits on `db.service_healthy`, reads ontology from Postgres
  - `prefect` — Prefect 3 server, UI on `:4200`, SQLite metadata in `threshold_prefect` volume
  - `mlflow` — MLflow tracking server, UI on `:5000`, SQLite + artifact store in `threshold_mlflow` volume
- ✅ **`backend/Dockerfile`** — Python 3.12-slim + GEOS/GDAL/PROJ system deps for geopandas, uvicorn on `0.0.0.0:8000`
- ✅ **`.dockerignore`** — keeps `.env`, `.git`, `frontend/`, notebooks, caches out of build context
- ✅ `docker compose config` validates clean

### Postgres schemas + tables

| Schema.Table | Family | Source | Description |
|--------------|--------|--------|-------------|
| `raw.census_2021`, `raw.cisv_cisr_2021`, `raw.ct_boundaries`, `raw.alectra_service_area`, `raw.facilities`, `raw.neighbourhoods` | Pipeline (bronze) | `stages/ingest.py` | One row per fetch — `payload` JSONB stored verbatim, `source_slug`, `source_url`, `load_at`. Audit trail. |
| `staging.census_tracts`, `staging.vulnerability`, `staging.ct_geometries`, `staging.facilities` | Pipeline (silver) | `stages/clean.py` | Typed columns, deduped, Pandera-validated. |
| `curated.community_features` | Pipeline (gold) | `stages/features.py` | Joined feature table — model input and serving source. |
| `ml.models` | Pipeline (ML) | `stages/train.py` | One row per fit — pickled sklearn `Pipeline`, JSON loadings, JSON metrics, MLflow `run_id`. |
| `ml.community_scores` | Pipeline (ML) | `stages/score.py` | One row per CT × scenario — `score`, `grade`, `model_id` FK. |
| `public.communities` | Serving (ontology) | `stages/publish.py` | Scored CT polygon + factor attributes (replaces `brampton_full.geojson`). |
| `public.facilities` | Serving (ontology) | `stages/publish.py` | Cooling / warming centres (replaces `brampton_facilities.geojson`). |
| `public.pca_loadings` | Serving (ontology) | `stages/publish.py` | Per-scenario PCA loadings (replaces `loadings.csv`). |
| `public.weather_observations` | Capture | Backend (live) | One row per weather fetch — OpenWeather, Open-Meteo, EnvCan. |
| `public.flood_observations` | Capture | Backend (live) | One row per Open-Meteo Flood (GloFAS v4) fetch. |
| `public.threshold_scores` | Capture | Backend (live) | Audit trail of CT × scenario × live recompute. |

---

### React Frontend (React 18 + TypeScript + Vite + Tailwind + react-leaflet)

All UI files live under `frontend/src/`. The Docker Compose file now includes a 2-stage Dockerfile (builder/runtime) to handle geospatial dependencies on the frontend build.

**Core modules:**
- ✅ **`types.ts`** — TypeScript type definitions: `Tract`, `Facility`, `Scenario`, `Tier`, `View`. Single source of truth for data shapes across the whole frontend.
- ✅ **`utils.ts`** — Pure utility functions: `scoreFor`, `getTier`, `TIER_COLORS`, `TIER_LABELS`, `formatIncome`, `formatPct`, `weatherLabel`, `haversineKm`. No side effects; all score and display logic lives here.
- ✅ **`dataLoader.ts`** — Fetches `/api/communities/features` and `/api/facilities` from the backend, proxied via Vite dev server to `http://localhost:8000`. Handles GeoJSON → typed array transformation.
- ✅ **`context.tsx`** — `AppProvider` wraps the app with shared React context. Holds `tracts`, `facilities`, `selected` (active CT), `scenario` (Baseline/Heatwave/Ice Storm), and `view` (Map/Triage) state. All child components read from here.

**Components:**
- ✅ **`components/TopBar.tsx`** — Logo, view switcher (Map ↔ Triage toggle), and scenario switcher (Baseline / Heatwave / Ice Storm). Dispatches context updates on interaction.
- ✅ **`components/LeftPanel.tsx`** — Ranked Census Tract list sorted by current scenario score, highest-vulnerability first. Includes outage pulse dots as live indicators. Clicking a row sets `selected`.
- ✅ **`components/MapPanel.tsx`** — Leaflet choropleth rendered via react-leaflet with a Carto dark basemap. Renders CT polygons colour-coded by tier, shelter marker overlays, and outage overlays. Includes a tier legend. Click selects a CT and populates RightPanel.
- ✅ **`components/RightPanel.tsx`** — Detail panel for the selected CT. Shows score header, live weather conditions, vulnerability breakdown, CISV dimension bars, income section, nearby shelter list, and an LLM briefing button that calls the backend `/api/briefing` endpoint.
- ✅ **`components/TriageView.tsx`** — Table view (alternative to map) showing per-CT stats: Critical count, average score, no-shelter count, and active outages. Columns are sortable.

---

## Not Started

- [ ] OpenWeather Brampton-grid fetcher (writes to `weather_observations` via `PersistenceService`) — *waiting on API key activation*
- [ ] Deployment (Vercel + Fly.io / Railway)
- [ ] Wire flood signal into the PCA composite (currently served as a standalone overlay; not yet a scored factor)
- [ ] Demographic-aware Gemini personalization (uses `curated.community_features` directly instead of the rebuilt `public.communities` row to keep prompts compact)

---

## Architecture Decisions Made

- **Narrowed demo to Brampton** for MVP. Best data coverage: real ESRI census, CISV/CISR, neighbourhood names, facilities — all from Brampton's own ArcGIS FeatureServer.
- **PCA not neural net** for scoring. With 122 CTs and 10 factors, PCA is more defensible and explainable to judges than a black-box model. Every loading is visible in `public.pca_loadings`.
- **Pipeline is a Python module, not a notebook.** The previous EDA notebook is retained as exploratory/demo, but the build path is `backend/app/pipeline/` — medallion-layered, Postgres-backed output, one venv shared with the backend.
- **Medallion layering inside Postgres** (`raw → staging → curated → ml → public`) instead of a file-based data lake. Justified by data size (<100 MB), the single-Postgres deployment target, and the need for SQL-debuggable lineage. Heavy stacks (Airflow + Feast + Hopsworks) were considered and explicitly rejected for hackathon scope.
- **Prefect over Airflow** for orchestration. Decorator-based, free cloud + local UI, ~5 lines to add to existing async code. Heavy operator/sensor ceremony of Airflow not warranted for a 6-stage daily chain.
- **MLflow for tracking + a `ml.models` table for the registry of record.** MLflow gives demo-friendly UI; the pickled artifact + metadata stored in Postgres means scoring still works if MLflow is unreachable.
- **Pandera for schema contracts** at stage boundaries. Lighter than Great Expectations; per-stage decorator/function call rather than a separate validation service.
- **Alembic owns the medallion schemas;** `Base.metadata.create_all` continues to handle `public.*`. The two systems coexist because `create_all` is idempotent and never touches the Alembic-managed schemas.
- **Postgres is the system of record.** Medallion + ontology live in Postgres; live captures live in `weather_observations` / `flood_observations` / `threshold_scores`. No GeoJSON / CSV file fallback in serving code.
- **Persistence is opt-in.** Backend boots cleanly without `THRESHOLD_DATABASE_URL`; archive helpers no-op. Pipeline run requires the DSN.
- **Open-Meteo** for both weather and flood — free, no key, cleaner per-point JSON than Environment Canada GeoMet (weather) and direct GloFAS access (flood).
- **CISV/CISR instead of CIMD** — newer 2025 StatsCan release with a resilience dimension that CIMD lacks.

---

## Known Data Gaps

| Gap | Workaround |
|-----|-----------|
| Mississauga CT census (city portal blocks access) | Not included in demo — Brampton is the MVP city |
| Historical weather archive empty until first live fetch | Build starts populating `weather_observations` once `THRESHOLD_DATABASE_URL` is set and `/api/weather?live=true` is hit |
| Flood data is GloFAS resolution (~5 km) | Sufficient for creek-system anomaly signal; TRCA `FloodPlain_Regulatory` available as a Tier A polygon layer if parcel-level extents become required |
| No active Alectra outages at last run | Columns populated live; will fill during a real event |

---

## Submission Checklist

- [ ] Public URL live (deploy frontend + backend)
- [x] React frontend with choropleth (react-leaflet 4 + Leaflet 1.9, Carto dark basemap — not Mapbox; Mapbox is a future upgrade) ✅
- [x] All 3 scenarios working in UI (Baseline / Heatwave / Ice Storm) ✅
- [ ] Demo video / slides updated
- [x] FastAPI backend running (routes: communities, weather, outages, flood, facilities, briefing, recommendations, extreme-plan, scenarios, health) ✅
- [x] Pipeline module persists ontology to Postgres ✅
- [x] All data real and spot-checked ✅
- [x] Open-Meteo Flood (GloFAS) wired and persisting to `flood_observations` ✅
- [x] `context/` docs up to date ✅
