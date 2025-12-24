from __future__ import annotations

import asyncio
import subprocess
import sys
from pathlib import Path
from typing import Optional

import typer

try:  # optional; no-op if missing
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover
    load_dotenv = None

try:  # optional interactive prompts
    import questionary
except ImportError:  # pragma: no cover
    questionary = None

if load_dotenv:
    load_dotenv()

from .config import StorylintConfig, load_config, write_config
from .runtime.runner import run_pipeline_sync, run_chapter_audit
from .runtime.doctor import run_doctor
from .store.artifacts import ensure_run_dir, new_run_id, write_json, build_index
from .parser.scene_parser import parse_chapter
from .tools.repo_tools import discover_repo_map, discover_chapters

app = typer.Typer(add_completion=False)
DEFAULT_AGENT_DIR = Path(__file__).resolve().parents[1] / "adk_project"
FALLBACK_CONFIG_PATHS = [
    Path.cwd() / "storylint.yaml",
    Path.cwd() / "story-content" / "storylint.yaml",
    Path.cwd() / "MemoryQuill" / "story-content" / "storylint.yaml",
]


@app.callback(invoke_without_command=True)
def main(ctx: typer.Context) -> None:
    """Storylint CLI entrypoint."""
    if ctx.invoked_subcommand is not None:
        return
    if not (sys.stdin.isatty() and sys.stdout.isatty()):
        typer.echo(ctx.get_help())
        raise typer.Exit(code=0)
    _interactive_menu()


@app.command()
def init(
    root: Path = typer.Option(Path.cwd(), "--root", help="Repository root to scan"),
    output: Path = typer.Option(Path("storylint.yaml"), "--output", help="Path to write storylint.yaml"),
) -> None:
    repo_map = discover_repo_map(root)
    chapters_dir = repo_map.chapters_dir or (root / "chapters")
    characters_dir = repo_map.characters_dir or (root / "characters")
    locations_dir = repo_map.locations_dir or (root / "locations")

    def _rel(path: Path) -> Path:
        try:
            return path.relative_to(root)
        except ValueError:
            return path

    cfg = StorylintConfig(
        project_root=root,
        chapters_dir=_rel(chapters_dir),
        characters_dir=_rel(characters_dir),
        locations_dir=_rel(locations_dir),
        images_dir=_rel(chapters_dir),
        runs_dir=Path("runs"),
    )

    write_config(cfg, output)

    typer.echo("Repository scan complete:")
    typer.echo(f"- chapter sample: {repo_map.chapter_sample}")
    typer.echo(f"- character sample: {repo_map.character_sample}")
    typer.echo(f"- location sample: {repo_map.location_sample}")
    typer.echo(f"- imagery sample: {repo_map.imagery_sample}")
    if repo_map.images_dir_candidates:
        typer.echo(f"- images dirs: {repo_map.images_dir_candidates[:3]}")
    typer.echo(f"Config written to {output}")


@app.command()
def audit(
    chapter: Optional[Path] = typer.Option(None, "--chapter", exists=True, file_okay=True, dir_okay=False),
    config: Optional[Path] = typer.Option(None, "--config", help="Path to storylint.yaml"),
    run_id: Optional[str] = typer.Option(None, "--run-id", help="Override run id"),
    model: Optional[str] = typer.Option(None, "--model", help="Override model for this audit"),
    force: bool = typer.Option(False, "--force"),
) -> None:
    cfg = _resolve_config(config)
    chapter_path = chapter.resolve() if chapter else _prompt_chapter(cfg)
    parsed = parse_chapter(chapter_path, cfg)

    run_id = run_id or new_run_id()
    run_dir = ensure_run_dir(cfg.runs_dir, run_id)

    write_json(run_dir / "config.json", cfg.model_dump(mode="json", exclude={"config_path"}))
    write_json(run_dir / "index.json", build_index([parsed]))

    chapter_model = model or cfg.models.chapter_audit
    try:
        asyncio.run(run_chapter_audit(parsed, cfg, run_dir, model=chapter_model, force=force))
        typer.echo(f"Report written to {run_dir}")
    except RuntimeError as exc:
        typer.echo(f"Audit completed with errors: {exc}")
        raise typer.Exit(code=1)


@app.command()
def run(
    start: Optional[str] = typer.Option(None, "--start", help="Start chapter slug"),
    end: Optional[str] = typer.Option(None, "--end", help="End chapter slug"),
    mode: str = typer.Option("full", "--mode"),
    window: int = typer.Option(5, "--window"),
    run_id: Optional[str] = typer.Option(None, "--run-id"),
    force: bool = typer.Option(False, "--force"),
    config: Optional[Path] = typer.Option(None, "--config"),
    model: Optional[str] = typer.Option(None, "--model", help="Override model for all tasks"),
) -> None:
    if start is None or end is None:
        start, end, mode, window, force = _prompt_run_options(start, end, mode, window, force, config)
    try:
        run_dir = run_pipeline_sync(
            start=start,
            end=end,
            mode=mode,
            window=window,
            run_id=run_id,
            force=force,
            config_path=str(config) if config else None,
            model=model,
        )
        typer.echo(f"Run completed: {run_dir}")
    except RuntimeError as exc:
        typer.echo(f"Run completed with errors: {exc}")
        raise typer.Exit(code=1)


@app.command()
def web(
    agent_dir: Path = typer.Option(DEFAULT_AGENT_DIR, "--agent-dir"),
) -> None:
    subprocess.run(["adk", "web"], cwd=agent_dir, check=False)


@app.command()
def doctor(
    config: Optional[Path] = typer.Option(None, "--config"),
) -> None:
    cfg = _resolve_config(config)
    result = run_doctor(cfg)
    if result.messages:
        typer.echo("Checks:")
        for item in result.messages:
            typer.echo(f"- {item}")
    if result.warnings:
        typer.echo("Warnings:")
        for item in result.warnings:
            typer.echo(f"- {item}")
    if not result.ok:
        raise typer.Exit(code=1)


def _resolve_config(config: Optional[Path]) -> StorylintConfig:
    if config:
        return load_config(config, start_dir=Path.cwd())
    try:
        return load_config(None, start_dir=Path.cwd())
    except FileNotFoundError:
        for candidate in FALLBACK_CONFIG_PATHS:
            if candidate.exists():
                return load_config(candidate, start_dir=Path.cwd())
        return _prompt_config_path()


def _prompt_config_path() -> StorylintConfig:
    prompt_text = "Enter path to storylint.yaml"
    if questionary:
        value = questionary.text(prompt_text).ask()
    else:
        value = typer.prompt(prompt_text)
    if not value:
        raise typer.BadParameter("No config path provided.")
    path = Path(value).expanduser()
    return load_config(path, start_dir=Path.cwd())


def _prompt_chapter(cfg: StorylintConfig) -> Path:
    chapters = discover_chapters(cfg)
    if not chapters:
        raise typer.BadParameter("No chapters found. Check storylint.yaml paths.")
    choices = [path.parent.name for path in chapters]
    if questionary:
        selection = questionary.select("Select a chapter", choices=choices).ask()
        if not selection:
            raise typer.BadParameter("No chapter selected.")
        for path in chapters:
            if path.parent.name == selection:
                return path
        raise typer.BadParameter("Unknown chapter selection.")
    typer.echo("Select a chapter:")
    for idx, slug in enumerate(choices, start=1):
        typer.echo(f"{idx:>2}. {slug}")
    choice = typer.prompt("Enter chapter number or slug").strip()
    if choice.isdigit():
        index = int(choice) - 1
        if index < 0 or index >= len(chapters):
            raise typer.BadParameter("Invalid chapter number.")
        return chapters[index]
    for path in chapters:
        if path.parent.name == choice:
            return path
    raise typer.BadParameter("Unknown chapter slug.")


def _prompt_run_options(
    start: Optional[str],
    end: Optional[str],
    mode: str,
    window: int,
    force: bool,
    config: Optional[Path],
) -> tuple[Optional[str], Optional[str], str, int, bool]:
    cfg = _resolve_config(config)
    chapters = discover_chapters(cfg)
    if not chapters:
        raise typer.BadParameter("No chapters found. Check storylint.yaml paths.")
    slugs = [path.parent.name for path in chapters]
    start_slug = start
    end_slug = end

    if questionary:
        start_choice = questionary.select(
            "Select start chapter",
            choices=["(first)"] + slugs,
        ).ask()
        end_choice = questionary.select(
            "Select end chapter",
            choices=slugs + ["(last)"],
        ).ask()
        if start_choice and start_choice != "(first)":
            start_slug = start_choice
        if end_choice and end_choice != "(last)":
            end_slug = end_choice
        mode_choice = questionary.select(
            "Select mode",
            choices=[
                "full",
                "chapters",
                "adjacent",
                "arc",
            ],
            default=mode,
        ).ask()
        mode_input = mode_choice or mode
        window_text = questionary.text("Arc window size", default=str(window)).ask()
        window_value = int(window_text or window)
        force_input = questionary.confirm("Force re-run existing artifacts?", default=force).ask()
        return start_slug, end_slug, mode_input, window_value, bool(force_input)

    typer.echo("Available chapters:")
    for idx, slug in enumerate(slugs, start=1):
        typer.echo(f"{idx:>2}. {slug}")

    start_input = typer.prompt("Start chapter slug (blank for first)", default="", show_default=False).strip()
    end_input = typer.prompt("End chapter slug (blank for last)", default="", show_default=False).strip()

    start_slug = start or (start_input if start_input else None)
    end_slug = end or (end_input if end_input else None)

    mode_input = typer.prompt("Mode [full/adjacent/arc/chapters]", default=mode)
    window_input = typer.prompt("Arc window size", default=window)
    force_input = typer.confirm("Force re-run existing artifacts?", default=force)

    return start_slug, end_slug, mode_input, int(window_input), force_input


def _interactive_menu() -> None:
    choices = [
        ("Run full pipeline", "run", "audits, transitions, arcs, synthesis"),
        ("Audit a single chapter", "audit", "quality + continuity for one chapter"),
        ("Doctor (validate config)", "doctor", "check paths, counts, and sample files"),
        ("Init (generate config)", "init", "scan repo and write storylint.yaml"),
        ("Open ADK web UI", "web", "interactive agent debugging UI"),
        ("Exit", "exit", "quit Storylint"),
    ]
    if questionary:
        selection = questionary.select(
            "Storylint — choose an action",
            choices=[
                questionary.Choice(
                    title=f"{label} — {desc}",
                    value=action,
                )
                for label, action, desc in choices
            ],
        ).ask()
    else:
        typer.echo("Storylint — choose an action:")
        for idx, (label, _, desc) in enumerate(choices, start=1):
            typer.echo(f"{idx:>2}. {label} — {desc}")
        selection = typer.prompt("Enter number").strip()
        if selection.isdigit():
            idx = int(selection) - 1
            if 0 <= idx < len(choices):
                selection = choices[idx][1]
        else:
            selection = None

    if not selection:
        raise typer.Exit(code=0)

    action = selection
    if action == "run":
        run()
    elif action == "audit":
        audit()
    elif action == "doctor":
        doctor()
    elif action == "init":
        init()
    elif action == "web":
        web()
    else:
        raise typer.Exit(code=0)
