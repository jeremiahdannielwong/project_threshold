# Code Standards

## General

- Keep modules small and single-purpose. One responsibility per file.
- Fix root causes, do not layer workarounds. If a data source is broken, fix the ingestion — do not paper over it in the UI.
- Do not mix unrelated concerns in one component, route, or pipeline step.
- Sources are first-class. Any function that produces a derived value should be able to name the source data that produced it.

## TypeScript (frontend)

- Strict mode is required. `"strict": true` in `tsconfig.json` is non-negotiable.
- No `any`. Use explicit interfaces, narrow union types, or `unknown` with a parsing step at the boundary.
- Validate any data crossing the boundary from the backend with a typed parser (Zod) before trusting it. Score, tier, and recommendation payloads in particular.
- Prefer functional components and hooks. No class components.
- Co-locate component types with the component (`Foo.tsx` exports `Foo` and `FooProps`).

## React (frontend)

- Server components are not in scope (Vite SPA). All components are client components.
- Lift data fetching to top-level routes or container components. Leaf components receive props.
- Use `useMemo` for expensive derivations (top-N sort, scenario re-keying). Do not over-memoize trivial values.
- Map interaction handlers (hover, click) must be debounced or throttled where they update React state on every mouse move.

## Python (backend + pipeline)

- Target Python 3.11+. Use `from __future__ import annotations` only where genuinely needed.
- Type hints required on every function signature in `backend/`. In `pipeline/` notebooks they are encouraged but not enforced.
- Use `pydantic` v2 for all request/response models in FastAPI.
- Use `pandas` for tabular data and `geopandas` for anything spatial. Do not roll your own spatial join.
- Use `httpx` for outbound HTTP (sync or async). Do not use `requests` in new code.
- Standard formatter: `ruff format`. Standard linter: `ruff check`.

## FastAPI Routes

- Validate and parse request input with a pydantic model before any logic runs.
- Return consistent response shapes. Every score or recommendation response carries the same wrapper: `{ data, sources, generated_at }`.
- Keep route handlers thin. Business logic lives in service modules under `backend/services/`.
- LLM-backed routes have an explicit timeout and a graceful fallback that still surfaces the underlying numbers.

## ML / Model Code

- Model training scripts live in `pipeline/training/`. They produce `.onnx` artifacts written to `backend/models/`.
- Every model artifact ships with a sibling `<model>.json` metadata file recording: training data source, vintage, feature names, accuracy/R² on a held-out split, training timestamp.
- Inference loads ONNX via `onnxruntime` in the backend. PyTorch is not a runtime dependency of the backend.
- A model's predicted value, confidence interval, and feature attribution must all be retrievable per inference call.

## Pipeline / Ingestion Code

- Pipeline modules live under `backend/app/pipeline/`. One module per upstream source (`boundaries.py`, `census.py`, `cimd.py`, `alectra.py`, `facilities.py`, `neighbourhoods.py`), plus `build.py` (orchestrator), `scoring.py` (PCA), and `db_writer.py` (Postgres UPSERT).
- Every ingestion logs the source URL, row count, and any geometry-validity drops. The pipeline orchestrator (`build_all`) emits section headers (`=== A1 · CT boundaries ===`) so a partial failure is locatable.
- Spatial joins use `geopandas.sjoin` with a documented predicate (`intersects` or `within`). Never approximate with bounding boxes alone.
- The pipeline writes the ontology to the `communities`, `facilities`, and `pca_loadings` Postgres tables via `db_writer.write_ontology`. It does **not** write files; `pipeline/data/` is an input cache only.

## Styling

- Use Tailwind utility classes. No hardcoded hex values in JSX or CSS — reference CSS custom properties defined in `ui-context.md`.
- Follow the border-radius scale in `ui-context.md`. Never write a raw `rounded-[5px]` outside the scale.
- Dark theme only. No light-mode variants. The mission-control aesthetic is the brand.

## API Contracts

- Every entity ID is a string slug, not an int. `"rexdale-kipling"`, not `42`.
- Scores are floats in `[0, 1]`. Tiers are one of `"Critical" | "High" | "Medium" | "Low"`.
- Timestamps are ISO 8601 with timezone. Never naive datetimes.
- Source citations are arrays of `{ slug, label, vintage, url }`.

## Data and Storage

- Tier A: Postgres tables (`communities`, `facilities`, `pca_loadings`) written by `python -m app.pipeline`. Backend reads at startup into an in-memory `DataStore`. No GeoJSON file fallback — the DB is the source of truth.
- Tier B: Postgres + PostGIS (future). Geometry columns will use SRID 4326 when enabled.
- Tier C: in-memory cache for hot serving; **optional** Postgres archive for historical/training datasets (e.g. `weather_observations`, `flood_observations`, future outage polls). Persistence is opt-in via `THRESHOLD_DATABASE_URL` — the live request path never blocks on the DB.
- The directory `pipeline/data/` is the gitignored upstream-source cache the pipeline writes raw zips/CSVs to. Nothing else reads from it.

## Persistence (SQLAlchemy)

- ORM models live in `backend/app/models/db.py`. Every model inherits from `Base` in `backend/app/db.py`.
- Use SQLAlchemy 2.x `Mapped[...]` + `mapped_column(...)` syntax. No legacy `Column()` declarations in new code.
- Write helpers belong in `backend/app/services/persistence.py`. Routes do not open sessions directly — they call `PersistenceService` methods so the "DB disabled" branch stays in one place.
- Every persisted row records `source` (slug from `sources.py`) where the concept of provenance applies. JSON columns (`raw_payload`, `factors`, `weights`) keep the full upstream / computed payload so we can rederive without re-fetching.
- No Alembic migrations during the hackathon — `Base.metadata.create_all()` runs at startup. When a deployed env needs schema changes without dropping data, add Alembic.

## File Organization

- `frontend/src/components/` — React components, one per file, PascalCase.
- `frontend/src/lib/` — pure TS utilities, parsers, formatters.
- `frontend/src/hooks/` — custom hooks.
- `backend/app/` — FastAPI app: `routes/`, `services/`, `models/` (Pydantic + ORM in `models/db.py`), `pipeline/`, `db.py` (engine), `deps.py` (FastAPI deps).
- `backend/app/pipeline/` — Tier A ingestion package. One module per upstream source plus `build.py` orchestrator and `db_writer.py`.
- `backend/models/` — ONNX artifacts and their sibling metadata files.
- `pipeline/data/` — gitignored cache for raw upstream zips/CSVs the pipeline downloads.
- `pipeline/EDA.ipynb` — exploratory / demo notebook. Not part of the build path.
