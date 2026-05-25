# EDA Notebook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `pipeline/EDA.ipynb` — a two-phase notebook that validates all data sources via ingestion + spatial joins, then computes a PCA-derived Threshold Score with a prototype choropleth across Alectra-territory Census Tracts.

**Architecture:** Five sequential sections in one notebook. Section 1–2 prove data reachability and join correctness. Section 3 characterises distributions for score design. Section 4 runs PCA over all normalized factors (with three scenario weight variants) to produce `threshold_score`. Section 5 renders the proof choropleth. All outputs written to `pipeline/data/`.

**Tech Stack:** Python 3.11+, geopandas 0.14, pandas 2.0, scikit-learn 1.4, matplotlib 3.8, seaborn 0.13, httpx 0.27, numpy 1.26, nbformat 5.

---

## File Map

| Path | Action | Responsibility |
|------|--------|----------------|
| `pipeline/EDA.ipynb` | Rewrite | Main notebook — all 5 sections |
| `pipeline/data/` | Create dir | All downloaded and derived outputs |
| `pipeline/data/ct_boundaries/` | Created by Task 2 | Raw StatsCan CT shapefile |
| `pipeline/data/census_profile/` | Created by Task 3 | Raw A2 demographics CSV |
| `pipeline/data/cimd/` | Created by Task 4 | Raw A3 CIMD CSV |
| `pipeline/data/master_cts.geojson` | Created by Task 9 | Joined master GeoDataFrame |
| `pipeline/data/loadings.csv` | Created by Task 12 | PCA loadings table (factor → loading → source) |
| `pipeline/data/prototype_choropleth.png` | Created by Task 13 | 3-panel scenario choropleth |

---

## Task 1: Environment Setup

**Files:**
- Modify: `pipeline/EDA.ipynb` (Cell 1 — setup)

- [ ] **Step 1: Replace the stub notebook with a clean setup cell**

Open `pipeline/EDA.ipynb`. Delete all existing cells. Add the following as Cell 1:

```python
import os
import io
import zipfile
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import geopandas as gpd
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
import seaborn as sns
import httpx
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA

warnings.filterwarnings("ignore")
pd.set_option("display.max_columns", 50)
pd.set_option("display.float_format", "{:.2f}".format)

DATA_DIR = Path("data")
DATA_DIR.mkdir(exist_ok=True)
(DATA_DIR / "ct_boundaries").mkdir(exist_ok=True)
(DATA_DIR / "census_profile").mkdir(exist_ok=True)
(DATA_DIR / "cimd").mkdir(exist_ok=True)

ARCGIS_TOKEN = os.getenv("ARCGIS_TOKEN", "")
if not ARCGIS_TOKEN:
    print("⚠️  ARCGIS_TOKEN not set — B1/B2 Esri sources will be skipped gracefully")
else:
    print("✅ ARCGIS_TOKEN loaded")

print("Setup complete. DATA_DIR:", DATA_DIR.resolve())
```

- [ ] **Step 2: Run Cell 1 and confirm output**

Expected output:
```
⚠️  ARCGIS_TOKEN not set — B1/B2 Esri sources will be skipped gracefully
Setup complete. DATA_DIR: .../pipeline/data
```
(Or `✅ ARCGIS_TOKEN loaded` if token is set.)

- [ ] **Step 3: Commit**

```bash
git add pipeline/EDA.ipynb
git commit -m "pipeline: rebuild EDA.ipynb — setup cell"
```

---

## Task 2: Fetch A1 — Census Tract Boundaries (StatsCan)

**Files:**
- Modify: `pipeline/EDA.ipynb` (Cell 2)
- Creates: `pipeline/data/ct_boundaries/` (shapefile contents)

- [ ] **Step 1: Write the assertion cell first (Cell 2a)**

```python
# ASSERTION — run after Cell 2b to verify
assert "gdf_ct" in dir(), "gdf_ct not defined — run the fetch cell"
assert len(gdf_ct) >= 350, f"Expected ≥350 CTs in scope, got {len(gdf_ct)}"
assert gdf_ct.crs.to_epsg() == 4326, f"Expected EPSG:4326, got {gdf_ct.crs}"
assert "CTUID" in gdf_ct.columns, "CTUID column missing"
assert gdf_ct.geometry.notnull().all(), "Null geometries found"
print(f"✅ A1 assertions pass — {len(gdf_ct)} CTs, CRS: {gdf_ct.crs}")
```

- [ ] **Step 2: Run Cell 2a and confirm it fails**

Expected: `AssertionError: gdf_ct not defined`

- [ ] **Step 3: Write the fetch cell (Cell 2b, insert before 2a)**

```python
# A1 — StatsCan Census Tract boundaries 2021
# Cartographic boundary file (simplified), national coverage, ~15 MB zip
CT_URL = (
    "https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/"
    "boundary-limites/files-fichiers/lct_000b21a_e.zip"
)
CT_ZIP = DATA_DIR / "ct_boundaries" / "lct_000b21a_e.zip"

if not CT_ZIP.exists():
    print("Downloading CT boundaries (~15 MB)...")
    with httpx.Client(follow_redirects=True, timeout=120) as client:
        r = client.get(CT_URL)
        r.raise_for_status()
    CT_ZIP.write_bytes(r.content)
    print(f"Saved to {CT_ZIP}")
else:
    print(f"Using cached {CT_ZIP}")

with zipfile.ZipFile(CT_ZIP) as z:
    z.extractall(DATA_DIR / "ct_boundaries")

# Read — geopandas can read the shapefile directly from the extracted dir
shp_files = list((DATA_DIR / "ct_boundaries").glob("*.shp"))
assert shp_files, "No .shp file found after extraction"
gdf_ct = gpd.read_file(shp_files[0])

print("Raw columns:", gdf_ct.columns.tolist())
print("Raw CRS:", gdf_ct.crs)
print("Raw shape:", gdf_ct.shape)

# Filter to CMAs 35535 (Toronto CMA — covers Mississauga + Brampton) and 35537 (Hamilton)
# CMAUID column name may be 'CMAUID' or 'CMAPUID' — check print above and adjust
gdf_ct = gdf_ct[gdf_ct["CMAUID"].isin(["35535", "35537"])].copy()
gdf_ct = gdf_ct.to_crs("EPSG:4326").reset_index(drop=True)

print(f"\nFiltered to {len(gdf_ct)} CTs in CMAs 35535 + 35537")
gdf_ct[["CTUID", "CTNAME", "CMAUID", "CMANAME"]].head(3)
```

- [ ] **Step 4: Run Cell 2b then Cell 2a — confirm assertion passes**

Expected:
```
✅ A1 assertions pass — 4XX CTs, CRS: EPSG:4326
```

> If the `CMAUID` column name differs (check the raw columns printout), update both cells accordingly.

- [ ] **Step 5: Commit**

```bash
git add pipeline/EDA.ipynb
git commit -m "pipeline: EDA A1 census tract boundaries"
```

---

## Task 3: Fetch A2 — Census Demographics (StatsCan)

**Files:**
- Modify: `pipeline/EDA.ipynb` (Cell 3)
- Creates: `pipeline/data/census_profile/98-401-X2021044_English_CSV_data.csv`

The 2021 Census Profile CSV (CT-level, English) is a long-format file where each row is one characteristic for one CT. Key characteristic codes used:
- `1` — Population, 2021
- `133` — Median total income of household in 2020 ($)
- `1680` — % renter (derived: Renter / Total private dwellings by tenure)
- `1681` — Owner count (to compute renter %)
- `1682` — Renter count
- `1838` — Dwellings built 1960 or before
- `1839` — Dwellings built 1961 to 1980
- `1820` — Total — Occupied private dwellings by period of construction (denominator)

> **Note:** Characteristic IDs in the Census Profile CSV are positional — verify by opening the file and searching for the label. The IDs above match the 2021 CT profile as of download date. The actual column holding the code is `CHARACTERISTIC_ID`.

- [ ] **Step 1: Write assertion cell (Cell 3a)**

```python
# ASSERTION
assert "df_census" in dir(), "df_census not defined"
assert {"CTUID", "median_income", "pct_renters", "pct_pre1980"}.issubset(df_census.columns), \
    f"Missing columns. Got: {df_census.columns.tolist()}"
assert len(df_census) >= 350, f"Expected ≥350 rows, got {len(df_census)}"
null_pct = df_census[["median_income", "pct_renters", "pct_pre1980"]].isnull().mean()
assert (null_pct < 0.10).all(), f"High null rate in core columns:\n{null_pct}"
print(f"✅ A2 assertions pass — {len(df_census)} CTs")
print(df_census[["CTUID","median_income","pct_renters","pct_pre1980"]].describe())
```

- [ ] **Step 2: Run assertion — confirm it fails**

Expected: `AssertionError: df_census not defined`

- [ ] **Step 3: Write fetch + reshape cell (Cell 3b, before 3a)**

```python
# A2 — Census Profile 2021, CT level (English, national)
# Large file (~1.5 GB unzipped). Downloads the zip (~200 MB), extracts, reshapes.
CENSUS_URL = (
    "https://www12.statcan.gc.ca/census-recensement/2021/dp-pd/prof/details/"
    "download-telecharger/comp/GetFile.cfm?Lang=E&FILETYPE=CSV&GEONO=044"
)
CENSUS_ZIP = DATA_DIR / "census_profile" / "98-401-X2021044_English_CSV.zip"
CENSUS_CSV = DATA_DIR / "census_profile" / "98-401-X2021044_English_CSV_data.csv"

if not CENSUS_CSV.exists():
    if not CENSUS_ZIP.exists():
        print("Downloading Census Profile CSV (~200 MB)...")
        with httpx.Client(follow_redirects=True, timeout=300) as client:
            r = client.get(CENSUS_URL)
            r.raise_for_status()
        CENSUS_ZIP.write_bytes(r.content)
        print("Download complete")
    print("Extracting...")
    with zipfile.ZipFile(CENSUS_ZIP) as z:
        z.extractall(DATA_DIR / "census_profile")
    print("Extracted")
else:
    print(f"Using cached {CENSUS_CSV}")

# Read only the rows we need to avoid loading 1.5 GB into memory
# The CSV is long-format: one row per (GEO_CODE, CHARACTERISTIC_ID)
# We filter to the 8 characteristic IDs we need
TARGET_CHARS = {1, 133, 1680, 1681, 1682, 1820, 1838, 1839}
CHAR_LABELS  = {
    1:    "population",
    133:  "median_income",
    1682: "renter_count",
    1681: "owner_count",
    1820: "total_period_construct",
    1838: "dwell_pre1960",
    1839: "dwell_1961_1980",
}

chunks = []
for chunk in pd.read_csv(CENSUS_CSV, chunksize=50_000, low_memory=False, encoding="latin-1"):
    chunk.columns = chunk.columns.str.strip()
    # The CT-level geo identifier column is typically 'GEO_CODE (POR)' or 'ALT_GEO_CODE'
    # Characteristic column: 'CHARACTERISTIC_ID'
    # Value column: 'C1_COUNT_TOTAL'
    mask = chunk["CHARACTERISTIC_ID"].isin(TARGET_CHARS)
    chunks.append(chunk[mask])

df_long = pd.concat(chunks, ignore_index=True)
print(f"Filtered rows: {len(df_long)}")
print("Columns:", df_long.columns.tolist()[:10])

# Pivot to wide format
# GEO_CODE is the CT identifier — it should match StatsCan CTUID (7-char string)
geo_col = "ALT_GEO_CODE"  # adjust if column name differs (check print above)
val_col  = "C1_COUNT_TOTAL"

df_wide = (
    df_long[df_long["CHARACTERISTIC_ID"].isin(CHAR_LABELS)]
    .pivot_table(index=geo_col, columns="CHARACTERISTIC_ID", values=val_col, aggfunc="first")
    .reset_index()
    .rename(columns={**{k: v for k, v in CHAR_LABELS.items()}, geo_col: "CTUID"})
)
df_wide["CTUID"] = df_wide["CTUID"].astype(str).str.zfill(7)

# Derived columns
df_wide["total_dwellings"] = df_wide.get("owner_count", 0) + df_wide.get("renter_count", 0)
df_wide["pct_renters"]  = df_wide["renter_count"]  / df_wide["total_dwellings"].replace(0, np.nan)
df_wide["pct_pre1980"]  = (
    (df_wide["dwell_pre1960"].fillna(0) + df_wide["dwell_1961_1980"].fillna(0))
    / df_wide["total_period_construct"].replace(0, np.nan)
)
df_wide["median_income"] = pd.to_numeric(df_wide["median_income"], errors="coerce")

df_census = df_wide[["CTUID","population","median_income","pct_renters","pct_pre1980"]].copy()
print(f"\ndf_census shape: {df_census.shape}")
df_census.head(3)
```

- [ ] **Step 4: Run Cell 3b then 3a — confirm assertions pass**

Expected: `✅ A2 assertions pass — 4XX CTs`

> If column names differ from expected (the CSV schema may vary), adjust `geo_col` and `val_col` using the printed column list.

- [ ] **Step 5: Commit**

```bash
git add pipeline/EDA.ipynb
git commit -m "pipeline: EDA A2 census demographics"
```

---

## Task 4: Fetch A3 — CIMD Vulnerability Index (StatsCan)

**Files:**
- Modify: `pipeline/EDA.ipynb` (Cell 4)
- Creates: `pipeline/data/cimd/`

- [ ] **Step 1: Write assertion cell (Cell 4a)**

```python
# ASSERTION
assert "df_cimd" in dir(), "df_cimd not defined"
required = {"CTUID","cimd_residential_instability","cimd_economic_dependency",
            "cimd_ethnocultural_composition","cimd_situational_vulnerability"}
assert required.issubset(df_cimd.columns), f"Missing cols. Got: {df_cimd.columns.tolist()}"
assert len(df_cimd) >= 350
print(f"✅ A3 assertions pass — {len(df_cimd)} rows")
print(df_cimd[list(required - {'CTUID'})].describe())
```

- [ ] **Step 2: Run — confirm AssertionError**

- [ ] **Step 3: Write fetch cell (Cell 4b, before 4a)**

```python
# A3 — Canadian Index of Multiple Deprivation (CIMD) 2021
# StatsCan catalogue 45-20-0001-01
CIMD_URL = "https://www150.statcan.gc.ca/n1/pub/45-20-0001/2021001/CIMD-ICMD.zip"
CIMD_ZIP = DATA_DIR / "cimd" / "CIMD-ICMD.zip"

if not CIMD_ZIP.exists():
    print("Downloading CIMD (~5 MB)...")
    with httpx.Client(follow_redirects=True, timeout=60) as client:
        r = client.get(CIMD_URL)
        r.raise_for_status()
    CIMD_ZIP.write_bytes(r.content)
    print("Downloaded")
else:
    print(f"Using cached {CIMD_ZIP}")

with zipfile.ZipFile(CIMD_ZIP) as z:
    z.extractall(DATA_DIR / "cimd")

csv_files = list((DATA_DIR / "cimd").glob("*.csv"))
print("CSV files found:", [f.name for f in csv_files])
df_cimd_raw = pd.read_csv(csv_files[0], encoding="latin-1")
print("Columns:", df_cimd_raw.columns.tolist())
print(df_cimd_raw.head(2))
```

- [ ] **Step 4: Add reshape cell (Cell 4c, after 4b)**

After running 4b, inspect the printout to identify the column names. The CIMD file typically has:
- `CTUID` or `CT_UID` — 7-digit CT identifier
- `RINS_PCTL` — Residential Instability percentile
- `ECON_PCTL` — Economic Dependency percentile
- `ETHN_PCTL` — Ethnocultural Composition percentile
- `SITU_PCTL` — Situational Vulnerability percentile

```python
# Adjust column mapping based on the actual column names printed above
CIMD_COL_MAP = {
    # "actual_col_name": "our_name"
    # Fill in after inspecting df_cimd_raw.columns
    "CT_UID":    "CTUID",          # verify
    "RINS_PCTL": "cimd_residential_instability",
    "ECON_PCTL": "cimd_economic_dependency",
    "ETHN_PCTL": "cimd_ethnocultural_composition",
    "SITU_PCTL": "cimd_situational_vulnerability",
}

df_cimd = df_cimd_raw.rename(columns=CIMD_COL_MAP)
# Keep only mapped columns that exist
keep = [c for c in CIMD_COL_MAP.values() if c in df_cimd.columns]
df_cimd = df_cimd[keep].copy()
df_cimd["CTUID"] = df_cimd["CTUID"].astype(str).str.zfill(7)

# Convert percentile columns to 0–1 range
for col in keep:
    if col != "CTUID":
        df_cimd[col] = pd.to_numeric(df_cimd[col], errors="coerce") / 100.0

print(f"df_cimd shape: {df_cimd.shape}")
df_cimd.head(3)
```

- [ ] **Step 5: Run 4b → 4c → 4a — confirm assertions pass**

- [ ] **Step 6: Commit**

```bash
git add pipeline/EDA.ipynb
git commit -m "pipeline: EDA A3 CIMD vulnerability index"
```

---

## Task 5: Fetch A8 — Alectra Service Area (ArcGIS REST)

**Files:**
- Modify: `pipeline/EDA.ipynb` (Cell 5)

- [ ] **Step 1: Write assertion cell (Cell 5a)**

```python
# ASSERTION
assert "gdf_alectra" in dir(), "gdf_alectra not defined"
assert gdf_alectra.crs.to_epsg() == 4326
assert len(gdf_alectra) >= 1, "No features returned"
assert gdf_alectra.geometry.notnull().all()
print(f"✅ A8 assertions pass — {len(gdf_alectra)} service area polygon(s)")
gdf_alectra.plot(figsize=(6, 6), edgecolor="black", facecolor="lightblue")
plt.title("Alectra Service Area"); plt.show()
```

- [ ] **Step 2: Run — confirm AssertionError**

- [ ] **Step 3: Write fetch cell (Cell 5b, before 5a)**

The Alectra service area item ID is `8eba357e1b124587884bccb724743c4c` on ArcGIS Online.
First discover the REST URL by querying the item metadata:

```python
# A8 — Alectra service area
# Step 1: get the FeatureServer URL from the ArcGIS item
ITEM_URL = "https://www.arcgis.com/sharing/rest/content/items/8eba357e1b124587884bccb724743c4c?f=json"
with httpx.Client(follow_redirects=True, timeout=30) as client:
    meta = client.get(ITEM_URL).json()

print("Item type:", meta.get("type"))
print("URL:", meta.get("url"))
service_url = meta.get("url", "").rstrip("/")

if not service_url:
    raise ValueError("Could not resolve service URL from item metadata. Check item ID.")

# Step 2: query layer 0 for all features as GeoJSON
query_url = f"{service_url}/0/query"
params = {
    "f": "geojson",
    "where": "1=1",
    "outFields": "*",
    "returnGeometry": "true",
}
with httpx.Client(follow_redirects=True, timeout=60) as client:
    r = client.get(query_url, params=params)
    r.raise_for_status()

gdf_alectra = gpd.read_file(io.StringIO(r.text))
gdf_alectra = gdf_alectra.to_crs("EPSG:4326")
print(f"A8 fetched: {len(gdf_alectra)} features")
print("Columns:", gdf_alectra.columns.tolist())
```

- [ ] **Step 4: Run 5b → 5a — confirm assertions pass and map renders**

- [ ] **Step 5: Commit**

```bash
git add pipeline/EDA.ipynb
git commit -m "pipeline: EDA A8 Alectra service area"
```

---

## Task 6: Fetch C1 — Alectra Live Outages (ArcGIS REST)

**Files:**
- Modify: `pipeline/EDA.ipynb` (Cell 6)

- [ ] **Step 1: Write assertion cell (Cell 6a)**

```python
# ASSERTION
assert "gdf_outages" in dir(), "gdf_outages not defined"
# Outages may legitimately be empty if none are active right now
assert isinstance(gdf_outages, gpd.GeoDataFrame)
assert gdf_outages.crs.to_epsg() == 4326 if len(gdf_outages) > 0 else True
print(f"✅ C1 assertions pass — {len(gdf_outages)} active outage polygon(s) right now")
if len(gdf_outages) > 0:
    print(gdf_outages[["geometry"]].head(3))
```

- [ ] **Step 2: Run — confirm AssertionError**

- [ ] **Step 3: Write enumeration + fetch cell (Cell 6b, before 6a)**

```python
# C1 — Alectra live outage polygons
# Step 1: enumerate all layers to find the customer outage polygon layer
FEAT_SERVER = "https://services8.arcgis.com/wNDmObY7QplwZD9m/ArcGIS/rest/services/Outage_Details/FeatureServer"
with httpx.Client(follow_redirects=True, timeout=30) as client:
    layers_resp = client.get(f"{FEAT_SERVER}/layers?f=json")
    layers_data = layers_resp.json()

print("Available layers:")
for lyr in layers_data.get("layers", []):
    print(f"  id={lyr['id']}  name={lyr['name']}  geomType={lyr.get('geometryType','?')}")
```

- [ ] **Step 4: Run Cell 6b (layer enumeration only)**

Inspect the output to identify the layer ID whose name contains "outage" or "customer" and has polygon geometry. Note that ID.

- [ ] **Step 5: Add fetch cell (Cell 6c, after 6b)**

Replace `OUTAGE_LAYER_ID` with the ID identified in Step 4:

```python
# Replace with the correct layer ID from the enumeration above
OUTAGE_LAYER_ID = 0  # ← UPDATE THIS after reading enumeration output

query_url = f"{FEAT_SERVER}/{OUTAGE_LAYER_ID}/query"
params = {
    "f": "geojson",
    "where": "1=1",
    "outFields": "*",
    "returnGeometry": "true",
}
with httpx.Client(follow_redirects=True, timeout=30) as client:
    r = client.get(query_url, params=params)
    r.raise_for_status()

try:
    gdf_outages = gpd.read_file(io.StringIO(r.text))
    if len(gdf_outages) > 0:
        gdf_outages = gdf_outages.to_crs("EPSG:4326")
    print(f"C1 fetched: {len(gdf_outages)} active outages")
    if len(gdf_outages) > 0:
        print("Columns:", gdf_outages.columns.tolist())
except Exception as e:
    print(f"No active outages or parse error: {e}")
    gdf_outages = gpd.GeoDataFrame(columns=["geometry"], geometry="geometry", crs="EPSG:4326")
```

- [ ] **Step 6: Run 6c → 6a — confirm assertions pass**

- [ ] **Step 7: Commit**

```bash
git add pipeline/EDA.ipynb
git commit -m "pipeline: EDA C1 Alectra live outages"
```

---

## Task 7: Fetch C2 — Environment Canada GeoMet Weather

**Files:**
- Modify: `pipeline/EDA.ipynb` (Cell 7)

- [ ] **Step 1: Write assertion cell (Cell 7a)**

```python
# ASSERTION
assert "gdf_weather" in dir(), "gdf_weather not defined"
assert isinstance(gdf_weather, gpd.GeoDataFrame)
assert "temperature_c" in gdf_weather.columns or len(gdf_weather) == 0, \
    f"Expected temperature_c. Got columns: {gdf_weather.columns.tolist()}"
print(f"✅ C2 assertions pass — {len(gdf_weather)} weather observation(s)")
```

- [ ] **Step 2: Run — confirm AssertionError**

- [ ] **Step 3: Write fetch cell (Cell 7b, before 7a)**

```python
# C2 — Environment Canada GeoMet OGC API — hourly observations near study area
# Bounding box: Hamilton + Mississauga + Brampton approximately -80.5, 43.1, -79.2, 43.9
BBOX = "-80.5,43.1,-79.2,43.9"
OBS_URL = "https://api.weather.gc.ca/collections/climate-hourly/items"
params = {
    "f": "json",
    "bbox": BBOX,
    "limit": 100,
    "sortby": "-LOCAL_DATE",  # most recent first
}
with httpx.Client(follow_redirects=True, timeout=30) as client:
    r = client.get(OBS_URL, params=params)
    if r.status_code != 200:
        print(f"climate-hourly returned {r.status_code}. Trying alternate collection...")
        # Fallback: check available collections
        coll_r = client.get("https://api.weather.gc.ca/collections?f=json", timeout=30)
        colls = [c["id"] for c in coll_r.json().get("collections", [])]
        print("Available collections (sample):", colls[:20])
        gdf_weather = gpd.GeoDataFrame(columns=["geometry","temperature_c"], geometry="geometry", crs="EPSG:4326")
    else:
        data = r.json()
        features = data.get("features", [])
        print(f"Got {len(features)} observations")
        if features:
            gdf_weather = gpd.GeoDataFrame.from_features(features, crs="EPSG:4326")
            # Normalize temperature column — may be TEMP, AIR_TEMP, or similar
            temp_candidates = [c for c in gdf_weather.columns if "TEMP" in c.upper()]
            print("Temperature candidates:", temp_candidates)
            if temp_candidates:
                gdf_weather["temperature_c"] = pd.to_numeric(
                    gdf_weather[temp_candidates[0]], errors="coerce"
                )
            # Humidex — may not be in this collection; set to NaN if absent
            if "HUMIDEX" not in gdf_weather.columns:
                gdf_weather["humidex"] = np.nan
            print("Columns:", gdf_weather.columns.tolist())
        else:
            gdf_weather = gpd.GeoDataFrame(
                columns=["geometry","temperature_c","humidex"],
                geometry="geometry", crs="EPSG:4326"
            )
```

- [ ] **Step 4: Run 7b → 7a — confirm assertions pass**

> If the `climate-hourly` collection is unavailable, the cell falls back gracefully. Check the printed collection list to identify an equivalent and update `OBS_URL`.

- [ ] **Step 5: Commit**

```bash
git add pipeline/EDA.ipynb
git commit -m "pipeline: EDA C2 Environment Canada weather"
```

---

## Task 8: Fetch B1/B2 — Esri (Token-Gated, Graceful Skip)

**Files:**
- Modify: `pipeline/EDA.ipynb` (Cell 8)

- [ ] **Step 1: Write cell (Cell 8)**

```python
# B1/B2 — Esri Living Atlas EJ + Climate Hub heat vulnerability
# These require an ArcGIS Online token. Cells skip gracefully if token is absent.

gdf_ej = None
gdf_heat_vuln = None

if not ARCGIS_TOKEN:
    print("⚠️  Skipping B1/B2 — set ARCGIS_TOKEN env var and rerun to include Esri sources")
else:
    # B1: Living Atlas Environmental Justice — Canada
    # Layer URL to be confirmed from https://livingatlas.arcgis.com (filter by Canada)
    # Placeholder — replace with actual FeatureServer URL after manual browser enumeration
    B1_URL = os.getenv("B1_EJ_LAYER_URL", "")
    if B1_URL:
        params = {"f":"geojson","where":"1=1","outFields":"*","token":ARCGIS_TOKEN}
        with httpx.Client(follow_redirects=True, timeout=60) as client:
            r = client.get(f"{B1_URL}/query", params=params)
        gdf_ej = gpd.read_file(io.StringIO(r.text)).to_crs("EPSG:4326")
        print(f"B1 EJ: {len(gdf_ej)} features, columns: {gdf_ej.columns.tolist()[:8]}")
    else:
        print("⚠️  B1_EJ_LAYER_URL not set — skipping B1")

    # B2: Esri Canada Climate Hub — heat vulnerability
    B2_URL = os.getenv("B2_HEAT_LAYER_URL", "")
    if B2_URL:
        params = {"f":"geojson","where":"1=1","outFields":"*","token":ARCGIS_TOKEN}
        with httpx.Client(follow_redirects=True, timeout=60) as client:
            r = client.get(f"{B2_URL}/query", params=params)
        gdf_heat_vuln = gpd.read_file(io.StringIO(r.text)).to_crs("EPSG:4326")
        print(f"B2 heat: {len(gdf_heat_vuln)} features")
    else:
        print("⚠️  B2_HEAT_LAYER_URL not set — skipping B2")
```

- [ ] **Step 2: Run — confirm skip message appears without token**

Expected: `⚠️  Skipping B1/B2 — set ARCGIS_TOKEN env var and rerun to include Esri sources`

- [ ] **Step 3: Commit**

```bash
git add pipeline/EDA.ipynb
git commit -m "pipeline: EDA B1/B2 Esri sources (graceful skip)"
```

---

## Task 9: Spatial Joins — Build Master GeoDataFrame

**Files:**
- Modify: `pipeline/EDA.ipynb` (Cell 9)
- Creates: `pipeline/data/master_cts.geojson`

- [ ] **Step 1: Write assertion cell (Cell 9a)**

```python
# ASSERTION
assert "gdf_master" in dir(), "gdf_master not defined"
assert len(gdf_master) <= len(gdf_ct), \
    f"Fan-out detected: {len(gdf_master)} > input {len(gdf_ct)}"
assert len(gdf_master) >= 350, f"Too few CTs: {len(gdf_master)}"
assert gdf_master["CTUID"].is_unique, "CTUID not unique in master"
assert gdf_master["served_by_alectra"].any(), "No CT flagged as served_by_alectra"
assert (DATA_DIR / "master_cts.geojson").exists(), "master_cts.geojson not written"
print(f"✅ Spatial join assertions pass — {len(gdf_master)} CTs, "
      f"{gdf_master['served_by_alectra'].sum()} in Alectra territory")
print(gdf_master.columns.tolist())
```

- [ ] **Step 2: Run — confirm AssertionError**

- [ ] **Step 3: Write join cell (Cell 9b, before 9a)**

```python
# Spatial join: A1 + A2 + A3 → clip to A8 → join C1 outages + C2 weather

# 1. Join A2 demographics onto CT boundaries
gdf_master = gdf_ct.merge(df_census, on="CTUID", how="left")
print(f"After A2 join: {gdf_master.shape}")

# 2. Join A3 CIMD
gdf_master = gdf_master.merge(df_cimd, on="CTUID", how="left")
print(f"After A3 join: {gdf_master.shape}")

# 3. Spatial join A8: flag served_by_alectra
# Use centroid for point-in-polygon — faster and avoids edge artefacts
gdf_master_pts = gdf_master.copy()
gdf_master_pts.geometry = gdf_master_pts.geometry.centroid

alectra_union = gdf_alectra.geometry.union_all()
gdf_master["served_by_alectra"] = gdf_master_pts.geometry.within(alectra_union)
print(f"CTs served by Alectra: {gdf_master['served_by_alectra'].sum()}")

# 4. Clip to Alectra territory for analysis
gdf_master = gdf_master[gdf_master["served_by_alectra"]].reset_index(drop=True)
print(f"After Alectra clip: {gdf_master.shape}")

# 5. Spatial join C1 outages → count active outages per CT
if len(gdf_outages) > 0:
    joined = gpd.sjoin(gdf_outages, gdf_master[["CTUID","geometry"]], how="left",
                       predicate="intersects")
    outage_counts = joined.groupby("CTUID").size().reset_index(name="active_outages")
    affected = joined.groupby("CTUID")["customers_affected"].sum().reset_index() \
        if "customers_affected" in joined.columns else pd.DataFrame(columns=["CTUID","customers_affected"])
    gdf_master = gdf_master.merge(outage_counts, on="CTUID", how="left")
    gdf_master = gdf_master.merge(affected, on="CTUID", how="left")
else:
    gdf_master["active_outages"] = 0
    gdf_master["customers_affected"] = 0
gdf_master["active_outages"] = gdf_master["active_outages"].fillna(0).astype(int)
gdf_master["customers_affected"] = gdf_master["customers_affected"].fillna(0)
print(f"Outage columns added. Total active outages: {gdf_master['active_outages'].sum()}")

# 6. Spatial join C2 weather → nearest station per CT centroid
if len(gdf_weather) > 0 and "temperature_c" in gdf_weather.columns:
    gdf_ct_pts = gdf_master[["CTUID","geometry"]].copy()
    gdf_ct_pts.geometry = gdf_ct_pts.geometry.centroid
    weather_join = gpd.sjoin_nearest(
        gdf_ct_pts, gdf_weather[["geometry","temperature_c","humidex"]],
        how="left", distance_col="wx_dist_deg"
    )
    weather_agg = weather_join.groupby("CTUID").agg(
        temperature_c=("temperature_c","mean"),
        humidex=("humidex","mean")
    ).reset_index()
    gdf_master = gdf_master.merge(weather_agg, on="CTUID", how="left")
else:
    gdf_master["temperature_c"] = np.nan
    gdf_master["humidex"] = np.nan
print(f"Weather columns added.")

# 7. Save
gdf_master.to_file(DATA_DIR / "master_cts.geojson", driver="GeoJSON")
print(f"\nmaster_cts.geojson written — {len(gdf_master)} CTs, {gdf_master.shape[1]} columns")
gdf_master[["CTUID","median_income","pct_renters","pct_pre1980",
            "cimd_residential_instability","active_outages","temperature_c"]].head(3)
```

- [ ] **Step 4: Run 9b → 9a — confirm all assertions pass**

- [ ] **Step 5: Commit**

```bash
git add pipeline/EDA.ipynb pipeline/data/master_cts.geojson
git commit -m "pipeline: EDA spatial joins — master_cts.geojson"
```

---

## Task 10: Section 3 — Distributions & Quality

**Files:**
- Modify: `pipeline/EDA.ipynb` (Cell 10)

- [ ] **Step 1: Write cell (Cell 10)**

```python
# ── Section 3: Distributions & Data Quality ──────────────────────────────────

FACTOR_COLS = [
    "median_income", "pct_pre1980", "pct_renters",
    "cimd_residential_instability", "cimd_economic_dependency",
    "cimd_ethnocultural_composition", "cimd_situational_vulnerability",
    "active_outages", "customers_affected", "humidex",
]
available = [c for c in FACTOR_COLS if c in gdf_master.columns]
df_factors = gdf_master[available].copy()

fig, axes = plt.subplots(3, 1, figsize=(14, 12))

# 3a: Missing value heatmap
ax = axes[0]
null_pct = df_factors.isnull().mean().sort_values(ascending=False)
null_df = pd.DataFrame({"column": null_pct.index, "null_pct": null_pct.values})
ax.barh(null_df["column"], null_df["null_pct"] * 100, color="#e05b5b")
ax.axvline(10, color="orange", linestyle="--", label="10% threshold")
ax.set_xlabel("% null")
ax.set_title("Missing values per factor column")
ax.legend()

# 3b: Factor histograms (grid)
n = len(available)
cols = 3
rows = (n + cols - 1) // cols
fig2, axes2 = plt.subplots(rows, cols, figsize=(14, rows * 3))
axes2 = axes2.flatten()
for i, col in enumerate(available):
    axes2[i].hist(df_factors[col].dropna(), bins=30, color="#5b8de0", edgecolor="white")
    axes2[i].set_title(col, fontsize=9)
    axes2[i].set_xlabel("")
for j in range(i + 1, len(axes2)):
    axes2[j].set_visible(False)
fig2.tight_layout()
fig2.suptitle("Factor Distributions", y=1.01, fontsize=12)
plt.show()

# 3c: Correlation matrix
corr = df_factors[available].corr()
fig3, ax3 = plt.subplots(figsize=(10, 8))
mask = np.triu(np.ones_like(corr, dtype=bool))
sns.heatmap(corr, mask=mask, annot=True, fmt=".2f", cmap="coolwarm",
            center=0, linewidths=0.5, ax=ax3)
ax3.set_title("Pearson Correlation — Factor Columns")
plt.tight_layout()
plt.show()

print("\nFactor summary stats:")
print(df_factors[available].describe().round(3))
```

- [ ] **Step 2: Run cell — confirm all 3 plots render and summary prints**

- [ ] **Step 3: Commit**

```bash
git add pipeline/EDA.ipynb
git commit -m "pipeline: EDA Section 3 distributions and quality"
```

---

## Task 11: Section 4 — PCA Score

**Files:**
- Modify: `pipeline/EDA.ipynb` (Cell 11)
- Creates: `pipeline/data/loadings.csv`

- [ ] **Step 1: Write assertion cell (Cell 11a)**

```python
# ASSERTION
assert "gdf_scored" in dir(), "gdf_scored not defined"
for col in ["threshold_score_baseline","threshold_score_heatwave","threshold_score_icestorm"]:
    assert col in gdf_scored.columns, f"Missing: {col}"
assert (DATA_DIR / "loadings.csv").exists(), "loadings.csv not written"
pc1_var = pca_baseline.explained_variance_ratio_[0]
assert pc1_var >= 0.20, f"PC1 explains only {pc1_var:.1%} — check factor columns"
print(f"✅ PCA assertions pass — PC1 explains {pc1_var:.1%} variance")
print(gdf_scored[["CTUID","threshold_score_baseline"]].describe())
```

- [ ] **Step 2: Run — confirm AssertionError**

- [ ] **Step 3: Write PCA cell (Cell 11b, before 11a)**

```python
# ── Section 4: PCA Threshold Score ───────────────────────────────────────────

FACTOR_COLS = [c for c in [
    "median_income", "pct_pre1980", "pct_renters",
    "cimd_residential_instability", "cimd_economic_dependency",
    "cimd_ethnocultural_composition", "cimd_situational_vulnerability",
    "active_outages", "customers_affected", "humidex",
] if c in gdf_master.columns]

df_pca = gdf_master[["CTUID"] + FACTOR_COLS].copy()

# Drop CTs missing >50% of factor columns
row_null_pct = df_pca[FACTOR_COLS].isnull().mean(axis=1)
df_pca = df_pca[row_null_pct <= 0.5].reset_index(drop=True)
print(f"CTs retained after null filter: {len(df_pca)}")

# Impute remaining NaN with column median
df_pca[FACTOR_COLS] = df_pca[FACTOR_COLS].fillna(df_pca[FACTOR_COLS].median())

# Invert income: lower income = higher vulnerability
df_pca["median_income"] = -df_pca["median_income"]

def run_pca_scenario(df, factor_cols, weights: dict = None):
    """Normalize columns, apply optional weights, return PCA and PC1 scores 0–100."""
    X = df[factor_cols].copy()
    if weights:
        for col, w in weights.items():
            if col in X.columns:
                X[col] = X[col] * w
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    pca = PCA(n_components=min(5, len(factor_cols)))
    pca.fit(X_scaled)
    scores_raw = pca.transform(X_scaled)[:, 0]
    # Flip so higher PC1 = higher vulnerability (check sign by inspecting loadings)
    # If loading on income is positive after inversion, PC1 is already oriented correctly
    scores_min, scores_max = scores_raw.min(), scores_raw.max()
    scores_norm = (scores_raw - scores_min) / (scores_max - scores_min) * 100
    return pca, scores_norm

# Baseline: equal weights
pca_baseline, scores_baseline = run_pca_scenario(df_pca, FACTOR_COLS)

# Heatwave: amplify heat/vulnerability factors
heatwave_weights = {"humidex": 2.5, "cimd_situational_vulnerability": 1.5, "pct_renters": 1.2}
pca_heatwave, scores_heatwave = run_pca_scenario(df_pca, FACTOR_COLS, heatwave_weights)

# Ice Storm: amplify outage factors
icestorm_weights = {"active_outages": 3.0, "customers_affected": 2.0, "pct_renters": 1.5}
pca_icestorm, scores_icestorm = run_pca_scenario(df_pca, FACTOR_COLS, icestorm_weights)

# Build scored GeoDataFrame
gdf_scored = gdf_master.merge(
    df_pca[["CTUID"]].assign(
        threshold_score_baseline=scores_baseline,
        threshold_score_heatwave=scores_heatwave,
        threshold_score_icestorm=scores_icestorm,
    ),
    on="CTUID", how="inner"
)

# Scree plot
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 4))
ax1.bar(range(1, len(pca_baseline.explained_variance_ratio_) + 1),
        pca_baseline.explained_variance_ratio_ * 100, color="#5b8de0")
ax1.set_xlabel("Principal Component"); ax1.set_ylabel("Variance explained (%)")
ax1.set_title("Scree Plot (Baseline)")

# Loadings table
loadings_df = pd.DataFrame({
    "factor": FACTOR_COLS,
    "loading_baseline": pca_baseline.components_[0],
    "loading_heatwave": pca_heatwave.components_[0],
    "loading_icestorm": pca_icestorm.components_[0],
    "source_slug": [
        "statcan-census-2021-ct-demographics",  # median_income
        "statcan-census-2021-ct-demographics",  # pct_pre1980
        "statcan-census-2021-ct-demographics",  # pct_renters
        "statcan-cimd-2021",                    # cimd_residential_instability
        "statcan-cimd-2021",                    # cimd_economic_dependency
        "statcan-cimd-2021",                    # cimd_ethnocultural_composition
        "statcan-cimd-2021",                    # cimd_situational_vulnerability
        "alectra-outages-live",                 # active_outages
        "alectra-outages-live",                 # customers_affected
        "envcan-geomet-current",                # humidex
    ][:len(FACTOR_COLS)]
}).sort_values("loading_baseline", key=abs, ascending=False)

# Loadings bar
ax2.barh(loadings_df["factor"], loadings_df["loading_baseline"], color="#e08b5b")
ax2.axvline(0, color="white", linewidth=0.5)
ax2.set_title("PC1 Loadings (Baseline)")
ax2.set_xlabel("Loading")
plt.tight_layout(); plt.show()

loadings_df.to_csv(DATA_DIR / "loadings.csv", index=False)
print(f"\nloadings.csv saved")
print(f"Baseline PC1 explains: {pca_baseline.explained_variance_ratio_[0]:.1%}")
loadings_df
```

- [ ] **Step 4: Run 11b → 11a — confirm assertions pass**

- [ ] **Step 5: Commit**

```bash
git add pipeline/EDA.ipynb pipeline/data/loadings.csv
git commit -m "pipeline: EDA Section 4 PCA score — baseline/heatwave/icestorm"
```

---

## Task 12: Section 5 — Prototype Choropleth

**Files:**
- Modify: `pipeline/EDA.ipynb` (Cell 12)
- Creates: `pipeline/data/prototype_choropleth.png`

- [ ] **Step 1: Write assertion cell (Cell 12a)**

```python
# ASSERTION
assert (DATA_DIR / "prototype_choropleth.png").exists(), "choropleth PNG not written"
print("✅ Choropleth written to pipeline/data/prototype_choropleth.png")
```

- [ ] **Step 2: Run — confirm AssertionError**

- [ ] **Step 3: Write choropleth cell (Cell 12b, before 12a)**

```python
# ── Section 5: Prototype Choropleth ──────────────────────────────────────────

# 4-tier colour ramp: low → medium → high → critical
# Dark theme matching planned Mapbox UI
CMAP = mcolors.LinearSegmentedColormap.from_list(
    "threshold", ["#1a1a2e", "#f5c518", "#e05b0e", "#c0392b"]
)

scenarios = [
    ("threshold_score_baseline", "Baseline"),
    ("threshold_score_heatwave",  "Heatwave"),
    ("threshold_score_icestorm",  "Ice Storm"),
]

fig, axes = plt.subplots(1, 3, figsize=(18, 7))
fig.patch.set_facecolor("#0a0a0a")

for ax, (score_col, title) in zip(axes, scenarios):
    ax.set_facecolor("#0a0a0a")
    if score_col not in gdf_scored.columns:
        ax.text(0.5, 0.5, f"{score_col}\nnot available", transform=ax.transAxes,
                ha="center", color="white")
        continue

    gdf_scored.plot(
        column=score_col, ax=ax, cmap=CMAP, vmin=0, vmax=100,
        linewidth=0.2, edgecolor="#333333",
        legend=True,
        legend_kwds={"shrink": 0.5, "label": "Threshold Score (0–100)",
                     "orientation": "horizontal"}
    )

    # Alectra boundary outline
    gdf_alectra.boundary.plot(ax=ax, color="#4fc3f7", linewidth=1.0, alpha=0.6)

    pc_var = (pca_baseline if "baseline" in score_col
              else pca_heatwave if "heatwave" in score_col
              else pca_icestorm).explained_variance_ratio_[0]

    ax.set_title(f"{title}\nPC1: {pc_var:.1%} variance",
                 color="white", fontsize=11)
    ax.set_axis_off()

plt.suptitle("Threshold Score — Prototype Choropleth\n"
             "Alectra Territory: Mississauga · Brampton · Hamilton",
             color="white", fontsize=13, y=1.01)
plt.tight_layout()
plt.savefig(DATA_DIR / "prototype_choropleth.png", dpi=150, bbox_inches="tight",
            facecolor=fig.get_facecolor())
plt.show()
print("Saved prototype_choropleth.png")
```

- [ ] **Step 4: Run 12b → 12a — confirm PNG written and map renders sensibly**

Sanity check: Hamilton south-end CTs should show higher scores (deeper colour) than Mississauga north-end suburban CTs in the Baseline scenario.

- [ ] **Step 5: Final commit**

```bash
git add pipeline/EDA.ipynb pipeline/data/prototype_choropleth.png
git commit -m "pipeline: EDA Section 5 prototype choropleth — all 3 scenarios"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Section 1 (Ingest & Validate): Tasks 2–8 cover all 8 sources
- ✅ Section 2 (Spatial Joins): Task 9
- ✅ Section 3 (Distributions & Quality): Task 10
- ✅ Section 4 (PCA Score + loadings table + scenario variants): Task 11
- ✅ Section 5 (Prototype choropleth, 3-panel): Task 12
- ✅ Success criteria: assertions in Tasks 9, 11, 12 enforce all 6 criteria from the spec
- ✅ `pipeline/data/master_cts.geojson` written: Task 9
- ✅ `pipeline/data/loadings.csv` written: Task 11
- ✅ `pipeline/data/prototype_choropleth.png` written: Task 12

**Type consistency:** `CTUID` used as the join key throughout. `gdf_master` → `gdf_scored` chain consistent. `pca_baseline`, `pca_heatwave`, `pca_icestorm` all named consistently in Tasks 11 and 12.

**Notes for the implementer:**
- StatsCan Census Profile CSV is ~1.5 GB unzipped. The chunk-read approach in Task 3 keeps memory under control.
- CIMD column names (`CT_UID`, `RINS_PCTL`, etc.) must be verified at runtime — the reshape cell in Task 4 has a `CIMD_COL_MAP` dict for this.
- C1 Alectra outage layer ID must be confirmed by running the layer enumeration step in Task 6 before updating `OUTAGE_LAYER_ID`.
- If `climate-hourly` GeoMet collection is unavailable, weather columns default to NaN — PCA still runs, `humidex` simply contributes nothing to Heatwave scenario.
