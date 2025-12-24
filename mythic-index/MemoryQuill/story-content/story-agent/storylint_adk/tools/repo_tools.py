from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml
import re

from ..config import StorylintConfig
from ..models import Issue
from ..parser.scene_parser import Chapter


@dataclass
class RepoMap:
    chapters_dir: Optional[Path]
    chapter_sample: Optional[Path]
    characters_dir: Optional[Path]
    character_sample: Optional[Path]
    locations_dir: Optional[Path]
    location_sample: Optional[Path]
    imagery_sample: Optional[Path]
    images_dir_candidates: List[Path]


def discover_repo_map(root: Path, scene_marker: str = "SCENE-START") -> RepoMap:
    chapter_files = _find_chapter_files(root, scene_marker)
    chapter_sample = chapter_files[0] if chapter_files else None
    chapters_dir = _infer_parent_dir(chapter_files, expected_child="content.md")

    character_files = list(root.rglob("characters/**/profile.md"))
    character_sample = character_files[0] if character_files else None
    characters_dir = _infer_parent_dir(character_files, expected_child=None, parent_name="characters")

    location_files = list(root.rglob("locations/**/overview.md"))
    location_sample = location_files[0] if location_files else None
    locations_dir = _infer_parent_dir(location_files, expected_child=None, parent_name="locations")

    imagery_files = list(root.rglob("imagery.yaml")) + list(root.rglob("chapter-imagery.yaml"))
    imagery_sample = imagery_files[0] if imagery_files else None

    images_dir_candidates = [path.parent for path in root.rglob("images") if path.is_dir()]

    return RepoMap(
        chapters_dir=chapters_dir,
        chapter_sample=chapter_sample,
        characters_dir=characters_dir,
        character_sample=character_sample,
        locations_dir=locations_dir,
        location_sample=location_sample,
        imagery_sample=imagery_sample,
        images_dir_candidates=images_dir_candidates,
    )


def _find_chapter_files(root: Path, scene_marker: str) -> List[Path]:
    candidates = []
    for md in root.rglob("*.md"):
        try:
            text = md.read_text()
        except Exception:
            continue
        if scene_marker in text:
            candidates.append(md)
    return candidates


def _infer_parent_dir(files: List[Path], expected_child: Optional[str], parent_name: Optional[str] = None) -> Optional[Path]:
    if not files:
        return None
    candidates = []
    for path in files:
        if expected_child and path.name != expected_child:
            continue
        if parent_name:
            if parent_name in path.parts:
                idx = path.parts.index(parent_name)
                candidates.append(Path(*path.parts[: idx + 1]))
            continue
        candidates.append(path.parent.parent if expected_child else path.parent)
    if not candidates:
        return None
    counter = Counter(str(c) for c in candidates)
    most_common = counter.most_common(1)[0][0]
    return Path(most_common)


def discover_chapters(config: StorylintConfig) -> List[Path]:
    chapter_files: List[Path] = []
    if config.chapters_dir.exists():
        for path in config.chapters_dir.rglob(config.chapter_filename):
            if path.is_file():
                chapter_files.append(path)
    return sorted(chapter_files, key=lambda p: p.parent.name)


def load_canon_snapshot(slug: str, base_dir: Path, max_chars: int) -> str:
    folder = base_dir / slug
    if not folder.exists():
        return ""
    candidates = sorted(folder.glob("*.md"))
    if not candidates:
        return ""
    raw = candidates[0].read_text()
    stripped = _strip_markdown(raw)
    return stripped[:max_chars]


def validate_slugs(chapter: Chapter, config: StorylintConfig) -> List[Issue]:
    findings: List[Issue] = []
    seen = set()

    for scene in chapter.scenes:
        for slug in scene.meta.characters:
            if not slug:
                continue
            key = ("character", slug)
            if key in seen:
                continue
            seen.add(key)
            path = config.characters_dir / slug
            if not path.exists():
                findings.append(
                    Issue(
                        type="slug",
                        severity="major",
                        location=f"{chapter.slug}:{scene.meta.id}",
                        explanation=f"Character slug '{slug}' not found in canonical directory.",
                        suggested_action="Add canonical docs or correct the slug.",
                        evidence_refs=[slug],
                    )
                )
            elif not list(path.glob("*.md")):
                findings.append(
                    Issue(
                        type="slug",
                        severity="moderate",
                        location=f"{chapter.slug}:{scene.meta.id}",
                        explanation=f"Character slug '{slug}' has no markdown canonical docs.",
                        suggested_action="Add at least one canonical markdown file.",
                        evidence_refs=[slug],
                    )
                )
        if scene.meta.location:
            slug = scene.meta.location
            key = ("location", slug)
            if key in seen:
                continue
            seen.add(key)
            path = config.locations_dir / slug
            if not path.exists():
                findings.append(
                    Issue(
                        type="slug",
                        severity="major",
                        location=f"{chapter.slug}:{scene.meta.id}",
                        explanation=f"Location slug '{slug}' not found in canonical directory.",
                        suggested_action="Add canonical docs or correct the slug.",
                        evidence_refs=[slug],
                    )
                )
            elif not list(path.glob("*.md")):
                findings.append(
                    Issue(
                        type="slug",
                        severity="moderate",
                        location=f"{chapter.slug}:{scene.meta.id}",
                        explanation=f"Location slug '{slug}' has no markdown canonical docs.",
                        suggested_action="Add at least one canonical markdown file.",
                        evidence_refs=[slug],
                    )
                )

    return findings


def validate_imagery(chapter: Chapter, config: StorylintConfig) -> List[Issue]:
    findings: List[Issue] = []
    for scene in chapter.scenes:
        for image in scene.meta.images:
            if not image:
                continue
            resolved = _resolve_image_path(image, chapter, config)
            if resolved is None or not resolved.exists():
                findings.append(
                    Issue(
                        type="imagery",
                        severity="moderate",
                        location=f"{chapter.slug}:{scene.meta.id}",
                        explanation=f"Image reference '{image}' not found on disk.",
                        suggested_action="Add the image file or update the scene metadata reference.",
                        evidence_refs=[image],
                    )
                )

    imagery_files = _find_imagery_files(chapter.path.parent, config.imagery_filenames)
    for imagery_file in imagery_files:
        data = _load_yaml(imagery_file)
        for image_path in _collect_generated_images(data):
            resolved = (config.project_root / image_path).resolve()
            if not resolved.exists():
                findings.append(
                    Issue(
                        type="imagery",
                        severity="minor",
                        location=f"{chapter.slug}:imagery.yaml",
                        explanation=f"Generated image path '{image_path}' not found on disk.",
                        suggested_action="Regenerate or remove the missing generated image entry.",
                        evidence_refs=[image_path],
                    )
                )

    return findings


def _find_imagery_files(folder: Path, names: List[str]) -> List[Path]:
    files = []
    for name in names:
        candidate = folder / name
        if candidate.exists():
            files.append(candidate)
    return files


def _resolve_image_path(image: str, chapter: Chapter, config: StorylintConfig) -> Optional[Path]:
    image_path = Path(image)
    if image_path.is_absolute():
        return image_path
    if "/" in image or "\\" in image:
        return (config.project_root / image_path).resolve()
    chapter_dir = chapter.path.parent
    candidates = [chapter_dir / image, chapter_dir / "images" / image]
    if config.images_dir:
        candidates.append(config.images_dir / chapter.slug / image)
        candidates.append(config.images_dir / chapter.slug / "images" / image)
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0] if candidates else None


def _load_yaml(path: Path) -> Dict[str, Any]:
    try:
        return yaml.safe_load(path.read_text()) or {}
    except Exception:
        return {}


def _collect_generated_images(node: Any) -> List[str]:
    results: List[str] = []
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "generated_images":
                results.extend(_extract_images_from_list(value))
            else:
                results.extend(_collect_generated_images(value))
    elif isinstance(node, list):
        for item in node:
            results.extend(_collect_generated_images(item))
    return results


def _extract_images_from_list(value: Any) -> List[str]:
    results: List[str] = []
    if isinstance(value, list):
        for item in value:
            if isinstance(item, str):
                results.append(item)
            elif isinstance(item, dict):
                for key in ["path", "file", "filename"]:
                    if key in item and isinstance(item[key], str):
                        results.append(item[key])
    return results


def _strip_markdown(text: str) -> str:
    text = re.sub(r"`{1,3}.*?`{1,3}", "", text, flags=re.DOTALL)
    text = re.sub(r"\[(.*?)\]\((.*?)\)", r"\1", text)
    text = re.sub(r"[#>*_~-]+", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()
