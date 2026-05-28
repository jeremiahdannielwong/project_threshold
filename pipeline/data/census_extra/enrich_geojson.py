"""Enrich frontend/public/data/brampton_full.geojson with 5 additional census
factors that the existing pipeline doesn't yet extract:

  - pct_seniors_65plus      (Layer 2  -- TOTAL_PCT_AGE_65_AND_OVER)
  - pct_children_under5     (Layer 2  -- TOTAL_AGE_0_TO_4 / TOTAL_AGE_GRPS)
  - pct_living_alone        (Layer 7  -- TOTAL_PCT_ONE_PERSON_HH)
  - pct_no_official_lang    (Layer 21 -- TOTAL_PCT_NEITHER)
  - pct_transit_commute     (Layer 41 -- TOTAL_PCT_PUBLIC_TRANSIT)

All values normalised to 0-1 to match the existing project convention
(pct_renters, pct_pre1980, etc).

Run once after editing -- writes the enriched geojson back to the frontend
public folder so the dev server picks it up on reload.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import httpx

FS_URL = (
    "https://services3.arcgis.com/rl7ACuZkiFsmDA2g/ArcGIS/rest/services/"
    "Census_2021/FeatureServer"
)
REPO_ROOT = Path(__file__).resolve().parents[3]
GEOJSON_PATH = REPO_ROOT / "frontend" / "public" / "data" / "brampton_full.geojson"


def _fetch_layer(layer_id: int, fields: str) -> dict[str, dict]:
    """Return {ctuid: attrs} for the requested layer."""
    r = httpx.get(
        f"{FS_URL}/{layer_id}/query",
        params={
            "f": "json",
            "where": "1=1",
            "outFields": fields,
            "returnGeometry": "false",
            "resultRecordCount": 2000,
        },
        timeout=60,
    )
    r.raise_for_status()
    out: dict[str, dict] = {}
    for feat in r.json().get("features", []):
        attrs = feat["attributes"]
        ctuid = str(attrs["CTUID"]).strip()
        out[ctuid] = attrs
    return out


def _pct_to_unit(v) -> float | None:
    """Census PCT fields are in 0-100 range; normalise to 0-1."""
    if v is None:
        return None
    try:
        return round(float(v) / 100, 4)
    except (TypeError, ValueError):
        return None


def _safe_div(num, den) -> float | None:
    try:
        n, d = float(num), float(den)
    except (TypeError, ValueError):
        return None
    if d <= 0:
        return None
    return round(n / d, 4)


def main() -> int:
    print("Fetching layer 2 (age)...")
    age = _fetch_layer(
        2,
        "CTUID,TOTAL_PCT_AGE_65_AND_OVER,TOTAL_AGE_0_TO_4,TOTAL_AGE_GRPS",
    )
    print(f"  {len(age)} rows")

    print("Fetching layer 7 (household type)...")
    hh = _fetch_layer(7, "CTUID,TOTAL_PCT_ONE_PERSON_HH")
    print(f"  {len(hh)} rows")

    print("Fetching layer 21 (knowledge of official languages)...")
    lang = _fetch_layer(21, "CTUID,TOTAL_PCT_NEITHER")
    print(f"  {len(lang)} rows")

    print("Fetching layer 41 (commuting mode)...")
    commute = _fetch_layer(
        41,
        "CTUID,TOTAL_PUBLIC_TRANSIT,TOTAL_EMP_LABOUR_FORCE_25",
    )
    print(f"  {len(commute)} rows")

    print(f"\nReading {GEOJSON_PATH.name}...")
    geo = json.loads(GEOJSON_PATH.read_text(encoding="utf-8"))
    features = geo.get("features", [])
    print(f"  {len(features)} features")

    enriched = 0
    missing: list[str] = []
    for feat in features:
        props = feat.setdefault("properties", {})
        ctuid = str(props.get("CTUID") or props.get("ctuid") or "").strip()
        if not ctuid:
            continue

        a = age.get(ctuid, {})
        h = hh.get(ctuid, {})
        lg = lang.get(ctuid, {})
        c = commute.get(ctuid, {})

        if not (a or h or lg or c):
            missing.append(ctuid)
            continue

        props["pct_seniors_65plus"] = _pct_to_unit(a.get("TOTAL_PCT_AGE_65_AND_OVER"))
        props["pct_children_under5"] = _safe_div(
            a.get("TOTAL_AGE_0_TO_4"), a.get("TOTAL_AGE_GRPS")
        )
        props["pct_living_alone"] = _pct_to_unit(h.get("TOTAL_PCT_ONE_PERSON_HH"))
        props["pct_no_official_lang"] = _pct_to_unit(lg.get("TOTAL_PCT_NEITHER"))
        props["pct_transit_commute"] = _safe_div(
            c.get("TOTAL_PUBLIC_TRANSIT"), c.get("TOTAL_EMP_LABOUR_FORCE_25")
        )
        enriched += 1

    GEOJSON_PATH.write_text(
        json.dumps(geo, separators=(",", ":")), encoding="utf-8"
    )
    print(f"\nEnriched {enriched}/{len(features)} features.")
    if missing:
        print(f"WARN: {len(missing)} CTs not found in any layer", file=sys.stderr)
    print(f"Wrote {GEOJSON_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
