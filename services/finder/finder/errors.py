"""Typed operational failures exposed by the browser adapter."""

from __future__ import annotations

from dataclasses import dataclass


class FinderError(Exception):
    code = "finder_error"


class NavigationError(FinderError):
    code = "navigation_error"


class SelectorError(FinderError):
    code = "selector_error"


class BlockedError(FinderError):
    code = "blocked"


class FinderTimeoutError(FinderError):
    code = "timeout"


class CandidateParseError(FinderError):
    code = "candidate_parse_error"


class BrowserError(FinderError):
    code = "browser_error"


class RuntimeError(FinderError):
    code = "runtime_error"


@dataclass(frozen=True, slots=True)
class DiscoveryFailure:
    code: str
    message: str
    reference: str | None = None
