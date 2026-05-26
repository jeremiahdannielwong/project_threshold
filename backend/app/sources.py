"""Source citation registry.

Single source of truth for the provenance metadata attached to every numeric
value the backend emits. Slugs match ``context/source-catalogue.md``.
"""

from __future__ import annotations

from typing import Iterable

from .models.common import SourceCitation

_REGISTRY: dict[str, SourceCitation] = {
    "statcan-census-tracts-2021": SourceCitation(
        slug="statcan-census-tracts-2021",
        label="StatsCan 2021 Census Tract Boundaries",
        vintage="2021",
        url="https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/files-fichiers/lct_000b21a_e.zip",
    ),
    "brampton-esri-census2021": SourceCitation(
        slug="brampton-esri-census2021",
        label="City of Brampton ESRI — 2021 Census Demographics",
        vintage="2021",
        url="https://services3.arcgis.com/rl7ACuZkiFsmDA2g/ArcGIS/rest/services/Census_2021/FeatureServer",
    ),
    "statcan-cisv-2021": SourceCitation(
        slug="statcan-cisv-2021",
        label="StatsCan Canadian Index of Social Vulnerability (CISV)",
        vintage="2021",
        url="https://www150.statcan.gc.ca/pub/45-20-0001/2025001/csv/cisv-eng.zip",
    ),
    "statcan-cisr-2021": SourceCitation(
        slug="statcan-cisr-2021",
        label="StatsCan Canadian Index of Social Resilience (CISR)",
        vintage="2021",
        url="https://www150.statcan.gc.ca/pub/45-20-0001/2025001/csv/cisr-eng.zip",
    ),
    "brampton-esri-secondary-plan-areas": SourceCitation(
        slug="brampton-esri-secondary-plan-areas",
        label="City of Brampton Secondary Plan Areas",
        vintage="2024",
        url="https://services3.arcgis.com/rl7ACuZkiFsmDA2g/arcgis/rest/services/Planning_Official_Plan/FeatureServer/0",
    ),
    "alectra-service-areas": SourceCitation(
        slug="alectra-service-areas",
        label="Alectra Utilities Service Areas",
        vintage="2024",
        url="https://services8.arcgis.com/BiisLrqUuQvkdMCP/arcgis/rest/services/Alectra_Service_Areas/FeatureServer/0",
    ),
    "alectra-outages-live": SourceCitation(
        slug="alectra-outages-live",
        label="Alectra Live Outage Feed",
        vintage="live",
        url="https://services8.arcgis.com/wNDmObY7QplwZD9m/ArcGIS/rest/services/Outage_Details/FeatureServer/7",
    ),
    "open-meteo-current": SourceCitation(
        slug="open-meteo-current",
        label="Open-Meteo Current Conditions",
        vintage="live",
        url="https://api.open-meteo.com/v1/forecast",
    ),
    "open-meteo-flood": SourceCitation(
        slug="open-meteo-flood",
        label="Open-Meteo Flood (Copernicus GloFAS v4 river discharge)",
        vintage="live",
        url="https://flood-api.open-meteo.com/v1/flood",
    ),
    # Legacy slug used in EDA loadings.csv before rename; kept so factor lookups
    # never silently 404.
    "envcan-geomet-current": SourceCitation(
        slug="envcan-geomet-current",
        label="Open-Meteo Current Conditions (formerly EnvCan GeoMet)",
        vintage="live",
        url="https://api.open-meteo.com/v1/forecast",
    ),
    "brampton-esri-recreation": SourceCitation(
        slug="brampton-esri-recreation",
        label="City of Brampton Recreation Facilities",
        vintage="2024",
        url="https://services3.arcgis.com/rl7ACuZkiFsmDA2g/arcgis/rest/services/RecreationFacilities/FeatureServer/0",
    ),
    "brampton-esri-libraries": SourceCitation(
        slug="brampton-esri-libraries",
        label="City of Brampton Libraries",
        vintage="2024",
        url="https://services3.arcgis.com/rl7ACuZkiFsmDA2g/arcgis/rest/services/Libraries/FeatureServer/0",
    ),
    "threshold-score-pca": SourceCitation(
        slug="threshold-score-pca",
        label="Threshold Composite Score (PCA across 10 factors)",
        vintage="computed",
        url="https://github.com/anthropics/threshold",  # placeholder repo URL
    ),
}


FACTOR_TO_SOURCE: dict[str, str] = {
    "cisv_score": "statcan-cisv-2021",
    "cisv_dim1": "statcan-cisv-2021",
    "cisv_dim2": "statcan-cisv-2021",
    "cisv_dim3": "statcan-cisv-2021",
    "cisv_dim4": "statcan-cisv-2021",
    "cisr_score": "statcan-cisr-2021",
    "cisr_dim1": "statcan-cisr-2021",
    "cisr_dim2": "statcan-cisr-2021",
    "cisr_dim3": "statcan-cisr-2021",
    "pct_pre1980": "brampton-esri-census2021",
    "pct_renters": "brampton-esri-census2021",
    "pct_low_income": "brampton-esri-census2021",
    "median_income": "brampton-esri-census2021",
    "population": "brampton-esri-census2021",
    "humidex": "open-meteo-current",
    "temperature_c": "open-meteo-current",
    "wind_speed_kmh": "open-meteo-current",
    "wind_gusts_kmh": "open-meteo-current",
    "precipitation_mm": "open-meteo-current",
    "weather_code": "open-meteo-current",
    "active_outages": "alectra-outages-live",
    "customers_affected": "alectra-outages-live",
}


def get_source(slug: str) -> SourceCitation:
    """Look up a source citation by slug. Raises if unknown."""
    if slug not in _REGISTRY:
        raise KeyError(f"Unknown source slug: {slug!r}")
    return _REGISTRY[slug]


def sources_for_factors(factor_names: Iterable[str]) -> list[SourceCitation]:
    """Return de-duplicated citations covering the given factors."""
    seen: dict[str, SourceCitation] = {}
    for name in factor_names:
        slug = FACTOR_TO_SOURCE.get(name)
        if slug is None or slug in seen:
            continue
        seen[slug] = _REGISTRY[slug]
    return list(seen.values())


def all_sources() -> list[SourceCitation]:
    return list(_REGISTRY.values())
