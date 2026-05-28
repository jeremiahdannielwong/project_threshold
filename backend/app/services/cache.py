"""Tiny in-process TTL cache for Tier C proxies.

Process-local on purpose. Tier C data is small (a few KB per refresh) and the
backend is single-instance for MVP. Multi-replica deploys would swap this for
Redis but the interface would not change.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable, Hashable
from dataclasses import dataclass
from typing import Generic, TypeVar

T = TypeVar("T")
K = TypeVar("K", bound=Hashable)


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


class KeyedTTLCache(Generic[K, T]):
    """Multi-key TTL cache. Concurrent callers for the same key coalesce.

    Used by the briefing service so a popular CT doesn't trigger a Gemini call
    on every poll — one fetch per (ctuid, scenario) per TTL window, shared
    across all clients.
    """

    def __init__(self, ttl_seconds: float) -> None:
        self._ttl = ttl_seconds
        self._entries: dict[K, _Entry[T]] = {}
        self._key_locks: dict[K, asyncio.Lock] = {}
        self._dict_lock = asyncio.Lock()

    def _peek(self, key: K) -> T | None:
        entry = self._entries.get(key)
        if entry is None or time.monotonic() >= entry.expires_at:
            return None
        return entry.value

    async def get(self, key: K, fetch: Callable[[], Awaitable[T]]) -> T:
        cached = self._peek(key)
        if cached is not None:
            return cached
        async with self._dict_lock:
            lock = self._key_locks.setdefault(key, asyncio.Lock())
        async with lock:
            cached = self._peek(key)
            if cached is not None:
                return cached
            value: T = await fetch()
            self._entries[key] = _Entry(value=value, expires_at=time.monotonic() + self._ttl)
            return value

    def clear(self) -> None:
        self._entries.clear()
