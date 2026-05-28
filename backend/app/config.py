"""Backend configuration loaded from environment variables.

Env vars are read once at startup. Tests construct ``Settings`` directly.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]
# Local cache directory for the pipeline's upstream downloads (StatsCan zips,
# CISV/CISR CSVs). The backend itself does not read from here — the database
# is the system of record.
DEFAULT_DATA_DIR = REPO_ROOT / "pipeline" / "data"


class Settings(BaseSettings):
    """Runtime configuration.

    All env vars are namespaced ``THRESHOLD_*`` except the Gemini ones, which
    follow the conventional ``GEMINI_*`` naming so existing operator runbooks
    work unchanged.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    data_dir: Path = Field(default=DEFAULT_DATA_DIR, alias="THRESHOLD_DATA_DIR")
    cors_origins: str = Field(
        default="http://localhost:5173,http://localhost:3000",
        alias="THRESHOLD_CORS_ORIGINS",
    )

    alectra_outages_url: str = Field(
        default="https://services8.arcgis.com/wNDmObY7QplwZD9m/ArcGIS/rest/services/Outage_Details/FeatureServer/7/query",
        alias="THRESHOLD_ALECTRA_OUTAGES_URL",
    )
    openmeteo_url: str = Field(
        default="https://api.open-meteo.com/v1/forecast",
        alias="THRESHOLD_OPENMETEO_URL",
    )
    flood_api_url: str = Field(
        default="https://flood-api.open-meteo.com/v1/flood",
        alias="THRESHOLD_FLOOD_API_URL",
    )

    outages_ttl_seconds: int = Field(default=300, alias="THRESHOLD_OUTAGES_TTL")
    weather_ttl_seconds: int = Field(default=900, alias="THRESHOLD_WEATHER_TTL")
    # GloFAS publishes daily — 1h cache is plenty and keeps the demo snappy.
    flood_ttl_seconds: int = Field(default=3600, alias="THRESHOLD_FLOOD_TTL")

    gemini_api_key: str | None = Field(default=None, alias="GEMINI_API_KEY")
    gemini_model: str = Field(default="gemini-2.0-flash", alias="GEMINI_MODEL")
    gemini_timeout_seconds: float = Field(default=10.0, alias="GEMINI_TIMEOUT_SECONDS")

    # Ambient feed: how often the background sweep regenerates every CT's
    # briefing. Default 1 hour; lower in dev (e.g. 120) for demos.
    feed_sweep_interval_seconds: int = Field(default=3600, alias="THRESHOLD_FEED_SWEEP_INTERVAL")
    # Set true to skip launching the sweep loop (useful in tests).
    feed_sweep_disabled: bool = Field(default=False, alias="THRESHOLD_FEED_SWEEP_DISABLED")

    # When unset the persistence layer is disabled and DB-backed helpers no-op.
    database_url: str | None = Field(default=None, alias="THRESHOLD_DATABASE_URL")

    openweather_api_key: str | None = Field(default=None, alias="OPENWEATHER_API_KEY")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
