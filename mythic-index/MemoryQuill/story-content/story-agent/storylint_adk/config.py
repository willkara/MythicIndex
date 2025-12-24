from __future__ import annotations

from pathlib import Path
from typing import Optional

import yaml
from pydantic import BaseModel, Field, model_validator


class PromptConfig(BaseModel):
    max_scene_chars: int = 4000
    max_paragraphs: int = 60


class ConcurrencyConfig(BaseModel):
    chapter_audit: int = 6
    adjacent: int = 6
    arc: int = 3


class ModelConfig(BaseModel):
    orchestrator: str = "gemini-3-flash-preview"
    chapter_audit: str = "gemini-3-flash-preview"
    adjacent_flow: str = "gemini-3-flash-preview"
    arc_window: str = "gemini-3-pro-preview"
    synthesis: str = "gemini-3-pro-preview"


class StorylintConfig(BaseModel):
    config_path: Optional[Path] = Field(default=None, exclude=True)

    project_root: Optional[Path] = None
    chapters_dir: Path
    characters_dir: Path
    locations_dir: Path
    images_dir: Optional[Path] = None
    runs_dir: Path = Path("runs")

    chapter_filename: str = "content.md"
    scene_start: str = "<!-- SCENE-START"
    scene_end: str = "<!-- SCENE-END"
    imagery_filenames: list[str] = Field(default_factory=lambda: ["imagery.yaml", "chapter-imagery.yaml"])

    canon_snapshot_chars: int = 1200
    prompt: PromptConfig = Field(default_factory=PromptConfig)
    concurrency: ConcurrencyConfig = Field(default_factory=ConcurrencyConfig)
    models: ModelConfig = Field(default_factory=ModelConfig)

    @model_validator(mode="after")
    def _resolve_paths(self) -> "StorylintConfig":
        base = self.project_root
        if base is None:
            if self.config_path:
                base = self.config_path.parent
            else:
                base = Path.cwd()
        self.project_root = base.resolve()

        self.chapters_dir = _resolve_path(self.chapters_dir, self.project_root)
        self.characters_dir = _resolve_path(self.characters_dir, self.project_root)
        self.locations_dir = _resolve_path(self.locations_dir, self.project_root)
        if self.images_dir is not None:
            self.images_dir = _resolve_path(self.images_dir, self.project_root)
        self.runs_dir = _resolve_path(self.runs_dir, self.project_root)
        return self


def _resolve_path(path: Path, base: Path) -> Path:
    if path.is_absolute():
        return path
    return (base / path).resolve()


def find_config(start_dir: Path, filename: str = "storylint.yaml") -> Optional[Path]:
    current = start_dir.resolve()
    for parent in [current, *current.parents]:
        candidate = parent / filename
        if candidate.exists():
            return candidate
    return None


def load_config(config_path: Optional[Path] = None, start_dir: Optional[Path] = None) -> StorylintConfig:
    if config_path is None:
        start_dir = start_dir or Path.cwd()
        config_path = find_config(start_dir)
        if config_path is None:
            raise FileNotFoundError("storylint.yaml not found. Provide --config or run storylint init.")

    data = yaml.safe_load(config_path.read_text()) or {}
    data["config_path"] = config_path
    return StorylintConfig(**data)


def write_config(config: StorylintConfig, path: Path) -> None:
    payload = config.model_dump(mode="json", exclude={"config_path"})
    path.write_text(yaml.safe_dump(payload, sort_keys=False))
