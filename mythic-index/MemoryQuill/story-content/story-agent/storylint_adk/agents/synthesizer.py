from __future__ import annotations

try:
    from google.adk.agents import LlmAgent
except ImportError:  # pragma: no cover
    from google.adk.agents.llm_agent import LlmAgent

from ..models import ActionPlan


def build_synthesis_agent(model: str) -> LlmAgent:
    return LlmAgent(
        name="SynthesisAgent",
        model=model,
        description="Synthesizes reports into an action plan.",
        instruction=(
            "You synthesize storylint reports into an action plan. "
            "Return ONLY JSON that matches the provided schema. "
            "Do not include markdown or commentary."
        ),
        output_schema=ActionPlan,
        output_key="action_plan",
    )
