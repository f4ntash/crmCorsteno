"""Optional local exports; never required by Finder core."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

from .models import FinderCandidate


def write_jsonl(path: Path, candidates: Iterable[FinderCandidate]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for candidate in candidates:
            handle.write(json.dumps(candidate.to_dict(), ensure_ascii=False, sort_keys=True) + "\n")


def write_excel(path: Path, candidates: Iterable[FinderCandidate]) -> None:
    try:
        import pandas as pd
    except ImportError as exc:
        raise RuntimeError("Excel export requires pandas and openpyxl") from exc
    rows = [candidate.to_dict() for candidate in candidates]
    for row in rows:
        context = row.pop("context", None) or {}
        row["search_category"] = context.get("search_category")
        row["search_location"] = context.get("search_location")
        row["discovered_at"] = context.get("discovered_at")
    path.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(rows).to_excel(path, index=False, sheet_name="FinderCandidates")
