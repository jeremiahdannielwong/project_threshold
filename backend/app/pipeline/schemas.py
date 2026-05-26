"""Pandera schemas -- data contracts at stage boundaries.

A schema validation failure aborts the stage *before* it writes the bad data
downstream. Each schema corresponds to one table the pipeline writes:

  staging.census_tracts          -> ``CensusTractStaging``
  staging.vulnerability          -> ``VulnerabilityStaging``
  curated.community_features     -> ``CommunityFeatures``
"""

from __future__ import annotations

import pandera.pandas as pa
from pandera.pandas import Column, DataFrameSchema


CTUID_REGEX = r"^\d{7}\.\d{2}$"


CensusTractStaging = DataFrameSchema(
    {
        "ctuid": Column(str, pa.Check.str_matches(CTUID_REGEX), nullable=False, unique=True),
        "population": Column(int, nullable=True),
        "median_income": Column(float, nullable=True),
        "pct_renters": Column(
            float, pa.Check.in_range(0.0, 1.0, include_min=True, include_max=True), nullable=True
        ),
        "pct_pre1980": Column(
            float, pa.Check.in_range(0.0, 1.0, include_min=True, include_max=True), nullable=True
        ),
        "pct_low_income": Column(
            float, pa.Check.in_range(0.0, 1.0, include_min=True, include_max=True), nullable=True
        ),
    },
    strict="filter",  # extra columns are silently dropped
    coerce=True,
)


VulnerabilityStaging = DataFrameSchema(
    {
        "ctuid": Column(str, pa.Check.str_matches(CTUID_REGEX), nullable=False, unique=True),
        "cisv_score": Column(float, nullable=True),
        "cisv_dim1": Column(float, nullable=True),
        "cisv_dim2": Column(float, nullable=True),
        "cisv_dim3": Column(float, nullable=True),
        "cisv_dim4": Column(float, nullable=True),
        "cisr_score": Column(float, nullable=True),
    },
    strict="filter",
    coerce=True,
)


CommunityFeatures = DataFrameSchema(
    {
        "ctuid": Column(str, pa.Check.str_matches(CTUID_REGEX), nullable=False, unique=True),
        "median_income": Column(float, nullable=True),
        "pct_renters": Column(float, nullable=True),
        "pct_pre1980": Column(float, nullable=True),
        "cisv_score": Column(float, nullable=True),
        "cisr_score": Column(float, nullable=True),
        "served_by_alectra": Column(bool, nullable=False),
    },
    strict="filter",
    coerce=True,
)


__all__ = [
    "CensusTractStaging",
    "CommunityFeatures",
    "VulnerabilityStaging",
]
