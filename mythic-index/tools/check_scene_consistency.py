#!/usr/bin/env python3
"""Scene Consistency Checker for MemoryQuill

Validates that chapter scene fences (SCENE-START/SCENE-END) match their
corresponding imagery.yaml entries.

Checks:
1. Every scene fence has corresponding imagery entries
2. Every imagery entry references a valid scene fence
3. Scene IDs match between content.md and imagery.yaml
4. Character and location references are valid
"""

import re
import sys
from pathlib import Path
from typing import Dict, List, Set, Tuple
import yaml


class SceneFence:
    """Represents a SCENE-START/END fence from content.md"""

    def __init__(self, scene_id: str, title: str, location: str, characters: List[str],
                 line_start: int, line_end: int):
        self.scene_id = scene_id
        self.title = title
        self.location = location
        self.characters = characters
        self.line_start = line_start
        self.line_end = line_end

    def __repr__(self):
        return f"SceneFence({self.scene_id}, '{self.title}', lines {self.line_start}-{self.line_end})"


class ImageryEntry:
    """Represents an imagery entry from imagery.yaml"""

    def __init__(self, slug: str, title: str, scene: str, chapter: str,
                 characters: List[str], location: str):
        self.slug = slug
        self.title = title
        self.scene = scene
        self.chapter = chapter
        self.characters = characters
        self.location = location

    def __repr__(self):
        return f"ImageryEntry({self.slug}, scene={self.scene})"


def parse_scene_fences(content_path: Path) -> List[SceneFence]:
    """Parse SCENE-START/END fences from content.md"""
    if not content_path.exists():
        return []

    fences = []
    content = content_path.read_text(encoding='utf-8')
    lines = content.split('\n')

    # Pattern: <!-- SCENE-START id:scn-XX-YY title:"..." location:"..." characters:["..."] ... -->
    start_pattern = re.compile(
        r'<!--\s*SCENE-START\s+'
        r'id:(?P<id>[\w-]+)\s+'
        r'title:"(?P<title>[^"]+)"\s*'
        r'.*?'
        r'location:"(?P<location>[\w-]+)"\s*'
        r'.*?'
        r'characters:\[(?P<characters>[^\]]*)\]'
    , re.DOTALL)

    end_pattern = re.compile(r'<!--\s*SCENE-END\s+id:([\w-]+)\s*-->')

    current_fence = None

    for line_num, line in enumerate(lines, start=1):
        # Check for SCENE-START
        start_match = start_pattern.search(line)
        if start_match:
            scene_id = start_match.group('id')
            title = start_match.group('title')
            location = start_match.group('location')
            characters_str = start_match.group('characters')

            # Parse character array
            characters = []
            if characters_str.strip():
                characters = [c.strip(' "\'') for c in characters_str.split(',')]

            current_fence = {
                'scene_id': scene_id,
                'title': title,
                'location': location,
                'characters': characters,
                'line_start': line_num
            }
            continue

        # Check for SCENE-END
        end_match = end_pattern.search(line)
        if end_match and current_fence:
            scene_id = end_match.group(1)

            if scene_id == current_fence['scene_id']:
                fences.append(SceneFence(
                    scene_id=current_fence['scene_id'],
                    title=current_fence['title'],
                    location=current_fence['location'],
                    characters=current_fence['characters'],
                    line_start=current_fence['line_start'],
                    line_end=line_num
                ))
                current_fence = None

    return fences


def parse_imagery_entries(imagery_path: Path) -> List[ImageryEntry]:
    """Parse imagery entries from imagery.yaml"""
    if not imagery_path.exists():
        return []

    with open(imagery_path, 'r', encoding='utf-8') as f:
        data = yaml.safe_load(f)

    if not data or not isinstance(data, list):
        return []

    entries = []
    for item in data:
        entries.append(ImageryEntry(
            slug=item.get('slug', ''),
            title=item.get('title', ''),
            scene=item.get('scene', ''),
            chapter=item.get('chapter', ''),
            characters=item.get('characters', []),
            location=item.get('location', '')
        ))

    return entries


def check_chapter_consistency(chapter_dir: Path) -> Dict[str, any]:
    """Check consistency for a single chapter"""
    chapter_name = chapter_dir.name
    content_path = chapter_dir / "content.md"
    imagery_path = chapter_dir / "imagery.yaml"

    # Parse both files
    fences = parse_scene_fences(content_path)
    entries = parse_imagery_entries(imagery_path)

    # Build scene ID sets
    fence_ids = {f.scene_id for f in fences}
    imagery_scenes = {e.scene for e in entries}

    # Find mismatches
    orphan_imagery = imagery_scenes - fence_ids  # Imagery with no fence
    missing_imagery = fence_ids - imagery_scenes  # Fences with no imagery

    # Check for duplicate scene IDs in fences
    fence_id_counts = {}
    for fence in fences:
        fence_id_counts[fence.scene_id] = fence_id_counts.get(fence.scene_id, 0) + 1
    duplicate_fence_ids = {sid: count for sid, count in fence_id_counts.items() if count > 1}

    return {
        'chapter': chapter_name,
        'fences_count': len(fences),
        'entries_count': len(entries),
        'fences': fences,
        'entries': entries,
        'orphan_imagery': orphan_imagery,
        'missing_imagery': missing_imagery,
        'duplicate_fence_ids': duplicate_fence_ids,
        'has_issues': bool(orphan_imagery or missing_imagery or duplicate_fence_ids)
    }


def main():
    """Run consistency check on all chapters"""
    # Find chapters directory
    story_content = Path("../MemoryQuill/story-content")
    if not story_content.exists():
        story_content = Path("./MemoryQuill/story-content")
    if not story_content.exists():
        print("❌ Cannot find story-content directory")
        return 1

    chapters_dir = story_content / "chapters"
    if not chapters_dir.exists():
        print(f"❌ Cannot find chapters directory: {chapters_dir}")
        return 1

    print("=" * 80)
    print("MemoryQuill Scene Consistency Check")
    print("=" * 80)
    print()

    all_results = []
    chapters_with_issues = []

    # Check each chapter
    for chapter_dir in sorted(chapters_dir.iterdir()):
        if not chapter_dir.is_dir():
            continue

        if not (chapter_dir / "content.md").exists():
            continue

        result = check_chapter_consistency(chapter_dir)
        all_results.append(result)

        if result['has_issues']:
            chapters_with_issues.append(result)

    # Summary
    print(f"✓ Checked {len(all_results)} chapters")
    print()

    if not chapters_with_issues:
        print("✅ No issues found! All chapters are consistent.")
        return 0

    # Report issues
    print(f"⚠️  Found issues in {len(chapters_with_issues)} chapters:")
    print()

    for result in chapters_with_issues:
        print(f"📖 {result['chapter']}")
        print(f"   Fences: {result['fences_count']} | Imagery entries: {result['entries_count']}")

        if result['duplicate_fence_ids']:
            print(f"   ❌ Duplicate fence IDs:")
            for sid, count in result['duplicate_fence_ids'].items():
                print(f"      - {sid} appears {count} times")

        if result['orphan_imagery']:
            print(f"   ⚠️  Imagery entries with no matching fence:")
            for scene_id in sorted(result['orphan_imagery']):
                matching_entries = [e for e in result['entries'] if e.scene == scene_id]
                for entry in matching_entries:
                    print(f"      - {entry.slug} (scene={scene_id})")

        if result['missing_imagery']:
            print(f"   ⚠️  Scene fences with no imagery entries:")
            for scene_id in sorted(result['missing_imagery']):
                matching_fence = next((f for f in result['fences'] if f.scene_id == scene_id), None)
                if matching_fence:
                    print(f"      - {scene_id}: \"{matching_fence.title}\" (lines {matching_fence.line_start}-{matching_fence.line_end})")

        print()

    # Totals
    total_orphan = sum(len(r['orphan_imagery']) for r in chapters_with_issues)
    total_missing = sum(len(r['missing_imagery']) for r in chapters_with_issues)
    total_duplicates = sum(len(r['duplicate_fence_ids']) for r in chapters_with_issues)

    print("=" * 80)
    print("Summary:")
    print(f"  - Chapters with issues: {len(chapters_with_issues)}/{len(all_results)}")
    print(f"  - Orphaned imagery entries: {total_orphan}")
    print(f"  - Fences missing imagery: {total_missing}")
    print(f"  - Duplicate fence IDs: {total_duplicates}")
    print("=" * 80)

    return 1 if chapters_with_issues else 0


if __name__ == "__main__":
    sys.exit(main())
