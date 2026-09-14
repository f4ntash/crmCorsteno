"""Run-local candidate deduplication only."""

from __future__ import annotations

import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from .models import FinderCandidate


def normalize_maps_url(value: str | None) -> str | None:
    if not value:
        return None
    parts = urlsplit(value.strip())
    if not parts.scheme or not parts.netloc:
        return value.strip().rstrip("/").lower() or None
    query = urlencode(sorted(parse_qsl(parts.query, keep_blank_values=True)))
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path.rstrip("/"), query, ""))


def normalize_domain(value: str | None) -> str | None:
    if not value:
        return None
    raw = value.strip().lower()
    if "://" not in raw:
        raw = "https://" + raw
    host = urlsplit(raw).hostname
    return host.removeprefix("www.") if host else None


def _text(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().lower())


def candidate_keys(candidate: FinderCandidate) -> tuple[str, ...]:
    keys: list[str] = []
    if candidate.source_reference:
        keys.append(f"source::{candidate.source.lower()}::{_text(candidate.source_reference)}")
    maps_url = normalize_maps_url(candidate.google_maps_url)
    if maps_url:
        keys.append(f"maps::{maps_url}")
    domain = normalize_domain(candidate.website)
    if domain:
        keys.append(f"domain::{domain}")
    name = _text(candidate.business_name)
    locality = _text(candidate.city or candidate.address)
    if name and locality:
        keys.append(f"name::{name}::{locality}")
    return tuple(keys)


class LocalDeduper:
    def __init__(self) -> None:
        self._keys: set[str] = set()

    def add(self, candidate: FinderCandidate) -> bool:
        keys = candidate_keys(candidate)
        if self._keys.intersection(keys):
            return False
        self._keys.update(keys)
        return True
