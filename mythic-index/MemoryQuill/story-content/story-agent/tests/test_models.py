from storylint.models import ChapterReport, Issue


def test_chapter_report_validation() -> None:
    report = ChapterReport(
        overall_quality=4,
        strengths=["Good pacing."],
        risks=["Continuity gap."],
        issues=[
            Issue(
                type="continuity",
                severity="medium",
                location="ch01:scn-01-01:p2",
                explanation="Missing handoff between scenes.",
                suggested_action="Add a bridge sentence.",
                evidence_refs=["ch01:scn-01-01:p2"],
            )
        ],
        questions=["Is the time jump intentional?"],
        opportunities=["Tighten the opening beat."],
        confidence=0.8,
    )
    assert report.overall_quality == 4
    assert report.issues[0].severity == "medium"
