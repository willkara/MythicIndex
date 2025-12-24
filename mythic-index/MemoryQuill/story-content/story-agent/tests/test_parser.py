from pathlib import Path

from storylint.config import StoryLintConfig
from storylint.parser import parse_chapter


def test_parse_chapter_scenes(tmp_path: Path) -> None:
    content = """# Chapter X\n\n<!-- SCENE-START id:scn-00-01 title:\"Test Scene\"\n        when:\"2025-01-01T00:00:00Z\"\n        location:\"test-hall\"\n        characters:[\"alpha\",\"beta\"]\n        tags:[\"setup\"]\n        images:[\"scene.png\"]\n-->\n\nFirst paragraph.\n\nSecond paragraph.\n\n<!-- SCENE-END id:scn-00-01 -->\n"""
    chapter_dir = tmp_path / "ch00-test"
    chapter_dir.mkdir()
    chapter_path = chapter_dir / "content.md"
    chapter_path.write_text(content)

    cfg = StoryLintConfig(
        project_root=tmp_path,
        chapters_dir=tmp_path,
        characters_dir=tmp_path,
        locations_dir=tmp_path,
        images_dir=tmp_path,
    )

    chapter = parse_chapter(chapter_path, cfg)
    assert chapter.slug == "ch00-test"
    assert chapter.title == "Chapter X"
    assert len(chapter.scenes) == 1
    scene = chapter.scenes[0]
    assert scene.meta.id == "scn-00-01"
    assert scene.meta.title == "Test Scene"
    assert scene.meta.location == "test-hall"
    assert scene.meta.characters == ["alpha", "beta"]
    assert len(scene.paragraphs) == 2
    assert scene.paragraphs[0].idx == 1
    assert "First paragraph" in scene.paragraphs[0].text
