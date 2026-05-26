"""URL constants for every upstream source the pipeline pulls from.

Kept in one place so a broken endpoint is found and fixed once. Slugs match
``app/sources.py`` so provenance survives end-to-end.
"""

from __future__ import annotations

# A1 — StatsCan 2021 Census Tract cartographic boundary file (~15 MB zip)
CT_BOUNDARIES_URL = (
    "https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/"
    "boundary-limites/files-fichiers/lct_000b21a_e.zip"
)

# A2 — City of Brampton ESRI Census 2021 FeatureServer
BRAMPTON_CENSUS_FS = (
    "https://services3.arcgis.com/rl7ACuZkiFsmDA2g/ArcGIS/rest/services/"
    "Census_2021/FeatureServer"
)

# A3/A4 — Canadian Index of Social Vulnerability + Resilience (StatsCan 2025001)
CISV_URL = "https://www150.statcan.gc.ca/pub/45-20-0001/2025001/csv/cisv-eng.zip"
CISR_URL = "https://www150.statcan.gc.ca/pub/45-20-0001/2025001/csv/cisr-eng.zip"
DA_CT_CROSSWALK_URL = (
    "https://www12.statcan.gc.ca/census-recensement/2021/geo/aip-pia/"
    "attribute-attribs/files-fichiers/2021_92-151_X.zip"
)

# Alectra service area (ArcGIS Online item, resolved through item metadata)
ALECTRA_ITEM_URL = (
    "https://www.arcgis.com/sharing/rest/content/items/"
    "8eba357e1b124587884bccb724743c4c?f=json"
)

# Brampton facilities — recreation centres + libraries
BRAMPTON_REC_URL = (
    "https://services3.arcgis.com/rl7ACuZkiFsmDA2g/arcgis/rest/services/"
    "RecreationFacilities/FeatureServer/0"
)
BRAMPTON_LIB_URL = (
    "https://services3.arcgis.com/rl7ACuZkiFsmDA2g/arcgis/rest/services/"
    "Libraries/FeatureServer/0"
)

# Secondary Plan Areas (neighbourhood names for the UI)
BRAMPTON_SPA_URL = (
    "https://services3.arcgis.com/rl7ACuZkiFsmDA2g/arcgis/rest/services/"
    "Planning_Official_Plan/FeatureServer/0"
)

# Two CMAs that fully cover Alectra's service territory in scope
TARGET_CMA_CODES = ("535", "537")
TARGET_PROVINCE_PRUID = "35"  # Ontario

HTTP_TIMEOUT_SECONDS = 120.0
HTTP_USER_AGENT = "Threshold-Pipeline/0.1 (+https://threshold.ca)"
