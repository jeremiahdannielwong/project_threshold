"""Flood (river discharge) response model.

GloFAS-backed signal from Open-Meteo. One row per CT.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class CTFlood(BaseModel):
    model_config = ConfigDict(extra="ignore")

    ctuid: str
    river_discharge: float | None = None
    discharge_30d_mean: float | None = None
    discharge_7d_max: float | None = None
    # Forecast peak ÷ 30-day baseline. Values >> 1 indicate a rising hazard.
    discharge_anomaly: float | None = None
