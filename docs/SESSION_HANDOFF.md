# Threshold — Session Handoff Context

*Generated for handoff to a new Claude session. Read this before touching any code.*

---

## 1. What Threshold is

**Threshold** is a civic preparedness intelligence platform that fuses census demographics, social vulnerability, weather, outages, and infrastructure data into a deterministic operations layer for utilities, municipalities, community organizations, and residents.

The product thesis: *"Climate disasters do not affect everyone equally. The same outage that is inconvenient in one neighbourhood becomes life-threatening in another."*

**Not a chatbot. Not an LLM. Not a dashboard.** Every advisory, score, and recommendation is rule-derived from public datasets with cited provenance. No language model is invoked anywhere in the production code path.

**Strategic frame:** civic operations infrastructure in the category of Palantir Gotham, ArcGIS Mission Manager, Bloomberg Terminal — but cleaner, more restrained, more institutional. The map *is* the product; everything else is summoned by spatial attention.

---

## 2. Repository layout

```
project_threshold/
├── backend/                FastAPI + Python pipeline
│   └── app/
│       ├── main.py         FastAPI app, lifespan, CORS, route mounting
│       ├── config.py       Pydantic settings from env
│       ├── sources.py      Source-citation registry
│       ├── models/         Pydantic v2 response models
│       │   ├── common.py
│       │   ├── community.py
│       │   ├── finance.py  (NEW)
│       │   └── weather.py
│       ├── routes/         HTTP handlers
│       │   ├── briefing.py
│       │   ├── communities.py
│       │   ├── extreme_plan.py
│       │   ├── facilities.py
│       │   ├── finance.py  (NEW — /api/finance)
│       │   ├── flood.py
│       │   ├── health.py
│       │   ├── outages.py
│       │   ├── recommendations.py
│       │   ├── scenarios.py
│       │   └── weather.py
│       ├── services/       Business logic
│       │   ├── cache.py
│       │   ├── data_loader.py
│       │   ├── extreme_plan.py
│       │   ├── finance.py  (NEW — OEB rates + BoC CPI)
│       │   ├── flood.py
│       │   ├── llm.py      (Gemini briefing — DEPRECATED, replaced by rule engine)
│       │   ├── outages.py
│       │   ├── persistence.py
│       │   ├── recommendations.py
│       │   ├── scoring.py
│       │   └── weather.py
│       └── pipeline/       Tier-A build → Postgres
├── frontend/               React + TypeScript + Vite
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── context.tsx          Central state + lens system
│   │   ├── types.ts             Tract, Facility, Scenario, View, Lens
│   │   ├── utils.ts             scoreFor, rampColor, percentileMap, stressIndex, narrative, interventionsFor
│   │   ├── dataLoader.ts        Initial fetch + normalisation
│   │   ├── liveData.ts          Polling primitives (weather/outages/finance)
│   │   ├── scenarios.ts         Heatwave + Ice Storm weather profiles
│   │   ├── advisories.ts        Rule engine + preparednessPosture()
│   │   ├── cityAnalysis.ts      Spatial pattern detector
│   │   ├── auditLog.ts          Tamper-evident hash chain
│   │   ├── equity.ts            EWEI + restoration queue
│   │   ├── exporters.ts         CSV + print-to-PDF
│   │   ├── forecast.ts          Deterministic 24h forecast
│   │   ├── facilityDetails.ts   Category-level facility metadata
│   │   ├── googlePlaces.ts      Lazy Places JS SDK loader
│   │   ├── i18n.ts              en/pa/hi translation tables
│   │   ├── tenant.ts            Multi-tenant config (Brampton/Mississauga/Hamilton/Surrey)
│   │   ├── staticLayers.ts      Transit corridors + hydro + service points
│   │   ├── vite-env.d.ts        VITE_GOOGLE_MAPS_API_KEY type
│   │   ├── components/
│   │   │   ├── TopBar.tsx           Ribbon (40px): Cmd-K · Lens · Scenario · Stress · Advisories
│   │   │   ├── LayerRail.tsx        Left edge 36px: watchlist/ledger/layers
│   │   │   ├── StatusStrip.tsx      Bottom 28px: per-source freshness
│   │   │   ├── MapPanel.tsx         Leaflet map + choropleth + advisory pips
│   │   │   ├── LeftPanel.tsx        Watchlist tray (Tracts/Advisories/Restoration/Outreach modes)
│   │   │   ├── RightPanel.tsx       Dispatch card (narrative + posture + advisories + metrics)
│   │   │   ├── ActivityTray.tsx     Operational ledger
│   │   │   ├── WeatherStation.tsx   Top-right weather card
│   │   │   ├── SuggestionBanner.tsx Smart scenario suggestion
│   │   │   ├── FacilityCard.tsx     Facility modal with Google Street View + Places
│   │   │   ├── ForecastWidget.tsx   24h forecast strip (top-left of map)
│   │   │   ├── ResidentView.tsx     Public-facing resident surface (i18n)
│   │   │   ├── CommandPalette.tsx   Cmd-K modal
│   │   │   ├── Methodology.tsx      ? overlay
│   │   │   ├── WallDisplay.tsx      F key full-screen EOC view
│   │   │   ├── SituationReport.tsx  R key 24h printable brief
│   │   │   ├── DecisionReplay.tsx   Shift+R audit-log scrubber
│   │   │   ├── CrossJurisdiction.tsx Shift+C peer comparison
│   │   │   ├── RestorationQueue.tsx Inside watchlist
│   │   │   └── TriageView.tsx       DEPRECATED stub (returns null)
│   │   └── styles/index.css     Design tokens + structural primitives + print stylesheet
│   ├── tailwind.config.js       Maps Tailwind tokens to CSS vars
│   ├── .env.example             VITE_GOOGLE_MAPS_API_KEY documented
│   └── package.json
├── docs/
│   ├── THRESHOLD_REDESIGN_BRIEF.md  Strategic brief + 4 addenda
│   └── SESSION_HANDOFF.md          (this file)
└── pipeline/
    └── EDA.ipynb
```

---

## 3. Architecture in one paragraph

The pipeline writes census + CISV + facilities + scenario-conditioned PCA scores to Postgres. The FastAPI backend serves them through `/api/communities/features`, proxies the Alectra outage feed (`/api/outages`) and Open-Meteo (`/api/weather?live=true` or `?simulate=true&...`), and exposes `/api/finance` (OEB rates + Bank of Canada CPI). The frontend boots from those endpoints, then polls weather every 5 min, outages every 2 min, finance every 60 min. The advisory rule engine and city-pattern detector run client-side over the live state, deterministically, in pure functions.

---

## 4. The lens system (central UX abstraction)

`Lens = 'operator' | 'municipal' | 'community' | 'resident'`

| Lens | Audience | What changes |
|---|---|---|
| operator | Utility (Alectra) | Restoration queue mode visible; operator-tier advisories first |
| municipal | EOC coordinator | Restoration visible; community advisories surface higher |
| community | Community organizers | Community advisories first; outreach mode highlighted |
| resident | Public | Completely different shell (ResidentView); no operator chrome; multilingual |

Lens is URL-persisted via `?lens=`. Every change writes to the audit log. The Resident lens is a wholly different surface — no map, no ribbon, no rail. Has a discreet "↩ Operator view" link as escape.

---

## 5. Scenarios

`Scenario = 'Baseline' | 'Heatwave' | 'Ice Storm'`

Switching scenario:
1. Immediately overrides every tract's weather (client-side) with the profile from `scenarios.ts`. Heatwave = 34°C / humidex 42. Ice Storm = -12°C / wind chill -22 / freezing rain / 35 km/h sustained.
2. The next weather poll (5 min) calls `/api/weather?simulate=true&...` instead of `?live=true` for per-tract nuance.
3. The choropleth re-ranks using `threshold_score_heatwave` or `threshold_score_icestorm` (pre-computed in the pipeline).
4. Returning to Baseline resumes live polling.

Smart scenario suggestion: when median live humidex ≥ 35 or median temp ≤ -5, a discreet centre-screen banner offers to switch.

---

## 6. Keyboard map

Global (when no overlay open, not typing in input):

- `Cmd-K` / `Ctrl-K` — command palette (works in inputs too)
- `Space` — cycle scenario
- `?` — open methodology overlay
- `F` — toggle Wall Display mode
- `R` — open 24h Situation Report
- `Shift+R` — open Decision Replay
- `Shift+C` — open Cross-Jurisdiction comparison
- `W` — toggle Watchlist tray
- `A` — toggle Operational Ledger (activity tray)
- `Esc` — stacked dismissal: palette → methodology → sitrep → cross-juris → replay → facility card → wall → ledger → watchlist → deselect tract

While any modal overlay is open, all global keys except Esc and Cmd-K are suspended.

---

## 7. Data flow and feeds

**One-shot at boot:**
- `GET /api/communities/features` → tracts + geometry
- `GET /api/facilities` → cooling/warming centres

**Polled:**
- `GET /api/weather?live=true` (or `?simulate=true&...` when scenario != Baseline) — every 5 min
- `GET /api/outages` — every 2 min, spatially joined to tract centroids client-side via ray-casting PIP
- `GET /api/finance` — every 60 min (Bank of Canada CPI via Valet API + OEB Regulated Price Plan rates)

**Static:**
- Transit corridors, hydro backbones, service points (in `staticLayers.ts`)

**Per-feed freshness state in `context.feeds`:** `{ lastSuccess, lastAttempt, inFlight, error, cadenceMs }`. Stale if past 2.5× cadence. Status strip shows per-source pips.

---

## 8. The rule engine

`advisoriesFor(tract, scenario, finance)` returns `Advisory[]` with:
- `audience`: 'resident' | 'community' | 'operator'
- `urgency`: 'routine' | 'elevated' | 'critical'
- `headline` (terse imperative)
- `detail` (static, never generated)
- `triggers`: `[{label, value, source}]` — the actual values that fired the rule
- `timeframe`, optional `impact` (operator-tier with delta/cost/authority/confidence)
- `sources`: dataset names

**16 rules across 3 audiences (R1–R6 resident, C1–C5 community, O1–O5 operator)**. Each rule fires when a named threshold is crossed in tract values + scenario + finance.

`preparednessPosture(advisories)` returns one of four tier-derived sentences (baseline / elevated / high / critical), used as the lead of the dispatch card narrative. Never empty.

`detectCityPatterns(tracts, scenario)` in `cityAnalysis.ts` runs spatial clustering (centroid-distance 2km, min 2 tracts) for: cooling deserts, vulnerable-senior low-access clusters, outage corridors, renter-pressure zones.

`forecast(tracts, scenario)` in `forecast.ts` returns 4 forecast points (0/6/12/24h ahead) with deterministic pressure coefficients. Phase 2 will swap for an LSTM; UI shape stable.

---

## 9. Tenant + i18n

**Tenants** (`tenant.ts`): brampton-pilot (live), mississauga-demo, hamilton-demo, surrey-demo. Each has `centre`, `zoom`, `population`. URL: `?tenant=hamilton-demo`. Map pans on tenant change.

**Locales** (`i18n.ts`): en, pa (ਪੰਜਾਬੀ), hi (हिन्दी). Resident view chrome and provenance translated. Locale switcher in resident header. URL: `?lang=pa`.

---

## 10. Audit log + cryptographic chain

`auditLog.ts` writes every consequential operator action to `localStorage` (`threshold.audit.v1`). Each entry carries:
- `id`, `ts`, `lens`, `action`, `targetLabel`, `ctuid?`, `note?`
- `prevHash`, `hash` (SHA-256 over content + previous hash) — async, settles after dispatch

Tamper-evident chain. `verifyAuditChain()` returns the index of the first tampered entry or -1.

External anchoring to a public timestamping service is the Phase-2 step toward regulatory-grade attestation.

---

## 11. Google integrations (require API key)

`VITE_GOOGLE_MAPS_API_KEY` in `frontend/.env.local`. Without it, the relevant surfaces fall back gracefully.

- **Street View Static** — used by `FacilityCard` for the top photo. Fades in over a kind-specific illustration; illustration stays if image fails or no key.
- **Places JavaScript SDK** — used by `FacilityCard` for real opening hours, phone, address, website, rating. Per-field "verified" shield. Without key, the card shows honest placeholders ("Hours vary by location. Confirm directly with the facility.") — no fabricated data.

Costs (with $200/mo free credit): findPlace+getDetails ~$0.034 per facility lookup; Street View ~$0.007 per photo.

---

## 12. The brief (`docs/THRESHOLD_REDESIGN_BRIEF.md`)

Main brief + 4 addenda:

- **Main** — 30-section strategic redesign (cartography, motion, hierarchy, etc.)
- **Addendum A · Preparedness Intelligence Layer** — the rule-engine architecture
- **Addendum B · Stakeholder Surfaces** — lens system + Restoration Queue + EWEI + Resident view
- **Addendum C · Refinement Brief** — the surgical-ten next steps
- **Addendum D · Billion-Dollar Roadmap** — what shipped, what's deferred, the 18-month sequence to Series C

---

## 13. Known limitations + deliberately deferred

**Not implemented (would need partner/infra/contract):**
- Native OMS / CAD integration (needs Alectra partnership, 12+ weeks)
- SOC 2 / FedRAMP / Protected B compliance (6–12 months audit each)
- Resident push notifications (needs PWA service worker + push server)
- Insurance / re-insurance data API (customer contract precedes infra)
- Real Brampton facility hours per location (would need data pipeline integration)

**Known visible quirks:**
- Toggling Wall Display mode (`F`) remounts MapPanel; tiles reload in ~1 second. Fix is portal/CSS-hide architecture; flagged for next pass.
- Cross-Jurisdiction peer cities use placeholder snapshot data; only Brampton is "live."
- Facility hours are honest placeholders unless Places API key is configured.
- Vite build fails in this sandbox due to ARM64 Rollup binary mismatch; works fine on user's Mac.

**Reverted features (do NOT reimplement without explicit ask):**
- Atmospheric map (CSS transitions on `.leaflet-interactive` for choropleth bleed, outage breath pulse, advisory pip pulse, weighted selection pan). User reverted this; the layer-once setStyle refactor in MapPanel went back to the pre-refactor rebuild-on-every-state-change pattern.

---

## 14. CSS / design tokens

12 colors total in `styles/index.css`:
- `--canvas` `#FAFAF7` (warm off-white)
- `--surface` `#FFFFFF`, `--surface-2` `#F4F2EC`
- `--hairline` `#E8E4D8`, `--hairline-2` `#D9D4C5`
- `--ink` `#0F172A`, `--ink-2`, `--ink-3`, `--ink-4`
- `--alert` `#9A3412` (deep ember — the single chromatic register)
- `--alert-deep` `#7C2D12`, `--alert-mid` `#C2410C`, `--alert-soft` `#D5A878`, `--alert-quiet` `#E8D8B9`
- `--warning` `#854D0E`, `--positive` `#3F6212`

Hairlines 0.5px throughout. No drop shadows. Border radius 4px max.

Typography: Inter only. Tabular figures via `.tabular` class. Scale: 10/11/12/13/14/15/17/18/22/28/48.

Motion: `cubic-bezier(0.22, 1, 0.36, 1)` easing. Durations 80/180/320/640ms.

---

## 15. Pending user-side items

- **Dev server is NOT running.** User needs to `cd Documents/Claude/Projects/Seneca\ Hackathon\ 2026/project_threshold/frontend && npm run dev` on their Mac to see the app at `http://localhost:5173`.
- **Claude in Chrome extension is not paired.** If they want me to drive the browser, they need to install the extension and click Connect.
- **Computer-use access is granted** for Chrome (read-tier) and Terminal (click-tier) on the Mac, plus the new `mcp__Control_Chrome__*` tools were just announced (load via ToolSearch when needed).

---

## 16. Recent context (last few turns before handoff)

1. User asked for "billion-dollar features." I shipped 9 of 13: forecast widget, Wall Display, Situation Report, Decision Replay, Cross-Jurisdiction, i18n (en/pa/hi), tenant theming, audit hash chain, expanded command palette. Documented in Addendum D.

2. User reported "lots of visual bugs and functionality failures." I did a defensive audit and fixed 8 concrete bugs: tenant switch didn't pan map, locale not URL-persisted, resident ctuid effect re-fired on every change, WallDisplay hardcoded "Brampton · Operations" subtitle, ForecastWidget/SuggestionBanner overlap, DecisionReplay autoplay divide-by-zero edge case, spacebar cycling scenario when overlays open, unused imports.

3. User said "use my desktop." I requested access to Chrome + Terminal (got read + click tier), opened Chrome, but found dev server isn't running. Tried to ask user to start it. User responded "[No preference]."

4. User then said "Continue from where you left off" but my last action was already complete (the AskUserQuestion). I responded "No response requested."

5. User asked to extract all context for a new session — this document.

---

## 17. What a fresh session should do first

1. Read this document.
2. Read `docs/THRESHOLD_REDESIGN_BRIEF.md` (full brief + 4 addenda) for strategic context.
3. Run `npx tsc --noEmit` from `frontend/` to verify the build is clean.
4. If the user has a specific bug or feature request, address that. Otherwise:
   - Wait for the user to start the dev server (`npm run dev` in `frontend/`)
   - Wait for them to connect the Claude in Chrome extension if they want me to drive their browser
   - Then audit visually + fix anything broken

**Default posture:** the user is post-prototype, ships at high velocity, doesn't want speculation. Be honest about scope. Don't make up data. Don't reintroduce reverted features without asking. Don't add chatbot UX. The map is the product.

---

*End of handoff. Generated by the previous session at the user's request.*
