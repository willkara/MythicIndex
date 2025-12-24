from __future__ import annotations

from typing import List, Literal

from pydantic import BaseModel, ConfigDict, Field


IssueType = Literal[
    "clarity",
    "character",
    "pacing",
    "continuity",
    "pov",
    "emotion",
    "logic",
    "imagery",
    "slug",
]
Severity = Literal["minor", "moderate", "major"]


class Issue(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: IssueType
    severity: Severity
    location: str = Field(
        description="Stable anchor like ch10:scn-10-03:p7 or ch10:scn-10-03:L120-L145",
    )
    explanation: str
    suggested_action: str
    evidence_refs: List[str] = Field(default_factory=list)


class ChapterReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    chapter_slug: str
    overall_quality: Literal["Excellent", "Good", "Mixed", "Needs Work"]
    strengths: List[str]
    risks: List[str]
    issues: List[Issue]
    questions: List[str]
    opportunities: List[str]
    integrity_findings: List[Issue]
    confidence: float = Field(ge=0.0, le=1.0)


class AdjacentReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    left_slug: str
    right_slug: str
    transition_rating: Literal["Smooth", "Acceptable", "Rough", "Broken"]
    diagnosis: str
    findings: List[Issue]
    missing_bridges: List[str]
    decisions_to_confirm: List[str]
    confidence: float = Field(ge=0.0, le=1.0)


class ArcReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    window_slug: str
    momentum: Literal["Strong", "Steady", "Stalled"]
    emotional_trajectory: Literal["Rising", "Flat", "Erratic"]
    structural_clarity: Literal["Clear", "Uneven", "Confused"]
    observations: List[str]
    risks: List[str]
    opportunities: List[str]
    chapters_to_rework: List[str]
    confidence: float = Field(ge=0.0, le=1.0)


class ActionPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    must_fix: List[str]
    should_fix: List[str]
    optional: List[str]
    open_questions: List[str]
    quick_wins: List[str]
    dashboard: dict


class DashboardSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    run_id: str
    generated_at: str
    mode: str
    window: int
    counts: dict
    issues: dict
    top_chapters: List[dict]
    errors: List[str]
