# Source Catalogue

Authoritative record of every data source ingested into Threshold, with exact endpoints, status, and where each one is implemented.

**Scope:** Brampton (MVP demo city — 122 Census Tracts in Alectra territory).
**Pipeline package:** [backend/app/pipeline/](../backend/app/pipeline/) — medallion-layered (`raw → staging → curated → ml → public`). One per-source loader under [backend/app/pipeline/sources/](../backend/app/pipeline/sources/); six chained stages under [backend/app/pipeline/stages/](../backend/app/pipeline/stages/). Full design in [pipeline.md](./pipeline.md). Run with `python -m app.pipeline` (full chain) or `python -m app.pipeline --stage <name>` (single stage).
**Live services:** [backend/app/services/](../backend/app/services/) — Tier C fetchers (outages, weather, flood) read on demand and optionally archive to Postgres.
**Source slugs:** Defined in [backend/app/pipeline/sources/urls.py](../backend/app/pipeline/sources/urls.py) (`SOURCE_SLUGS`); every persisted value carries one.
**Status legend:** `planned → fetched → normalized → joined → live-in-app`

---

## Tier A — Structural (yearly, baked at build time)

Tier A flows through the medallion layers: each source is ingested verbatim into `raw.*`, typed and cleaned into `staging.*`, joined into `curated.community_features`, fed through PCA → `ml.{models, community_scores}`, and finally promoted into `public.{communities, facilities, pca_loadings}` for the FastAPI app to serve. See [pipeline.md](./pipeline.md).

### A1 · Census Tract Boundaries (StatsCan 2021)

- **Slug:** `statcan-census-tracts-2021`
- **Endpoint:** `https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/files-fichiers/lct_000b21a_e.zip`
- **Format:** Shapefile → GeoDataFrame via `geopandas`
- **Module:** [sources/boundaries.py](../backend/app/pipeline/sources/boundaries.py)
- **Coverage:** 1,432 Ontario CTs (PRUID=35) — filtered to CMAs 535 (Toronto) + 537 (Hamilton), Alectra service area
- **Raw landing:** `raw.ct_boundaries` (full GeoJSON record set, one row per fetch)
- **Output:** `geometry` column on every `staging.ct_geometries` row → `curated.community_features.geometry` → `public.communities.geometry` (GeoJSON)
- **License:** Statistics Canada Open License
- **Status:** ✅ live-in-app
- **Notes:** CTUID is the join key for every other source. Raw zip cached to `pipeline/data/ct_boundaries/`.

---

### A2 · 2021 Census Demographics by CT — Brampton (City ESRI ArcGIS)

- **Slug:** `brampton-esri-census2021`
- **Endpoint:** `https://services3.arcgis.com/rl7ACuZkiFsmDA2g/ArcGIS/rest/services/Census_2021/FeatureServer`
  - Layer 1 — Population: `CTUID, POPULATION_2021, TOTAL_PRIVATE_DWELLINGS`
  - Layer 6 — Housing tenure + age: `CTUID, RENTER, TOTAL_PRIV_HH_BY_TENURE_25, FROM1960_OR_BEFORE, FROM1961_TO_1980, TOTAL_PRIV_DWELL_PERIOD_25`
  - Layer 8 — Income: `CTUID, TOTAL_MED_HH_INC_2020`
  - Layer 11 — Low income: `CTUID, TOTAL_LOWINC_2020_LIM, TOTAL_PCT_LOWINC_2020_LIM`
- **Format:** JSON via ArcGIS REST
- **Module:** [sources/census.py](../backend/app/pipeline/sources/census.py)
- **Raw landing:** `raw.census_2021` → typed in `staging.census_tracts`
- **Coverage:** 122 Brampton Census Tracts (complete city coverage)
- **Columns produced:**
  - `population` — from `POPULATION_2021`
  - `median_income` — from `TOTAL_MED_HH_INC_2020`
  - `pct_renters` — computed: `RENTER / TOTAL_PRIV_HH_BY_TENURE_25`
  - `pct_pre1980` — computed: `(FROM1960_OR_BEFORE + FROM1961_TO_1980) / TOTAL_PRIV_DWELL_PERIOD_25`
  - `pct_low_income` — from `TOTAL_PCT_LOWINC_2020_LIM / 100`
- **License:** City of Brampton Open Data License
- **Status:** ✅ live-in-app
- **Verified:** Population for CT 5350528.20 = 5,726 — exact match to live ESRI on 2026-05-25.

---

### A3 · Canadian Index of Social Vulnerability (CISV) — StatsCan 2021

- **Slug:** `statcan-cisv-2021`
- **Endpoint:** `https://www150.statcan.gc.ca/pub/45-20-0001/2025001/csv/cisv-eng.zip`
- **Format:** CSV zip — DA-level scores (`cisv_scores_quintiles-eng.csv`)
- **Module:** [sources/cimd.py](../backend/app/pipeline/sources/cimd.py)
- **DA→CT crosswalk:** `2021_92-151_X.csv` (StatsCan 92-151 attribute file)
- **Aggregation:** DA scores averaged (mean) to CT level
- **Raw landing:** `raw.cisv_cisr_2021` → typed in `staging.vulnerability`
- **Columns produced:**
  - `cisv_score` — overall social vulnerability composite
  - `cisv_dim1` — Racialized populations & immigration status
  - `cisv_dim2` — Income & labour market marginalization
  - `cisv_dim3` — Education & Indigenous identity
  - `cisv_dim4` — Dwelling conditions
  - `cisv_quintile` — National quintile (5 = most vulnerable)
- **License:** Statistics Canada Open License
- **Status:** ✅ live-in-app
- **Verified:** CISV score for CT 5350528.20 = 0.0335 — exact match to raw StatsCan zip on 2026-05-25.
- **Reference:** Burrows et al. (2025). *Canadian Index of Social Vulnerability.* StatsCan Cat. 45-20-0001.

---

### A4 · Canadian Index of Social Resilience (CISR) — StatsCan 2021

- **Slug:** `statcan-cisr-2021`
- **Endpoint:** `https://www150.statcan.gc.ca/pub/45-20-0001/2025001/csv/cisr-eng.zip`
- **Format:** CSV zip — DA-level scores
- **Module:** [sources/cimd.py](../backend/app/pipeline/sources/cimd.py) (same module as CISV)
- **Columns produced:** `cisr_score` (inverted in PCA — higher resilience = lower vulnerability), `cisr_dim1..3`, `cisr_quintile`
- **License:** Statistics Canada Open License
- **Status:** ✅ live-in-app

---

### A5 · Brampton Secondary Plan Area Boundaries (Neighbourhood Names)

- **Slug:** `brampton-esri-secondary-plan-areas`
- **Endpoint:** `https://services3.arcgis.com/rl7ACuZkiFsmDA2g/arcgis/rest/services/Planning_Official_Plan/FeatureServer/0`
- **Format:** GeoJSON via ArcGIS REST
- **Module:** [sources/neighbourhoods.py](../backend/app/pipeline/sources/neighbourhoods.py)
- **Raw landing:** `raw.neighbourhoods` (Secondary Plan Area FeatureCollection); spatial join replayed offline by `stages/clean.py` → `staging.ct_geometries.neighbourhood`
- **Coverage:** 39 named Secondary Plan Areas covering all of Brampton
- **Columns produced:** `neighbourhood` (human-readable area name)
- **Method:** Point-in-polygon — each CT centroid assigned to the SPA polygon containing it
- **Status:** ✅ live-in-app — 122/122 CTs matched

---

### A6 · Alectra Service Area Boundaries

- **Slug:** `alectra-service-areas`
- **Endpoint:** `https://services8.arcgis.com/BiisLrqUuQvkdMCP/arcgis/rest/services/Alectra_Service_Areas/FeatureServer/0`
- **Format:** GeoJSON via ArcGIS REST (resolved through item `8eba357e1b124587884bccb724743c4c`)
- **Module:** [sources/alectra.py](../backend/app/pipeline/sources/alectra.py)
- **Raw landing:** `raw.alectra_service_area`; centroid-in-polygon flag is computed by `stages/clean.py` and stored as `staging.ct_geometries.served_by_alectra`
- **Coverage:** 18 service area polygons (Brampton, Mississauga, Hamilton, other Alectra municipalities)
- **Role:** Clips the master CT list to served-by-Alectra CTs via centroid-in-polygon
- **Status:** ✅ live-in-app

---

### A7 · Brampton Recreation Centres + Libraries

- **Slugs:** `brampton-esri-recreation`, `brampton-esri-libraries`
- **Endpoints:**
  - `https://services3.arcgis.com/rl7ACuZkiFsmDA2g/arcgis/rest/services/RecreationFacilities/FeatureServer/0`
  - `https://services3.arcgis.com/rl7ACuZkiFsmDA2g/arcgis/rest/services/Libraries/FeatureServer/0`
- **Module:** [sources/facilities.py](../backend/app/pipeline/sources/facilities.py)
- **Raw landing:** `raw.facilities` → typed in `staging.facilities` → promoted to `public.facilities` by `stages/publish.py`
- **Coverage:** 38 active recreation facilities + 7 library branches
- **Output:** `public.facilities` Postgres table; each row carries `_source_layer` ∈ {`recreation`, `library`}
- **Role:** Labelled as "Cooling & Warming Centres" in the UI
- **License:** City of Brampton Open Data License
- **Status:** ✅ live-in-app

---

## Tier C — Live (request-time fetch, optional Postgres archive)

### C1 · Alectra Live Power Outage Feed

- **Slug:** `alectra-outages-live`
- **Endpoint:** `https://services8.arcgis.com/wNDmObY7QplwZD9m/ArcGIS/rest/services/Outage_Details/FeatureServer/7/query`
- **Format:** GeoJSON via ArcGIS REST (`?f=geojson&where=1=1&outFields=*`)
- **Service:** [outages.py](../backend/app/services/outages.py) — TTL cache (default 5 min), spatial-joined to CT polygons at request time
- **Columns produced (per CT, live):**
  - `active_outages` — count of outage polygons overlapping the CT
  - `customers_affected` — sum of `CUSTOUT` from overlapping outages
- **License:** Esri/Alectra public ArcGIS Hub — public access permitted
- **Status:** ✅ live-in-app

---

### C2 · Open-Meteo Current Conditions

- **Slug:** `open-meteo-current`
- **Endpoint:** `https://api.open-meteo.com/v1/forecast`
- **Format:** JSON (free, no API key)
- **Service:** [weather.py](../backend/app/services/weather.py) — TTL cache (default 15 min), batched per-CT centroid request
- **Parameters fetched:** `temperature_2m, apparent_temperature, precipitation, wind_speed_10m, wind_gusts_10m, weather_code`
- **Columns produced:** `temperature_c`, `humidex` (apparent temperature), `precipitation_mm`, `wind_speed_kmh`, `wind_gusts_kmh`, `weather_code`
- **Archive:** `weather_observations` table (one row per CT per fetch when `THRESHOLD_DATABASE_URL` is set)
- **License:** Open-Meteo CC-BY 4.0
- **Status:** ✅ live-in-app

---

### C3 · Open-Meteo Flood (Copernicus GloFAS v4 river discharge)

- **Slug:** `open-meteo-flood`
- **Endpoint:** `https://flood-api.open-meteo.com/v1/flood`
- **Format:** JSON daily series (free, no API key) — 30 past days + today + 7 forecast days per call
- **Service:** [flood.py](../backend/app/services/flood.py) — TTL cache (default 1 hour, GloFAS publishes daily), one HTTP call per CT centroid
- **Coverage:** Per-coordinate discharge from the largest river within ~5 km. For Brampton this picks up Etobicoke Creek / Mimico Creek / Humber tributaries.
- **Columns produced (per CT, live):**
  - `river_discharge` — today's discharge (m³/s)
  - `discharge_30d_mean` — mean across the past 30 days (baseline)
  - `discharge_7d_max` — max across the next 7 forecast days
  - `discharge_anomaly` — `discharge_7d_max / discharge_30d_mean` (real-time hazard ratio; >> 1 = rising)
- **Archive:** `flood_observations` table — one row per CT per cold-cache fetch (raw GloFAS payload retained for replay)
- **License:** Open-Meteo CC-BY 4.0; underlying data Copernicus Emergency Management Service (open)
- **Status:** ✅ live-in-app

---

## Computed Outputs

### Score · Threshold Vulnerability Score

- **Slug:** `threshold-score-pca`
- **Method:** Principal Component Analysis (PCA), PC1 rescaled 0–100
- **Library:** `sklearn.Pipeline([StandardScaler, PCA(n_components=5)])`
- **Training:** [stages/train.py](../backend/app/pipeline/stages/train.py) — fits one pipeline per scenario on `curated.community_features`, persists pickled `Pipeline` + loadings + metrics into `ml.models` with a fresh `model_id`, and logs the run to MLflow (best-effort)
- **Scoring:** [stages/score.py](../backend/app/pipeline/stages/score.py) — loads the latest model per scenario from `ml.models`, applies it, writes one row per CT × scenario into `ml.community_scores` with `model_id` provenance
- **Publishing:** [stages/publish.py](../backend/app/pipeline/stages/publish.py) — promotes `ml.community_scores` + `curated.community_features` into `public.communities` and rebuilds `public.pca_loadings` from the latest models, in a single transaction
- **Config:** [config.py:FACTOR_COLS, SCENARIOS, grade_for](../backend/app/pipeline/config.py)
- **Input factors (all standardized before PCA):**

  | Factor | Direction | Notes |
  |--------|-----------|-------|
  | `cisv_score` | ↑ vulnerable | Highest loading |
  | `cisv_dim4` (dwelling conditions) | ↑ vulnerable | |
  | `cisv_dim2` (income/labour) | ↑ vulnerable | |
  | `cisv_dim3` (education) | ↑ vulnerable | |
  | `cisv_dim1` (racialized/immigration) | ↑ vulnerable | |
  | `pct_pre1980` | ↑ vulnerable | |
  | `pct_renters` | ↑ vulnerable | |
  | `humidex` | ↑ vulnerable | Weather factor |
  | `cisr_score` | **inverted** (high = resilient) | |
  | `median_income` | **inverted** (high = less vulnerable) | |

- **PC1 explained variance:** ~35% of total variation across Brampton CTs
- **Rescaling:** `score = (PC1 − min) / (max − min) × 100`
- **Risk buckets:** Low (0–25) · Moderate (25–50) · High (50–75) · Critical (75–100)
- **Scenarios:**
  - **Baseline** — equal weights
  - **Heatwave** — humidex weight × 2.5, pct_renters × 1.2
  - **Ice Storm** — active_outages × 3.0, customers_affected × 2.0, pct_renters × 1.5
- **Output columns on `public.communities`:** `threshold_score_baseline`, `threshold_score_heatwave`, `threshold_score_icestorm`, `threshold_score` (= baseline), `risk_level`, plus per-scenario `model_id_{scenario}` so any score traces back to its training run
- **Model registry:** `ml.models` (one row per fit — pickled sklearn `Pipeline`, JSON loadings, JSON metrics, MLflow `run_id`)
- **Score table:** `ml.community_scores` (one row per CT × scenario with `model_id` FK; the source of truth that `publish` reads from)
- **Loadings table:** `public.pca_loadings` (one row per factor, with per-scenario loading + source slug — rebuilt every run from the latest `ml.models` rows)
- **Computation archive:** `threshold_scores` table (legacy audit trail of live-time recomputes from Tier C data, when `THRESHOLD_DATABASE_URL` is set)
- **Experiment tracking:** MLflow at `http://localhost:5000` — every training run logs params, metrics, and the serialized pipeline as an artifact

---

## Known Limits

| Limit | Impact | Status |
|-------|--------|--------|
| Pipeline scoped to Brampton | Mississauga / Hamilton CTs not currently in the `communities` table | Brampton-only is the MVP scope |
| Historical weather not archived yet | Tier C archive starts at first live `/api/weather` fetch | Builds over time once `THRESHOLD_DATABASE_URL` is set |
| Flood data is GloFAS resolution (~5 km), not TRCA regulatory floodplain | Catches creek-system rises; doesn't show parcel-level flood extents | Add TRCA `FloodPlain_Regulatory` as a Tier A polygon layer if a parcel-level signal becomes needed |
| OpenWeather Brampton-grid fetcher | Not yet wired — `OPENWEATHER_API_KEY` passthrough exists but no service consumes it | Planned (writes to `weather_observations` via `PersistenceService`) |
