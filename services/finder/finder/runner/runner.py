"""One-message external Finder runner; no daemon and no lead persistence."""

from __future__ import annotations

import os
from time import monotonic
from pathlib import Path
from typing import Mapping
from typing import Any, Callable

from ..browser import BrowserSettings, GoogleMapsBrowser
from ..config import SearchConfig
from ..core import discover
from ..errors import BlockedError, FinderError
from .api_client import InternalApiClient, InternalApiError
from .queue_client import QueueClient, QueueClientError

PERSIST_SAFETY_MULTIPLIER = 3


def load_local_environment(environ: Mapping[str, str] | None = None, env_path: Path | None = None) -> dict[str, str]:
    """Load .env.local as a fallback without overriding explicit environment values."""
    values = dict(os.environ if environ is None else environ)
    path = env_path or Path(__file__).resolve().parents[2] / ".env.local"
    if not path.exists():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if key and key not in values:
            values[key] = value
    return values


def env_config(environ: dict[str, str] | None = None, env_path: Path | None = None) -> dict[str, str]:
    values = load_local_environment(environ, env_path)
    required = ("CORSTENO_API_BASE_URL", "CF_ACCOUNT_ID", "CF_FINDER_QUEUE_ID", "CF_QUEUES_API_TOKEN", "FINDER_SERVICE_SECRET")
    missing = [name for name in required if not values.get(name)]
    if missing:
        raise RuntimeError("Missing runner environment variables: " + ", ".join(missing))
    return {name: values[name] for name in required}


class ExternalFinderRunner:
    def __init__(self, queue: QueueClient, api: InternalApiClient, *, headed: bool = False, log: Callable[[str], None] = print) -> None:
        self.queue = queue
        self.api = api
        self.headed = headed
        self.log = log

    def pull_once(self) -> int:
        self.log("[Runner] Pulling one Finder message")
        messages = self.queue.pull_once(batch_size=1, visibility_timeout_ms=120_000)
        if not messages:
            self.log("[Runner] No messages")
            return 0
        message = messages[0]
        job_id = message.payload.get("jobId") if isinstance(message.payload.get("jobId"), str) else ""
        organization_id = message.payload.get("organizationId") if isinstance(message.payload.get("organizationId"), str) else ""
        if message.payload.get("version") != 1 or not job_id or not organization_id:
            self.log("[Runner] Invalid message; acknowledging stale payload")
            self.queue.ack(message.lease_id)
            return 0
        try:
            context = self.api.claim(job_id, organization_id)
            self.log(f"[Runner] Job state: {context.state}")
            if context.state in {"COMPLETED", "CANCELLED", "FAILED"}:
                self.queue.ack(message.lease_id)
                return 0
            if context.state != "RUNNING" or not context.search:
                raise RuntimeError("job claim did not return a runnable search")
            config = SearchConfig(str(context.search["category"]), str(context.search["location"]), int(context.search["limit"]))
            if context.mode == "external_persist":
                summary, candidates, cancelled = self._run_persistent_finder(job_id, organization_id, config)
                if cancelled:
                    self.queue.ack(message.lease_id)
                    self.log("[Runner] Job cancelled; queue message acknowledged")
                    return 0
            else:
                summary, candidates = self._run_finder(config)
                self.api.batch(job_id, organization_id, [candidate.to_dict() for candidate in candidates], summary)
                self.log(f"[Runner] Batch accepted by API: {len(candidates)} candidates")
            self.api.complete(job_id, organization_id, summary)
            self.log("[Runner] Job completed")
            self.queue.ack(message.lease_id)
            self.log("[Runner] Queue message acknowledged")
            return len(candidates)
        except (FinderError, ValueError) as exc:
            message_text = str(exc)
            try: self.api.fail(job_id, organization_id, message_text, retryable=False)
            finally: self.queue.ack(message.lease_id)
            self.log(f"[Runner] Job failed: {type(exc).__name__}")
            return 0
        except (QueueClientError, InternalApiError, OSError) as exc:
            self.log(f"[Runner] Transient failure: {exc}; retrying message")
            self.queue.retry(message.lease_id, delay_seconds=30)
            return 0

    def _run_finder(self, config: SearchConfig):
        from playwright.sync_api import sync_playwright
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=not self.headed, timeout=15_000)
            context = None
            page = None
            try:
                context = browser.new_context(locale="es-AR", viewport=None)
                context.set_default_timeout(15_000)
                page = context.new_page()
                report = discover(config, GoogleMapsBrowser(page, BrowserSettings(headless=not self.headed)),)
                summary = {"candidatesSeen": report.candidates_seen, "uniqueCandidates": len(report.unique_candidates), "errors": report.errors, "blocked": report.blocked, "durationSeconds": round(report.duration_seconds, 3), "leadsCreated": 0}
                if report.blocked:
                    raise BlockedError("Finder blocked by CAPTCHA or challenge")
                return summary, report.unique_candidates
            finally:
                for resource in (page, context, browser):
                    if resource is not None:
                        try: resource.close()
                        except Exception: pass

    def _run_persistent_finder(self, job_id: str, organization_id: str, config: SearchConfig):
        from playwright.sync_api import sync_playwright
        started = monotonic()
        candidates: list[Any] = []
        metrics = {"leadsCreated": 0, "duplicates": 0, "invalidCandidates": 0, "candidatesSeen": 0}
        safety_cap = config.limit * PERSIST_SAFETY_MULTIPLIER
        cancelled = False
        batch: list[Any] = []

        def flush() -> bool:
            nonlocal cancelled, batch, metrics
            if not batch or cancelled:
                return metrics["leadsCreated"] >= config.limit
            summary = {"candidatesSeen": metrics["candidatesSeen"], "uniqueCandidates": metrics["candidatesSeen"], "errors": metrics["invalidCandidates"], "blocked": False, "durationSeconds": round(monotonic() - started, 3), "leadsCreated": metrics["leadsCreated"], "duplicates": metrics["duplicates"], "invalidCandidates": metrics["invalidCandidates"]}
            response = self.api.batch(job_id, organization_id, [candidate.to_dict() for candidate in batch], summary)
            if response.get("state") == "CANCELLED":
                cancelled = True
                batch = []
                return True
            returned = response.get("metrics") if isinstance(response.get("metrics"), dict) else response
            for key in metrics:
                if isinstance(returned.get(key), int):
                    metrics[key] = int(returned[key])
            self.log(f"[Runner] Batch accepted by API: {len(batch)} candidates; created={metrics['leadsCreated']} duplicates={metrics['duplicates']}")
            batch = []
            return metrics["leadsCreated"] >= config.limit

        def on_candidate(candidate: Any) -> bool:
            candidates.append(candidate)
            metrics["candidatesSeen"] += 1
            batch.append(candidate)
            reached_target = len(batch) >= 5 and flush()
            return reached_target or metrics["candidatesSeen"] >= safety_cap

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=not self.headed, timeout=15_000)
            context = None
            page = None
            try:
                context = browser.new_context(locale="es-AR", viewport=None)
                context.set_default_timeout(15_000)
                page = context.new_page()
                report = discover(config, GoogleMapsBrowser(page, BrowserSettings(headless=not self.headed)), on_candidate=on_candidate, continue_until_limit=True)
                if not cancelled and batch:
                    flush()
                summary = {"requestedLeads": config.limit, "candidatesSeen": report.candidates_seen, "uniqueCandidates": len(report.unique_candidates), "errors": report.errors, "blocked": report.blocked, "durationSeconds": round(report.duration_seconds, 3), "leadsCreated": metrics["leadsCreated"], "duplicates": metrics["duplicates"], "invalidCandidates": metrics["invalidCandidates"]}
                return summary, candidates, cancelled
            finally:
                for resource in (page, context, browser):
                    if resource is not None:
                        try: resource.close()
                        except Exception: pass


def build_runner(*, headed: bool = False, environ: dict[str, str] | None = None, log: Callable[[str], None] = print) -> ExternalFinderRunner:
    config = env_config(environ)
    return ExternalFinderRunner(QueueClient(config["CF_ACCOUNT_ID"], config["CF_FINDER_QUEUE_ID"], config["CF_QUEUES_API_TOKEN"]), InternalApiClient(config["CORSTENO_API_BASE_URL"], config["FINDER_SERVICE_SECRET"]), headed=headed, log=log)
