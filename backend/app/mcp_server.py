"""MCP server derived from the FastAPI route surface.

Every REST endpoint registered on the FastAPI app is exposed as an MCP tool
(GET routes become ``ResourceTemplate``-style tools, POSTs become invocations).
The MCP server runs in-process and reaches FastAPI over an ASGI transport, so
dependency injection, middleware, and the existing rate limiter all apply
exactly as they do for HTTP clients.

Mounted at ``/mcp`` from :func:`app.main.create_app`.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator, Callable

from fastapi import FastAPI
from fastmcp import FastMCP
from starlette.types import Lifespan


def build_mcp_app(app: FastAPI) -> tuple[FastMCP, object]:
    """Derive a FastMCP server from ``app`` and return ``(mcp, asgi_app)``.

    The returned ASGI app speaks the MCP streamable-HTTP transport at ``/`` —
    callers should ``app.mount("/mcp", asgi_app)`` so the public endpoint
    lands at ``/mcp/``.
    """
    mcp = FastMCP.from_fastapi(
        app=app,
        name="Threshold MCP",
    )
    asgi_app = mcp.http_app(path="/")
    return mcp, asgi_app


def compose_lifespan(
    threshold_lifespan: Lifespan[FastAPI],
    mcp_asgi_app,
) -> Callable[[FastAPI], "AsyncIterator[None]"]:
    """Wrap the existing lifespan with the MCP session-manager lifespan.

    Order matters: the MCP session manager must outlive any in-flight tool
    call that touches FastAPI state, so we enter MCP first and exit last.
    """

    @asynccontextmanager
    async def combined(app: FastAPI) -> AsyncIterator[None]:
        async with mcp_asgi_app.lifespan(app):
            async with threshold_lifespan(app):
                yield

    return combined
