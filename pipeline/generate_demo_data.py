"""
generate_demo_data.py

Generates realistic synthetic census and vulnerability data for the
~400 Census Tracts in the Threshold MVP territory (Mississauga, Brampton, Hamilton).

Run this once before the EDA notebook when real StatsCan downloads are unavailable:
    cd pipeline && ../.venv/bin/python3 generate_demo_data.py

Outputs:
    data/demo_census.parquet    -- A2 demographics (income, dwelling age, tenure)
    data/demo_cimd.parquet      -- A3 CIMD sub-indices (residential instability, etc.)

The notebook auto-detects these files and uses them when real downloads are absent.
"""

from pathlib import Path
import numpy as np
import pandas as pd

DATA_DIR = Path("data")
DATA_DIR.mkdir(exist_ok=True)

RNG = np.random.default_rng(42)

# -------------------------------------------------------------------
# CMA profiles: realistic distributions for each metro area
# Hamilton inner-city is more vulnerable; Mississauga/Brampton suburbs less so.
# -------------------------------------------------------------------
PROFILES = {
    "535": {   # Toronto CMA — Mississauga (CTs 535xxxx)
        "n_cts": 200,
        "income_mean": 95_000, "income_std": 25_000,
        "pct_renters_mean": 0.28, "pct_renters_std": 0.12,
        "pct_pre1980_mean": 0.30, "pct_pre1980_std": 0.18,
        "cimd_ri_mean": 45, "cimd_ri_std": 20,
        "cimd_ed_mean": 40, "cimd_ed_std": 18,
        "cimd_ec_mean": 50, "cimd_ec_std": 22,
        "cimd_sv_mean": 35, "cimd_sv_std": 15,
    },
    "536": {   # Toronto CMA — Brampton (CTs 536xxxx)
        "n_cts": 120,
        "income_mean": 85_000, "income_std": 20_000,
        "pct_renters_mean": 0.22, "pct_renters_std": 0.10,
        "pct_pre1980_mean": 0.25, "pct_pre1980_std": 0.15,
        "cimd_ri_mean": 50, "cimd_ri_std": 18,
        "cimd_ed_mean": 48, "cimd_ed_std": 20,
        "cimd_ec_mean": 62, "cimd_ec_std": 18,
        "cimd_sv_mean": 38, "cimd_sv_std": 14,
    },
    "537": {   # Hamilton CMA (Code Red narrative — wider spread)
        "n_cts": 100,
        "income_mean": 72_000, "income_std": 30_000,
        "pct_renters_mean": 0.40, "pct_renters_std": 0.18,
        "pct_pre1980_mean": 0.58, "pct_pre1980_std": 0.22,
        "cimd_ri_mean": 62, "cimd_ri_std": 25,
        "cimd_ed_mean": 60, "cimd_ed_std": 22,
        "cimd_ec_mean": 45, "cimd_ec_std": 20,
        "cimd_sv_mean": 55, "cimd_sv_std": 22,
    },
}


def _clamp(arr: np.ndarray, lo: float, hi: float) -> np.ndarray:
    return np.clip(arr, lo, hi)


def generate_census(profiles: dict) -> pd.DataFrame:
    rows = []
    for cma, p in profiles.items():
        n = p["n_cts"]
        ctids = [f"{cma}{str(i+1).zfill(4)}" for i in range(n)]
        income = _clamp(RNG.normal(p["income_mean"], p["income_std"], n), 20_000, 250_000)
        renters = _clamp(RNG.normal(p["pct_renters_mean"], p["pct_renters_std"], n), 0.01, 0.95)
        pre1980 = _clamp(RNG.normal(p["pct_pre1980_mean"], p["pct_pre1980_std"], n), 0.0, 1.0)
        population = RNG.integers(800, 6_000, n)
        rows.append(pd.DataFrame({
            "CTUID": ctids,
            "population": population,
            "median_income": income.round(0),
            "pct_renters": renters.round(4),
            "pct_pre1980": pre1980.round(4),
        }))
    return pd.concat(rows, ignore_index=True)


def generate_cimd(census_df: pd.DataFrame, profiles: dict) -> pd.DataFrame:
    rows = []
    for cma, p in profiles.items():
        mask = census_df["CTUID"].str.startswith(cma)
        ctids = census_df.loc[mask, "CTUID"].tolist()
        n = len(ctids)
        ri = _clamp(RNG.normal(p["cimd_ri_mean"], p["cimd_ri_std"], n), 1, 99) / 100
        ed = _clamp(RNG.normal(p["cimd_ed_mean"], p["cimd_ed_std"], n), 1, 99) / 100
        ec = _clamp(RNG.normal(p["cimd_ec_mean"], p["cimd_ec_std"], n), 1, 99) / 100
        sv = _clamp(RNG.normal(p["cimd_sv_mean"], p["cimd_sv_std"], n), 1, 99) / 100
        rows.append(pd.DataFrame({
            "CTUID": ctids,
            "cimd_residential_instability": ri.round(4),
            "cimd_economic_dependency": ed.round(4),
            "cimd_ethnocultural_composition": ec.round(4),
            "cimd_situational_vulnerability": sv.round(4),
        }))
    return pd.concat(rows, ignore_index=True)


if __name__ == "__main__":
    df_census = generate_census(PROFILES)
    df_cimd   = generate_cimd(df_census, PROFILES)

    out_census = DATA_DIR / "demo_census.parquet"
    out_cimd   = DATA_DIR / "demo_cimd.parquet"

    df_census.to_parquet(out_census, index=False)
    df_cimd.to_parquet(out_cimd, index=False)

    print(f"✅ demo_census.parquet  — {len(df_census)} CTs, columns: {df_census.columns.tolist()}")
    print(f"✅ demo_cimd.parquet    — {len(df_cimd)} CTs, columns: {df_cimd.columns.tolist()}")
    print(f"\nIncome range:   ${df_census['median_income'].min():,.0f} – ${df_census['median_income'].max():,.0f}")
    print(f"Renter % range: {df_census['pct_renters'].min():.1%} – {df_census['pct_renters'].max():.1%}")
    print(f"Pre-1980 range: {df_census['pct_pre1980'].min():.1%} – {df_census['pct_pre1980'].max():.1%}")
