from __future__ import annotations

from typing import List, Literal

from pydantic import BaseModel, ConfigDict, Field


Severity = Literal["low", "medium", "high", "critical"]
IssueType = Literal[
    "continuity",
    "quality",
    "character",
    "setting",
    "pacing",
    "dialogue",
    "consistency",
    "clarity",
    "stakes",
    "tone",
    "other",
]


class Issue(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: IssueType
    severity: Severity
    location: str = Field(
        description="Stable anchor like ch10:scn-10-03:p7 or ch10:scn-10-03:l120-132",
    )
    explanation: str
    suggested_action: str
    evidence_refs: List[str] = Field(default_factory=list)


class ChapterReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    overall_quality: int = Field(ge=1, le=5)
    strengths: List[str]
    risks: List[str]
    issues: List[Issue]
    questions: List[str]
    opportunities: List[str]
    confidence: float = Field(ge=0.0, le=1.0)


class AdjacentReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    transition_rating: int = Field(ge=1, le=5)
    diagnosis: str
    findings: List[str]
    missing_bridges: List[str]
    decisions_to_confirm: List[str]
    confidence: float = Field(ge=0.0, le=1.0)


class ArcReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    momentum: int = Field(ge=1, le=5)
    emotional_trajectory: str
    structural_clarity: int = Field(ge=1, le=5)
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
