"""Safe local CLI for a small Finder dry-run."""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from pathlib import Path

from .browser import BrowserSettings, GoogleMapsBrowser
from .config import DRY_RUN_MAX_LIMIT, SUPPORTED_CATEGORIES, SearchConfig
from .core import discover
from .doctor import run_doctor
from .export import write_jsonl


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="finder", description="Local Google Maps Finder dry-run")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("doctor", help="check the local Playwright/Chromium runtime")
    runner = sub.add_parser("runner", help="run the external Finder integration")
    runner_sub = runner.add_subparsers(dest="runner_command", required=True)
    pull = runner_sub.add_parser("pull-once", help="pull and process at most one Finder job")
    pull.add_argument("--headed", action="store_true", help="run Chromium visibly")
    dry = sub.add_parser("dry-run", help="discover a small number of candidates locally")
    dry.add_argument("--category", required=True, choices=SUPPORTED_CATEGORIES)
    dry.add_argument("--location", required=True)
    dry.add_argument("--limit", type=int, default=10)
    dry.add_argument("--output", type=Path, default=Path("tmp/finder-dry-run.jsonl"))
    mode = dry.add_mutually_exclusive_group()
    mode.add_argument("--headed", action="store_true", help="run Chromium in a visible window")
    mode.add_argument("--headless", action="store_true", help="run Chromium without a visible window (default)")
    return parser


def run_dry_run(args: argparse.Namespace) -> int:
    if args.limit > DRY_RUN_MAX_LIMIT:
        raise SystemExit(f"dry-run limit cannot exceed {DRY_RUN_MAX_LIMIT}")
    config = SearchConfig(args.category, args.location, args.limit)
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise SystemExit("Playwright is required. Install dependencies and run: playwright install chromium") from exc

    with sync_playwright() as playwright:
        headed = bool(args.headed)
        browser = playwright.chromium.launch(headless=not headed, timeout=15_000)
        try:
            context = browser.new_context(locale="es-AR", viewport=None)
            context.set_default_timeout(15_000)
            page = context.new_page()
            report = discover(config, GoogleMapsBrowser(page, BrowserSettings(headless=not headed)))
        finally:
            browser.close()

    write_jsonl(args.output, report.unique_candidates)
    print("Finder dry run")
    print(f"Solicitados: {report.requested}")
    print(f"Candidatos vistos: {report.candidates_seen}")
    print(f"Únicos: {len(report.unique_candidates)}")
    print(f"Duplicados locales: {report.duplicates_local}")
    print(f"Errores: {report.errors}")
    print(f"Bloqueado: {'sí' if report.blocked else 'no'}")
    print(f"Duración: {report.duration_seconds:.1f}s")
    print(f"JSONL: {args.output}")
    if report.failures:
        print(json.dumps([asdict(failure) for failure in report.failures], ensure_ascii=False))
    return 0 if not report.blocked else 2


def main() -> int:
    args = build_parser().parse_args()
    if args.command == "doctor":
        return 0 if run_doctor().ok else 1
    if args.command == "dry-run":
        return run_dry_run(args)
    if args.command == "runner" and args.runner_command == "pull-once":
        from .runner.runner import build_runner
        return 0 if build_runner(headed=args.headed).pull_once() >= 0 else 1
    return 2
