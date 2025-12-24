from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional


@dataclass
class ChapterPlan:
    slug: str
    path: Path


def sort_chapters(chapter_paths: List[Path]) -> List[Path]:
    return sorted(chapter_paths, key=lambda p: _slug_sort_key(p.parent.name))


def _slug_sort_key(slug: str) -> tuple:
    match = re.match(r"ch(\d+(?:\.\d+)?)", slug)
    if match:
        return (float(match.group(1)), slug)
    return (float("inf"), slug)


def slice_chapters(chapter_paths: List[Path], start: Optional[str], end: Optional[str]) -> List[Path]:
    if not chapter_paths:
        return []
    ordered = sort_chapters(chapter_paths)
    if not start and not end:
        return ordered

    slugs = [p.parent.name for p in ordered]
    start_idx = 0
    end_idx = len(slugs) - 1
    if start and start in slugs:
        start_idx = slugs.index(start)
    if end and end in slugs:
        end_idx = slugs.index(end)
    if start_idx > end_idx:
        start_idx, end_idx = end_idx, start_idx
    return ordered[start_idx : end_idx + 1]


def build_plan(chapter_paths: List[Path], start: Optional[str], end: Optional[str]) -> List[ChapterPlan]:
    selection = slice_chapters(chapter_paths, start, end)
    return [ChapterPlan(slug=path.parent.name, path=path) for path in selection]
