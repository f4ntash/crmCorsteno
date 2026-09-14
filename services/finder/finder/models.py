"""Typed contracts emitted by the Finder core."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    value = " ".join(str(value).split())
    return value or None


@dataclass(frozen=True, slots=True)
class SearchContext:
    """Provenance of the search that produced a candidate."""

    search_category: str
    search_location: str
    discovered_at: str

    @classmethod
    def now(cls, category: str, location: str) -> "SearchContext":
        return cls(
            search_category=category,
            search_location=location,
            discovered_at=datetime.now(timezone.utc).isoformat(),
        )


@dataclass(frozen=True, slots=True)
class FinderCandidate:
    """The stable, CRM-neutral result of one business discovery."""

    business_name: str
    category: str | None = None
    address: str | None = None
    city: str | None = None
    region: str | None = None
    country: str | None = None
    website: str | None = None
    phone: str | None = None
    google_maps_url: str | None = None
    source: str = "google_maps"
    source_reference: str | None = None
    context: SearchContext | None = None

    def __post_init__(self) -> None:
        if not _clean(self.business_name):
            raise ValueError("business_name must not be empty")
        object.__setattr__(self, "business_name", _clean(self.business_name) or "")
        for field in (
            "category", "address", "city", "region", "country", "website",
            "phone", "google_maps_url", "source_reference",
        ):
            object.__setattr__(self, field, _clean(getattr(self, field)))

    def to_dict(self) -> dict[str, Any]:
        """Return a stable JSON-compatible representation."""
        value = asdict(self)
        value["context"] = asdict(self.context) if self.context else None
        return value
