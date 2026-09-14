"""Playwright adapter for the existing Google Maps UI workflow."""

from __future__ import annotations

import random
import re
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote_plus

from .config import SearchConfig
from .errors import BlockedError, CandidateParseError, FinderTimeoutError, NavigationError, SelectorError
from .models import FinderCandidate, SearchContext
from . import selectors


@dataclass(frozen=True, slots=True)
class BrowserSettings:
    headless: bool = True
    launch_timeout_ms: int = 15_000
    context_timeout_ms: int = 15_000
    page_timeout_ms: int = 15_000
    navigation_timeout_ms: int = 60_000
    search_timeout_ms: int = 15_000
    result_timeout_ms: int = 10_000
    min_delay_seconds: float = 1.2
    max_delay_seconds: float = 2.4
    max_scrolls: int = 50
    max_search_results: int = 80
    timeout_ms: int = 45_000
    log: Any = print


class GoogleMapsBrowser:
    """Only class allowed to know Google Maps selectors and Playwright details."""

    def __init__(self, page: Any, settings: BrowserSettings | None = None) -> None:
        self.page = page
        self.settings = settings or BrowserSettings()

    def _pause(self) -> None:
        time.sleep(random.uniform(self.settings.min_delay_seconds, self.settings.max_delay_seconds))

    def _log(self, message: str) -> None:
        self.settings.log(f"[Finder] {message}")

    def _assert_not_blocked(self) -> None:
        title = (self.page.title() or "").lower()
        body = (self.page.locator("body").inner_text(timeout=3_000) or "").lower()
        markers = ("captcha", "unusual traffic", "tráfico inusual", "verify you are human", "verifica que eres humano")
        if any(marker in title or marker in body for marker in markers):
            raise BlockedError("Google Maps reported a challenge or traffic block")

    def accept_consent(self) -> None:
        for label in selectors.CONSENT_LABELS:
            try:
                button = self.page.get_by_role("button", name=label, exact=True)
                if button.count():
                    button.first.click(timeout=2_000)
                    return
            except Exception:
                continue

    def search_urls(self, config: SearchConfig) -> list[str]:
        url = "https://www.google.com/maps/search/" + quote_plus(f"{config.category} {config.location}")
        self._log(f"Opening Google Maps for {config.category} / {config.location}")
        try:
            self.page.goto(url, wait_until="domcontentloaded", timeout=self.settings.navigation_timeout_ms)
            self._log("Maps loaded")
            self.accept_consent()
            self._assert_not_blocked()
            self.page.locator(selectors.SEARCH_FEED).wait_for(timeout=self.settings.search_timeout_ms)
            self._log("Results visible")
        except BlockedError:
            raise
        except Exception as exc:
            if "timeout" in exc.__class__.__name__.lower():
                raise FinderTimeoutError(f"search stage timed out: {exc}") from exc
            raise NavigationError(f"could not open Maps search: {exc}") from exc

        urls: list[str] = []
        seen: set[str] = set()
        no_growth = 0
        for _ in range(self.settings.max_scrolls):
            for anchor in self.page.locator(selectors.PLACE_LINK).all():
                href = anchor.get_attribute("href")
                if href and href not in seen:
                    seen.add(href)
                    urls.append(href)
                    if len(urls) >= min(config.limit * 3, self.settings.max_search_results):
                        return urls
            before = len(urls)
            self.page.locator(selectors.SEARCH_FEED).evaluate("node => node.scrollTo(0, node.scrollHeight)")
            self._pause()
            no_growth = no_growth + 1 if len(urls) == before else 0
            if no_growth >= 5:
                break
        return urls

    def extract_candidate(self, url: str, config: SearchConfig) -> FinderCandidate:
        try:
            self._log("Opening business detail")
            self.page.goto(url, wait_until="domcontentloaded", timeout=self.settings.timeout_ms)
            self._pause()
            self._assert_not_blocked()
            name = self.page.locator(selectors.BUSINESS_NAME).first.inner_text(timeout=self.settings.result_timeout_ms).strip()
        except BlockedError:
            raise
        except Exception as exc:
            if "timeout" in exc.__class__.__name__.lower():
                raise FinderTimeoutError(f"detail stage timed out: {exc}") from exc
            raise NavigationError(f"could not open business detail: {exc}") from exc

        if not name:
            raise CandidateParseError("business name was empty")
        address = phone = website = ""
        try:
            for item in self.page.locator(selectors.DETAIL_ITEMS).all()[:50]:
                item_id = item.get_attribute("data-item-id") or ""
                value = item.get_attribute("aria-label") or item.get_attribute("href") or ""
                if item_id.startswith("address"):
                    address = value.removeprefix("Dirección:").strip()
                elif item_id.startswith("phone"):
                    phone = value
                elif item_id.startswith("authority"):
                    website = value
            if not address:
                address = (self.page.locator(selectors.ADDRESS).first.get_attribute("aria-label") or "").removeprefix("Dirección:").strip()
        except Exception as exc:
            raise SelectorError(f"business detail selectors changed: {exc}") from exc

        # Google does not expose this optional field on every business page.
        # The old Finder treated it as optional and used the search category.
        category = config.category
        try:
            category_locator = self.page.locator(selectors.CATEGORY)
            if category_locator.count():
                category = category_locator.first.inner_text(timeout=2_000).strip() or config.category
        except Exception:
            pass

        return FinderCandidate(
            business_name=name,
            category=category or config.category,
            address=address,
            website=website,
            phone=phone,
            google_maps_url=url,
            source_reference=extract_place_id(url),
            context=SearchContext.now(config.category, config.location),
        )


def extract_place_id(url: str | None) -> str | None:
    if not url:
        return None
    for pattern in (r"!1s([^!]+)", r"place/([^/]+)"):
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None
