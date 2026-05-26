"""Pipeline orchestrator -- chains the six stages.

The stages are decoupled: each reads from one schema and writes to the next.
Running the full chain produces the same observable end state as the previous
monolithic ``build_all`` did, but every intermediate result is persisted and
inspectable in Postgres.

Stage order:

  1. ingest    upstream APIs        -> raw.*
  2. clean     raw.*                -> staging.*
  3. features  staging.*            -> curated.community_features
  4. train     curated.*            -> ml.models   (also -> MLflow)
  5. score     ml.models + curated  -> ml.community_scores
  6. publish   ml.* + staging.*     -> public.{communities, facilities, pca_loadings}
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .stages import StageResult
from .stages import clean as clean_stage
from .stages import features as features_stage
from .stages import ingest as ingest_stage
from .stages import publish as publish_stage
from .stages import score as score_stage
from .stages import train as train_stage

logger = logging.getLogger(__name__)


STAGES: dict[str, Any] = {
    "ingest": ingest_stage,
    "clean": clean_stage,
    "features": features_stage,
    "train": train_stage,
    "score": score_stage,
    "publish": publish_stage,
}


@dataclass
class PipelineResult:
    results: list[StageResult]

    @property
    def total_rows(self) -> int:
        return sum(r.rows_written for r in self.results)

    @property
    def total_seconds(self) -> float:
        return sum(r.elapsed_seconds for r in self.results)


def _open_db() -> Any:
    from ..config import get_settings
    from ..db import Database

    settings = get_settings()
    db = Database(settings)
    if not db.enabled:
        raise RuntimeError(
            "Pipeline requires THRESHOLD_DATABASE_URL. Set it (e.g. in backend/.env) "
            "to a postgresql+asyncpg://... DSN and re-run."
        )
    return db


async def run_stage(stage_name: str, *, cache_dir: Path | None = None) -> StageResult:
    """Run one stage. Used by the CLI's ``--stage`` flag and tests."""
    module = STAGES.get(stage_name)
    if module is None:
        raise ValueError(f"Unknown stage {stage_name!r}; expected one of {list(STAGES)}")

    db = _open_db()
    await db.connect()
    try:
        if stage_name == "ingest":
            if cache_dir is None:
                raise ValueError("ingest stage requires cache_dir")
            return await module.run(db, cache_dir=cache_dir)
        return await module.run(db)
    finally:
        await db.dispose()


async def run_all(cache_dir: Path) -> PipelineResult:
    """Run every stage end-to-end and persist into Postgres."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    db = _open_db()
    await db.connect()
    results: list[StageResult] = []
    try:
        logger.info("=== ingest ===")
        results.append(await ingest_stage.run(db, cache_dir=cache_dir))
        logger.info("=== clean ===")
        results.append(await clean_stage.run(db))
        logger.info("=== features ===")
        results.append(await features_stage.run(db))
        logger.info("=== train ===")
        results.append(await train_stage.run(db))
        logger.info("=== score ===")
        results.append(await score_stage.run(db))
        logger.info("=== publish ===")
        results.append(await publish_stage.run(db))
    finally:
        await db.dispose()

    summary = PipelineResult(results=results)
    logger.info(
        "pipeline done: %d rows across %d stages in %.2fs",
        summary.total_rows,
        len(summary.results),
        summary.total_seconds,
    )
    return summary
