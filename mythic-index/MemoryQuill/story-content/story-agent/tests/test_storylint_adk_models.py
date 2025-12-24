from storylint_adk.models import ChapterReport, Issue


def test_chapter_report_validation() -> None:
    report = ChapterReport(
        chapter_slug="ch01-ash-and-compass",
        overall_quality="Good",
        strengths=["Clear pacing."],
        risks=["Minor continuity gap."],
        issues=[
            Issue(
                type="continuity",
                severity="moderate",
                location="ch01:scn-01-01:p2",
                explanation="Missing handoff between scenes.",
                suggested_action="Add a bridge sentence.",
                evidence_refs=["ch01:scn-01-01:p2"],
            )
        ],
        questions=["Is the time jump intentional?"],
        opportunities=["Tighten the opening beat."],
        integrity_findings=[],
        confidence=0.8,
    )
    assert report.overall_quality == "Good"
    assert report.issues[0].severity == "moderate"
