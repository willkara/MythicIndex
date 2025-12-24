from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict

import typer

from .canon import load_character_snapshots, load_location_snapshots
from .config import load_config
from .llm import LLMSettings, generate_with_retries, get_client
from .models import ChapterReport
from .parser import Chapter, parse_chapter
from .render import render_markdown, render_prompt
from .storage import build_index, create_run_dir, new_run_id, write_json, write_text
from .utils import truncate_text

app = typer.Typer(add_completion=False)


@app.command()
def audit(
    chapter: Path = typer.Option(..., "--chapter", exists=True, file_okay=True, dir_okay=False),
    config: Path | None = typer.Option(None, "--config", help="Path to storylint.yaml"),
    run_id: str | None = typer.Option(None, "--run-id", help="Override run id"),
    output_dir: Path | None = typer.Option(None, "--output-dir", help="Override output directory"),
    llm: str = typer.Option("mock", "--llm", help="LLM provider: mock|openai"),
    model: str = typer.Option("gpt-4o-mini", "--model", help="LLM model name"),
    no_md: bool = typer.Option(False, "--no-md", help="Skip Markdown report output"),
) -> None:
    cfg = load_config(config, start_dir=Path.cwd())
    chapter_path = chapter.resolve()

    parsed = parse_chapter(chapter_path, cfg)
    index = build_index(parsed)

    character_slugs = index["slugs"]["characters"]
    location_slugs = index["slugs"]["locations"]

    character_snapshots = load_character_snapshots(character_slugs, cfg)
    location_snapshots = load_location_snapshots(location_slugs, cfg)

    prompt = render_prompt(
        "chapter_audit.j2",
        {
            "chapter": _chapter_payload(parsed, cfg),
            "canon": {
                "characters": {k: v.text for k, v in character_snapshots.items()},
                "locations": {k: v.text for k, v in location_snapshots.items()},
            },
            "schema": ChapterReport.model_json_schema(),
        },
    )

    settings = LLMSettings(provider=llm, model=model)
    client = get_client(settings)
    raw = generate_with_retries(client, prompt, settings)
    report = _parse_report(raw)

    run_id = run_id or new_run_id()
    out_dir = (output_dir or cfg.output_dir).resolve()
    run_dir = create_run_dir(out_dir, run_id)

    write_json(run_dir / "config.json", cfg.model_dump(mode="json"))
    write_json(run_dir / "index.json", index)
    write_json(run_dir / "chapter" / f"{parsed.slug}.report.json", report.model_dump(mode="json"))

    if not no_md:
        md = render_markdown(
            "chapter_report.md.j2",
            {"chapter": parsed, "report": report.model_dump(mode="json")},
        )
        write_text(run_dir / "chapter" / f"{parsed.slug}.report.md", md)

    typer.echo(f"Report written to {run_dir}")


def _chapter_payload(chapter: Chapter, cfg) -> Dict[str, Any]:
    scenes = []
    for scene in chapter.scenes:
        paragraphs = []
        for paragraph in scene.paragraphs[: cfg.prompt.max_paragraphs]:
            paragraphs.append(
                {
                    "idx": paragraph.idx,
                    "location": f"{chapter.slug}:{scene.meta.id}:p{paragraph.idx}",
                    "text": truncate_text(paragraph.text, cfg.prompt.max_scene_chars),
                }
            )
        scenes.append(
            {
                "id": scene.meta.id,
                "title": scene.meta.title,
                "when": scene.meta.when,
                "location": scene.meta.location,
                "characters": scene.meta.characters,
                "tags": scene.meta.tags,
                "images": scene.meta.images,
                "paragraphs": paragraphs,
            }
        )

    return {
        "slug": chapter.slug,
        "title": chapter.title,
        "path": str(chapter.path),
        "scenes": scenes,
    }


def _parse_report(raw: str) -> ChapterReport:
    json_text = _extract_json(raw)
    data = json.loads(json_text)
    return ChapterReport.model_validate(data)


def _extract_json(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("{") and cleaned.endswith("}"):
        return cleaned
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        return match.group(0)
    raise ValueError("No JSON object found in model output.")
