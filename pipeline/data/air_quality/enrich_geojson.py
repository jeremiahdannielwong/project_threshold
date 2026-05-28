"""Fetch current air quality from Open-Meteo and add the Canadian AQHI plus
component pollutant readings to every CT in brampton_full.geojson.

AQHI (Air Quality Health Index) is Environment Canada's official 1-10+ scale
combining ozone, NO2, and PM2.5 into a single health-risk number. Open-Meteo
does not return AQHI directly, but it returns the three components, so we
compute it here using the official formula:

    AQHI = (1000/10.4) * (
        (exp(0.000537 * O3_ppb)   - 1)
      + (exp(0.000871 * NO2_ppb)  - 1)
      + (exp(0.000487 * PM25_ugm) - 1)
    )

Open-Meteo returns ozone and NO2 in µg/m^3 -- convert to ppb (at 25 °C, 1 atm):
    O3:  1 ppb ~= 1.96 µg/m^3  =>  ppb = µg/m^3 / 1.96
    NO2: 1 ppb ~= 1.88 µg/m^3  =>  ppb = µg/m^3 / 1.88
PM2.5 stays in µg/m^3.

Risk bands (Health Canada):
    1-3  Low
    4-6  Moderate
    7-10 High
    11+  Very High

Spatial note: Open-Meteo's air-quality model is gridded at ~11 km, and PM2.5
varies very little across a 25 km city like Brampton on most days. We fetch a
single point at Brampton's centre and apply it to all 122 CTs -- consistent
with how a typical air-quality reading would be reported citywide. A future
upgrade could fetch per-CT centroids and pick up the small gradients near
highways or industrial zones.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import httpx

API_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
BRAMPTON_LAT, BRAMPTON_LON = 43.72, -79.77
REPO_ROOT = Path(__file__).resolve().parents[3]
GEOJSON_PATH = REPO_ROOT / "frontend" / "public" / "data" / "brampton_full.geojson"


def aqhi(o3_ugm: float, no2_ugm: float, pm25_ugm: float) -> float:
    o3_ppb = o3_ugm / 1.96
    no2_ppb = no2_ugm / 1.88
    raw = (1000 / 10.4) * (
        (math.exp(0.000537 * o3_ppb) - 1)
        + (math.exp(0.000871 * no2_ppb) - 1)
        + (math.exp(0.000487 * pm25_ugm) - 1)
    )
    return round(max(raw, 0), 1)


def aqhi_band(score: float) -> str:
    if score <= 3:
        return "Low"
    if score <= 6:
        return "Moderate"
    if score <= 10:
        return "High"
    return "Very High"


def main() -> int:
    print(f"Fetching current air quality at Brampton ({BRAMPTON_LAT}, {BRAMPTON_LON})...")
    r = httpx.get(
        API_URL,
        params={
            "latitude": BRAMPTON_LAT,
            "longitude": BRAMPTON_LON,
            "current": "pm2_5,pm10,ozone,nitrogen_dioxide",
        },
        timeout=30,
    )
    r.raise_for_status()
    payload = r.json()
    current = payload.get("current", {})

    pm25 = current.get("pm2_5")
    pm10 = current.get("pm10")
    o3 = current.get("ozone")
    no2 = current.get("nitrogen_dioxide")
    observed_at = current.get("time")

    if None in (pm25, o3, no2):
        print(f"ERROR: missing components in payload: {current}", file=sys.stderr)
        return 1

    score = aqhi(o3, no2, pm25)
    band = aqhi_band(score)
    print(f"  observed_at: {observed_at}")
    print(f"  PM2.5={pm25} µg/m³  PM10={pm10} µg/m³  O3={o3} µg/m³  NO2={no2} µg/m³")
    print(f"  AQHI={score} ({band})")

    print(f"\nUpdating {GEOJSON_PATH.name}...")
    geo = json.loads(GEOJSON_PATH.read_text(encoding="utf-8"))
    features = geo.get("features", [])
    for feat in features:
        props = feat.setdefault("properties", {})
        props["aqhi"] = score
        props["aqhi_band"] = band
        props["pm25"] = pm25
        props["pm10"] = pm10
        props["air_observed_at"] = observed_at

    GEOJSON_PATH.write_text(json.dumps(geo, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote AQHI={score} to {len(features)} features -> {GEOJSON_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
