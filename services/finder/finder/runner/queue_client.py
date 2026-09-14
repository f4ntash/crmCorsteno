"""Cloudflare Queues HTTP pull client with explicit body decoding."""

from __future__ import annotations

import base64
import json
import os
from dataclasses import dataclass
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class QueueClientError(RuntimeError):
    def __init__(self, message: str, *, transient: bool = True) -> None:
        super().__init__(message)
        self.transient = transient


@dataclass(frozen=True, slots=True)
class PulledMessage:
    message_id: str
    lease_id: str
    attempts: int
    payload: dict[str, Any]


def decode_queue_body(body: Any, content_type: str | None = None) -> Any:
    """Decode Cloudflare pull bodies while supporting current and legacy formats."""
    normalized = (content_type or "").strip().lower().replace("_", "-")
    if isinstance(body, (dict, list)):
        return body

    if normalized == "v8":
        raise ValueError("unsupported queue body content type: v8")

    if normalized == "bytes":
        if not isinstance(body, (str, bytes, bytearray)):
            raise ValueError("queue body must be base64 text or bytes for content type bytes")
        try:
            raw = base64.b64decode(body, validate=True)
        except (ValueError, TypeError) as exc:
            raise ValueError("invalid base64 queue body") from exc
        return raw

    if not isinstance(body, str):
        if isinstance(body, (bytes, bytearray)):
            try:
                body = bytes(body).decode("utf-8")
            except UnicodeDecodeError as exc:
                raise ValueError("queue body is not valid UTF-8 text") from exc
        else:
            raise ValueError("queue body must be text, JSON, or bytes-compatible")

    if normalized in {"json", "application/json"}:
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            try:
                raw = base64.b64decode(body, validate=True)
                return json.loads(raw.decode("utf-8"))
            except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise ValueError("queue JSON body is neither JSON nor valid base64 JSON") from exc

    if normalized in {"text", "", "text/plain"}:
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            return body

    raise ValueError(f"unsupported queue body content type: {content_type}")


def _content_type(metadata: dict[str, Any]) -> str | None:
    """Read Cloudflare's content-type metadata without depending on casing."""
    supported = {"cf-content-type", "content-type"}
    for key, value in metadata.items():
        if isinstance(key, str) and key.strip().lower().replace("_", "-") in supported:
            return str(value) if value is not None else None
    return None


def parse_pull_response(value: dict[str, Any]) -> list[PulledMessage]:
    result = value.get("result") if isinstance(value.get("result"), dict) else value
    raw_messages = result.get("messages", []) if isinstance(result, dict) else []
    if not isinstance(raw_messages, list):
        raise ValueError("queue response messages must be an array")
    messages: list[PulledMessage] = []
    for raw in raw_messages:
        if not isinstance(raw, dict) or not isinstance(raw.get("id"), str) or not isinstance(raw.get("lease_id"), str):
            raise ValueError("queue message is missing id or lease_id")
        metadata = raw.get("metadata") if isinstance(raw.get("metadata"), dict) else {}
        content_type = _content_type(metadata)
        payload = decode_queue_body(raw.get("body"), str(content_type) if content_type else None)
        if not isinstance(payload, dict):
            raise ValueError("queue message payload must be an object")
        messages.append(PulledMessage(str(raw["id"]), str(raw["lease_id"]), int(raw.get("attempts", 0)), payload))
    return messages


class QueueClient:
    def __init__(self, account_id: str, queue_id: str, token: str, *, transport: Callable[[Request], Any] | None = None) -> None:
        self.base_url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/queues/{queue_id}"
        self.token = token
        self.transport = transport or urlopen

    def _request(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        request = Request(f"{self.base_url}/{path}", data=json.dumps(payload).encode(), method="POST", headers={"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"})
        try:
            with self.transport(request) as response:
                data = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            raise QueueClientError(f"Cloudflare Queue HTTP {exc.code}", transient=exc.code >= 500 or exc.code == 429) from exc
        except (URLError, TimeoutError, OSError) as exc:
            raise QueueClientError("Cloudflare Queue network failure") from exc
        if not isinstance(data, dict) or data.get("success") is False:
            raise QueueClientError("Cloudflare Queue returned an unsuccessful response")
        return data

    def pull_once(self, *, batch_size: int = 1, visibility_timeout_ms: int = 120_000) -> list[PulledMessage]:
        return parse_pull_response(self._request("messages/pull", {"batch_size": batch_size, "visibility_timeout_ms": visibility_timeout_ms}))

    def ack(self, lease_id: str) -> None:
        self._request("messages/ack", {"acks": [{"lease_id": lease_id}], "retries": []})

    def retry(self, lease_id: str, *, delay_seconds: int = 30) -> None:
        self._request("messages/ack", {"acks": [], "retries": [{"lease_id": lease_id, "delay_seconds": delay_seconds}]})
