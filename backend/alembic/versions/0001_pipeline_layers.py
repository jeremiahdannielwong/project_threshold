"""Pipeline data layers: raw / staging / curated / ml schemas + tables.

Adds the medallion layering the rewritten pipeline writes through:

  raw.*       -- as-fetched upstream payloads (immutable, audit trail)
  staging.*   -- typed, cleaned, deduplicated
  curated.*   -- joined feature tables (model + serving input)
  ml.*        -- versioned model artifacts + per-CT predictions

The existing public.communities / public.facilities / public.pca_loadings
tables are untouched -- this migration only adds the upstream layers that
feed them.

Revision ID: 0001_pipeline_layers
Revises:
Create Date: 2026-05-25
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_pipeline_layers"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SCHEMAS = ("raw", "staging", "curated", "ml")


def upgrade() -> None:
    for schema in SCHEMAS:
        op.execute(sa.text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))

    # ---- raw: one row per fetch, payload stored verbatim ----
    for table in (
        "census_2021",
        "cisv_cisr_2021",
        "alectra_service_area",
        "ct_boundaries",
        "facilities",
        "neighbourhoods",
    ):
        op.create_table(
            table,
            sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
            sa.Column("source_slug", sa.String(64), nullable=False),
            sa.Column("source_url", sa.Text, nullable=False),
            sa.Column(
                "load_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
                index=True,
            ),
            sa.Column("payload", postgresql.JSONB, nullable=True),
            sa.Column("payload_bytes", postgresql.BYTEA, nullable=True),
            sa.Column("row_count", sa.Integer, nullable=True),
            sa.Column("notes", sa.Text, nullable=True),
            schema="raw",
        )
        op.create_index(
            f"ix_raw_{table}_slug_load",
            table,
            ["source_slug", "load_at"],
            schema="raw",
        )

    # ---- staging: typed columns, one row per logical entity ----
    op.create_table(
        "census_tracts",
        sa.Column("ctuid", sa.String(16), primary_key=True),
        sa.Column("population", sa.Integer, nullable=True),
        sa.Column("median_income", sa.Float, nullable=True),
        sa.Column("pct_renters", sa.Float, nullable=True),
        sa.Column("pct_pre1980", sa.Float, nullable=True),
        sa.Column("pct_low_income", sa.Float, nullable=True),
        sa.Column(
            "loaded_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        schema="staging",
    )

    op.create_table(
        "vulnerability",
        sa.Column("ctuid", sa.String(16), primary_key=True),
        sa.Column("cisv_score", sa.Float, nullable=True),
        sa.Column("cisv_dim1", sa.Float, nullable=True),
        sa.Column("cisv_dim2", sa.Float, nullable=True),
        sa.Column("cisv_dim3", sa.Float, nullable=True),
        sa.Column("cisv_dim4", sa.Float, nullable=True),
        sa.Column("cisv_quintile", sa.Float, nullable=True),
        sa.Column("cisr_score", sa.Float, nullable=True),
        sa.Column("cisr_dim1", sa.Float, nullable=True),
        sa.Column("cisr_dim2", sa.Float, nullable=True),
        sa.Column("cisr_dim3", sa.Float, nullable=True),
        sa.Column("cisr_quintile", sa.Float, nullable=True),
        sa.Column(
            "loaded_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        schema="staging",
    )

    op.create_table(
        "ct_geometries",
        sa.Column("ctuid", sa.String(16), primary_key=True),
        sa.Column("cma_code", sa.String(8), nullable=True),
        sa.Column("pruid", sa.String(8), nullable=True),
        sa.Column("geometry", postgresql.JSONB, nullable=False),
        sa.Column("neighbourhood", sa.String(128), nullable=True),
        sa.Column("served_by_alectra", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column(
            "loaded_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        schema="staging",
    )

    op.create_table(
        "facilities",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(256), nullable=True),
        sa.Column("address", sa.String(512), nullable=True),
        sa.Column("type", sa.String(128), nullable=True),
        sa.Column("role", sa.String(64), nullable=True),
        sa.Column("website", sa.String(512), nullable=True),
        sa.Column("source_layer", sa.String(64), nullable=True),
        sa.Column("geometry", postgresql.JSONB, nullable=False),
        sa.Column(
            "loaded_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        schema="staging",
    )

    # ---- curated: the feature table ML + serving consume ----
    op.create_table(
        "community_features",
        sa.Column("ctuid", sa.String(16), primary_key=True),
        sa.Column("population", sa.Integer, nullable=True),
        sa.Column("median_income", sa.Float, nullable=True),
        sa.Column("pct_renters", sa.Float, nullable=True),
        sa.Column("pct_pre1980", sa.Float, nullable=True),
        sa.Column("pct_low_income", sa.Float, nullable=True),
        sa.Column("cisv_score", sa.Float, nullable=True),
        sa.Column("cisv_dim1", sa.Float, nullable=True),
        sa.Column("cisv_dim2", sa.Float, nullable=True),
        sa.Column("cisv_dim3", sa.Float, nullable=True),
        sa.Column("cisv_dim4", sa.Float, nullable=True),
        sa.Column("cisr_score", sa.Float, nullable=True),
        sa.Column("neighbourhood", sa.String(128), nullable=True),
        sa.Column("served_by_alectra", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("geometry", postgresql.JSONB, nullable=True),
        sa.Column(
            "built_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        schema="curated",
    )

    # ---- ml: model registry (artifact + metrics) + per-CT scores ----
    op.create_table(
        "models",
        sa.Column("model_id", sa.String(64), primary_key=True),
        sa.Column("kind", sa.String(64), nullable=False),
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("scenario", sa.String(32), nullable=False, server_default="baseline"),
        sa.Column(
            "fitted_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("factor_columns", postgresql.JSONB, nullable=False),
        sa.Column("loadings", postgresql.JSONB, nullable=False),
        sa.Column("explained_variance", postgresql.JSONB, nullable=True),
        sa.Column("metrics", postgresql.JSONB, nullable=True),
        sa.Column("artifact", postgresql.BYTEA, nullable=True),
        sa.Column("mlflow_run_id", sa.String(64), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        schema="ml",
    )
    op.create_index("ix_ml_models_kind_version", "models", ["kind", "version"], schema="ml")
    op.create_index("ix_ml_models_scenario", "models", ["scenario"], schema="ml")

    op.create_table(
        "community_scores",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("ctuid", sa.String(16), nullable=False, index=True),
        sa.Column("scenario", sa.String(32), nullable=False, index=True),
        sa.Column("score", sa.Float, nullable=False),
        sa.Column("grade", sa.String(16), nullable=False),
        sa.Column(
            "model_id",
            sa.String(64),
            sa.ForeignKey("ml.models.model_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "computed_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("factor_values", postgresql.JSONB, nullable=True),
        schema="ml",
    )
    op.create_index(
        "ix_ml_scores_ct_scenario",
        "community_scores",
        ["ctuid", "scenario", "computed_at"],
        schema="ml",
    )


def downgrade() -> None:
    op.drop_index("ix_ml_scores_ct_scenario", table_name="community_scores", schema="ml")
    op.drop_table("community_scores", schema="ml")
    op.drop_index("ix_ml_models_scenario", table_name="models", schema="ml")
    op.drop_index("ix_ml_models_kind_version", table_name="models", schema="ml")
    op.drop_table("models", schema="ml")

    op.drop_table("community_features", schema="curated")

    op.drop_table("facilities", schema="staging")
    op.drop_table("ct_geometries", schema="staging")
    op.drop_table("vulnerability", schema="staging")
    op.drop_table("census_tracts", schema="staging")

    for table in (
        "neighbourhoods",
        "facilities",
        "ct_boundaries",
        "alectra_service_area",
        "cisv_cisr_2021",
        "census_2021",
    ):
        op.drop_index(f"ix_raw_{table}_slug_load", table_name=table, schema="raw")
        op.drop_table(table, schema="raw")

    for schema in reversed(SCHEMAS):
        op.execute(sa.text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
