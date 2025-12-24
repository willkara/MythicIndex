#!/usr/bin/env python3
"""
Consolidate imagery.yaml scene slugs to match database scn-XX-YY format.

This script:
1. Extracts scenes from content.md files (SCENE-START comments with id:scn-XX-YY title:"...")
2. Extracts scene references from imagery.yaml files (slug: ch1-xxx, title: "...")
3. Matches by title using fuzzy string matching
4. Outputs a mapping file and optionally updates imagery.yaml files
"""

import re
import os
import sys
from pathlib import Path
from difflib import SequenceMatcher
from dataclasses import dataclass, field
from typing import Optional

# Try to import yaml, fall back to basic parsing if unavailable
try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False
    print("Warning: PyYAML not available, using basic parsing")


@dataclass
class DBScene:
    """Scene from content.md (database format)"""
    content_slug: str  # e.g., ch01-ash-and-compass
    scene_id: str      # e.g., scn-01-01
    title: str         # e.g., "Twilight on the Rim"


@dataclass
class ImageryScene:
    """Scene from imagery.yaml"""
    content_slug: str  # e.g., ch01-ash-and-compass
    scene_slug: str    # e.g., ch1-twilight-rim
    title: str         # e.g., "Twilight on the Rim"
    line_num: int      # For updating the file


@dataclass
class SceneMapping:
    """Mapping result"""
    imagery_slug: str
    db_scene_id: Optional[str]
    imagery_title: str
    db_title: Optional[str]
    match_ratio: float
    action: str  # 'exact', 'fuzzy', 'no_match'


def normalize_title(title: str) -> str:
    """Normalize a title for comparison"""
    return title.lower().strip().replace("'", "'").replace('"', '').replace("–", "-").replace("—", "-")


def similarity_ratio(s1: str, s2: str) -> float:
    """Calculate similarity between two strings"""
    return SequenceMatcher(None, normalize_title(s1), normalize_title(s2)).ratio()


def extract_scenes_from_content_md(content_path: Path) -> list[DBScene]:
    """Extract scenes from content.md SCENE-START comments"""
    scenes = []
    content_slug = content_path.parent.name

    try:
        text = content_path.read_text(encoding='utf-8')
    except Exception as e:
        print(f"  Error reading {content_path}: {e}")
        return scenes

    # Pattern: <!-- SCENE-START id:scn-XX-YY title:"Title Here"
    pattern = r'<!--\s*SCENE-START\s+id:(scn-\d+-\d+)\s+title:"([^"]+)"'

    for match in re.finditer(pattern, text):
        scene_id = match.group(1)
        title = match.group(2)
        scenes.append(DBScene(
            content_slug=content_slug,
            scene_id=scene_id,
            title=title
        ))

    return scenes


def extract_scenes_from_imagery_yaml(yaml_path: Path) -> list[ImageryScene]:
    """Extract scene references from imagery.yaml"""
    scenes = []
    content_slug = yaml_path.parent.name

    try:
        text = yaml_path.read_text(encoding='utf-8')
    except Exception as e:
        print(f"  Error reading {yaml_path}: {e}")
        return scenes

    if HAS_YAML:
        try:
            data = yaml.safe_load(text)
            if data and 'scenes' in data:
                for scene in data['scenes']:
                    if 'slug' in scene and 'title' in scene:
                        scenes.append(ImageryScene(
                            content_slug=content_slug,
                            scene_slug=scene['slug'],
                            title=scene['title'],
                            line_num=0  # YAML doesn't give us line numbers easily
                        ))
        except Exception as e:
            print(f"  YAML parse error for {yaml_path}: {e}")
    else:
        # Basic regex parsing as fallback
        # Find slug: and title: pairs within scenes
        scene_blocks = re.split(r'\n- base_prompt:', text)
        for block in scene_blocks[1:]:  # Skip header
            slug_match = re.search(r'\n\s+slug:\s*(\S+)', block)
            title_match = re.search(r'\n\s+title:\s*(.+)', block)
            if slug_match and title_match:
                slug = slug_match.group(1)
                title = title_match.group(1).strip().strip("'\"")
                scenes.append(ImageryScene(
                    content_slug=content_slug,
                    scene_slug=slug,
                    title=title,
                    line_num=0
                ))

    return scenes


def match_scenes(
    db_scenes: dict[str, list[DBScene]],  # keyed by content_slug
    imagery_scenes: dict[str, list[ImageryScene]]  # keyed by content_slug
) -> dict[str, list[SceneMapping]]:
    """Match imagery scenes to DB scenes by title within each chapter"""
    mappings = {}

    for content_slug, img_scenes in imagery_scenes.items():
        chapter_mappings = []
        chapter_db_scenes = db_scenes.get(content_slug, [])

        for img_scene in img_scenes:
            best_match = None
            best_ratio = 0.0

            for db_scene in chapter_db_scenes:
                ratio = similarity_ratio(img_scene.title, db_scene.title)
                if ratio > best_ratio:
                    best_ratio = ratio
                    best_match = db_scene

            if best_ratio >= 0.95:
                action = 'exact'
            elif best_ratio >= 0.70:
                action = 'fuzzy'
            else:
                action = 'no_match'

            chapter_mappings.append(SceneMapping(
                imagery_slug=img_scene.scene_slug,
                db_scene_id=best_match.scene_id if best_match else None,
                imagery_title=img_scene.title,
                db_title=best_match.title if best_match else None,
                match_ratio=best_ratio,
                action=action
            ))

        if chapter_mappings:
            mappings[content_slug] = chapter_mappings

    return mappings


def update_imagery_yaml(yaml_path: Path, mappings: list[SceneMapping], dry_run: bool = True, remove_unmatched: bool = False) -> tuple[int, int]:
    """Update scene slugs in imagery.yaml file

    Returns: (slugs_updated, slugs_removed)
    """
    try:
        text = yaml_path.read_text(encoding='utf-8')
    except Exception as e:
        print(f"  Error reading {yaml_path}: {e}")
        return 0, 0

    slugs_updated = 0
    slugs_removed = 0

    for mapping in mappings:
        if mapping.action in ('exact', 'fuzzy') and mapping.db_scene_id:
            # Replace the old slug with the new one
            # Pattern: slug: old-slug (handles both "- slug:" and "  slug:" formats)
            old_pattern = rf'(\n\s*-?\s*slug:\s*){re.escape(mapping.imagery_slug)}(\s*\n)'
            new_replacement = rf'\g<1>{mapping.db_scene_id}\g<2>'

            new_text = re.sub(old_pattern, new_replacement, text)
            if new_text != text:
                text = new_text
                slugs_updated += 1
        elif remove_unmatched and mapping.action == 'no_match':
            # Remove the slug line entirely for unmatched scenes
            # This makes the image link to chapter only
            # Handle both "- slug:" and "  slug:" formats
            old_pattern = rf'\n\s*-?\s*slug:\s*{re.escape(mapping.imagery_slug)}\s*\n'
            new_text = re.sub(old_pattern, '\n', text)
            if new_text != text:
                text = new_text
                slugs_removed += 1

    total_changes = slugs_updated + slugs_removed
    if total_changes > 0:
        if dry_run:
            print(f"  [DRY RUN] Would update {slugs_updated} + remove {slugs_removed} slug(s) in {yaml_path.name}")
        else:
            yaml_path.write_text(text, encoding='utf-8')
            print(f"  Updated {slugs_updated} + removed {slugs_removed} slug(s) in {yaml_path.name}")

    return slugs_updated, slugs_removed


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Consolidate imagery.yaml scene slugs to database format')
    parser.add_argument('--story-content', type=Path,
                        default=Path('MemoryQuill/story-content'),
                        help='Path to story-content directory')
    parser.add_argument('--out-report', type=Path,
                        default=Path('frontend/import/scene_slug_mapping_report.txt'),
                        help='Output report file')
    parser.add_argument('--out-mapping', type=Path,
                        default=Path('frontend/import/scene_slug_mapping.yaml'),
                        help='Output mapping file (YAML)')
    parser.add_argument('--apply', action='store_true',
                        help='Actually update imagery.yaml files (default: dry run)')
    parser.add_argument('--min-ratio', type=float, default=0.70,
                        help='Minimum similarity ratio for fuzzy matches (default: 0.70)')
    parser.add_argument('--remove-unmatched', action='store_true',
                        help='Remove scene slugs for unmatched imagery scenes (they will link to chapter only)')
    args = parser.parse_args()

    story_content = args.story_content
    if not story_content.exists():
        print(f"Error: story-content directory not found: {story_content}")
        sys.exit(1)

    chapters_dir = story_content / 'chapters'
    if not chapters_dir.exists():
        print(f"Error: chapters directory not found: {chapters_dir}")
        sys.exit(1)

    # Collect DB scenes from content.md files
    print("Extracting scenes from content.md files...")
    db_scenes: dict[str, list[DBScene]] = {}
    for chapter_dir in sorted(chapters_dir.iterdir()):
        if not chapter_dir.is_dir():
            continue
        content_md = chapter_dir / 'content.md'
        if content_md.exists():
            scenes = extract_scenes_from_content_md(content_md)
            if scenes:
                db_scenes[chapter_dir.name] = scenes
                print(f"  {chapter_dir.name}: {len(scenes)} scenes")

    # Collect imagery scenes from imagery.yaml files
    print("\nExtracting scenes from imagery.yaml files...")
    imagery_scenes: dict[str, list[ImageryScene]] = {}
    for chapter_dir in sorted(chapters_dir.iterdir()):
        if not chapter_dir.is_dir():
            continue
        imagery_yaml = chapter_dir / 'imagery.yaml'
        if imagery_yaml.exists():
            scenes = extract_scenes_from_imagery_yaml(imagery_yaml)
            if scenes:
                imagery_scenes[chapter_dir.name] = scenes
                print(f"  {chapter_dir.name}: {len(scenes)} scenes")

    # Match scenes
    print("\nMatching scenes by title...")
    mappings = match_scenes(db_scenes, imagery_scenes)

    # Generate report
    print(f"\nGenerating report to {args.out_report}...")
    args.out_report.parent.mkdir(parents=True, exist_ok=True)

    with open(args.out_report, 'w', encoding='utf-8') as f:
        f.write("Scene Slug Mapping Report\n")
        f.write("=" * 80 + "\n\n")

        stats = {'exact': 0, 'fuzzy': 0, 'no_match': 0}

        for content_slug in sorted(mappings.keys()):
            chapter_mappings = mappings[content_slug]
            f.write(f"\n## {content_slug}\n")
            f.write("-" * 60 + "\n")

            for m in chapter_mappings:
                stats[m.action] += 1

                if m.action == 'exact':
                    f.write(f"  [EXACT] {m.imagery_slug} -> {m.db_scene_id}\n")
                    f.write(f"          Title: \"{m.imagery_title}\"\n")
                elif m.action == 'fuzzy':
                    f.write(f"  [FUZZY {m.match_ratio:.0%}] {m.imagery_slug} -> {m.db_scene_id}\n")
                    f.write(f"          Imagery: \"{m.imagery_title}\"\n")
                    f.write(f"          DB:      \"{m.db_title}\"\n")
                else:
                    f.write(f"  [NO MATCH] {m.imagery_slug}\n")
                    f.write(f"          Title: \"{m.imagery_title}\"\n")
                    f.write(f"          (No matching DB scene found - will link to chapter only)\n")

        f.write("\n\n" + "=" * 80 + "\n")
        f.write("Summary\n")
        f.write("=" * 80 + "\n")
        f.write(f"  Exact matches:   {stats['exact']}\n")
        f.write(f"  Fuzzy matches:   {stats['fuzzy']}\n")
        f.write(f"  No match:        {stats['no_match']}\n")
        f.write(f"  Total:           {sum(stats.values())}\n")

    print(f"  Exact matches:   {stats['exact']}")
    print(f"  Fuzzy matches:   {stats['fuzzy']}")
    print(f"  No match:        {stats['no_match']}")

    # Generate mapping YAML
    if HAS_YAML:
        print(f"\nGenerating mapping file to {args.out_mapping}...")
        mapping_data = {}
        for content_slug, chapter_mappings in mappings.items():
            mapping_data[content_slug] = {}
            for m in chapter_mappings:
                if m.action in ('exact', 'fuzzy') and m.db_scene_id:
                    mapping_data[content_slug][m.imagery_slug] = {
                        'new_slug': m.db_scene_id,
                        'title': m.imagery_title,
                        'match_ratio': round(m.match_ratio, 2),
                        'action': m.action
                    }
                else:
                    mapping_data[content_slug][m.imagery_slug] = {
                        'new_slug': None,
                        'title': m.imagery_title,
                        'action': 'remove_scene_reference'
                    }

        with open(args.out_mapping, 'w', encoding='utf-8') as f:
            yaml.dump(mapping_data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)

    # Apply updates if requested
    if args.apply:
        print("\nApplying updates to imagery.yaml files...")
    else:
        print("\n[DRY RUN] Would update the following files:")

    files_changed = 0
    total_updated = 0
    total_removed = 0

    for content_slug, chapter_mappings in mappings.items():
        yaml_path = chapters_dir / content_slug / 'imagery.yaml'
        if yaml_path.exists():
            updated, removed = update_imagery_yaml(
                yaml_path,
                chapter_mappings,
                dry_run=not args.apply,
                remove_unmatched=args.remove_unmatched
            )
            if updated > 0 or removed > 0:
                files_changed += 1
                total_updated += updated
                total_removed += removed

    action = 'Updated' if args.apply else 'Would update'
    print(f"\n{action} {files_changed} files:")
    print(f"  Slugs remapped to scn-XX-YY: {total_updated}")
    if args.remove_unmatched:
        print(f"  Slugs removed (chapter-only): {total_removed}")

    if not args.apply:
        print("\nTo apply changes, run with --apply flag")


if __name__ == '__main__':
    main()
