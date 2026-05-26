# Progress Tracker

Last updated: 2026-05-25. Hackathon deadline: **2026-05-26 23:59 ET.**

---

## Current Phase

**Data pipeline migrated from notebook → Python module + Postgres. Backend reads ontology from `communities`/`facilities`/`pca_loadings` tables; no GeoJSON file fallback. Live-data archive (`weather_observations`, `flood_observations`, `threshold_scores`) is opt-in via `THRESHOLD_DATABASE_URL`. Full local stack runs via `docker compose up`. EDA notebook is retained as a demo / exploratory artifact only.**

---

## Completed

### Data Pipeline (Python module — `backend/app/pipeline/`)

The pipeline is now a Python package — one module per upstream source plus an orchestrator. Run with `python -m app.pipeline` from `backend/`. Writes the ontology to Postgres; no file output. The cache dir `pipeline/data/` holds upstream zip/CSV downloads only.

- ✅ **CT Boundaries** ([boundaries.py](../backend/app/pipeline/boundaries.py)) — StatsCan 2021 boundary file
- ✅ **Brampton Census 2021** ([census.py](../backend/app/pipeline/census.py)) — 122 CTs, Brampton ESRI ArcGIS FeatureServer
- ✅ **CISV + CISR** ([cimd.py](../backend/app/pipeline/cimd.py)) — StatsCan 2021 indices, DA→CT crosswalk
- ✅ **Alectra Service Area** ([alectra.py](../backend/app/pipeline/alectra.py)) — 18 polygons, clips to served-by-Alectra CTs
- ✅ **Facilities** ([facilities.py](../backend/app/pipeline/facilities.py)) — recreation centres + libraries from Brampton ESRI
- ✅ **Neighbourhood Names** ([neighbourhoods.py](../backend/app/pipeline/neighbourhoods.py)) — Secondary Plan Areas spatial-joined to CT centroids
- ✅ **PCA Vulnerability Score** ([scoring.py](../backend/app/pipeline/scoring.py)) — PC1 across 10 factors, three scenarios
- ✅ **Postgres writer** ([db_writer.py](../backend/app/pipeline/db_writer.py)) — UPSERT into `communities`, `facilities`, `pca_loadings`

The legacy notebook [pipeline/EDA.ipynb](../pipeline/EDA.ipynb) is retained as a demo / exploratory artifact but is no longer the build path.

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
- ✅ **`backend/app/models/db.py`** — two ORM tables:
  - `weather_observations` (source, station_id, lat/lon, fetched_at, full measurement set, `raw_payload` JSONB) — for the OpenWeather Brampton-grid fetcher and the existing Open-Meteo path
  - `threshold_scores` (ctuid, scenario_slug, computed_at, score, `factors`/`weights` JSONB) — historical scores so routes don't recompute PCA
- ✅ **`backend/app/services/persistence.py`** — `PersistenceService` with `record_weather`, `record_weather_batch`, `record_score`, `latest_score`, `recent_weather`. Every method short-circuits when DB is off.
- ✅ Wired into FastAPI lifespan ([backend/app/main.py](../backend/app/main.py)) and exposed via `get_db` / `get_persistence` in [backend/app/deps.py](../backend/app/deps.py)
- ✅ All modules syntax-validate via `python -m py_compile`

### Local Docker Stack

- ✅ **`docker-compose.yml`** — `db` (postgres:16-alpine, healthcheck, named volume) + `backend` (built from Dockerfile, waits on `db.service_healthy`, bind-mounts `pipeline/data` read-only at `/data`)
- ✅ **`backend/Dockerfile`** — Python 3.12-slim + GEOS/GDAL/PROJ system deps for geopandas, uvicorn on `0.0.0.0:8000`
- ✅ **`.dockerignore`** — keeps `.env`, `.git`, `frontend/`, notebooks, caches out of build context
- ✅ `docker compose config` validates clean

### Postgres tables (written by `python -m app.pipeline` / live services)

| Table | Family | Source | Description |
|-------|--------|--------|-------------|
| `communities` | Ontology | Pipeline | Scored CT polygon + factor attributes (replaces `brampton_full.geojson`) |
| `facilities` | Ontology | Pipeline | Cooling / warming centres (replaces `brampton_facilities.geojson`) |
| `pca_loadings` | Ontology | Pipeline | Per-scenario PCA loadings (replaces `loadings.csv`) |
| `weather_observations` | Capture | Backend (live) | One row per weather fetch — OpenWeather, Open-Meteo, EnvCan |
| `flood_observations` | Capture | Backend (live) | One row per Open-Meteo Flood (GloFAS v4) fetch |
| `threshold_scores` | Capture | Backend (live) | Audit trail of CT × scenario × computation |

---

## Not Started

- [ ] FastAPI backend (scoring endpoint, live data proxy) — *scaffolding present (routes/services in `backend/app/`); endpoints need to be wired to real handlers*
- [ ] OpenWeather Brampton-grid fetcher (writes to `weather_observations` via `PersistenceService`) — *waiting on API key activation*
- [ ] React frontend (Mapbox choropleth, scenario switcher, detail panel)
- [ ] Interactive Folium map cell in notebook (build_map.py was removed — code needs to be ported in)
- [ ] Alembic migrations (deferred — `create_all` works for the hackathon)
- [ ] Deployment (Vercel + Fly.io / Railway)

---

## Architecture Decisions Made

- **Narrowed demo to Brampton** for MVP. Best data coverage: real ESRI census, CISV/CISR, neighbourhood names, facilities — all from Brampton's own ArcGIS FeatureServer.
- **PCA not neural net** for scoring. With 122 CTs and 10 factors, PCA is more defensible and explainable to judges than a black-box model. Every loading is visible in `loadings.csv`.
- **Single self-contained notebook** — `EDA.ipynb` is the entire pipeline. No external scripts. Run top-to-bottom to regenerate all data from scratch.
- **Data folder not in git** — all files are reproducible from live public APIs. `.gitignore` excludes `pipeline/data/`.
- **Open-Meteo** for weather — free, no key, cleaner per-point JSON than Environment Canada GeoMet.
- **CISV/CISR instead of CIMD** — newer 2025 StatsCan release with a resilience dimension that CIMD lacks.

---

## Known Data Gaps

| Gap | Workaround |
|-----|-----------|
| Mississauga CT census (city portal blocks access) | Not included in demo — Brampton is the MVP city |
| Historical weather mostly null (Open-Meteo rate limiting) | Not used in PCA; columns present in CSV |
| NRCan flood zones returned empty | `in_flood_zone` = False for all CTs |
| No active Alectra outages at last run | Columns present, will populate during real event |

---

## Submission Checklist

- [ ] Public URL live (deploy frontend or share Folium HTML)
- [ ] Interactive map cell in EDA notebook (port build_map.py code in)
- [ ] FastAPI backend running
- [ ] React frontend with Mapbox choropleth
- [ ] All 3 scenarios working in UI (Baseline / Heatwave / Ice Storm)
- [ ] Demo video / slides updated
- [x] All data real and spot-checked ✅
- [x] `pipeline/EDA.ipynb` runs clean top-to-bottom ✅
- [x] `context/` docs up to date ✅
