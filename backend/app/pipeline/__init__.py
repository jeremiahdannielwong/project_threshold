"""Tier A data pipeline.

Replaces the ``pipeline/EDA.ipynb`` notebook as the source-of-truth build path
for the ontology the backend reads at startup. The build chain is layered:

  raw.*        -- as-fetched payloads from each upstream source
  staging.*    -- typed, cleaned, deduplicated tables
  curated.*    -- joined feature table (model + serving input)
  ml.*         -- versioned PCA model artifacts + per-CT scores
  public.*     -- the three tables the backend reads at startup

Run the full chain with::

    python -m app.pipeline

Run a single stage (useful while iterating)::

    python -m app.pipeline --stage train

Tier C live data (weather, outages) is intentionally NOT snapshotted here --
those are served live via ``app.services.weather`` / ``app.services.outages``.

Note: this package's submodules pull in heavy deps (geopandas, scikit-learn,
prefect, mlflow, pandera). We deliberately do NOT re-export them here so
importing a single submodule doesn't drag in the orchestrator.
"""
