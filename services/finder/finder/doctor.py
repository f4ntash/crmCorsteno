"""Local Playwright runtime diagnostics. Never accesses CRM or production."""

from __future__ import annotations

from dataclasses import dataclass
from importlib import metadata
from pathlib import Path
from typing import Callable


@dataclass(frozen=True, slots=True)
class DoctorResult:
    python: bool = False
    playwright: bool = False
    chromium_installed: bool = False
    chromium_launch: bool = False
    navigation: bool = False
    error: str | None = None

    @property
    def ok(self) -> bool:
        return all((self.python, self.playwright, self.chromium_installed, self.chromium_launch, self.navigation))


def run_doctor(log: Callable[[str], None] = print) -> DoctorResult:
    log(f"Python: OK")
    try:
        from playwright.sync_api import sync_playwright
        version = metadata.version("playwright")
        log(f"Playwright: OK ({version})")
    except Exception as exc:
        log(f"Playwright: FAIL ({exc})")
        return DoctorResult(python=True, error=str(exc))

    with sync_playwright() as playwright:
        executable = Path(playwright.chromium.executable_path)
        if not executable.exists():
            log(f"Chromium installed: FAIL ({executable})")
            return DoctorResult(python=True, playwright=True, error=f"missing executable: {executable}")
        log(f"Chromium installed: OK ({executable})")
        browser = None
        context = None
        page = None
        try:
            browser = playwright.chromium.launch(headless=True, timeout=15_000)
            log("Chromium launch: OK")
            context = browser.new_context(locale="es-AR", viewport=None)
            context.set_default_timeout(10_000)
            page = context.new_page()
            page.goto("data:text/html,<title>Corsteno Finder doctor</title>", wait_until="domcontentloaded", timeout=10_000)
            log("Navigation: OK")
            return DoctorResult(python=True, playwright=True, chromium_installed=True, chromium_launch=True, navigation=True)
        except Exception as exc:
            log(f"Chromium launch/navigation: FAIL ({exc})")
            return DoctorResult(python=True, playwright=True, chromium_installed=True, error=str(exc))
        finally:
            for resource in (page, context, browser):
                if resource is not None:
                    try:
                        resource.close()
                    except Exception:
                        pass
