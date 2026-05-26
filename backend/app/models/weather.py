"""Weather + outage response models."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class CTWeather(BaseModel):
    model_config = ConfigDict(extra="ignore")

    ctuid: str
    temperature_c: float | None = None
    humidex: float | None = None
    precipitation_mm: float | None = None
    wind_speed_kmh: float | None = None
    wind_gusts_kmh: float | None = None
    weather_code: int | None = None


class OutageFeature(BaseModel):
    """One outage polygon from the Alectra feed.

    Geometry is passed through verbatim (GeoJSON dict). Properties carry the
    upstream attributes we care about; the rest are dropped.
    """

    type: str = "Feature"
    geometry: dict
    properties: dict


class OutageCollection(BaseModel):
    type: str = "FeatureCollection"
    features: list[OutageFeature]


class ScenarioInfo(BaseModel):
    """Static description of a scoring scenario for the scenario picker."""

    slug: str
    label: str
    description: str
    weight_overrides: dict[str, float]
