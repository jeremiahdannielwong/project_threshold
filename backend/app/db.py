"""Async SQLAlchemy engine + session lifecycle.

Persistence is opt-in: when ``THRESHOLD_DATABASE_URL`` is unset the engine is
``None`` and every helper short-circuits. This keeps the dev/demo flow working
without a running Postgres while letting real deployments persist on-demand.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from .config import Settings

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    """Declarative base shared by every ORM model."""


class Database:
    """Lazy-initialized engine + sessionmaker wrapper.

    Lives on ``app.state.db`` and is also passed to services that need to
    persist rows. Callers check ``db.enabled`` before opening a session.
    """

    def __init__(self, settings: Settings) -> None:
        self._url = settings.database_url
        self._engine: AsyncEngine | None = None
        self._sessionmaker: async_sessionmaker[AsyncSession] | None = None

    @property
    def enabled(self) -> bool:
        return bool(self._url)

    async def connect(self) -> None:
        """Open the engine and create tables. No-op when DB is disabled."""
        if not self.enabled:
            logger.info("THRESHOLD_DATABASE_URL not set — persistence disabled.")
            return
        # Import here so models register on Base.metadata before create_all runs.
        from .models import db as _db_models  # noqa: F401

        self._engine = create_async_engine(self._url, future=True, pool_pre_ping=True)
        self._sessionmaker = async_sessionmaker(
            self._engine, expire_on_commit=False, class_=AsyncSession
        )
        async with self._engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Persistence ready — tables ensured on %s.", _sanitize(self._url))

    async def dispose(self) -> None:
        if self._engine is not None:
            await self._engine.dispose()
            self._engine = None
            self._sessionmaker = None

    @asynccontextmanager
    async def session(self) -> AsyncIterator[AsyncSession]:
        """Context-managed session. Raises if the DB is disabled."""
        if self._sessionmaker is None:
            raise RuntimeError(
                "Database is disabled — set THRESHOLD_DATABASE_URL to enable persistence."
            )
        async with self._sessionmaker() as session:
            yield session


def _sanitize(url: str) -> str:
    """Strip the password out of a DSN before logging it."""
    if "@" not in url or "://" not in url:
        return url
    scheme, rest = url.split("://", 1)
    creds, host = rest.split("@", 1)
    if ":" in creds:
        user = creds.split(":", 1)[0]
        return f"{scheme}://{user}:***@{host}"
    return url


__all__ = ["Base", "Database"]
