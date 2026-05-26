"""Tiny HTTP helpers for the pipeline. Caches downloaded zips on disk."""

from __future__ import annotations

import io
import zipfile
from pathlib import Path

import httpx

from .urls import HTTP_TIMEOUT_SECONDS, HTTP_USER_AGENT


def _client() -> httpx.Client:
    return httpx.Client(
        follow_redirects=True,
        timeout=HTTP_TIMEOUT_SECONDS,
        headers={"User-Agent": HTTP_USER_AGENT},
    )


def download_to(url: str, dest: Path) -> Path:
    """Download ``url`` once; reuse cached bytes on subsequent runs."""
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    with _client() as client:
        r = client.get(url)
        r.raise_for_status()
    dest.write_bytes(r.content)
    return dest


def download_bytes(url: str) -> bytes:
    """Download ``url`` and return the raw bytes (no caching)."""
    with _client() as client:
        r = client.get(url)
        r.raise_for_status()
    return r.content


def download_and_extract_zip(url: str, extract_dir: Path) -> Path:
    """Download a zip and extract it into ``extract_dir`` (cached)."""
    if extract_dir.exists() and any(extract_dir.iterdir()):
        return extract_dir
    extract_dir.mkdir(parents=True, exist_ok=True)
    with _client() as client:
        r = client.get(url)
        r.raise_for_status()
    with zipfile.ZipFile(io.BytesIO(r.content)) as zf:
        zf.extractall(extract_dir)
    return extract_dir


def get_json(url: str, params: dict | None = None) -> dict:
    with _client() as client:
        r = client.get(url, params=params)
        r.raise_for_status()
    return r.json()


def get_text(url: str, params: dict | None = None) -> str:
    with _client() as client:
        r = client.get(url, params=params)
        r.raise_for_status()
    return r.text
