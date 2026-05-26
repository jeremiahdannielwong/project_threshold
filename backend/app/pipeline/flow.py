"""Prefect flow wrapping the pipeline stages.

Each stage becomes a ``@task`` so the Prefect UI shows per-stage status,
duration, and retries. The flow is registerable as a deployment so it can
run on a daily cron from the Prefect server at http://localhost:4200.

Local run::

    python -m app.pipeline.flow

Schedule (registered as a deployment with a 06:00 America/Toronto cron)::

    python -m app.pipeline.flow --serve
"""

from __future__ import annotations

import argparse
import asyncio
import logging
from pathlib import Path

from prefect import flow, get_run_logger, task
from prefect.schedules import Cron

from ..config import get_settings
from ..db import Database
from .stages import StageResult
from .stages import clean as clean_stage
from .stages import features as features_stage
from .stages import ingest as ingest_stage
from .stages import publish as publish_stage
from .stages import score as score_stage
from .stages import train as train_stage

logger = logging.getLogger(__name__)


def _open_db() -> Database:
    settings = get_settings()
    db = Database(settings)
    if not db.enabled:
        raise RuntimeError(
            "Pipeline requires THRESHOLD_DATABASE_URL. Set it (e.g. in backend/.env) "
            "to a postgresql+asyncpg://... DSN and re-run."
        )
    return db


@task(name="ingest", retries=2, retry_delay_seconds=30)
async def t_ingest(db: Database, cache_dir: Path) -> StageResult:
    get_run_logger().info("ingest: starting (cache_dir=%s)", cache_dir)
    return await ingest_stage.run(db, cache_dir=cache_dir)


@task(name="clean", retries=1, retry_delay_seconds=10)
async def t_clean(db: Database) -> StageResult:
    return await clean_stage.run(db)


@task(name="features", retries=1, retry_delay_seconds=10)
async def t_features(db: Database) -> StageResult:
    return await features_stage.run(db)


@task(name="train", retries=1, retry_delay_seconds=10)
async def t_train(db: Database) -> StageResult:
    return await train_stage.run(db)


@task(name="score", retries=1, retry_delay_seconds=10)
async def t_score(db: Database) -> StageResult:
    return await score_stage.run(db)


@task(name="publish", retries=1, retry_delay_seconds=10)
async def t_publish(db: Database) -> StageResult:
    return await publish_stage.run(db)


@flow(name="threshold-pipeline", log_prints=True)
async def threshold_pipeline(cache_dir: str = "pipeline/data") -> dict[str, dict]:
    """End-to-end pipeline run.

    Returns a dict of stage-name -> StageResult.details so the Prefect UI
    surfaces a structured summary in the flow output.
    """
    run_logger = get_run_logger()
    db = _open_db()
    await db.connect()
    try:
        cache = Path(cache_dir)
        results: list[StageResult] = []
        results.append(await t_ingest(db, cache))
        results.append(await t_clean(db))
        results.append(await t_features(db))
        results.append(await t_train(db))
        results.append(await t_score(db))
        results.append(await t_publish(db))
    finally:
        await db.dispose()

    summary = {
        r.name: {
            "rows": r.rows_written,
            "elapsed_seconds": round(r.elapsed_seconds, 2),
            **r.details,
        }
        for r in results
    }
    run_logger.info("threshold-pipeline: summary = %s", summary)
    return summary


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="python -m app.pipeline.flow")
    p.add_argument(
        "--serve",
        action="store_true",
        help=(
            "Register the flow as a long-running deployment scheduled at "
            "06:00 America/Toronto daily. Otherwise the flow runs once and exits."
        ),
    )
    p.add_argument(
        "--cache-dir",
        type=Path,
        default=Path("pipeline/data"),
        help="Local directory for upstream zip/CSV cache (default: pipeline/data).",
    )
    return p.parse_args()


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s -- %(message)s",
    )
    args = _parse_args()
    if args.serve:
        threshold_pipeline.serve(
            name="daily",
            schedules=[Cron("0 6 * * *", timezone="America/Toronto")],
            parameters={"cache_dir": str(args.cache_dir)},
        )
        return
    asyncio.run(threshold_pipeline(cache_dir=str(args.cache_dir)))


if __name__ == "__main__":
    main()
