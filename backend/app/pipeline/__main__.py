"""``python -m app.pipeline`` -- pipeline CLI.

Three modes:

  full run (default)::
      python -m app.pipeline

  single stage::
      python -m app.pipeline --stage train

  Prefect flow (run once or schedule)::
      python -m app.pipeline --prefect
      python -m app.pipeline --prefect --serve
"""

from __future__ import annotations

import argparse
import asyncio
import logging
from pathlib import Path

from .build import STAGES, run_all, run_stage


def _parse_args() -> argparse.Namespace:
    from ..config import get_settings

    settings = get_settings()
    p = argparse.ArgumentParser(
        prog="python -m app.pipeline",
        description="Build Tier A artifacts and write them to Postgres.",
    )
    p.add_argument(
        "--cache-dir",
        type=Path,
        default=settings.data_dir,
        help=f"Local directory for upstream zip/CSV cache (default: {settings.data_dir}).",
    )
    p.add_argument(
        "--stage",
        choices=tuple(STAGES.keys()),
        help="Run a single stage instead of the full chain.",
    )
    p.add_argument(
        "--prefect",
        action="store_true",
        help="Run via the Prefect flow (registers with the Prefect server if reachable).",
    )
    p.add_argument(
        "--serve",
        action="store_true",
        help="With --prefect: schedule the flow as a deployment instead of running once.",
    )
    p.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="Log DEBUG-level messages.",
    )
    return p.parse_args()


def main() -> None:
    args = _parse_args()
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s -- %(message)s",
    )
    logger = logging.getLogger("threshold.pipeline")

    if args.prefect:
        from .flow import main as flow_main

        # Forward to the flow entrypoint -- it owns its own argparse.
        import sys

        forwarded = ["--cache-dir", str(args.cache_dir)]
        if args.serve:
            forwarded.append("--serve")
        sys.argv = [sys.argv[0], *forwarded]
        flow_main()
        return

    if args.stage:
        result = asyncio.run(run_stage(args.stage, cache_dir=args.cache_dir))
        logger.info("stage %s: %s", args.stage, result)
        return

    summary = asyncio.run(run_all(args.cache_dir))
    logger.info(
        "pipeline done: %d rows across %d stages in %.2fs",
        summary.total_rows,
        len(summary.results),
        summary.total_seconds,
    )
    for r in summary.results:
        logger.info("  - %s", r)


if __name__ == "__main__":
    main()
