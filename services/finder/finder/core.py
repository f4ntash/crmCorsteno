"""Finder orchestration independent from persistence and CRM concerns."""

from __future__ import annotations

from dataclasses import dataclass, field
from time import monotonic
from typing import Callable

from .browser import GoogleMapsBrowser
from .config import SearchConfig
from .dedupe import LocalDeduper
from .errors import DiscoveryFailure, FinderError
from .models import FinderCandidate


@dataclass(slots=True)
class DiscoveryReport:
    requested: int
    candidates_seen: int = 0
    unique_candidates: list[FinderCandidate] = field(default_factory=list)
    duplicates_local: int = 0
    failures: list[DiscoveryFailure] = field(default_factory=list)
    blocked: bool = False
    duration_seconds: float = 0.0

    @property
    def errors(self) -> int:
        return len(self.failures)


def discover(config: SearchConfig, browser: GoogleMapsBrowser, *, on_candidate: Callable[[FinderCandidate], bool | None] | None = None, continue_until_limit: bool = False) -> DiscoveryReport:
    started = monotonic()
    report = DiscoveryReport(requested=config.limit)
    deduper = LocalDeduper()
    try:
        urls = browser.search_urls(config)
    except FinderError as exc:
        report.failures.append(DiscoveryFailure(exc.code, str(exc)))
        report.blocked = exc.code == "blocked"
        report.duration_seconds = monotonic() - started
        return report

    for url in urls:
        if not continue_until_limit and len(report.unique_candidates) >= config.limit:
            break
        report.candidates_seen += 1
        try:
            candidate = browser.extract_candidate(url, config)
            if not deduper.add(candidate):
                report.duplicates_local += 1
                continue
            report.unique_candidates.append(candidate)
            if on_candidate and on_candidate(candidate):
                break
        except FinderError as exc:
            report.failures.append(DiscoveryFailure(exc.code, str(exc), url))
            if exc.code == "blocked":
                report.blocked = True
                break
    report.duration_seconds = monotonic() - started
    return report
