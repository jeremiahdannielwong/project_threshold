"""Convert brampton_area_hospitals.csv -> a GeoJSON FeatureCollection consumed
by the frontend at /data/hospitals.geojson.

Run after geocode.py finishes; idempotent.
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
CSV_PATH = Path(__file__).parent / "brampton_area_hospitals.csv"
OUT_PATH = REPO_ROOT / "frontend" / "public" / "data" / "hospitals.geojson"


def main() -> int:
    rows = list(csv.DictReader(CSV_PATH.open(encoding="utf-8")))
    features = []
    for row in rows:
        try:
            lon = float(row["longitude"])
            lat = float(row["latitude"])
        except (KeyError, ValueError):
            print(f"SKIP {row.get('name')}: missing coordinates", file=sys.stderr)
            continue
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
                "properties": {
                    "name": row["name"],
                    "address": row["address"],
                    "city": row["city"],
                    "postal_code": row["postal_code"],
                    "system": row.get("system", ""),
                    "type": row.get("type", "Hospital"),
                    "emergency_24_7": row.get("emergency_24_7", "False").lower() == "true",
                    "source": row.get("source", ""),
                },
            }
        )

    geojson = {"type": "FeatureCollection", "features": features}
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(geojson, indent=2), encoding="utf-8")
    print(f"Wrote {len(features)} features -> {OUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
