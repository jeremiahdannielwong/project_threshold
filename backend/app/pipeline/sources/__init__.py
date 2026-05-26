"""Upstream source loaders.

Each loader is responsible for *one* external system and returns a typed
DataFrame / GeoDataFrame. They are pure: no DB writes, no caching policy --
the ``stages.ingest`` orchestrator decides where the output goes.
"""

from .alectra import load_alectra_service_area
from .boundaries import load_ct_boundaries
from .census import load_brampton_census
from .cimd import load_cimd
from .facilities import build_facilities
from .neighbourhoods import neighbourhood_map
from .urls import (
    ALECTRA_ITEM_URL,
    BRAMPTON_CENSUS_FS,
    BRAMPTON_LIB_URL,
    BRAMPTON_REC_URL,
    BRAMPTON_SPA_URL,
    CISR_URL,
    CISV_URL,
    CT_BOUNDARIES_URL,
    DA_CT_CROSSWALK_URL,
    HTTP_TIMEOUT_SECONDS,
    HTTP_USER_AGENT,
    TARGET_CMA_CODES,
    TARGET_PROVINCE_PRUID,
)

__all__ = [
    "ALECTRA_ITEM_URL",
    "BRAMPTON_CENSUS_FS",
    "BRAMPTON_LIB_URL",
    "BRAMPTON_REC_URL",
    "BRAMPTON_SPA_URL",
    "CISR_URL",
    "CISV_URL",
    "CT_BOUNDARIES_URL",
    "DA_CT_CROSSWALK_URL",
    "HTTP_TIMEOUT_SECONDS",
    "HTTP_USER_AGENT",
    "TARGET_CMA_CODES",
    "TARGET_PROVINCE_PRUID",
    "build_facilities",
    "load_alectra_service_area",
    "load_brampton_census",
    "load_cimd",
    "load_ct_boundaries",
    "neighbourhood_map",
]
