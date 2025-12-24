from __future__ import annotations

try:
    from google.adk.agents import LlmAgent
except ImportError:  # pragma: no cover
    from google.adk.agents.llm_agent import LlmAgent

from ..models import AdjacentReport


def build_adjacent_flow_agent(model: str) -> LlmAgent:
    return LlmAgent(
        name="AdjacentFlowAgent",
        model=model,
        description="Audits narrative flow between adjacent chapters.",
        instruction=(
            "You audit transitions between adjacent chapters. "
            "Return ONLY JSON that matches the provided schema. "
            "Do not include markdown or commentary."
        ),
        output_schema=AdjacentReport,
        output_key="adjacent_report",
    )
