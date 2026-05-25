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
| Pipeline     | Python (pandas, geopandas, requests)| Ingest, normalize, spatial joins, write ontology JSON               |
| Storage (A)  | Flat JSON / GeoJSON in repo         | Structural ontology, baked at build time                            |
| Storage (B)  | PostgreSQL + PostGIS                | Seasonal cache, refreshed daily by cron                              |
| Storage (C)  | In-memory + short TTL cache         | Live data (weather, outages, AQHI)                                  |
| Frontend host| Vercel                              | Static frontend + edge functions if needed                          |
| Backend host | Fly.io or Railway                   | FastAPI service with persistent volume for Postgres                 |

## System Boundaries

- `frontend/` — React + TypeScript app. Owns the map, scenario switching, detail panel, recommendation panel, live overlay toggles, and all client-side rendering. Talks to the backend over HTTP. Never computes scores itself — it consumes them.
- `backend/` — FastAPI service. Owns ML inference, LLM orchestration, recommendation composition, and the Tier C live endpoints. Reads from the ontology store. Does not own ingestion.
- `pipeline/` — Python scripts and notebooks. Owns ingestion, normalization, spatial joins, model training, and writing the ontology to storage (Tier A as JSON, Tier B into Postgres). Runs at build time and on cron, not in the request path.
- `context/` — Specification documents. Source of truth for what the system should be.
- `docs/` — Reference materials (hackathon docs, challenge sets, external references).

## Data Architecture: Three-Tier Fusion

| Tier | Refresh   | Source examples                                                                   | Storage              |
| ---- | --------- | --------------------------------------------------------------------------------- | -------------------- |
| A    | Yearly    | StatsCan 2021 Census, Toronto Open Data neighbourhood boundaries, NRCan flood map | Flat JSON in repo    |
| B    | Daily     | Cooling centres, air quality stations, Esri Living Atlas EJ layers                | PostgreSQL + PostGIS |
| C    | 5–15 min  | EnvCan GeoMet weather, AQHI, Toronto Hydro outage map, active advisories          | In-memory + TTL      |

## Ontology Model

All sources normalize to a small set of spatial entities, keyed by stable IDs. Every field on every entity records its source dataset, vintage, and confidence.

- **Neighbourhood** — primary entity. Holds composite scores, factor sub-scores, demographic aggregates, and references to overlapping Buildings, GridFeeders, Shelters, and WeatherCells.
- **Building** — for retrofit/incentive targeting (PS1). Age, type, owner/renter mix proxy.
- **GridFeeder** — utility-side grid segment. For outage history and prediction.
- **Shelter** — cooling/warming centres and community facilities. Location, capacity, current open/closed status.
- **WeatherCell** — gridded weather observation/forecast. Current temp, humidex, advisories.
- **PollutionSource** — for PS3. Point source with emission type and intensity.

## Storage Model

- **Tier A (flat JSON in repo)**: Neighbourhood polygons + structural attributes, baked GeoJSON, deployed with frontend. No DB needed for structural data — it's small and changes yearly.
- **PostgreSQL + PostGIS (Tier B)**: Daily-refreshed entity tables (shelters, pollution sources, AQHI stations). Spatial indices on geometry. Source provenance columns on every row.
- **In-memory cache (Tier C)**: FastAPI process holds short-TTL responses for weather, outages, advisories. Refresh on miss. Never persisted.
- **ML model artifacts**: ONNX files in `backend/models/`, version-pinned. Loaded once at process start.
- **LLM responses**: Not cached server-side in MVP. Streamed to client per request.

## Auth and Access Model

- No user authentication in MVP. The product is a public civic-data view.
- Backend endpoints are public read-only with rate limiting on LLM-backed routes.
- Any future write surfaces (e.g. annotation, plan-sharing) will require auth — out of MVP scope.

## Invariants

1. **Numbers come from models, prose comes from LLMs.** An LLM may never output a probability, score, count, or projection that did not originate from a model, dataset, or scoring engine. LLM output is always wrapped around numeric values it received as input.
2. **Every score on the UI is traceable in ≤2 clicks** to the input numbers and the source datasets that produced it.
3. **Pipeline work does not happen in the request path.** Ingestion, spatial joins, and model training run in `pipeline/` jobs. Backend serves precomputed results.
4. **Tier A data is immutable per deploy.** It is regenerated by a pipeline run and committed; the backend never writes to Tier A storage at runtime.
5. **Frontend computes nothing scored.** All scoring, ML inference, and recommendation composition happens in the backend.
6. **Sources are first-class.** Every persisted entity row records its source dataset slug and vintage. UI surfaces this on demand.
7. **Honest data vintage.** Real-time means real-time. Annual means annual. The product never labels static data as live.
