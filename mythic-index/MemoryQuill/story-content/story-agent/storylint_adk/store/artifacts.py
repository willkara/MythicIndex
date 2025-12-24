from __future__ import annotations

import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict

from ..parser.scene_parser import Chapter


def new_run_id() -> str:
    return datetime.utcnow().strftime("%Y%m%d-%H%M%S")


def ensure_run_dir(root: Path, run_id: str) -> Path:
    run_path = root / run_id
    (run_path / "chapter").mkdir(parents=True, exist_ok=True)
    (run_path / "adjacent").mkdir(parents=True, exist_ok=True)
    (run_path / "arc").mkdir(parents=True, exist_ok=True)
    (run_path / "final").mkdir(parents=True, exist_ok=True)
    return run_path


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=True))
    tmp.replace(path)


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text)
    tmp.replace(path)


def artifact_exists(path: Path) -> bool:
    return path.exists()


def build_index(chapters: list[Chapter]) -> Dict[str, Any]:
    chapter_items = []
    for chapter in chapters:
        chapter_items.append(
            {
                "slug": chapter.slug,
                "title": chapter.title,
                "path": str(chapter.path),
                "scenes": [
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
                    for scene in chapter.scenes
                ],
            }
        )

    return {
        "chapters": chapter_items,
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


def make_job_id() -> str:
    return uuid.uuid4().hex
