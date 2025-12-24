from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from ..agents.adjacent_flow import build_adjacent_flow_agent
from ..agents.arc_analyst import build_arc_agent
from ..agents.chapter_auditor import build_chapter_audit_agent
from ..agents.synthesizer import build_synthesis_agent
from ..config import StorylintConfig, load_config
from ..models import ActionPlan, AdjacentReport, ArcReport, ChapterReport, DashboardSummary
from ..parser.scene_parser import Chapter, parse_chapter
from ..parser.slug_index import build_slug_index
from ..store.artifacts import ensure_run_dir, new_run_id, write_json, write_text, artifact_exists, build_index
from ..store.render_md import render_markdown
from ..tools.repo_tools import (
    discover_chapters,
    load_canon_snapshot,
    validate_imagery,
    validate_slugs,
)
from .adk_client import run_agent_prompt
from .planning import build_plan
from .prompting import render_prompt
from .status import StatusReporter


async def run_pipeline(
    start: Optional[str],
    end: Optional[str],
    mode: str,
    window: int,
    run_id: Optional[str],
    force: bool,
    config_path: Optional[str],
    model: str | None = None,
) -> Path:
    cfg = load_config(Path(config_path) if config_path else None, start_dir=Path.cwd())
    chapter_files = discover_chapters(cfg)
    plan = build_plan(chapter_files, start, end)
    if not plan:
        raise RuntimeError("No chapters found for the requested range.")
    mode = (mode or "full").lower()
    chapter_model = model or cfg.models.chapter_audit
    adjacent_model = model or cfg.models.adjacent_flow
    arc_model = model or cfg.models.arc_window
    synthesis_model = model or cfg.models.synthesis

    parsed_chapters: List[Chapter] = [parse_chapter(item.path, cfg) for item in plan]
    run_id = run_id or new_run_id()
    run_dir = ensure_run_dir(cfg.runs_dir, run_id)

    write_json(run_dir / "config.json", cfg.model_dump(mode="json", exclude={"config_path"}))
    write_json(run_dir / "index.json", build_index(parsed_chapters))

    reporter = StatusReporter()
    error_count = 0
    chapter_sem = asyncio.Semaphore(cfg.concurrency.chapter_audit)
    adjacent_sem = asyncio.Semaphore(cfg.concurrency.adjacent)
    arc_sem = asyncio.Semaphore(cfg.concurrency.arc)

    with reporter.display():
        reporter.log("[bold]Storylint run started[/bold]")
        chapter_task = reporter.add_task("Chapter audits", total=len(parsed_chapters))

        async def _run_chapter(chapter: Chapter) -> None:
            nonlocal error_count
            async with chapter_sem:
                try:
                    await run_chapter_audit(chapter, cfg, run_dir, model=chapter_model, force=force)
                except Exception as exc:
                    error_count += 1
                    reporter.record_error(f"chapter:{chapter.slug}", exc)
                reporter.advance(chapter_task)

        await asyncio.gather(*[_run_chapter(chapter) for chapter in parsed_chapters])

        run_adjacent = mode in {"full", "all", "adjacent", "adjacent-only", "flow"}
        run_arc = mode in {"full", "all", "arc", "arc-only"}
        adjacent_pairs: list[tuple[Chapter, Chapter]] = []
        windows: list[list[Chapter]] = []
        if run_adjacent and len(parsed_chapters) > 1:
            adjacent_pairs = list(zip(parsed_chapters[:-1], parsed_chapters[1:]))
            adjacent_task = reporter.add_task("Adjacent flow", total=len(adjacent_pairs))

            async def _run_adjacent(left: Chapter, right: Chapter) -> None:
                nonlocal error_count
                async with adjacent_sem:
                    try:
                        await run_adjacent_flow(
                            left,
                            right,
                            cfg,
                            run_dir,
                            model=adjacent_model,
                            force=force,
                        )
                    except Exception as exc:
                        error_count += 1
                        reporter.record_error(f"adjacent:{left.slug}->{right.slug}", exc)
                    reporter.advance(adjacent_task)

            await asyncio.gather(*[_run_adjacent(left, right) for left, right in adjacent_pairs])

        if run_arc and len(parsed_chapters) >= window:
            windows = _build_windows(parsed_chapters, window)
            arc_task = reporter.add_task("Arc windows", total=len(windows))

            async def _run_arc(window_chapters: list[Chapter]) -> None:
                nonlocal error_count
                async with arc_sem:
                    try:
                        await run_arc_window(
                            window_chapters,
                            cfg,
                            run_dir,
                            model=arc_model,
                            force=force,
                        )
                    except Exception as exc:
                        error_count += 1
                        window_slug = f"{window_chapters[0].slug}-{window_chapters[-1].slug}"
                        reporter.record_error(f"arc:{window_slug}", exc)
                    reporter.advance(arc_task)

            await asyncio.gather(*[_run_arc(window_set) for window_set in windows])

        try:
            await run_synthesis(run_dir, model=synthesis_model, force=force)
        except Exception as exc:
            error_count += 1
            reporter.record_error("synthesis", exc)

        await write_dashboard_summary(
            run_dir=run_dir,
            run_id=run_id,
            mode=mode,
            window=window,
            chapters=parsed_chapters,
            adjacent_pairs=adjacent_pairs if run_adjacent else [],
            arc_windows=windows if run_arc else [],
            error_count=error_count,
            recent_errors=reporter.recent_errors() if hasattr(reporter, "recent_errors") else [],
        )

        if error_count:
            reporter.log(f"[bold yellow]Storylint completed with {error_count} error(s).[/bold yellow]")
        else:
            reporter.log("[bold green]Storylint run completed[/bold green]")
    if error_count:
        raise RuntimeError(f"Storylint completed with {error_count} error(s). See error panel for details.")
    return run_dir


def run_pipeline_sync(
    start: Optional[str],
    end: Optional[str],
    mode: str,
    window: int,
    run_id: Optional[str],
    force: bool,
    config_path: Optional[str],
    model: str | None = None,
) -> Path:
    return asyncio.run(
        run_pipeline(
            start=start,
            end=end,
            mode=mode,
            window=window,
            run_id=run_id,
            force=force,
            config_path=config_path,
            model=model,
        )
    )


async def run_chapter_audit(
    chapter: Chapter,
    cfg: StorylintConfig,
    run_dir: Path,
    model: str,
    force: bool,
) -> None:
    report_path = run_dir / "chapter" / f"{chapter.slug}.report.json"
    md_path = run_dir / "chapter" / f"{chapter.slug}.report.md"
    if artifact_exists(report_path) and not force:
        return

    slug_index = build_slug_index(chapter)
    canon_payload = {
        "characters": {
            slug: load_canon_snapshot(slug, cfg.characters_dir, cfg.canon_snapshot_chars)
            for slug in slug_index.characters
        },
        "locations": {
            slug: load_canon_snapshot(slug, cfg.locations_dir, cfg.canon_snapshot_chars)
            for slug in slug_index.locations
        },
    }

    integrity_findings = validate_slugs(chapter, cfg) + validate_imagery(chapter, cfg)

    prompt = render_prompt(
        "chapter_audit.j2",
        {
            "schema": ChapterReport.model_json_schema(),
            "chapter": _chapter_payload(chapter, cfg),
            "canon": canon_payload,
        },
    )

    agent = build_chapter_audit_agent(model)
    report = await _generate_report(
        agent,
        prompt,
        ChapterReport,
        retries=2,
        defaults={"chapter_slug": chapter.slug, "integrity_findings": []},
    )

    report = report.model_copy(
        update={
            "chapter_slug": chapter.slug,
            "integrity_findings": integrity_findings,
        }
    )

    write_json(report_path, report.model_dump(mode="json"))
    md = render_markdown("chapter_report.md.j2", {"report": report.model_dump(mode="json")})
    write_text(md_path, md)


async def run_adjacent_flow(
    left: Chapter,
    right: Chapter,
    cfg: StorylintConfig,
    run_dir: Path,
    model: str,
    force: bool,
) -> None:
    report_path = run_dir / "adjacent" / f"{left.slug}_{right.slug}.report.json"
    md_path = run_dir / "adjacent" / f"{left.slug}_{right.slug}.report.md"
    if artifact_exists(report_path) and not force:
        return

    left_payload = _chapter_payload(left, cfg)
    right_payload = _chapter_payload(right, cfg)

    canon_payload = _canon_payload_for_chapters([left, right], cfg)

    prompt = render_prompt(
        "adjacent_flow.j2",
        {
            "schema": AdjacentReport.model_json_schema(),
            "left": left_payload,
            "right": right_payload,
            "canon": canon_payload,
        },
    )

    agent = build_adjacent_flow_agent(model)
    report = await _generate_report(
        agent,
        prompt,
        AdjacentReport,
        retries=2,
        defaults={"left_slug": left.slug, "right_slug": right.slug},
    )

    write_json(report_path, report.model_dump(mode="json"))
    md = render_markdown("adjacent_report.md.j2", {"report": report.model_dump(mode="json")})
    write_text(md_path, md)


async def run_arc_window(
    window_chapters: list[Chapter],
    cfg: StorylintConfig,
    run_dir: Path,
    model: str,
    force: bool,
) -> None:
    if not window_chapters:
        return
    window_slug = f"{window_chapters[0].slug}-{window_chapters[-1].slug}"
    report_path = run_dir / "arc" / f"{window_slug}.report.json"
    md_path = run_dir / "arc" / f"{window_slug}.report.md"
    if artifact_exists(report_path) and not force:
        return

    window_payload = [_chapter_summary_payload(chapter, cfg) for chapter in window_chapters]
    canon_payload = _canon_payload_for_chapters(window_chapters, cfg)

    prompt = render_prompt(
        "arc_window.j2",
        {
            "schema": ArcReport.model_json_schema(),
            "window": window_payload,
            "canon": canon_payload,
        },
    )

    agent = build_arc_agent(model)
    report = await _generate_report(
        agent,
        prompt,
        ArcReport,
        retries=2,
        defaults={"window_slug": window_slug},
    )

    write_json(report_path, report.model_dump(mode="json"))
    md = render_markdown("arc_report.md.j2", {"report": report.model_dump(mode="json")})
    write_text(md_path, md)


async def run_synthesis(run_dir: Path, model: str, force: bool) -> None:
    report_dir = run_dir / "chapter"
    output_json = run_dir / "final" / "action-plan.json"
    output_md = run_dir / "final" / "action-plan.md"
    if artifact_exists(output_json) and not force:
        return

    reports = []
    for report_path in report_dir.glob("*.report.json"):
        try:
            reports.append(json.loads(report_path.read_text()))
        except Exception:
            continue

    prompt = render_prompt(
        "synthesis.j2",
        {
            "schema": ActionPlan.model_json_schema(),
            "reports": reports,
        },
    )

    agent = build_synthesis_agent(model)
    plan = await _generate_report(agent, prompt, ActionPlan, retries=2, defaults={})

    write_json(output_json, plan.model_dump(mode="json"))
    md = render_markdown("action_plan.md.j2", {"plan": plan.model_dump(mode="json")})
    write_text(output_md, md)


def _chapter_payload(chapter: Chapter, cfg: StorylintConfig) -> Dict[str, Any]:
    scenes = []
    for scene in chapter.scenes:
        paragraphs = []
        for paragraph in scene.paragraphs[: cfg.prompt.max_paragraphs]:
            paragraphs.append(
                {
                    "idx": paragraph.idx,
                    "location": f"{chapter.slug}:{scene.meta.id}:p{paragraph.idx}",
                    "text": _truncate(paragraph.text, cfg.prompt.max_scene_chars),
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


def _chapter_summary_payload(chapter: Chapter, cfg: StorylintConfig) -> Dict[str, Any]:
    scenes = []
    for scene in chapter.scenes:
        snippet = ""
        if scene.paragraphs:
            snippet = _truncate(scene.paragraphs[0].text, 320)
        scenes.append(
            {
                "id": scene.meta.id,
                "title": scene.meta.title,
                "location": scene.meta.location,
                "characters": scene.meta.characters,
                "tags": scene.meta.tags,
                "snippet": snippet,
            }
        )
    return {
        "slug": chapter.slug,
        "title": chapter.title,
        "scenes": scenes,
    }


def _canon_payload_for_chapters(chapters: list[Chapter], cfg: StorylintConfig) -> Dict[str, Any]:
    characters = set()
    locations = set()
    for chapter in chapters:
        for scene in chapter.scenes:
            characters.update(scene.meta.characters)
            if scene.meta.location:
                locations.add(scene.meta.location)

    return {
        "characters": {
            slug: load_canon_snapshot(slug, cfg.characters_dir, cfg.canon_snapshot_chars)
            for slug in sorted(c for c in characters if c)
        },
        "locations": {
            slug: load_canon_snapshot(slug, cfg.locations_dir, cfg.canon_snapshot_chars)
            for slug in sorted(l for l in locations if l)
        },
    }


def _truncate(text: str, max_chars: int) -> str:
    if max_chars <= 0 or len(text) <= max_chars:
        return text
    return text[: max_chars - 3] + "..."


def _build_windows(chapters: list[Chapter], window: int) -> list[list[Chapter]]:
    if window <= 0:
        return []
    if len(chapters) < window:
        return []
    return [chapters[i : i + window] for i in range(0, len(chapters) - window + 1)]


async def _generate_report(agent, prompt: str, model_cls, retries: int = 2, defaults: Optional[Dict[str, Any]] = None):
    last_error: Optional[Exception] = None
    for attempt in range(retries + 1):
        try:
            raw = await run_agent_prompt(agent, prompt)
            data = _extract_json(raw)
            if defaults:
                for key, value in defaults.items():
                    data.setdefault(key, value)
            return model_cls.model_validate(data)
        except Exception as exc:
            last_error = exc
            await asyncio.sleep(1 + attempt)
    raise RuntimeError(f"Failed to generate report: {last_error}")


def _extract_json(text: str) -> Any:
    cleaned = text.strip()
    if cleaned.startswith("{") and cleaned.endswith("}"):
        return json.loads(cleaned)
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        return json.loads(match.group(0))
    raise ValueError("No JSON object found in model output.")


async def write_dashboard_summary(
    run_dir: Path,
    run_id: str,
    mode: str,
    window: int,
    chapters: list[Chapter],
    adjacent_pairs: list[tuple[Chapter, Chapter]],
    arc_windows: list[list[Chapter]],
    error_count: int,
    recent_errors: list[str],
) -> None:
    chapter_reports = list((run_dir / "chapter").glob("*.report.json"))
    adjacent_reports = list((run_dir / "adjacent").glob("*.report.json"))
    arc_reports = list((run_dir / "arc").glob("*.report.json"))

    issues_total = 0
    by_severity: dict[str, int] = {}
    by_type: dict[str, int] = {}
    by_chapter: dict[str, int] = {}

    for report_path in chapter_reports:
        try:
            data = json.loads(report_path.read_text())
        except Exception:
            continue
        chapter_slug = data.get("chapter_slug") or report_path.stem.replace(".report", "")
        for issue in (data.get("issues") or []) + (data.get("integrity_findings") or []):
            issues_total += 1
            severity = issue.get("severity", "unknown")
            issue_type = issue.get("type", "unknown")
            by_severity[severity] = by_severity.get(severity, 0) + 1
            by_type[issue_type] = by_type.get(issue_type, 0) + 1
            by_chapter[chapter_slug] = by_chapter.get(chapter_slug, 0) + 1

    for report_path in adjacent_reports:
        try:
            data = json.loads(report_path.read_text())
        except Exception:
            continue
        for issue in data.get("findings") or []:
            issues_total += 1
            severity = issue.get("severity", "unknown")
            issue_type = issue.get("type", "unknown")
            by_severity[severity] = by_severity.get(severity, 0) + 1
            by_type[issue_type] = by_type.get(issue_type, 0) + 1

    top_chapters = sorted(
        ({"chapter": slug, "issue_count": count} for slug, count in by_chapter.items()),
        key=lambda item: item["issue_count"],
        reverse=True,
    )[:5]

    summary = DashboardSummary(
        run_id=run_id,
        generated_at=datetime.utcnow().isoformat() + "Z",
        mode=mode,
        window=window,
        counts={
            "chapters_total": len(chapters),
            "chapters_completed": len(chapter_reports),
            "adjacent_total": len(adjacent_pairs),
            "adjacent_completed": len(adjacent_reports),
            "arc_total": len(arc_windows),
            "arc_completed": len(arc_reports),
            "errors": error_count,
        },
        issues={
            "total": issues_total,
            "by_severity": by_severity,
            "by_type": by_type,
        },
        top_chapters=top_chapters,
        errors=recent_errors,
    )

    output_json = run_dir / "final" / "dashboard.json"
    output_md = run_dir / "final" / "dashboard.md"
    write_json(output_json, summary.model_dump(mode="json"))
    md = render_markdown("dashboard.md.j2", {"dashboard": summary.model_dump(mode="json")})
    write_text(output_md, md)
