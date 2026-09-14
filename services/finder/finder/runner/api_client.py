"""Signed service-to-API client. Secrets never enter logs or payloads."""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class InternalApiError(RuntimeError):
    def __init__(self, message: str, *, status: int | None = None, path: str | None = None, transient: bool = True, payload: Any = None) -> None:
        super().__init__(message)
        self.status = status
        self.path = path
        self.transient = transient
        self.payload = payload


@dataclass(frozen=True, slots=True)
class JobContext:
    job_id: str
    organization_id: str
    state: str
    search: dict[str, Any] | None
    mode: str | None = None


def sign_request(method: str, path: str, body: str, secret: str, timestamp: int | None = None) -> tuple[str, str]:
    stamp = int(time.time()) if timestamp is None else timestamp
    body_hash = hashlib.sha256(body.encode("utf-8")).hexdigest()
    canonical = f"{method.upper()}\n{path}\n{stamp}\n{body_hash}"
    signature = hmac.new(secret.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256).hexdigest()
    return str(stamp), signature


def _api_error_detail(result: Any) -> str:
    if not isinstance(result, dict) or not isinstance(result.get("error"), dict):
        return ""
    error = result["error"]
    code = error.get("code") if isinstance(error.get("code"), str) else None
    message = error.get("message") if isinstance(error.get("message"), str) else None
    safe_message = " ".join(message.split())[:240] if message else None
    return " ".join(part for part in (code, safe_message) if part)


class InternalApiClient:
    def __init__(self, base_url: str, secret: str, *, transport: Callable[[Request], Any] | None = None) -> None:
        self.base_url = base_url.rstrip("/")
        self.secret = secret
        self.transport = transport or urlopen

    def request(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        timestamp, signature = sign_request("POST", path, body, self.secret)
        request = Request(self.base_url + path, data=body.encode("utf-8"), method="POST", headers={"Accept": "application/json", "Content-Type": "application/json", "User-Agent": "corsteno-finder-runner/1.0", "X-Finder-Timestamp": timestamp, "X-Finder-Signature": signature})
        try:
            with self.transport(request) as response:
                status = getattr(response, "status", 200)
                result = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            raw = exc.read().decode("utf-8", errors="replace")
            try: result = json.loads(raw)
            except json.JSONDecodeError: result = None
            detail = f" {_api_error_detail(result)}" if _api_error_detail(result) else ""
            raise InternalApiError(f"internal API HTTP {exc.code}{detail} at POST {path}", status=exc.code, path=path, transient=exc.code >= 500 or exc.code == 429, payload=result) from exc
        except (URLError, TimeoutError, OSError) as exc:
            raise InternalApiError(f"internal API network failure at POST {path}", path=path) from exc
        if status >= 400:
            detail = f" {_api_error_detail(result)}" if _api_error_detail(result) else ""
            raise InternalApiError(f"internal API HTTP {status}{detail} at POST {path}", status=status, path=path, transient=status >= 500 or status == 429, payload=result)
        if not isinstance(result, dict):
            raise InternalApiError(f"internal API returned invalid JSON at POST {path}", path=path, transient=False)
        return result

    def claim(self, job_id: str, organization_id: str) -> JobContext:
        result = self.request(f"/internal/finder/jobs/{job_id}/claim", {"organizationId": organization_id})
        return JobContext(job_id, organization_id, str(result.get("state", "UNKNOWN")), result.get("search") if isinstance(result.get("search"), dict) else None, result.get("mode") if isinstance(result.get("mode"), str) else None)

    def batch(self, job_id: str, organization_id: str, candidates: list[dict[str, Any]], summary: dict[str, Any]) -> dict[str, Any]:
        return self.request(f"/internal/finder/jobs/{job_id}/batch", {"organizationId": organization_id, "candidates": candidates, "summary": summary})

    def complete(self, job_id: str, organization_id: str, summary: dict[str, Any]) -> dict[str, Any]:
        return self.request(f"/internal/finder/jobs/{job_id}/complete", {"organizationId": organization_id, "summary": summary})

    def fail(self, job_id: str, organization_id: str, message: str, *, retryable: bool) -> dict[str, Any]:
        return self.request(f"/internal/finder/jobs/{job_id}/fail", {"organizationId": organization_id, "message": message[:500], "retryable": retryable})
