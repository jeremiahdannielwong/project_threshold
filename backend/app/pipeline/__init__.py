"""Tier A data pipeline.

Replaces the ``pipeline/EDA.ipynb`` notebook as the source-of-truth build path
for the ontology the backend reads at startup. Output goes to three Postgres
tables — not files:

  * ``communities``   — scored Census Tracts (PCA composite)
  * ``facilities``    — cooling/warming centres
  * ``pca_loadings``  — PCA factor loadings per scenario

The notebook is retained as a judge-facing exploration tool but no longer
authoritative. Run the build with::

    python -m app.pipeline

Tier C live data (weather, outages) is intentionally NOT snapshotted here —
those are served live via ``app.services.weather`` / ``app.services.outages``.

Note: this package's submodules pull in heavy deps (geopandas, scikit-learn).
We deliberately do NOT re-export ``build_all`` here so importing a single
submodule (e.g. ``app.pipeline.scoring``) doesn't drag in the orchestrator.
"""
