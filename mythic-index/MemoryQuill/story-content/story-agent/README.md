# Storylint (ADK + Gemini)

Local-first story linting for chapter-level narrative quality, continuity, and repository integrity, backed by Google ADK agents. The default `storylint` CLI now runs the ADK pipeline. A legacy CLI remains available as `storylint-legacy`.

## Ubuntu setup

```bash
cd /home/willkara/source/MemoryQuill/mythic-index/MemoryQuill/story-content/story-agent
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
```

## Configuration

Generate a repo-root config with:

```bash
storylint init --root /home/willkara/source/MemoryQuill/mythic-index/MemoryQuill/story-content --output /home/willkara/source/MemoryQuill/mythic-index/MemoryQuill/story-content/storylint.yaml
```

## Commands

Single-chapter audit:

```bash
storylint audit --chapter /home/willkara/source/MemoryQuill/mythic-index/MemoryQuill/story-content/chapters/ch01-ash-and-compass/content.md --config /home/willkara/source/MemoryQuill/mythic-index/MemoryQuill/story-content/storylint.yaml
```

If you omit `--chapter`, the CLI will prompt you with arrow-key selection.

Full run:

```bash
storylint run --start ch09-hearth-and-home --end ch13-spring-thaw --mode full --window 5 --config /home/willkara/source/MemoryQuill/mythic-index/MemoryQuill/story-content/storylint.yaml
```

If you omit range flags, the CLI will prompt for start/end/mode and show live progress + error panel.

Outputs are written to `runs/<run_id>/` with JSON + Markdown reports, including `final/action-plan.json`, `final/action-plan.md`, `final/dashboard.json`, and `final/dashboard.md`.

Model defaults are defined in the `models:` block of `storylint.yaml` (currently set to Gemini preview models for Option B).

## Tests

```bash
pytest
```

## Legacy CLI

The previous MVP CLI is still available as:

```bash
storylint-legacy audit --chapter /home/willkara/source/MemoryQuill/mythic-index/MemoryQuill/story-content/chapters/ch01-ash-and-compass/content.md --config /home/willkara/source/MemoryQuill/mythic-index/MemoryQuill/story-content/story-agent/storylint.yaml
```

See `storylint_adk/README.md` for the full ADK workflow and `adk` CLI usage.
