"""Pipeline stages. Each module exports a single ``run(db, **kwargs)`` coroutine.

The stages are independently runnable so a single failed step does not force
a full re-fetch -- e.g. ``stages.train.run(db)`` re-fits on the existing
curated features without re-hitting any upstream API.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class StageResult:
    """Standard return type from every stage."""

    name: str
    rows_written: int = 0
    elapsed_seconds: float = 0.0
    details: dict[str, Any] = field(default_factory=dict)

    def __str__(self) -> str:  # pragma: no cover - log convenience
        return (
            f"{self.name}: wrote {self.rows_written} rows "
            f"in {self.elapsed_seconds:.2f}s "
            f"({', '.join(f'{k}={v}' for k, v in self.details.items())})"
        )


__all__ = ["StageResult"]
