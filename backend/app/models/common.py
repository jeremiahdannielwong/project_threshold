"""Shared response shapes.

Every backend response returns ``Envelope[T] = {data, sources, generated_at}``
per ``context/code-standards.md``.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field, HttpUrl

T = TypeVar("T")


class SourceCitation(BaseModel):
    """Provenance metadata for a numeric value."""

    model_config = ConfigDict(frozen=True)

    slug: str
    label: str
    vintage: str
    url: HttpUrl


class Envelope(BaseModel, Generic[T]):
    """Uniform wrapper applied to every score/recommendation response."""

    data: T
    sources: list[SourceCitation]
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


def utcnow() -> datetime:
    return datetime.now(timezone.utc)
