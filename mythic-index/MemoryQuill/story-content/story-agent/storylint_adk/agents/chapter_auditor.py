from __future__ import annotations

try:
    from google.adk.agents import LlmAgent
except ImportError:  # pragma: no cover - optional dependency
    from google.adk.agents.llm_agent import LlmAgent

from ..models import ChapterReport


def build_chapter_audit_agent(model: str) -> LlmAgent:
    return LlmAgent(
        name="ChapterAuditAgent",
        model=model,
        description="Audits a single chapter for narrative quality and continuity.",
        instruction=(
            "You audit a chapter for narrative quality and continuity. "
            "Return ONLY JSON that matches the provided schema. "
            "Do not include markdown or commentary."
        ),
        output_schema=ChapterReport,
        output_key="chapter_report",
    )
