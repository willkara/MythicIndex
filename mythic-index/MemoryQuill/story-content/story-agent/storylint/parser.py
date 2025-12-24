from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import json
import re
from typing import Any, Dict, List, Optional, Tuple

from .config import StoryLintConfig


@dataclass
class Paragraph:
    idx: int
    text: str
    start_line: int
    end_line: int


@dataclass
class SceneMeta:
    id: str
    title: str
    when: Optional[str]
    location: Optional[str]
    characters: List[str]
    tags: List[str]
    images: List[str]
    raw: Dict[str, Any]
    raw_text: str


@dataclass
class Scene:
    meta: SceneMeta
    text: str
    paragraphs: List[Paragraph]
    start_line: int
    end_line: int
    meta_start_line: int
    meta_end_line: int


@dataclass
class Chapter:
    slug: str
    title: str
    path: Path
    scenes: List[Scene]


def parse_chapter(path: Path, config: StoryLintConfig) -> Chapter:
    lines = path.read_text().splitlines()
    slug = path.parent.name
    title = _extract_title(lines)
    scenes: List[Scene] = []

    i = 0
    while i < len(lines):
        line = lines[i]
        if config.scene_start in line:
            meta_start_line = i + 1
            meta_lines = [line]
            i += 1
            while i < len(lines) and "-->" not in lines[i]:
                meta_lines.append(lines[i])
                i += 1
            if i < len(lines):
                meta_lines.append(lines[i])
            meta_end_line = i + 1
            meta_block = "\n".join(meta_lines)
            meta_dict = parse_scene_meta(meta_block)

            scene_lines: List[Tuple[int, str]] = []
            i += 1
            scene_start_line = i + 1
            while i < len(lines) and config.scene_end not in lines[i]:
                scene_lines.append((i + 1, lines[i]))
                i += 1
            if i >= len(lines):
                raise ValueError(f"Missing SCENE-END for scene starting at line {meta_start_line} in {path}")
            if scene_lines:
                scene_end_line = scene_lines[-1][0]
            else:
                scene_end_line = scene_start_line

            scene_text = "\n".join([line_text for _, line_text in scene_lines]).strip()
            paragraphs = _split_paragraphs(scene_lines)

            scene = Scene(
                meta=_build_scene_meta(meta_dict, meta_block),
                text=scene_text,
                paragraphs=paragraphs,
                start_line=scene_start_line,
                end_line=scene_end_line,
                meta_start_line=meta_start_line,
                meta_end_line=meta_end_line,
            )
            scenes.append(scene)
        i += 1

    return Chapter(slug=slug, title=title, path=path, scenes=scenes)


def parse_scene_meta(meta_block: str) -> Dict[str, Any]:
    content = meta_block
    content = content.replace("<!--", "").replace("-->", "")
    content = content.replace("SCENE-START", "")
    content = re.sub(r"\s+", " ", content).strip()

    result: Dict[str, Any] = {}
    i = 0
    while i < len(content):
        if content[i].isspace():
            i += 1
            continue
        key_match = re.match(r"[A-Za-z_][A-Za-z0-9_-]*", content[i:])
        if not key_match:
            i += 1
            continue
        key = key_match.group(0)
        i += len(key)
        if i >= len(content) or content[i] != ":":
            i += 1
            continue
        i += 1
        while i < len(content) and content[i].isspace():
            i += 1
        if i >= len(content):
            break
        value, i = _parse_value(content, i)
        result[key] = value
    return result


def _parse_value(content: str, start: int) -> Tuple[Any, int]:
    if content[start] == '"':
        end = start + 1
        while end < len(content) and content[end] != '"':
            end += 1
        value = content[start + 1 : end]
        return value, end + 1
    if content[start] == '[':
        end = start + 1
        depth = 1
        while end < len(content) and depth > 0:
            if content[end] == '[':
                depth += 1
            elif content[end] == ']':
                depth -= 1
            end += 1
        raw = content[start:end]
        try:
            value = json.loads(raw)
        except json.JSONDecodeError:
            value = raw
        return value, end

    end = start
    while end < len(content) and not content[end].isspace():
        end += 1
    return content[start:end], end


def _build_scene_meta(meta_dict: Dict[str, Any], meta_block: str) -> SceneMeta:
    def _coerce_list(val: Any) -> List[str]:
        if val is None:
            return []
        if isinstance(val, list):
            return [str(item) for item in val]
        return [str(val)]

    scene_id = str(meta_dict.get("id", ""))
    title = str(meta_dict.get("title", ""))

    return SceneMeta(
        id=scene_id,
        title=title,
        when=meta_dict.get("when"),
        location=meta_dict.get("location"),
        characters=_coerce_list(meta_dict.get("characters")),
        tags=_coerce_list(meta_dict.get("tags")),
        images=_coerce_list(meta_dict.get("images")),
        raw=meta_dict,
        raw_text=meta_block,
    )


def _split_paragraphs(scene_lines: List[Tuple[int, str]]) -> List[Paragraph]:
    paragraphs: List[Paragraph] = []
    buffer: List[str] = []
    start_line = None
    last_line = None
    idx = 1

    for line_no, line_text in scene_lines:
        if line_text.strip() == "":
            if buffer:
                paragraphs.append(
                    Paragraph(
                        idx=idx,
                        text="\n".join(buffer).strip(),
                        start_line=start_line or line_no,
                        end_line=last_line or line_no,
                    )
                )
                idx += 1
                buffer = []
                start_line = None
                last_line = None
            continue
        if start_line is None:
            start_line = line_no
        buffer.append(line_text)
        last_line = line_no

    if buffer:
        paragraphs.append(
            Paragraph(
                idx=idx,
                text="\n".join(buffer).strip(),
                start_line=start_line or (last_line or 1),
                end_line=last_line or (start_line or 1),
            )
        )

    return paragraphs


def _extract_title(lines: List[str]) -> str:
    for line in lines:
        if line.startswith("# "):
            return line[2:].strip()
    return ""
