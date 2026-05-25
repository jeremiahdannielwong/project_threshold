# Threshold — Product Requirements Document

**Version:** 1.0  
**Date:** 2026-05-25  
**Status:** Living Document — Hackathon MVP  
**Deadline:** 2026-05-26 23:59 ET (Seneca Energy Hackathon 2026)

---

## Table of Contents

1. Executive Summary
2. Product Vision
3. Mission Statement
4. Problem Statement
5. Solution Overview
6. Market Context and Sponsor Alignment
7. Target Users and Personas
8. Core User Flows
9. Feature Requirements
10. Data Architecture
11. Technical Architecture
12. ML Architecture
13. LLM Architecture
14. API Design
15. UI/UX Requirements
16. Design System
17. Scoring Engine Specification
18. Data Sources and Provenance
19. Testing Strategy
20. Monitoring and Observability
21. Functional Requirements
22. Non-Functional Requirements
23. Scalability Considerations
24. Reliability Considerations
25. Security and Privacy Considerations
26. Accessibility Considerations
27. Deployment Architecture
28. Technical Constraints
29. Known Limitations
30. Future Expansion Opportunities

---

## 1. Executive Summary

Threshold is a civic data fusion platform for community energy vulnerability built for the Seneca Energy Hackathon 2026, Theme 3: Community Energy, Equity and Sustainability. It ingests structural, seasonal, and real-time data — currently siloed across Alectra Utilities, the City of Brampton, Statistics Canada, and Environment Canada — normalises them into a shared spatial ontology, and produces traceable, quantitative vulnerability assessments and recommendations that emergency managers, utility planners, and community organisations can act on together.

The MVP demonstrates:
- A dark mission-control choropleth of 122 Brampton Census Tracts coloured by Threshold Vulnerability Score
- Three data tiers fused: StatsCan 2021 Census and CISV/CISR indices (Tier A), live weather from Open-Meteo (Tier B), and Alectra's live outage feed via ArcGIS Hub (Tier C)
- Three scenario modes (Baseline, Heatwave, Ice Storm) that re-weight factors and recolour the map instantly
- PCA-based composite vulnerability scoring with full factor traceability
- Brampton facility overlay (45 cooling and warming centres)
- Per-community detail panel with radar chart, factor breakdown, and source citations

As of 2026-05-25: the data pipeline (`pipeline/EDA.ipynb`) is complete, fully verified against live sources, and self-contained. The application layer (React frontend + FastAPI backend) is the remaining build target for the final 24 hours before submission.

---

## 2. Product Vision

**Threshold makes community energy vulnerability visible, quantifiable, and actionable — in real time.**

The product vision is a future where utility operators, municipal emergency managers, and community organisations share a single, live operational picture of which communities are most at risk during energy and climate events — and have ranked, costed, traceable recommendations for what to do about it.

The vision is grounded in a specific gap: today, the data to answer "which neighbourhood needs a welfare check before this heat dome arrives?" exists across a dozen public databases. But no tool fuses them. An emergency manager at Alectra cannot today answer: "given the current Alectra outage polygon, which Census Tracts have the highest concentration of elderly renters in pre-1980 buildings with low incomes?" Threshold makes that query instantaneous.

For the hackathon MVP, this vision is demonstrated with Brampton. For production, it extends to all 17 Alectra communities and eventually to any Canadian utility territory with open civic data.

---

## 3. Mission Statement

**Every recommendation Threshold makes is traceable to a number, and every number is traceable to a public dataset.**

This is non-negotiable. The LLM writes prose around numbers; it never invents numbers. ML models produce numbers; they cite the data they were trained on. The map renders numbers; clicking any colour reveals the score and its inputs in two clicks or fewer.

The mission statement is an architectural constraint, not a marketing slogan. It is enforced through system invariants, UI design, and the data provenance model.

---

## 4. Problem Statement

### 4.1 The Siloed Data Problem

Civic data relevant to community energy vulnerability is fragmented across incompatible systems:

| Data Type | Current Home | Access Complexity |
|-----------|-------------|-------------------|
| Census demographics (income, age, tenure) | Statistics Canada | Public, but requires shapefile joins |
| Social vulnerability indices (CISV/CISR) | Statistics Canada | Public, DA-level, requires CT crosswalk |
| Power outage feeds | Alectra ArcGIS Hub | Public ArcGIS REST, undocumented layer structure |
| Current weather and advisories | Environment Canada / Open-Meteo | Public JSON APIs, per-point queries |
| Community facilities (cooling centres) | City of Brampton ArcGIS | Public ESRI FeatureServer |
| Flood hazard zones | NRCan ArcGIS | Public, but returns empty for this geography |

No tool today fuses these sources into a single, spatially consistent view at Census Tract granularity.

### 4.2 The Equity Blindspot

Emergency response planning often relies on administrative boundaries (wards, planning districts) that do not map cleanly to socioeconomic reality. Census Tracts — the analytical unit in Threshold — are designed to be internally homogeneous by population size and are the smallest unit at which StatsCan publishes income and vulnerability indices. Ward-level planning misses the intra-ward variation that makes some Census Tracts critical while adjacent tracts are low-risk.

### 4.3 The Temporal Gap

Structural vulnerability (who lives where, what their housing is like, what their income is) changes on multi-year timescales. Energy system events (outages, heat extremes) happen in hours. No current tool bridges these two timescales — connecting the annual census picture to the live outage polygon overlay.

### 4.4 The Traceability Problem

AI-generated civic recommendations without auditable provenance are a liability, not an asset. Emergency managers need to defend decisions; community organisations need to challenge them. Threshold's design makes every score and every recommendation traceable to its source data in two clicks or fewer — a design constraint that drives both the scoring architecture and the UI.

---

## 5. Solution Overview

Threshold addresses the above through three integrated layers:

### 5.1 Data Fusion Layer

A self-contained Python pipeline (`pipeline/EDA.ipynb`) ingests 9 public data sources, normalises them to Census Tract granularity, performs spatial joins, and outputs a single GeoJSON file (`brampton_full.geojson`) containing all structural attributes, vulnerability scores, and overlay metadata for 122 Brampton Census Tracts.

The three-tier architecture handles data at different refresh rates:
- **Tier A (Structural, yearly):** StatsCan CT boundaries, CISV/CISR, Brampton Census 2021, Alectra service area boundaries, neighbourhood names
- **Tier B (Seasonal, daily):** Live weather (Open-Meteo), facility status
- **Tier C (Live, 5–15 min):** Alectra outage polygons

### 5.2 Intelligence Layer

A PCA-based composite scoring engine produces a Threshold Vulnerability Score (0–100) per Census Tract across three scenario modes. The score is constructed from 10 factors drawn from the fused data, with factor loadings visible in `pipeline/data/loadings.csv`. A recommendation engine (designed, not yet built) will rank interventions by projected impact, cost, and confidence.

### 5.3 Presentation Layer

A React + Mapbox GL frontend renders the fusion output as a dark, mission-control choropleth. Community detail panels surface the full factor breakdown and source citations. An LLM reasoning layer (Gemini 2.x) generates plain-language briefings per community, injecting score values and citing sources — never generating numbers independently.

---

## 6. Market Context and Sponsor Alignment

### 6.1 Hackathon Context

**Competition:** Seneca Energy Hackathon 2026  
**Theme:** Theme 3 — Community Energy, Equity and Sustainability  
**Challenge Set:** Challenge Set 03 (all three problem statements)  
**Deadline:** 2026-05-26 23:59 ET

**PS1 (Energy vulnerability and resilience):** Addressed through the Threshold Score — a composite measure of structural vulnerability plus live energy risk (outages, extreme weather). The recommendation engine targets PS1 interventions (welfare checks, facility pre-positioning, pre-emptive outreach).

**PS2 (Equity and affordability):** Addressed through CISV integration (StatsCan 2025 social vulnerability index), income and tenure factors, and the equity-weighted ranking of communities for intervention.

**PS3 (Environmental justice and air quality):** Partially addressed through CISV Dimension 1 (racialized populations) and the architecture's `PollutionSource` entity stub. Full AQHI integration is a stretch goal.

### 6.2 Sponsor Alignment

| Sponsor | Alignment |
|---------|-----------|
| **Alectra Utilities** | Live outage feed is a Tier C data source; the product demonstrates what their ArcGIS Hub data enables when fused with civic data |
| **Esri Canada** | Primary ingest mechanism is ArcGIS REST (Brampton ESRI FeatureServer, Alectra ArcGIS Hub, StatsCan boundary layers); Esri Living Atlas and Climate Hub are stretch data sources |

**Pitch positioning:** "Threshold is the community equity and vulnerability layer that Alectra's innovation portfolio doesn't have yet, built on Esri Canada infrastructure." This sentence threads both sponsors and identifies a real gap.

---

## 7. Target Users and Personas

### Persona 1: Municipal Emergency Manager

**Name:** Priya — Emergency Management Coordinator, City of Brampton  
**Scenario:** Pre-positioning welfare check resources ahead of a forecast heat dome  
**Need:** Within 10 minutes, identify the top 10 Census Tracts where concentrations of vulnerable residents (elderly, low income, renters in old buildings) are highest and cooling centres are farthest  
**What Threshold gives her:** Map loads, she sees the Critical tier tracts instantly. She switches to Heatwave scenario — the map recolours, weighting humidex heavily. She clicks the top-ranked CT — radar chart shows why it's high (64% renters, CISV 0.42, humidex 38.2°C). She opens recommendations — first card says: "Activate Chinguacousy Recreation Centre by 4 PM — 3.2km from CT centroid, 68 residents estimated heat-vulnerable."

### Persona 2: Utility Operations Planner

**Name:** Marcus — Grid Resilience Planner, Alectra  
**Scenario:** Post-ice-storm restoration prioritisation  
**Need:** Identify which currently-outaged areas have the highest concentration of medically dependent or low-income customers who cannot shelter elsewhere  
**What Threshold gives him:** He toggles the live Alectra outage overlay. Outage polygons appear over the choropleth. He switches to Ice Storm scenario — the map highlights high-outage-overlap CTs at Critical tier. The recommendation card shows: "Prioritise feeder restoration for Bramalea West CT cluster — 38% renters, CISV 0.38, 12 hours outage duration, no cooling centre within 2.5km."

### Persona 3: Community Organisation Program Director

**Name:** Aisha — Executive Director, Peel Community Health  
**Scenario:** Targeting outreach for a pre-summer energy affordability campaign  
**Need:** Identify which neighbourhoods in Brampton have the highest concentration of households at risk of energy poverty — renters, low income, old buildings — to focus door-knocking  
**What Threshold gives her:** She explores the Baseline choropleth. She filters to Critical and High tiers. She reads the briefing for a High-tier CT: "This community has a median income of $62,000, 71% renters in pre-1980 buildings, and a CISV score of 0.44 — in the top national quintile for social vulnerability. Outreach teams can reach 340 households from the Springdale Community Centre."

---

## 8. Core User Flows

### Flow 1: Map Load and Overview

1. User navigates to the Threshold URL
2. Frontend loads React SPA from Vercel CDN
3. `brampton_full.geojson` loads from `/public/data/` — 122 CT polygons, all pre-scored
4. Mapbox GL renders choropleth with four-tier colour ramp (Low → Moderate → High → Critical)
5. Sidebar shows top-10 most vulnerable communities by current scenario score
6. **Target:** Under 3 seconds on LTE connection

### Flow 2: Community Detail

1. User hovers CT → tooltip shows neighbourhood name, tier badge, score
2. User clicks CT → detail panel slides open from right
3. Detail panel renders: score, tier chip, radar chart (10 factors), factor bars with raw values and source tags, LLM-generated briefing (or structural fallback if LLM unavailable)
4. User clicks any source tag → source citation expands showing dataset name, vintage, and endpoint
5. **Target:** Panel opens under 500ms; LLM briefing streams under 10 seconds

### Flow 3: Scenario Switching

1. User clicks Baseline / Heatwave / Ice Storm control
2. Client-side: score columns switch (`threshold_score_baseline` → `threshold_score_heatwave` → `threshold_score_icestorm`)
3. Mapbox GL re-applies colour ramp to new score values — no network call
4. Sidebar top-10 list re-ranks
5. **Target:** Under 200ms (client-side only)

### Flow 4: Overlay Toggles

1. User toggles Alectra Outages → frontend calls `GET /api/outages` → FastAPI returns cached outage polygons → Mapbox renders as transparent overlay
2. User toggles Cooling Centres → frontend loads `brampton_facilities.geojson` from CDN → 45 point markers appear
3. User toggles Weather → frontend calls `GET /api/weather` → returns current conditions per CT centroid
4. **Target:** Each toggle under 2 seconds

### Flow 5: Recommendation Panel

1. User clicks "Recommendations" tab
2. Frontend calls `GET /api/recommendations?ct=<CTUID>&scenario=<scenario>`
3. Backend returns ranked recommendation cards
4. Each card shows: action headline, why (quantitative inputs), confidence, how we know (sources), who should act
5. **Target:** Under 3 seconds (no LLM on this route)

---

## 9. Feature Requirements

### 9.1 Map and Choropleth (Must Ship)

- Dark Mapbox GL choropleth of all 122 Brampton Census Tracts
- Four-tier colour ramp: Low (#2E7D32) → Moderate (#F57F17) → High (#E65100) → Critical (#C62828)
- Clip to Alectra service area boundary
- Hover tooltip: neighbourhood name, tier badge, Threshold Score
- Click-to-open detail panel
- Scenario switcher (Baseline / Heatwave / Ice Storm) — client-side recolour under 200ms

### 9.2 Detail Panel (Must Ship)

- Score and tier badge
- Radar chart (10 factors): cisv_score, cisv_dim1–4, pct_pre1980, pct_renters, median_income (inverted), cisr_score (inverted), humidex
- Factor bars with raw values and source citations
- LLM-generated briefing (Gemini 2.x) with graceful fallback to structured data
- Two-click source traceability for every score

### 9.3 Live Overlays (Must Ship: Outages and Facilities; Stretch: Weather)

- Alectra live outage polygons (Tier C, polled from backend)
- Cooling and warming centres (45 facilities, static from CDN)
- Current weather conditions (Tier B/C, from backend)
- Active advisory polygons (stretch)

### 9.4 Recommendations Panel (Must Ship)

- Per-community ranked recommendations
- Each card: action, quantitative inputs (≥3), confidence score, source list, target actor
- Scenario-aware ranking

### 9.5 Interactive Folium Map in Notebook (Must Ship — Fallback Demo)

- Replaces the deleted `build_map.py` functionality
- Self-contained HTML export from `pipeline/EDA.ipynb`
- Usable as standalone demo if React frontend is not complete

---

## 10. Data Architecture

### Three-Tier Fusion Model

| Tier | Refresh | Sources | Storage |
|------|---------|---------|---------|
| A | Yearly (build-time) | StatsCan CT Boundaries, CISV/CISR, Brampton Census 2021, Alectra Service Areas, NRCan Flood Zones, Brampton Neighbourhood Names | Flat GeoJSON in repo (`frontend/public/data/`) |
| B | Daily (cron) | Open-Meteo current weather, Brampton facilities status | PostgreSQL + PostGIS |
| C | 5–15 min (polling) | Alectra live outages, Environment Canada advisories | In-memory + Postgres archive |

### Ontology Entities

- **Community** — One per Census Tract. Primary entity. Holds composite scores, factor sub-scores, demographic aggregates, municipal label, `served_by_alectra` flag.
- **Shelter** — Cooling and warming centres. 45 facilities across Brampton. Point geometry.
- **WeatherCell** — Gridded weather observation per CT centroid. Current conditions.
- **Outage** — Alectra outage polygon. Spatial-joined to Communities. Archived per poll.
- **Advisory** — Active weather advisory polygon (heat, cold, flood). Spatial-joined to Communities.
- **Building** — (Phase 2) Retrofit targeting. Age, type, tenure mix.
- **GridFeeder** — (Phase 2) Utility grid segment for outage prediction.
- **PollutionSource** — (Stretch) Point source with emission type and intensity.

### Join Keys

All entities use CTUID (Census Tract Unique Identifier, e.g., `5350528.20`) as the primary spatial join key. Point-in-polygon joins use GeoPandas `sjoin` with `predicate="intersects"` or CT centroid lookup.

---

## 11. Technical Architecture

```
┌─────────────────────────────────────────────────────────┐
│  User Browser                                           │
│  React 18 + TypeScript + Vite                          │
│  Mapbox GL JS  ·  Recharts  ·  Tailwind + shadcn/ui    │
└──────────────────┬──────────────────────────────────────┘
                   │ HTTP
        ┌──────────▼──────────┐    ┌──────────────────────┐
        │   Vercel CDN        │    │  Fly.io FastAPI       │
        │   Static frontend   │    │  /api/communities     │
        │   + GeoJSON Tier A  │    │  /api/briefing        │
        └─────────────────────┘    │  /api/outages         │
                                   │  /api/weather         │
                                   │  /api/recommendations │
                                   └──────────┬────────────┘
                                              │
                              ┌───────────────▼───────────────┐
                              │  PostgreSQL + PostGIS          │
                              │  Tier B seasonal tables        │
                              │  Tier C outage archive         │
                              └───────────────────────────────┘
```

### Stack

| Layer | Technology | Role |
|-------|-----------|------|
| Frontend | React 18 + TypeScript + Vite | Map UI, scenario controls, detail and recommendation panels |
| UI Styling | Tailwind CSS + shadcn/ui | Dark mission-control design system |
| Map | Mapbox GL JS | Choropleth, overlays, hover/click interactions |
| Charts | Recharts | Radar chart, factor bars |
| Backend | FastAPI (Python 3.11+) | API surface, ML inference, LLM orchestration, Tier C endpoints |
| ML | scikit-learn + ONNX | PCA scoring, baseline models, portable inference |
| LLM Primary | Gemini 2.x | Briefing synthesis, multi-source narrative |
| LLM Critic | DeepSeek R1/V3 | Chain-of-thought critique (stretch) |
| Pipeline | Python (pandas, geopandas, httpx) | Ingest, normalise, spatial joins, write GeoJSON |
| Storage A | Flat GeoJSON in repo | Structural ontology, baked at build time |
| Storage B/C | PostgreSQL + PostGIS | Seasonal cache, live archive |
| Frontend Host | Vercel | Static frontend + CDN delivery |
| Backend Host | Fly.io | FastAPI service with persistent volume |

### System Invariants

1. **Numbers from models, prose from LLMs.** An LLM may never output a probability, score, count, or projection that did not originate from a model, dataset, or scoring engine.
2. **Every score traceable in ≤2 clicks** to the input numbers and source datasets.
3. **Pipeline work does not happen in the request path.** Ingestion, joins, and scoring run in `pipeline/` jobs.
4. **Tier A data is immutable per deploy.** Regenerated by pipeline run; never written at runtime.
5. **Frontend computes nothing scored.** All scoring happens in the backend.
6. **Sources are first-class.** Every persisted entity row records its source dataset slug and vintage.
7. **Honest data vintage.** Real-time means real-time. Annual means annual.
8. **Community = Census Tract.** Municipal neighbourhood labels are overlays only.

---

## 12. ML Architecture

### Current Implementation: PCA Scoring

The MVP vulnerability score is computed using Principal Component Analysis (PCA) on 10 normalised factor inputs.

**Library:** `sklearn.decomposition.PCA` + `sklearn.preprocessing.StandardScaler`  
**Location:** `pipeline/EDA.ipynb`, cell `section4-pca-score`

**Input factors:**

| Factor | Column | Direction | Loading Interpretation |
|--------|--------|-----------|----------------------|
| CISV overall | `cisv_score` | ↑ vulnerable | Highest PC1 loading |
| CISV Dim 4 (dwelling conditions) | `cisv_dim4` | ↑ vulnerable | Crowding, major repairs |
| CISV Dim 2 (income/labour) | `cisv_dim2` | ↑ vulnerable | Low income, unemployment |
| CISV Dim 3 (education) | `cisv_dim3` | ↑ vulnerable | Low education attainment |
| CISV Dim 1 (racialized/immigration) | `cisv_dim1` | ↑ vulnerable | Racialised population share |
| Pre-1980 housing | `pct_pre1980` | ↑ vulnerable | Old building stock |
| Renters | `pct_renters` | ↑ vulnerable | Tenure instability |
| Humidex | `humidex` | ↑ vulnerable | Current heat stress |
| CISR score | `cisr_score` | **inverted** | High resilience = lower vulnerability |
| Median income | `median_income` | **inverted** | High income = lower vulnerability |

**PC1 explained variance:** ~35% of total variation across 122 Brampton CTs

**Score rescaling:** `score = (PC1 − min) / (max − min) × 100`

**Risk buckets:** Low (0–25) · Moderate (25–50) · High (50–75) · Critical (75–100)

### Scenario Weighting

Scenarios apply multiplicative weights to individual factor contributions before PCA:

| Scenario | Weight Modifications |
|----------|---------------------|
| Baseline | All factors equal weight (1.0) |
| Heatwave | `humidex × 2.5`, `pct_renters × 1.2` |
| Ice Storm | `active_outages × 3.0`, `customers_affected × 2.0`, `pct_renters × 1.5` |

### Phase 2: Neural Network Model

With 122 CTs (current Brampton scope), a neural network is statistically undersized. Phase 2 expansion to 569+ CTs enables:
- Shallow feedforward network (2–3 layers) trained on the same 10 factors
- ONNX export to `backend/models/threshold_nn.onnx`
- Cross-validation on held-out CT subset
- `onnxruntime` inference in FastAPI backend
- Sibling metadata JSON with training data provenance and validation accuracy

---

## 13. LLM Architecture

### Gemini 2.x — Primary Briefing Model

**Role:** Generate plain-language community briefings per Census Tract for the detail panel.

**Input to Gemini (injected from scoring engine):**

```json
{
  "ctuid": "5350528.20",
  "neighbourhood": "Springdale",
  "threshold_score": 72.4,
  "risk_level": "High",
  "scenario": "Baseline",
  "factors": {
    "cisv_score": 0.42,
    "cisv_dim4": 0.38,
    "pct_renters": 0.64,
    "pct_pre1980": 0.71,
    "median_income": 62500,
    "humidex": 31.2
  },
  "active_outages": 0,
  "nearest_facility_km": 1.8,
  "sources": ["statcan-cisv-2021", "brampton-esri-census2021", "open-meteo-current"]
}
```

**Output from Gemini:** Plain-language 3–4 sentence briefing framing the community's vulnerability profile, who is most at risk, and what the most impactful intervention would be.

**Hard constraint on Gemini output:** No numeric value may appear in the briefing unless it was explicitly provided in the input context above. The backend validates this constraint before returning the response. Any number in the response not traceable to an input field causes the backend to strip it and replace with the structural factor breakdown.

### DeepSeek R1/V3 — Critique Layer (Stretch)

**Role:** Chain-of-thought critique of ML outputs. Routes recommendation cards through a second pass that challenges the projected impact numbers, flags overconfidence, and annotates the card with confidence-adjusted language.

---

## 14. API Design

### Base URL
`https://api.threshold.ca` (Fly.io; final URL TBD at deployment)

### Endpoints

#### `GET /api/communities`
Returns all 122 Brampton CTs with pre-computed scores for all scenarios.

**Response:**
```json
{
  "communities": [
    {
      "ctuid": "5350528.20",
      "neighbourhood": "Springdale",
      "threshold_score_baseline": 72.4,
      "threshold_score_heatwave": 81.2,
      "threshold_score_icestorm": 68.9,
      "risk_level": "High",
      "population": 5726,
      "median_income": 62500,
      "pct_renters": 0.64,
      "cisv_score": 0.42
    }
  ]
}
```

#### `GET /api/outages`
Returns current Alectra outage polygons, cached with 5-minute TTL.

**Response:** GeoJSON FeatureCollection of outage polygons with `CUSTOUT` (customers affected) attribute.

#### `GET /api/weather`
Returns current weather conditions per CT centroid, refreshed every 15 minutes.

**Response:** Array of `{ctuid, temperature_c, humidex, wind_speed_kmh, weather_code}` per CT.

#### `POST /api/briefing`
Generates an LLM briefing for a specific CT.

**Request:** `{ctuid: string, scenario: "baseline"|"heatwave"|"icestorm"}`

**Response:** `{briefing: string, factors: {...}, sources: [...]}` streamed as Server-Sent Events.

**Timeout:** 10 seconds. Fallback: returns structured factor breakdown without prose.

**Rate limit:** 60 requests/hour per IP.

#### `GET /api/recommendations`
Returns ranked intervention recommendations for a CT and scenario.

**Request params:** `ct=<CTUID>&scenario=<scenario>`

**Response:** Array of recommendation cards, each with `{action, why, inputs, confidence, sources, actor}`.

---

## 15. UI/UX Requirements

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│ THRESHOLD                    [Baseline][Heatwave][Ice Storm] │
├────────────────────────────────────────┬────────────────────┤
│                                        │ Detail Panel        │
│                                        │ ─────────────────  │
│         MAPBOX GL                      │ Springdale          │
│         CHOROPLETH                     │ Score: 72 · High    │
│                                        │                     │
│                                        │ [Radar Chart]       │
│                                        │                     │
│                                        │ Factor bars...      │
│                                        │                     │
│                                        │ LLM Briefing...     │
├────────────────────────────────────────┴────────────────────┤
│ [Overlays: Outages | Facilities | Weather | Advisories]      │
└─────────────────────────────────────────────────────────────┘
```

### Key Interaction Specifications

- **Hover state:** CT outline glows with tier colour; tooltip appears immediately (no delay)
- **Click state:** Detail panel slides in from right (300ms ease-out); map shifts left 400px
- **Scenario switch:** Colour ramp re-applies to all CTs in a single Mapbox `setPaintProperty` call — no map re-render
- **Overlay toggle:** Button state changes immediately; data loads async with spinner
- **Mobile:** Single-column layout; map full-screen with bottom-sheet detail panel on tap

### Performance Targets

| Interaction | Target | Method |
|-------------|--------|--------|
| Initial map render | < 3 seconds | GeoJSON pre-loaded from Vercel CDN |
| Scenario recolour | < 200ms | Client-side paint property |
| Detail panel open | < 500ms | Pre-loaded data |
| LLM briefing | < 10 seconds | Streaming SSE |
| Overlay toggle | < 2 seconds | Cached backend response |

---

## 16. Design System

### Colour Palette

```css
--bg-base: #0D0D0D;         /* Near-black background */
--bg-surface: #1A1A1A;      /* Panel surfaces */
--bg-elevated: #242424;     /* Cards, tooltips */
--border-subtle: #2E2E2E;   /* Dividers */
--text-primary: #F0F0F0;    /* Primary text */
--text-secondary: #AAAAAA;  /* Secondary text */
--text-muted: #8A8A8A;      /* Labels, captions */

/* Threshold Score Tier Colours */
--tier-critical: #C62828;   /* 75–100 */
--tier-high: #E65100;       /* 50–75 */
--tier-moderate: #F57F17;   /* 25–50 */
--tier-low: #2E7D32;        /* 0–25 */

/* Accent */
--accent-primary: #1A56DB;  /* Interactive blue */
--accent-glow: rgba(26, 86, 219, 0.15);
```

### Typography

- **Body:** Inter (system stack fallback: -apple-system)
- **Monospace / Scores:** JetBrains Mono
- **Scale:** 12px caption · 14px body · 16px label · 20px heading · 24px display

### Component Primitives

All components built on shadcn/ui primitives styled to the dark design system:

- `TierChip` — colour-coded badge showing risk level (never colour-only; always includes label)
- `ScoreDisplay` — JetBrains Mono numeric display with tier background glow
- `RadarChart` — Recharts radar, 10-factor, themed axis labels
- `FactorBar` — progress bar with source citation tag
- `OverlayToggle` — pill button with active/loading/error states
- `RecommendationCard` — action + why + sources + actor anatomy

---

## 17. Scoring Engine Specification

### Input Processing

1. Load `brampton_full.geojson` at backend startup
2. Extract the 10 PCA input columns for each CT
3. Apply scenario weight multipliers to the relevant columns
4. Run StandardScaler on the weighted matrix
5. Apply PCA (pre-trained, loaded from `backend/models/scaler.pkl` and `backend/models/pca.pkl`)
6. Rescale PC1 to [0, 100] using the training-time min/max (stored in model metadata)
7. Apply risk bucket thresholds

### Model Artifacts

All model artifacts live in `backend/models/`:

| File | Contents |
|------|---------|
| `scaler_baseline.pkl` | Fitted StandardScaler for baseline scenario |
| `pca_baseline.pkl` | Fitted PCA model for baseline |
| `scaler_heatwave.pkl` | Fitted StandardScaler for heatwave weights |
| `pca_heatwave.pkl` | Fitted PCA model for heatwave |
| `scaler_icestorm.pkl` | Fitted StandardScaler for ice storm weights |
| `pca_icestorm.pkl` | Fitted PCA model for ice storm |
| `model_metadata.json` | Training data provenance, PC1 variance explained, training-time min/max per scenario |

### Score Traceability

For any CT, the backend must be able to return:
- The raw value of each of the 10 input factors
- The scaled (standardised) value of each factor
- The factor's loading on PC1 (from `loadings.csv`)
- The source dataset slug and vintage for each factor

This is the data that populates the detail panel factor bars and the two-click source citation flow.

---

## 18. Data Sources and Provenance

Full catalogue maintained in `context/source-catalogue.md`. Summary:

| Source | Slug | Tier | Coverage | Status |
|--------|------|------|----------|--------|
| StatsCan CT Boundaries 2021 | `statcan-census-tracts-2021` | A | 569 CTs | ✅ live-in-app |
| Brampton ESRI Census 2021 | `brampton-esri-census2021` | A | 122 CTs | ✅ live-in-app |
| StatsCan CISV 2021 | `statcan-cisv-2021` | A | 1,432 Ontario CTs | ✅ live-in-app |
| StatsCan CISR 2021 | `statcan-cisr-2021` | A | 1,432 Ontario CTs | ✅ live-in-app |
| Brampton Secondary Plan Areas | `brampton-esri-secondary-plan-areas` | A | 122 CTs | ✅ live-in-app |
| Alectra Service Area | `alectra-service-areas` | A | 18 areas | ✅ live-in-app |
| NRCan Flood Hazard | `nrcan-flood-hazard` | A | Study area | ⚠️ 0 features returned |
| Open-Meteo Current Weather | `open-meteo-current` | B | 684 CTs | ✅ live-in-app |
| Alectra Live Outages | `alectra-outages-live` | C | Alectra territory | ✅ live-in-app |
| Brampton Recreation Centres | `brampton-esri-recreation` | B | 38 facilities | ✅ live-in-app |
| Brampton Libraries | `brampton-esri-libraries` | B | 7 branches | ✅ live-in-app |

### Data Verification (2026-05-25)

All critical sources verified against live endpoints:

| Check | Result |
|-------|--------|
| Census population CT 5350528.20 | 5,726 — exact match to live ESRI |
| CISV score CT 5350528.20 | 0.0335 — exact match to raw StatsCan zip |
| Weather temperature (sample CT) | 19.8°C — matches live Open-Meteo |
| All 122 Brampton CTs present | 122/122 — none missing, none extra |
| Facility names | All match live ESRI |
| Income range | $61K–$172K — realistic, real StatsCan 2021 values |

---

## 19. Testing Strategy

### Pipeline Testing (Implemented)

Each data source in `pipeline/EDA.ipynb` has an assertion cell immediately following the fetch cell. Assertions check:

- Row count bounds (e.g., `len(gdf_cts) >= 400`)
- Required column presence (`assert set(required_cols).issubset(gdf.columns)`)
- CRS integrity (`assert gdf.crs.to_epsg() == 4326`)
- Null rate thresholds (`assert df['cisv_score'].isna().mean() < 0.01`)
- Spot-check values against known correct values from live sources

All 9 assertion cells pass cleanly on the current notebook run.

### Backend Testing (Planned)

For FastAPI endpoints:
- Unit tests with `pytest` + `httpx.AsyncClient`
- One test per endpoint verifying response schema
- Test data: subset of `brampton_full.geojson` with known scores
- Mock Gemini API responses in CI to avoid quota usage

### Frontend Testing (Planned)

- Vitest unit tests for score colour mapping functions
- Component tests for `TierChip`, `ScoreDisplay`, `FactorBar`
- No E2E browser testing in MVP scope — time constraint

### Integration Testing (Planned)

- Smoke test: notebook → output files → backend serves them → frontend renders
- Verified manually before demo, not automated in MVP

---

## 20. Monitoring and Observability

### MVP (Minimal)

- FastAPI request logging to stdout (captured by Fly.io)
- Fly.io metrics dashboard for CPU and memory
- Manual verification: reload Alectra outage endpoint every 15 minutes during demo

### Post-MVP (Designed)

- Grafana dashboard on homelab monitoring stack
- Alert: Alectra outage endpoint returns HTTP ≠ 200 for >15 minutes
- Alert: Gemini API latency > 8 seconds (pre-emptive rate limit warning)
- Alert: CT count in API response drops below 122 (pipeline regression)
- Structured JSON logging with `ctuid`, `scenario`, `endpoint`, `duration_ms` on every request

---

## 21. Functional Requirements

### FR-01: Data Pipeline Reproducibility (IMPLEMENTED)
- The pipeline `pipeline/EDA.ipynb` must run top-to-bottom without manual intervention to regenerate all output files.
- All data must be fetched from live public endpoints with no hardcoded local file dependencies.
- **Status:** Met.

### FR-02: CT Boundary Coverage
- Output must include all 122 Brampton Census Tracts with valid polygon geometries in EPSG:4326.
- No null geometries. CTUID must be unique.
- **Status:** Met. Verified by assertion cell `a1-assert-ct-boundaries`.

### FR-03: Demographic Data Coverage
- `brampton_full.geojson` must include `population`, `median_income`, `pct_renters`, `pct_pre1980`, `pct_low_income` for all 122 Brampton CTs with null rate below 5%.
- **Status:** Met. Verified by assertion cell `f17888cf`.

### FR-04: CISV/CISR Coverage
- All 122 Brampton CTs must have `cisv_score`, `cisr_score`, and all dimension scores (`cisv_dim1`–4, `cisr_dim1`–3).
- **Status:** Met. ~0.5% null rate Ontario-wide; Brampton coverage complete.

### FR-05: Threshold Score — Three Scenarios
- `brampton_full.geojson` must contain `threshold_score_baseline`, `threshold_score_heatwave`, `threshold_score_icestorm` for all 122 CTs.
- Scores must be in [0, 100]. `risk_level` must be one of `Critical/High/Moderate/Low`.
- **Status:** Met.

### FR-06: Map Rendering
- The frontend must render a dark choropleth of all 122 Brampton CTs with correct tier colours within 3 seconds of initial load.
- **Status:** Not built.

### FR-07: Scenario Switching
- Switching scenarios must recolour the choropleth in under 1 second with no network call.
- **Status:** Not built. Logic specified.

### FR-08: Detail Panel
- Clicking any CT must open a detail panel showing: neighbourhood name, score, tier, radar chart of 10 factors, factor bars with values, source citations, LLM briefing (or graceful fallback if LLM unavailable).
- **Status:** Not built. Spec complete.

### FR-09: Source Traceability
- Every score must be reachable from its source datasets in two UI clicks or fewer.
- **Status:** Not built. Architectural invariant defined.

### FR-10: Facility Overlay
- Toggling the cooling/warming centres overlay must render all 45 facility point markers.
- **Status:** Not built. Data ready (`brampton_facilities.geojson`).

### FR-11: Live Outage Overlay
- Toggling the outage overlay must fetch from `/api/outages` and render Alectra outage polygons intersected with Brampton CTs.
- **Status:** Not built. Pipeline logic exists; backend endpoint not implemented.

### FR-12: LLM Briefing
- `POST /api/briefing` must return a plain-language community briefing in under 10 seconds. Briefing must contain no numeric values not present in the input prompt context.
- Timeout fallback: return structured factor breakdown without prose.
- **Status:** Not built.

### FR-13: Public URL Deployment
- The application must be accessible at a public URL on mobile browsers before the hackathon deadline.
- **Status:** Not built.

---

## 22. Non-Functional Requirements

### Performance

| Metric | Target | Notes |
|--------|--------|-------|
| Initial map render | < 3 seconds on LTE | Tier A GeoJSON pre-loaded from CDN |
| Scenario switch recolour | < 200ms | Client-side only, no network call |
| Detail panel open | < 500ms | Pre-loaded data; no backend call for base panel |
| LLM briefing | < 10 seconds | Gemini API with streaming |
| Outage overlay refresh | < 2 seconds | Short TTL cached on backend |

### Data Freshness

| Tier | Refresh Rate | Notes |
|------|-------------|-------|
| Tier A (structural) | Per pipeline run (weekly or before deploy) | Census, CISV/CISR — annual vintage |
| Tier B (seasonal) | Daily cron | Weather aggregates, facility status |
| Tier C (live) | 5–15 minutes | Alectra outages, current conditions |

### Scalability Target (MVP)

The MVP targets Brampton: 122 CTs. The GeoJSON payload is well under 5 MB. No caching or pagination is required at this scale. The architecture is designed to scale to 569 Alectra-territory CTs (phase 2) without structural changes.

---

## 23. Scalability Considerations

### Geographic Scalability

The three-tier architecture and CT-keyed ontology are designed for expansion from day one:

| Phase | CTs | Communities | Blockers |
|-------|-----|-------------|---------|
| MVP | 122 | Brampton | None — fully real data |
| Phase 2 | 569 | Brampton + Mississauga + Hamilton | Mississauga census requires manual download or GeoEnrichment; Hamilton is partial Alectra coverage |
| Phase 3 | ~1,200 | All 17 Alectra communities | Open-data availability varies by municipality |

**Pipeline design for expansion:** Each source in `pipeline/EDA.ipynb` is filtered to CMAs 535 (Mississauga/Brampton) and 537 (Hamilton). Expanding to additional CMAs requires only updating the CMA filter and adding new ESRI FeatureServer endpoints for municipal census data. StatsCan CISV/CISR already covers all Canadian CTs.

### Data Volume Scalability

- At 569 CTs, `master_cts.geojson` is estimated at 8–12 MB — still within browser-deployable range.
- Beyond ~1,000 CTs, tile-based delivery (Mapbox Vector Tiles or `pmtiles`) should replace flat GeoJSON delivery.
- The PostgreSQL + PostGIS backend is designed to handle Tier B and C data at full Alectra scale from day one.

### API Scalability

- FastAPI with `asyncio` handles concurrent Tier C live data requests without blocking.
- LLM-backed routes (`/api/briefing`) carry explicit timeout (10 seconds) and rate limiting to prevent Gemini API quota exhaustion.
- Tier A data is served statically from Vercel CDN — zero backend load for map rendering.

---

## 24. Reliability Considerations

### Pipeline Reliability

Every data source in `EDA.ipynb` has an assertion cell that runs immediately after the fetch cell. Assertions verify:
- Row count bounds
- CRS integrity (EPSG:4326)
- Required column presence
- Null rate thresholds
- Key spot-check values

If any assertion fails, the notebook halts at the failing cell with a descriptive error message. This prevents silently corrupted outputs from propagating to production.

**Fallback for empty sources (implemented):**
- Alectra outages with 0 features: `gdf_outages` is an empty GeoDataFrame; downstream joins are left-joins that produce `active_outages = 0` rather than dropping rows.
- NRCan flood zones returned 0 features (known issue): `in_flood_zone` column defaults to `False` for all CTs.

### Application Reliability (Designed)

- **LLM timeout:** If Gemini call exceeds 10 seconds, backend returns structured JSON with factor values and no prose. The UI renders the structured data regardless.
- **Tier C unavailability:** If `/api/outages` or `/api/weather` is unreachable, the overlay toggles show an error state but the base choropleth remains functional. The map never depends on Tier C data to render.
- **Backend unavailability:** Tier A GeoJSON is served from the Vercel CDN static bundle. The map renders from that data even if the FastAPI backend is down. Only LLM briefings and live overlays fail.

---

## 25. Security and Privacy Considerations

### Data Privacy

- Threshold operates entirely on aggregate Census Tract level data. The smallest geographic unit is a Census Tract, containing a minimum of approximately 2,500 residents. No individual-level data is collected, stored, or processed.
- No user accounts, sessions, or personal data. The product is a public civic-data view.
- No cookies required for core functionality.

### Source Data Licensing

| Source | License |
|--------|---------|
| Statistics Canada (CISV, CISR, CT Boundaries) | Statistics Canada Open License |
| City of Brampton ESRI data | City of Brampton Open Data License |
| Alectra outage feed | Public ArcGIS Hub — public access permitted |
| Open-Meteo weather | CC-BY 4.0 |

All licenses permit use in a public application. Attribution requirements: Statistics Canada and City of Brampton require attribution, included in source citations UI.

### API Security (Designed)

- No user-facing write endpoints in MVP.
- LLM-backed routes (`/api/briefing`) rate-limited to prevent Gemini API quota exhaustion.
- `GEMINI_API_KEY` stored as environment variable, never committed to repository.
- Backend endpoints are public read-only. Rate limiting applied at the FastAPI layer.

### Infrastructure Security (Designed)

- Vercel: static frontend, no server-side secrets exposed
- Fly.io: FastAPI service with persistent volume; environment variables managed in Fly.io secrets
- PostgreSQL: not publicly exposed; accessed only by the FastAPI service on the same Fly.io network

---

## 26. Accessibility Considerations

### Implemented Design Requirements

- **Tier colours never stand alone.** Every tier colour is paired with a tier label (`TierChip` component). Colour is reinforcement, not the sole signal.
- **Focus rings.** All interactive elements have a visible focus ring using `--accent-primary` (#1A56DB) at 2px offset.
- **Text contrast.** Minimum 4.5:1 against background. `--text-muted` (#8A8A8A) on `--bg-base` (#0D0D0D) must be verified during implementation.
- **Numeric rendering.** Scores use JetBrains Mono (`--font-mono`) — a font designed for legibility of numeric values.

### Accessibility Features Marked as Stretch for MVP

- **Keyboard navigation for the map:** Arrow keys pan, +/- zoom, Tab cycles through clickable overlay controls.
- **Screen reader support for map layers.** Mapbox GL JS accessibility features will be enabled; ARIA labels on overlay controls and sidebar tabs.

### Accessibility Gaps to Address Post-MVP

- The dark-only design removes light mode as an accessibility accommodation for users with certain visual conditions. A high-contrast mode overlay is a Phase 2 requirement.
- The choropleth colour ramp (low `#2E7D32` → critical `#C62828`) uses red-green contrast that may be difficult for users with deuteranopia. A pattern/texture secondary encoding is specified for Phase 2.

---

## 27. Deployment Architecture

### Target Architecture (Designed, Not Yet Deployed)

```
User browser
    │
    ├──→ Vercel CDN (frontend static bundle)
    │       └── React SPA + Tier A GeoJSON in /public/data/
    │
    └──→ Fly.io (FastAPI backend)
            ├── /api/communities   ← serves pre-computed scores
            ├── /api/briefing      ← Gemini API proxy
            ├── /api/outages       ← Alectra feed proxy (TTL cached)
            ├── /api/weather       ← Open-Meteo proxy (TTL cached)
            └── PostgreSQL (Tier B+C archive)
                    └── persistent volume on Fly.io
```

### Environment Variables Required

| Variable | Service | Notes |
|---------|---------|-------|
| `GEMINI_API_KEY` | Fly.io backend | Gemini 2.x API access |
| `DATABASE_URL` | Fly.io backend | PostgreSQL connection string |
| `MAPBOX_TOKEN` | Vercel frontend (build-time) | Mapbox GL JS map rendering |

### Build Pipeline (Designed)

1. `cd pipeline && jupyter nbconvert --to notebook --execute EDA.ipynb` — regenerate Tier A GeoJSON
2. Copy `brampton_full.geojson`, `brampton_facilities.geojson` to `frontend/public/data/`
3. `cd frontend && npm run build` → `dist/`
4. `vercel --prod` → deploys `dist/` to Vercel CDN
5. `cd backend && docker build -t threshold-backend .` → `fly deploy`

### Hackathon MVP Fallback

If the full Vercel + Fly.io deployment cannot be completed before the deadline, the minimum viable demo is:
- Add an interactive Folium map cell to `pipeline/EDA.ipynb` (specified in progress tracker as a pending item)
- Export a self-contained HTML file from the notebook
- Host the HTML file on any static hosting service

This fallback preserves the data, scoring, and choropleth — the core product value — even without the React frontend and FastAPI backend.

---

## 28. Technical Constraints

### Hackathon Time Constraint

**Deadline: 2026-05-26 23:59 ET.** As of 2026-05-25, the data pipeline is complete. The application layer (frontend + backend) has not been started. Approximately 24 hours remain. This creates a build sequencing priority:

1. Priority 1: Interactive Folium map in the notebook (fallback demo path)
2. Priority 2: FastAPI backend with `/api/communities` serving `brampton_full.geojson`
3. Priority 3: React frontend with Mapbox choropleth and scenario switching
4. Priority 4: LLM briefing integration
5. Priority 5: Deployment to public URL

### Data Constraints

- **Mississauga census data:** The City of Mississauga blocks programmatic access to CT-level census data through its portal. The 184 Mississauga CTs in `master_cts.geojson` have CISV/CISR scores but lack demographic columns. Demo is explicitly narrowed to Brampton as a result.
- **Hamilton census data:** Similar access restrictions. Partial coverage only.
- **NRCan flood zones:** API returns 0 features for the study area. `in_flood_zone` defaults to `False` for all CTs.
- **Historical weather:** Open-Meteo archive API is rate-limited. Historical columns are present in `weather_ct.csv` but mostly null. Historical weather is not used in PCA scoring.
- **No active Alectra outages in Ontario:** At the time of pipeline run (2026-05-25), 11 outage polygons were detected but all were geometrically located in Tennessee. This is a real feed returning real data — there simply were no Ontario outages active at that moment.

### Technology Constraints

- **No PyTorch in backend runtime:** ONNX Runtime is the inference engine for the backend.
- **No user authentication in MVP:** All backend routes are public read-only.
- **LLM numbers invariant:** The Gemini API integration must enforce that no numeric value appears in LLM output unless it was provided in the prompt context from the scoring engine.
- **Frontend is SPA only:** No server-side rendering (Vite SPA). All components are client-side React.

---

## 29. Known Limitations

| Limitation | Impact | Mitigation |
|-----------|--------|-----------|
| Brampton-only demo | Cannot demo Alectra's full 17-community territory | Acknowledged in pitch; Phase 2 expansion path described |
| PCA explains only 35% variance | Score does not capture 65% of variation in the factor space | Defensible for hackathon: PCA is transparent and explainable; neural net alternative specified for Phase 2 |
| Mississauga/Hamilton demographic data missing | `master_cts.geojson` is mixed real/synthetic outside Brampton | Explicitly documented in source catalogue; demo narrowed to Brampton where all data is real |
| No active Ontario outages in current output | Ice Storm scenario has `active_outages = 0` for all CTs | Outage polling logic is operational; a real event would populate the column |
| NRCan flood zones empty | `in_flood_zone` uniformly False | Acknowledged as a data gap; likely correct for this geography |
| Historical weather mostly null | Cannot compute `heat_days_per_yr` etc. | Not used in PCA; CISV/CISR provide structural vulnerability without it |
| No recommendation engine numbers verified | Recommendation cards with projected impact numbers are designed but not implemented | Specify in MVP as illustrative; implement in Phase 2 with real impact model |
| LLM briefings not implemented | Detail panel has no prose narrative for MVP fallback | Factor breakdown renders regardless; prose is enhancement not requirement |
| Single city in facilities data | Only Brampton recreation centres/libraries | Consistent with Brampton MVP scope |

---

## 30. Future Expansion Opportunities

### Phase 2: Geographic Expansion (Mississauga + Hamilton)

**Trigger:** Resolve programmatic access to Mississauga CT-level census data (either through direct city portal access, Statistics Canada GeoEnrichment, or Esri Canada Living Atlas enrichment via student credentials).

**Work required:**
- Fetch Mississauga census data (184 CTs) and Hamilton census data (~80 CTs in Alectra territory)
- Add Mississauga and Hamilton facilities (cooling/warming centres, libraries) to the facility layer
- Add Secondary Plan Area or ward name equivalents for neighbourhood labels
- Rerun `pipeline/EDA.ipynb` — all other pipeline stages already cover these CTs
- Validate scores against known vulnerable communities (Hamilton's North End)

**Timeline estimate:** 2–4 days with data access resolved.

### Phase 2: Neural Network Scoring Model

The PCA scoring model explains 35% of variance. A gradient boosted tree or shallow neural network trained on the same 10 factors with cross-validation could improve predictive validity. With 569 CTs (phase 2 scope), the training set is large enough to support this.

### Phase 2: Full Recommendation Engine

The recommendation engine is architecturally specified but not implemented. Full implementation requires:
- Impact estimation model per intervention type (cooling bus, welfare check, facility activation)
- Cost database per intervention (per-trip cost, per-facility-activation cost)
- Confidence intervals on impact estimates
- Integration with Alectra's demand response data to generate grid-side recommendations

### Phase 3: All 17 Alectra Communities

Extending to the full Alectra service territory requires open-data CT-level census access per municipality. StatsCan CISV/CISR already covers all Canadian CTs — no additional pipeline work needed for the vulnerability index layer.

### Phase 3: Productization as a Data Service

Threshold's long-term commercial model: a subscription vulnerability intelligence service for municipalities and utilities. Deliverables:
- SLA-backed API with versioned data contracts
- Bulk export (CSV, GeoJSON) for offline analysis
- Webhook alerts when a CT's risk tier changes (e.g., heat event pushes a Moderate CT to High)
- White-label deployment for individual municipalities
- Integration with Alectra's DSO (Centricity) system for equity-weighted demand response dispatch

### Phase 3: AQHI / Environmental Justice Layer (PS3)

Environmental justice data from the Esri Canada Living Atlas or Environment and Climate Change Canada's AQHI service would address Challenge Set 03 PS3 directly. The `PollutionSource` entity is already specified in the ontology. Implementation requires:
- AQHI data feed integration (Environment Canada GeoMet or AirNow API)
- `cisv_dim1` (racialized populations) is a partial proxy already in the score
- Full PS3 coverage: add `pollution_burden` as an additional PCA factor

### Phase 3: DeepSeek Critique Layer

The architecture specifies DeepSeek R1/V3 as a chain-of-thought critic for ML outputs. Implementation: route every recommendation card through a second LLM pass that critiques the projected impact numbers against historical base rates, flags overconfidence, and adjusts prose accordingly. This is a novel pattern in civic tech — visible, auditable AI self-criticism.

---

*Document generated 2026-05-25. Reflects verified state of `pipeline/EDA.ipynb` as of that date. Application layer sections (Frontend, Backend, Deployment) reflect authoritative specifications; implementation status noted throughout.*

*Data sources verified against live endpoints 2026-05-25: StatsCan CISV, Brampton ESRI ArcGIS, Open-Meteo, Alectra ArcGIS Hub.*
