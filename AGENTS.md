# Project Agent Instructions

## Project

Threshold — civic data fusion platform for community energy vulnerability. Built for Seneca Energy Hackathon 2026, Theme 3 (Community Energy, Equity & Sustainability). See `context/project-overview.md` for the full product specification.

## Product Axiom

**Every recommendation Threshold makes is traceable to a number, and every number is traceable to a public dataset.** This axiom overrides any other implementation instinct. LLMs write prose around numbers; they never invent numbers. ML models produce numbers; they cite the data they were trained on. Surfaces render numbers; the user can trace any colour or score to its source in two clicks or fewer.

## Folder Routing

When working in `frontend/`, read:

- `context/project-overview.md`
- `context/architecture.md`
- `context/code-standards.md`
- `context/ui-context.md`
- `skills/frontend-design/SKILL.md` (if present)

The frontend is React 18 + TypeScript + Vite + Tailwind + shadcn/ui + Mapbox GL. It owns the map, scenario switching, detail panel, recommendation panel, and live overlays. It consumes scores from the backend — it never computes them.

When working in `backend/`, read:

- `context/project-overview.md`
- `context/architecture.md`
- `context/code-standards.md`

The backend is FastAPI (Python 3.11+) with pydantic v2, PostgreSQL + PostGIS for Tier B storage, and ONNX runtime for ML inference. It orchestrates LLM calls (Gemini for synthesis, DeepSeek for critique) and serves Tier C live endpoints. It reads the ontology; it does not ingest.

When working in `pipeline/`, read:

- `context/project-overview.md`
- `context/architecture.md`
- `context/code-standards.md`

The pipeline is Python (pandas, geopandas, httpx) plus training scripts in PyTorch + scikit-learn. It owns ingestion, normalization, spatial joins, model training, and writing the ontology to storage (Tier A as GeoJSON to `frontend/public/data/`, Tier B into Postgres). It runs at build time and on cron, never in the request path.

When working in `context/` or `docs/`, treat the change as a specification update. Reflect it in `progress-tracker.md` in the same change.

## General Rules

- Read the relevant context before editing.
- Prefer existing project patterns over introducing new ones.
- Verify changes before claiming they are done. Frontend: `npm run build` passes. Backend: app boots clean. Pipeline: scripts run top-to-bottom.
- Keep commits focused by folder or feature area. Do not combine `frontend/` and `backend/` work in one commit unless the change is genuinely cross-cutting (e.g. a new ontology field).
- When the product axiom and a convenience are in conflict, the axiom wins.

## Hackathon Constraints

- Submission deadline: **2026-05-26 23:59 ET.**
- MVP scope is defined in `context/project-overview.md` and is the hard floor.
- Stretch features ship only if MVP is green.
- Honest data vintage at all times: real-time means real-time, annual means annual.
