# Threshold Backend

FastAPI service for Threshold. Serves pre-computed Census-Tract scores, proxies the
Alectra live outage feed and Open-Meteo weather, composes traceable recommendation
cards, and (optionally) orchestrates a Gemini briefing per CT.

The backend never computes scores from scratch at request time. It reads the
ontology that `app.pipeline` (run via `python -m app.pipeline`) has persisted
into Postgres — three tables: `communities`, `facilities`, `pca_loadings`.
There are no file artifacts; the database is the system of record.
`pipeline/EDA.ipynb` remains as a judge-facing exploration notebook — it shows
the data lineage and lets us decide which factors stay in the score — but it
is no longer the build path.

## Layout

```
backend/
├── app/
│   ├── main.py              FastAPI app, lifespan, CORS, route mounting
│   ├── config.py            Settings from env (pydantic-settings)
│   ├── sources.py           Source-citation registry (slug → label/vintage/url)
│   ├── models/              Pydantic v2 response models
│   ├── routes/              Thin HTTP handlers
│   │   ├── health.py
│   │   ├── communities.py   GET /api/communities, /api/communities/{ctuid}
│   │   ├── outages.py       GET /api/outages
│   │   ├── weather.py       GET /api/weather
│   │   ├── facilities.py    GET /api/facilities
│   │   ├── scenarios.py     GET /api/scenarios
│   │   ├── briefing.py      POST /api/briefing
│   │   └── recommendations.py  GET /api/recommendations
│   ├── db.py                Async SQLAlchemy engine + session wrapper
│   ├── services/            Business logic
│   │   ├── data_loader.py   Loads communities/facilities/loadings from DB at startup
│   │   ├── scoring.py       Score lookup, factor breakdown, risk tier
│   │   ├── cache.py         In-memory TTL cache
│   │   ├── outages.py       Alectra ArcGIS proxy + cache
│   │   ├── weather.py       Open-Meteo proxy + cache
│   │   ├── recommendations.py  Rule-based, traceable card composer
│   │   └── llm.py           Gemini briefing call + deterministic fallback
│   └── pipeline/            Tier A build (writes to Postgres, not files)
│       ├── __main__.py      `python -m app.pipeline` entry point
│       ├── build.py         Orchestrator + CLI
│       ├── db_writer.py     Truncate-and-insert into communities/facilities/pca_loadings
│       ├── sources.py       Upstream URL constants
│       ├── boundaries.py    A1 — StatsCan CT shapefile
│       ├── census.py        A2 — Brampton ESRI Census 2021
│       ├── cimd.py          A3/A4 — CISV + CISR (DA → CT)
│       ├── alectra.py       Alectra service area polygon
│       ├── facilities.py    Recreation centres + libraries
│       ├── neighbourhoods.py Secondary Plan Area names
│       └── scoring.py       PCA composite + per-scenario loadings
└── tests/                   pytest + httpx.AsyncClient endpoint tests
```

## Run

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Point at a running Postgres. Set in backend/.env or export inline.
$env:THRESHOLD_DATABASE_URL = "postgresql+asyncpg://user:pass@localhost:5432/threshold"

# Build the Tier A artifacts (~30 s on a warm upstream cache, a few minutes
# cold). Truncates and rewrites communities/facilities/pca_loadings in one
# transaction. No files are produced.
python -m app.pipeline

uvicorn app.main:app --reload --port 8000
```

Then open <http://localhost:8000/docs>.

## Environment

See `.env.example`. The service boots even without `GEMINI_API_KEY` set —
`/api/briefing` returns a deterministic, source-cited fallback briefing built
from the numeric inputs (still satisfies the product axiom: no invented numbers).

If `THRESHOLD_DATABASE_URL` is unset, or the `communities` table is empty, the
service still boots and logs a warning — the community list will be empty until
the pipeline has been run. Run `python -m app.pipeline` to populate.

## Invariants

- LLM output is wrapped around numbers from the scoring engine; it never invents
  values. The prompt receives the exact factor table; the response is parsed and
  the numeric placeholders are re-validated.
- Every response carries `{ data, sources, generated_at }`. `sources` is the
  list of dataset slugs that produced the numbers in `data`.
- Tier C live data is in-memory only at request time; the backend never writes
  to the ontology tables.
- Tier A data is read-only for the backend — only `app.pipeline` writes to
  `communities` / `facilities` / `pca_loadings`.

## Tests

```powershell
pytest
```

The tests stub Tier C HTTP calls and exercise every route's schema. They do not
require a live Alectra or Open-Meteo connection.
