from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import List

from ..config import StorylintConfig
from ..tools.repo_tools import discover_chapters


@dataclass
class DoctorResult:
    ok: bool
    messages: List[str]
    warnings: List[str]


def run_doctor(cfg: StorylintConfig) -> DoctorResult:
    messages: List[str] = []
    warnings: List[str] = []
    ok = True

    if not cfg.project_root or not cfg.project_root.exists():
        ok = False
        warnings.append(f"Project root not found: {cfg.project_root}")
    else:
        messages.append(f"Project root: {cfg.project_root}")

    for label, path in [
        ("chapters", cfg.chapters_dir),
        ("characters", cfg.characters_dir),
        ("locations", cfg.locations_dir),
    ]:
        if not path.exists():
            ok = False
            warnings.append(f"Missing {label} directory: {path}")
        else:
            messages.append(f"{label.title()} directory: {path}")

    if cfg.images_dir:
        if cfg.images_dir.exists():
            messages.append(f"Images directory: {cfg.images_dir}")
        else:
            warnings.append(f"Images directory not found: {cfg.images_dir}")

    chapters = discover_chapters(cfg)
    if not chapters:
        ok = False
        warnings.append("No chapter content.md files found.")
    else:
        messages.append(f"Chapters found: {len(chapters)}")
        messages.append(f"Sample chapter: {chapters[0]}")

    return DoctorResult(ok=ok, messages=messages, warnings=warnings)
