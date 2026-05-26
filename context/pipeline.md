# Pipeline Architecture

The Tier A pipeline lives in [backend/app/pipeline/](../backend/app/pipeline/). It is a **medallion-layered** data pipeline: every upstream fetch lands in `raw.*`, gets cleaned and typed into `staging.*`, joined into `curated.*`, fed into a model that lives in `ml.*`, and finally promoted into the three `public.*` tables the FastAPI app reads.

Run with `python -m app.pipeline` (full chain) or `python -m app.pipeline --stage <name>` (single stage).

---

## Stages (one module each, in [backend/app/pipeline/stages/](../backend/app/pipeline/stages/))

| # | Stage | Reads | Writes | Module |
|---|---|---|---|---|
| 1 | `ingest` | upstream APIs / shapefiles | `raw.*` (6 tables) | [stages/ingest.py](../backend/app/pipeline/stages/ingest.py) |
| 2 | `clean` | `raw.*` | `staging.*` (4 tables) | [stages/clean.py](../backend/app/pipeline/stages/clean.py) |
| 3 | `features` | `staging.*` | `curated.community_features` | [stages/features.py](../backend/app/pipeline/stages/features.py) |
| 4 | `train` | `curated.community_features` | `ml.models` (also → MLflow) | [stages/train.py](../backend/app/pipeline/stages/train.py) |
| 5 | `score` | `ml.models` + `curated.*` | `ml.community_scores` | [stages/score.py](../backend/app/pipeline/stages/score.py) |
| 6 | `publish` | `ml.*` + `staging.facilities` | `public.{communities, facilities, pca_loadings}` | [stages/publish.py](../backend/app/pipeline/stages/publish.py) |

Each stage exposes a single `async def run(db, **kwargs) -> StageResult`. They are decoupled — running `--stage train` does not re-fetch upstream data; it just refits on whatever currently sits in `curated.community_features`.

---

## Schema layout (Postgres)

```sql
CREATE SCHEMA raw;        -- bronze: as-fetched payloads (audit trail)
CREATE SCHEMA staging;    -- silver: typed, cleaned, deduplicated
CREATE SCHEMA curated;    -- gold: joined feature tables (model + serving input)
CREATE SCHEMA ml;         -- model artifacts + per-CT scores
-- public.communities / facilities / pca_loadings stay as the serving layer
```

### Tables created by [alembic/versions/0001_pipeline_layers.py](../backend/alembic/versions/0001_pipeline_layers.py)

| Schema | Table | Key columns |
|---|---|---|
| raw | `census_2021` | `id`, `source_slug`, `source_url`, `load_at`, `payload` JSONB, `row_count` |
| raw | `cisv_cisr_2021` | same shape — DA-level CIMD payload |
| raw | `alectra_service_area` | same shape — service-area polygons |
| raw | `ct_boundaries` | same shape — StatsCan CT shapefile (as GeoJSON records) |
| raw | `facilities` | same shape — recreation + library payloads |
| raw | `neighbourhoods` | same shape — Brampton Secondary Plan Areas FeatureCollection |
| staging | `census_tracts` | `ctuid` PK + typed demographic columns |
| staging | `vulnerability` | `ctuid` PK + CISV/CISR scores + dimensions |
| staging | `ct_geometries` | `ctuid` PK + geometry + neighbourhood + served_by_alectra |
| staging | `facilities` | typed facility records (name, address, role, geometry) |
| curated | `community_features` | full join — every column the model + frontend consume |
| ml | `models` | `model_id` PK, `kind`, `version`, `scenario`, `loadings` JSONB, `metrics` JSONB, `artifact` BYTEA, `mlflow_run_id` |
| ml | `community_scores` | one row per CT × scenario, with FK to `ml.models` |

`public.communities`, `public.facilities`, `public.pca_loadings` are unchanged in shape — the `publish` stage refreshes them in a single transaction so the backend never sees a half-written ontology.

---

## Source loaders ([backend/app/pipeline/sources/](../backend/app/pipeline/sources/))

The per-source modules pull data from one upstream system each and return typed DataFrames / GeoDataFrames. They are pure: no DB writes, no caching policy.

| Source | Module | Returns |
|---|---|---|
| StatsCan CT boundaries | [sources/boundaries.py](../backend/app/pipeline/sources/boundaries.py) | `GeoDataFrame` (~370 CTs, WGS84) |
| Brampton Census 2021 (ESRI FS) | [sources/census.py](../backend/app/pipeline/sources/census.py) | `DataFrame` (122 CTs, demographics) |
| CISV + CISR (StatsCan) | [sources/cimd.py](../backend/app/pipeline/sources/cimd.py) | `DataFrame` (CT-aggregated CIMD) |
| Alectra service area | [sources/alectra.py](../backend/app/pipeline/sources/alectra.py) | `GeoDataFrame` (18 polygons) |
| Brampton facilities | [sources/facilities.py](../backend/app/pipeline/sources/facilities.py) | `GeoDataFrame` (rec + libraries) |
| Brampton Secondary Plan Areas | [sources/neighbourhoods.py](../backend/app/pipeline/sources/neighbourhoods.py) | `Series[CTUID → SPA_NAME]` |

URL constants live in [sources/urls.py](../backend/app/pipeline/sources/urls.py). HTTP helpers in [sources/_http.py](../backend/app/pipeline/sources/_http.py).

---

## Data contracts ([backend/app/pipeline/schemas.py](../backend/app/pipeline/schemas.py))

Pandera schemas validate dataframes at stage boundaries. A failed validation aborts the stage *before* it writes the bad data downstream.

- `CensusTractStaging` — enforces `ctuid` format + percentage range checks
- `VulnerabilityStaging` — enforces CISV/CISR column presence
- `CommunityFeatures` — enforces the curated table's columns + `served_by_alectra` is boolean

---

## ML layer ([backend/app/pipeline/stages/train.py](../backend/app/pipeline/stages/train.py) + [stages/score.py](../backend/app/pipeline/stages/score.py))

**Model:** `Pipeline([StandardScaler, PCA(n_components=5)])` — one fit per scenario.

**Training flow:**
1. Load `curated.community_features`.
2. Drop rows with >50% null factors; median-impute the rest; sign-flip `INVERTED_FACTORS`.
3. For each scenario in [config.py:SCENARIOS](../backend/app/pipeline/config.py), apply weight overrides → fit pipeline → rescale PC1 to 0..100.
4. Log params + metrics + sklearn pipeline to **MLflow** (best-effort — pipeline survives MLflow being down).
5. Persist row to `ml.models` with the pickled sklearn `Pipeline`, JSON loadings, JSON metrics, and the MLflow `run_id`.

**Scoring flow:**
1. For each scenario, load the latest model row from `ml.models`.
2. Reconstruct sklearn `Pipeline` from the artifact; apply to current `curated.community_features`.
3. Rescale to 0..100 using the train-time min/max so scores are comparable across runs.
4. Bucket via [config.py:grade_for](../backend/app/pipeline/config.py) → `Critical | High | Moderate | Low`.
5. Insert one row per CT × scenario into `ml.community_scores` with the originating `model_id`.

Every score on the frontend is traceable to a `model_id` → MLflow run → exact training data snapshot.

---

## Orchestration

### CLI

```bash
# full chain
python -m app.pipeline

# one stage at a time (iterating)
python -m app.pipeline --stage clean

# via Prefect (registers with the local Prefect server if reachable)
python -m app.pipeline --prefect

# register as a daily deployment (06:00 America/Toronto)
python -m app.pipeline --prefect --serve
```

### Prefect flow ([backend/app/pipeline/flow.py](../backend/app/pipeline/flow.py))

The flow wraps each stage as a `@task` with retries + per-task logging. Run UI at `http://localhost:4200` (Prefect service in [docker-compose.yml](../docker-compose.yml)).

### MLflow

Tracking server at `http://localhost:5000` (MLflow service in `docker-compose.yml`). Backed by SQLite + filesystem artifact store, both inside the `threshold_mlflow` Docker volume.

Tracking URI is configurable via `THRESHOLD_MLFLOW_TRACKING_URI`; defaults to `http://localhost:5000`.

### Alembic

```bash
# migrate the DB to the latest schema (creates raw / staging / curated / ml)
cd backend
alembic upgrade head

# create a new migration
alembic revision -m "add my feature"
```

Config in [backend/alembic.ini](../backend/alembic.ini); env in [backend/alembic/env.py](../backend/alembic/env.py). Migrations live in [backend/alembic/versions/](../backend/alembic/versions/). The Alembic DSN is pulled from `Settings.database_url` so it never diverges from the runtime DSN.

---

## File layout

```
backend/
├── alembic.ini
├── alembic/
│   ├── env.py
│   └── versions/
│       └── 0001_pipeline_layers.py
└── app/
    └── pipeline/
        ├── __init__.py            (package docs only)
        ├── __main__.py            (CLI entry: --stage / --prefect)
        ├── build.py               (run_all + run_stage helpers)
        ├── config.py              (FACTOR_COLS, SCENARIOS, grade_for, runtime())
        ├── flow.py                (Prefect @flow wrapping stages)
        ├── schemas.py             (Pandera contracts)
        ├── sources/
        │   ├── __init__.py        (re-exports)
        │   ├── urls.py            (every upstream URL + SOURCE_SLUGS)
        │   ├── _http.py           (httpx helpers)
        │   ├── alectra.py
        │   ├── boundaries.py
        │   ├── census.py
        │   ├── cimd.py
        │   ├── facilities.py
        │   └── neighbourhoods.py
        └── stages/
            ├── __init__.py        (StageResult dataclass)
            ├── ingest.py
            ├── clean.py
            ├── features.py
            ├── train.py
            ├── score.py
            └── publish.py
```

---

## Why this layout

- **Lineage is explicit.** Every column the frontend serves can be traced from `public.communities` → `curated.community_features` → `staging.{census_tracts, vulnerability, ct_geometries}` → `raw.{census_2021, cisv_cisr_2021, ct_boundaries}` → upstream URL.
- **Re-runs are cheap.** A model tweak does `--stage train --stage score --stage publish`. No re-fetching.
- **Failures are local.** A bad upstream payload fails the `clean` stage and never poisons `curated.*`.
- **Models are versioned.** Each training run inserts a new row in `ml.models` with a new `model_id`. Old rows stay around; rollback is `UPDATE community_scores SET model_id = '<previous>'`.
- **No file output.** Postgres is the system of record. `pipeline/data/` is a local cache for upstream zip / CSV downloads only, never consumed by serving code.
