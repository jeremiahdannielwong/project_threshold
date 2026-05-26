# Architecture Context

## Stack

| Layer        | Technology                          | Role                                                                 |
| ------------ | ----------------------------------- | -------------------------------------------------------------------- |
| Frontend     | React 18 + TypeScript + Vite        | Map UI, scenario controls, detail and recommendation panels         |
| UI styling   | Tailwind CSS + shadcn/ui            | Dark mission-control design system, component primitives            |
| Map          | Mapbox GL JS                        | Choropleth, overlays, hover/click interactions                       |
| Charts       | Recharts                            | Radar chart, factor bars in detail panel                             |
| Backend      | FastAPI (Python 3.11+)              | API surface, ML inference, LLM orchestration, Tier C live endpoints |
| ML           | PyTorch + scikit-learn + ONNX       | Custom NN training, baseline models, portable inference             |
| LLM (primary)| Gemini 2.x (long-context)           | Briefing synthesis, multi-source narrative                           |
| LLM (critic) | DeepSeek R1 / V3                    | Chain-of-thought critique of ML outputs (stretch)                   |
| Pipeline     | Python package `backend/app/pipeline/` — medallion layout (raw → staging → curated → ml → public) | Ingest, normalize, spatial joins, model training, scoring, publish to serving tables |
| Orchestration| Prefect 3 (`backend/app/pipeline/flow.py`) | `@flow` + per-stage `@task` with retries; UI on :4200 |
| ML tracking  | MLflow (sklearn pipelines + metrics + artifacts) | Experiment registry + model artifact store; UI on :5000 |
| Migrations   | Alembic (`backend/alembic/`)        | Single migration history for schemas + tables; DSN reused from `Settings.database_url` |
| Data contracts | Pandera (`backend/app/pipeline/schemas.py`) | DataFrame validation at stage boundaries — fails the stage before bad data is written |
| Spatial API  | ArcGIS REST (sponsor-aligned)       | Primary ingestion mechanism for Alectra outages + Living Atlas      |
| Storage (A)  | Postgres — `raw / staging / curated / ml` schemas + `public.{communities, facilities, pca_loadings}` | Structural ontology + medallion layers, written by `python -m app.pipeline` |
| Storage (B)  | PostgreSQL + PostGIS                | Seasonal cache, refreshed daily by cron (future)                     |
| Storage (C)  | In-memory + short TTL cache + Postgres archive (`weather_observations`, future outage archive) | Live data + historical archive built by polling |
| ORM          | SQLAlchemy 2.x async + asyncpg      | Async ORM over Postgres; opt-in via `THRESHOLD_DATABASE_URL`        |
| Local stack  | Docker Compose (`docker-compose.yml`) | Postgres 16 + backend + Prefect server + MLflow tracking server, single `docker compose up` for full local env |
| Frontend host| Vercel                              | Static frontend + edge functions if needed                          |
| Backend host | Fly.io or Railway                   | FastAPI service with persistent volume for Postgres                 |

## System Boundaries

- `frontend/` — React + TypeScript app. Owns the map, scenario switching, detail panel, recommendation panel, live overlay toggles, and all client-side rendering. Talks to the backend over HTTP. Never computes scores itself — it consumes them.
- `backend/` — FastAPI service. Owns ML inference, LLM orchestration, recommendation composition, the Tier C live endpoints, and the polling archive of the Alectra outage feed. Reads the ontology from Postgres at startup into an in-memory `DataStore`. Also hosts the Tier A pipeline module (`backend/app/pipeline/`) so ingestion and serving share one venv + one set of ORM models.
- `backend/app/pipeline/` — Python package. Owns all ingestion, normalization, spatial joins, model training, scoring, and publication to the `public.communities` / `public.facilities` / `public.pca_loadings` serving tables. Structured as a medallion pipeline: `sources/` (upstream loaders), `stages/` (six chained stages: ingest → clean → features → train → score → publish), `flow.py` (Prefect orchestration), `config.py` (scenarios + factor columns), `schemas.py` (Pandera contracts). Run via `python -m app.pipeline` (full chain) or `python -m app.pipeline --stage <name>` (one stage). Full design in [pipeline.md](./pipeline.md). Uses `pipeline/data/` only as a local cache for upstream zip / CSV downloads — never as an output target.
- `pipeline/` (top level) — Holds `EDA.ipynb` (kept as a demo / exploratory notebook, no longer the build path) and the gitignored `pipeline/data/` cache dir.
- `context/` — Specification documents. Source of truth for what the system should be.
- `docs/` — Reference materials (hackathon docs, challenge sets, external references).

## Data Architecture: Three-Tier Fusion

| Tier | Refresh   | Source examples                                                                                  | Storage                                                                           |
| ---- | --------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| A    | Yearly    | StatsCan 2021 Census Tracts + demographics + CISV/CISR, Brampton ESRI census, facilities         | Postgres medallion: `raw.*` (audit) → `staging.*` (typed) → `curated.community_features` (joined) → `ml.{models, community_scores}` (versioned PCA) → `public.{communities, facilities, pca_loadings}` (serving)                      |
| B    | Daily     | Cooling centres (Miss./Bramp./Hamilton), Esri Living Atlas EJ, Esri Climate Hub heat vuln        | PostgreSQL + PostGIS (future)                                                     |
| C    | 5–15 min  | Alectra outages (ArcGIS REST), Open-Meteo / OpenWeather / EnvCan weather, advisories, AQHI       | In-memory TTL cache (hot serve) + `weather_observations` Postgres archive         |

## Ontology Model

All sources normalize to a small set of spatial entities, keyed by stable IDs. Every field on every entity records its source dataset, vintage, and confidence.

- **Community** — primary entity. **One per Census Tract.** Holds composite scores, factor sub-scores, demographic aggregates, the municipal label(s) that contain or overlap the tract, the `served_by_alectra` flag, and references to overlapping Buildings, GridFeeders, Shelters, WeatherCells, and active Outages/Advisories.
- **Building** — for retrofit/incentive targeting (PS1). Age, type, owner/renter mix proxy. Aggregated from MPAC + municipal property data; joined to Community via spatial join.
- **GridFeeder** — utility-side grid segment. For outage history and prediction. Initially scaffolded; populated only if Alectra exposes feeder topology data during the build window.
- **Shelter** — cooling/warming centres and community facilities (libraries, community centres). Location, capacity, current open/closed status. One row per facility across the three cities.
- **WeatherCell** — gridded weather observation/forecast. Current temp, humidex, wind, advisory flags.
- **PollutionSource** — for PS3. Point source with emission type and intensity. Stretch.
- **Outage** — Alectra outage polygon. Spatial-joined to overlapping Communities. Archived per poll with `polled_at` for historical sample construction.
- **Advisory** — Active weather advisory polygon (heat, cold, flood, storm). Spatial-joined to Communities.

## Storage Model

**Postgres is the system of record.** The ontology and the live archive both live there; the backend never reads ontology files at runtime.

- **Tier A (Postgres medallion)**: The pipeline writes through five schemas — `raw.*` holds verbatim upstream payloads (audit), `staging.*` holds typed/cleaned rows, `curated.community_features` is the joined feature table the model and serving tier both read, `ml.{models, community_scores}` holds versioned PCA artifacts + per-CT scores with `model_id` provenance, and `public.{communities, facilities, pca_loadings}` are the serving tables the FastAPI app loads at startup. The `publish` stage promotes `ml.* + staging.facilities + curated.community_features` into `public.*` in a single transaction so readers never see a half-rewritten ontology. Full design in [pipeline.md](./pipeline.md); migrations in [backend/alembic/versions/](../backend/alembic/versions/); ORM definitions in [backend/app/models/db.py](../backend/app/models/db.py).
- **Tier B (Postgres, future)**: Daily-refreshed entity tables (Shelters, PollutionSources, Living Atlas EJ snapshots). Spatial indices on geometry, SRID 4326 — added once PostGIS is enabled.
- **Tier C live cache (in-memory)**: FastAPI process holds short-TTL responses for weather, advisories, AQHI. Refresh on miss.
- **Tier C archive (Postgres)**: `weather_observations` — one row per fetch from any weather source. `threshold_scores` — audit trail of CT × scenario × computation. Written via `PersistenceService` ([backend/app/services/persistence.py](../backend/app/services/persistence.py)).
- **ML model artifacts**: ONNX files in `backend/models/`, version-pinned. Sibling JSON metadata file per artifact. Loaded once at process start.
- **LLM responses**: Not cached server-side in MVP. Streamed to client per request.

### Database Connection Lifecycle

Engine + sessionmaker live in [backend/app/db.py](../backend/app/db.py); ORM models in [backend/app/models/db.py](../backend/app/models/db.py); write helpers in [backend/app/services/persistence.py](../backend/app/services/persistence.py); read helper in [backend/app/services/data_loader.py](../backend/app/services/data_loader.py).

The FastAPI lifespan runs the boot sequence in order:
1. `Database(settings)` + `await db.connect()` — creates the async engine, runs `Base.metadata.create_all()` for the `public.*` ORM tables (Alembic owns the `raw / staging / curated / ml` schemas; the two systems coexist because `create_all` is idempotent and never touches the medallion layers).
2. `PersistenceService(db)` — registered for routes that want to archive observations / scores.
3. `await load_data_store(db)` — queries `public.communities`, `public.facilities`, `public.pca_loadings` and assembles the in-memory `DataStore` that every read route hits.

The DB layer is **opt-in for tests and degraded boot**: `THRESHOLD_DATABASE_URL` unset → `db.enabled = False`, `load_data_store` returns an empty store with a warning, and `PersistenceService` methods no-op. The backend still boots and live endpoints (weather, outages) keep working. The pipeline (`python -m app.pipeline`) **requires** the DSN and raises if it's missing.

**Migrations:** Alembic is the source of truth for the medallion schemas. `alembic upgrade head` from `backend/` applies [0001_pipeline_layers.py](../backend/alembic/versions/0001_pipeline_layers.py) which creates the four schemas plus all 13 raw/staging/curated/ml tables. New schema changes go through Alembic; `create_all` continues to handle the `public.*` tables on startup.

### Medallion + capture tables

The pipeline writes through five schemas; the backend reads only from `public.*`. See [pipeline.md](./pipeline.md) for the full table inventory.

| Schema | Table | Purpose |
|---|---|---|
| raw | `census_2021`, `cisv_cisr_2021`, `ct_boundaries`, `alectra_service_area`, `facilities`, `neighbourhoods` | One row per fetch — payload stored verbatim as JSONB, with `source_slug`, `source_url`, `load_at`. Immutable audit trail. |
| staging | `census_tracts`, `vulnerability`, `ct_geometries`, `facilities` | Typed columns per logical entity, deduped, replayable from `raw.*`. Pandera-validated before write. |
| curated | `community_features` | One row per Brampton CT — full join across staging tables, clipped to Alectra service area. Input to model + publish. |
| ml | `models` | One row per trained model — `model_id` PK, scenario, version, pickled sklearn `Pipeline`, loadings, metrics, `mlflow_run_id`. |
| ml | `community_scores` | One row per CT × scenario — `score`, `grade`, `model_id` FK. Every score on the frontend traces back through here. |
| public | `communities` | Serving table the FastAPI app loads at startup. `ctuid` (pk), `properties` JSON, `geometry` JSON, `built_at`. |
| public | `facilities` | Cooling/warming centres. `id` (pk), `properties` JSON, `geometry` JSON, `built_at`. |
| public | `pca_loadings` | Per-scenario factor loadings for the radar chart. `factor` (pk), `loading_baseline`, `loading_heatwave`, `loading_icestorm`, `source_slug`. |
| Capture  | `weather_observations` | One row per fetch from any weather source (OpenWeather, Open-Meteo, EnvCan). Builds the historical-weather dataset Open-Meteo rate-limited us out of. | `source`, `station_id`, `ctuid`, `latitude`, `longitude`, `fetched_at`, `observed_at`, full measurement set, `raw_payload` JSONB |
| Capture  | `flood_observations` | One row per CT × Open-Meteo Flood (GloFAS v4) fetch. Discharge today, 30-day mean, 7-day max, anomaly ratio. | `ctuid`, `latitude`, `longitude`, `fetched_at`, `river_discharge`, `discharge_30d_mean`, `discharge_7d_max`, `discharge_anomaly`, `raw_payload` JSONB |
| Capture  | `threshold_scores` | One row per CT × scenario × computation — audit trail; not used as the read path. | `ctuid`, `scenario_slug`, `computed_at`, `score`, `factors` JSONB, `weights` JSONB |

PostGIS extension is not enabled today — geometry is stored as GeoJSON dicts in `JSON` columns rather than `GEOMETRY(…)` columns. When spatial-query workloads land (Shelters in radius, outage polygon intersect), the image switches to `postgis/postgis` and SRID 4326 conventions from `code-standards.md` apply.

### Local development stack

[docker-compose.yml](../docker-compose.yml) brings up the full backend environment:

- `db` — `postgres:16-alpine` with healthcheck, named volume `threshold_pgdata` so data persists across `docker compose down`.
- `backend` — built from [backend/Dockerfile](../backend/Dockerfile) (Python 3.12-slim + GEOS/GDAL/PROJ for geopandas). `depends_on: db.service_healthy` blocks startup until Postgres is reachable.
- `prefect` — `prefecthq/prefect:3-latest` running `prefect server start`. Holds the flow run history + UI on `:4200`. SQLite metadata in the `threshold_prefect` volume.
- `mlflow` — `ghcr.io/mlflow/mlflow:latest` running the tracking server on `:5000` with SQLite backend store + filesystem artifact store, both in the `threshold_mlflow` volume.

The backend container does not bind-mount `pipeline/data` — the ontology comes from Postgres, not from files. To populate Postgres:

1. Run migrations once: `cd backend && alembic upgrade head` (creates the `raw / staging / curated / ml` schemas).
2. Run the pipeline either on the host (`cd backend && python -m app.pipeline` with `THRESHOLD_DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/threshold`) or inside the container (`docker compose exec backend python -m app.pipeline`); either way the upstream zip/CSV cache stays at the operator's `pipeline/data/`.

Env-var passthrough: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`, `BACKEND_PORT`, `PREFECT_PORT`, `MLFLOW_PORT`, `OPENWEATHER_API_KEY`, `GEMINI_API_KEY`. All have sensible defaults; only secrets need to be supplied. The backend container also receives `THRESHOLD_MLFLOW_TRACKING_URI=http://mlflow:5000` and `THRESHOLD_PREFECT_API_URL=http://prefect:4200/api` so the pipeline can reach both services from inside the network.

## Auth and Access Model

- No user authentication in MVP. The product is a public civic-data view.
- Backend endpoints are public read-only with rate limiting on LLM-backed routes.
- Any future write surfaces (e.g. annotation, plan-sharing) will require auth — out of MVP scope.

## Invariants

1. **Numbers come from models, prose comes from LLMs.** An LLM may never output a probability, score, count, or projection that did not originate from a model, dataset, or scoring engine. LLM output is always wrapped around numeric values it received as input.
2. **Every score on the UI is traceable in ≤2 clicks** to the input numbers and the source datasets that produced it.
3. **Pipeline work does not happen in the request path.** Ingestion, spatial joins, and model training run in `backend/app/pipeline/` (CLI: `python -m app.pipeline`). Backend serves precomputed results from Postgres.
4. **Tier A data is immutable between pipeline runs.** Ontology tables (`communities`, `facilities`, `pca_loadings`) are rewritten only by the pipeline; backend read endpoints never `INSERT`/`UPDATE` them.
5. **Frontend computes nothing scored.** All scoring, ML inference, and recommendation composition happens in the backend.
6. **Sources are first-class.** Every persisted entity row records its source dataset slug and vintage. UI surfaces this on demand.
7. **Honest data vintage.** Real-time means real-time. Annual means annual. The product never labels static data as live.
8. **Community = Census Tract.** The analytical unit is always a Census Tract. Municipal neighbourhoods/wards/planning areas are label overlays only — they do not drive scoring or computation.
9. **Polling Alectra is archival, not active.** The Tier C archive of Alectra outage polls is for historical model training only. Live UI overlay reads from the in-memory cache, not the archive.
