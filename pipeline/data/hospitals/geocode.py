"""Enrich brampton_area_hospitals.csv with lat/lon via Nominatim (OpenStreetMap).

Idempotent: rows that already have coordinates are skipped. Respects Nominatim's
1-request-per-second usage policy.

Usage:
    python pipeline/data/hospitals/geocode.py
"""

from __future__ import annotations

import csv
import sys
import time
from pathlib import Path

import httpx

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "project-threshold/0.1 (seneca-hackathon-2026)"
RATE_LIMIT_SECONDS = 1.1
CSV_PATH = Path(__file__).parent / "brampton_area_hospitals.csv"


def geocode(address: str, city: str, postal_code: str) -> tuple[float, float] | None:
    query = f"{address}, {city}, ON {postal_code}, Canada"
    r = httpx.get(
        NOMINATIM_URL,
        params={"q": query, "format": "json", "limit": 1, "countrycodes": "ca"},
        headers={"User-Agent": USER_AGENT},
        timeout=15,
    )
    r.raise_for_status()
    results = r.json()
    if not results:
        return None
    return float(results[0]["lat"]), float(results[0]["lon"])


def main() -> int:
    rows = list(csv.DictReader(CSV_PATH.open(encoding="utf-8")))
    if not rows:
        print(f"No rows in {CSV_PATH}", file=sys.stderr)
        return 1

    fieldnames = list(rows[0].keys())
    for col in ("latitude", "longitude"):
        if col not in fieldnames:
            fieldnames.append(col)

    failures: list[str] = []
    for row in rows:
        if row.get("latitude") and row.get("longitude"):
            print(f"SKIP {row['name']} (already geocoded)")
            continue

        coords = geocode(row["address"], row["city"], row["postal_code"])
        if coords is None:
            print(f"FAIL {row['name']}: no result")
            row["latitude"] = ""
            row["longitude"] = ""
            failures.append(row["name"])
        else:
            row["latitude"] = f"{coords[0]:.6f}"
            row["longitude"] = f"{coords[1]:.6f}"
            print(f"OK   {row['name']}: {coords[0]:.4f}, {coords[1]:.4f}")
        time.sleep(RATE_LIMIT_SECONDS)

    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\nWrote {CSV_PATH}")
    if failures:
        print(f"WARNING: {len(failures)} row(s) could not be geocoded: {failures}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
