# Storylint ADK (Gemini)

Local-first story QA and continuity audits built on Google ADK. This package uses deterministic tools for parsing and repository integrity checks, and Gemini-backed ADK agents for narrative analysis.

## Ubuntu setup

```bash
cd /home/willkara/source/MemoryQuill/mythic-index/MemoryQuill/story-content/story-agent
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e .
```

## Configure Gemini

Create a `.env` in the repo root with your API key:

```bash
GOOGLE_API_KEY=your_key_here
```

ADK auto-loads `.env` when running agents.

## Initialize config

```bash
storylint init --root /home/willkara/source/MemoryQuill/mythic-index/MemoryQuill/story-content --output /home/willkara/source/MemoryQuill/mythic-index/MemoryQuill/story-content/storylint.yaml
```

## Single chapter audit

```bash
storylint audit --chapter /home/willkara/source/MemoryQuill/mythic-index/MemoryQuill/story-content/chapters/ch01-ash-and-compass/content.md --config /home/willkara/source/MemoryQuill/mythic-index/MemoryQuill/story-content/storylint.yaml
```

If you omit flags, the CLI will prompt you with arrow-key selection (questionary).

## Full run (parallel audits + synthesis)

```bash
storylint run --start ch09-hearth-and-home --end ch13-spring-thaw --mode full --window 5 --config /home/willkara/source/MemoryQuill/mythic-index/MemoryQuill/story-content/storylint.yaml
```

If you omit the range flags, the CLI will prompt you for start/end and mode interactively, with live progress + error panel.

## Model defaults (Option B)

The default configuration uses preview models for quality:

- Orchestrator: `gemini-3-flash-preview`
- Chapter/Adjacent: `gemini-3-flash-preview`
- Arc/Synthesis: `gemini-3-pro-preview`

Override all tasks with `--model` or edit the `models:` block in `storylint.yaml` for per-agent choices.

## ADK interactive debugging

The ADK CLI can run the root agent or start the web UI:

```bash
adk run storylint_adk/adk_project
adk web
```

## Notes

- Reports are written to `runs/<run_id>/` with JSON + Markdown:
  - `final/action-plan.json` and `final/action-plan.md`
  - `final/dashboard.json` and `final/dashboard.md`
- Adjacent + arc window agents are stubbed in the runner for now; only chapter audits and synthesis are executed in MVP.
