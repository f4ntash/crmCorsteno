"""Local Finder core for discovering Google Maps candidates.

This package stops at discovery. It does not know about CRM persistence,
Cloudflare, D1, queues, enrichment, scoring, or email.
"""

from .config import SUPPORTED_CATEGORIES, SearchConfig
from .models import FinderCandidate, SearchContext

__all__ = ["FinderCandidate", "SearchConfig", "SearchContext", "SUPPORTED_CATEGORIES"]
