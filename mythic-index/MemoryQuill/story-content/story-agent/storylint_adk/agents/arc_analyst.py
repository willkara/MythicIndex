from __future__ import annotations

try:
    from google.adk.agents import LlmAgent
except ImportError:  # pragma: no cover
    from google.adk.agents.llm_agent import LlmAgent

from ..models import ArcReport


def build_arc_agent(model: str) -> LlmAgent:
    return LlmAgent(
        name="ArcWindowAgent",
        model=model,
        description="Analyzes coherence across a rolling arc window.",
        instruction=(
            "You analyze arc coherence across multiple chapters. "
            "Return ONLY JSON that matches the provided schema. "
            "Do not include markdown or commentary."
        ),
        output_schema=ArcReport,
        output_key="arc_report",
    )
