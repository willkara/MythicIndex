from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List

from .config import StoryLintConfig
from .utils import strip_markdown, truncate_text


@dataclass
class CanonSnapshot:
    slug: str
    kind: str
    exists: bool
    path: Path
    source_file: Path | None
    text: str


def load_character_snapshots(slugs: Iterable[str], config: StoryLintConfig) -> Dict[str, CanonSnapshot]:
    return _load_snapshots(slugs, "character", config.characters_dir, _character_priorities(), config)


def load_location_snapshots(slugs: Iterable[str], config: StoryLintConfig) -> Dict[str, CanonSnapshot]:
    return _load_snapshots(slugs, "location", config.locations_dir, _location_priorities(), config)


def _load_snapshots(
    slugs: Iterable[str],
    kind: str,
    base_dir: Path,
    priorities: List[str],
    config: StoryLintConfig,
) -> Dict[str, CanonSnapshot]:
    snapshots: Dict[str, CanonSnapshot] = {}
    for slug in sorted(set(slugs)):
        if not slug:
            continue
        folder = base_dir / slug
        if not folder.exists():
            snapshots[slug] = CanonSnapshot(
                slug=slug,
                kind=kind,
                exists=False,
                path=folder,
                source_file=None,
                text="",
            )
            continue
        source = _pick_source_file(folder, priorities)
        if source is None:
            snapshots[slug] = CanonSnapshot(
                slug=slug,
                kind=kind,
                exists=True,
                path=folder,
                source_file=None,
                text="",
            )
            continue
        raw = source.read_text()
        cleaned = truncate_text(strip_markdown(raw), config.canon_snapshot_chars)
        snapshots[slug] = CanonSnapshot(
            slug=slug,
            kind=kind,
            exists=True,
            path=folder,
            source_file=source,
            text=cleaned,
        )
    return snapshots


def _pick_source_file(folder: Path, priorities: List[str]) -> Path | None:
    for name in priorities:
        candidate = folder / name
        if candidate.exists():
            return candidate
    md_files = sorted(folder.glob("*.md"))
    if md_files:
        return md_files[0]
    return None


def _character_priorities() -> List[str]:
    return ["profile.md", "overview.md", "background.md"]


def _location_priorities() -> List[str]:
    return ["overview.md", "description.md", "inhabitants.md"]
