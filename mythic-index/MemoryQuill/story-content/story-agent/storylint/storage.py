from __future__ import annotations

import json
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict

from .parser import Chapter


def new_run_id() -> str:
    return datetime.utcnow().strftime("%Y%m%d-%H%M%S")


def create_run_dir(output_dir: Path, run_id: str) -> Path:
    run_path = output_dir / run_id
    (run_path / "chapter").mkdir(parents=True, exist_ok=True)
    (run_path / "final").mkdir(parents=True, exist_ok=True)
    return run_path


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=True))


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def build_index(chapter: Chapter) -> Dict[str, Any]:
    scenes = []
    characters = set()
    locations = set()
    for scene in chapter.scenes:
        characters.update(scene.meta.characters)
        if scene.meta.location:
            locations.add(scene.meta.location)
        scenes.append(
            {
                "scene_id": scene.meta.id,
                "title": scene.meta.title,
                "location": scene.meta.location,
                "characters": scene.meta.characters,
                "tags": scene.meta.tags,
                "images": scene.meta.images,
                "line_range": [scene.start_line, scene.end_line],
                "paragraphs": len(scene.paragraphs),
                "anchor": f"{chapter.slug}:{scene.meta.id}",
            }
        )

    return {
        "chapter": {"slug": chapter.slug, "title": chapter.title, "path": str(chapter.path)},
        "slugs": {
            "characters": sorted(characters),
            "locations": sorted(locations),
        },
        "scenes": scenes,
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }
