"""Tiny in-process TTL cache for Tier C proxies.

Process-local on purpose. Tier C data is small (a few KB per refresh) and the
backend is single-instance for MVP. Multi-replica deploys would swap this for
Redis but the interface would not change.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Generic, TypeVar

T = TypeVar("T")


@dataclass
class _Entry(Generic[T]):
    value: T
    expires_at: float


class TTLCache(Generic[T]):
    """Single-key TTL cache that coalesces concurrent refreshes."""

    def __init__(self, ttl_seconds: float) -> None:
        self._ttl = ttl_seconds
        self._entry: _Entry[T] | None = None
        self._lock = asyncio.Lock()

    def peek(self) -> T | None:
        """Return the cached value if still fresh, else None. No fetch."""
        if self._entry is None or time.monotonic() >= self._entry.expires_at:
            return None
        return self._entry.value

    async def get(self, fetch):
        """Return a fresh value, fetching once across concurrent callers."""
        cached = self.peek()
        if cached is not None:
            return cached
        async with self._lock:
            cached = self.peek()
            if cached is not None:
                return cached
            value: T = await fetch()
            self._entry = _Entry(value=value, expires_at=time.monotonic() + self._ttl)
            return value

    def clear(self) -> None:
        self._entry = None
