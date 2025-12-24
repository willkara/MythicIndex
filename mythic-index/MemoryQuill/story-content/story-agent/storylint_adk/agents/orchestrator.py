from __future__ import annotations

try:
    from google.adk.agents import LlmAgent
except ImportError:  # pragma: no cover
    from google.adk.agents.llm_agent import LlmAgent

try:
    from google.adk.tools.agent_tool import AgentTool
except ImportError:  # pragma: no cover
    from google.adk.tools import agent_tool
    AgentTool = agent_tool.AgentTool

from .adjacent_flow import build_adjacent_flow_agent
from .arc_analyst import build_arc_agent
from .chapter_auditor import build_chapter_audit_agent
from .synthesizer import build_synthesis_agent


def run_storylint(
    start: str = "",
    end: str = "",
    mode: str = "full",
    window: int = 5,
    run_id: str = "",
    force: bool = False,
    config_path: str = "",
) -> str:
    """Run the storylint pipeline. Returns the run directory."""
    from ..runtime.runner import run_pipeline_sync

    run_dir = run_pipeline_sync(
        start=start or None,
        end=end or None,
        mode=mode,
        window=window,
        run_id=run_id or None,
        force=force,
        config_path=config_path or None,
    )
    return str(run_dir)


def build_orchestrator_agent(model: str, model_overrides: dict | None = None) -> LlmAgent:
    models = {
        "orchestrator": "gemini-3-flash-preview",
        "chapter_audit": "gemini-3-flash-preview",
        "adjacent_flow": "gemini-3-flash-preview",
        "arc_window": "gemini-3-pro-preview",
        "synthesis": "gemini-3-pro-preview",
    }
    if model_overrides:
        models.update(model_overrides)

    chapter_agent = build_chapter_audit_agent(models["chapter_audit"])
    adjacent_agent = build_adjacent_flow_agent(models["adjacent_flow"])
    arc_agent = build_arc_agent(models["arc_window"])
    synth_agent = build_synthesis_agent(models["synthesis"])

    tools = [
        AgentTool(agent=chapter_agent),
        AgentTool(agent=adjacent_agent),
        AgentTool(agent=arc_agent),
        AgentTool(agent=synth_agent),
        run_storylint,
    ]

    return LlmAgent(
        name="OrchestratorAgent",
        model=model or models["orchestrator"],
        description="Plans and runs Storylint audits using specialized agents.",
        instruction=(
            "You coordinate Storylint runs. "
            "Use the run_storylint tool for a full pipeline. "
            "Use sub-agent tools for targeted audits."
        ),
        tools=tools,
        sub_agents=[chapter_agent, adjacent_agent, arc_agent, synth_agent],
    )
