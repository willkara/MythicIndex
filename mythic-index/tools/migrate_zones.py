#!/usr/bin/env python3
"""
Zone Consolidation Script

Consolidates location zones from three data sources:
1. location_analysis.yaml - narrative zone definitions
2. imagery.yaml - visual zone specifications
3. Chapter scene markers - zone usage in scenes

Generates a simplified zones.yaml for each location with consolidated unique zones
and chapter tracking.

Usage:
    python migrate_zones.py                     # Migrate all locations
    python migrate_zones.py westwall-watchpost  # Migrate specific location
    python migrate_zones.py --dry-run           # Preview without writing files
"""

import sys
import yaml
import re
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Tuple, Any, Set

# Paths
STORY_CONTENT_DIR = Path("MemoryQuill/story-content")
LOCATIONS_DIR = STORY_CONTENT_DIR / "locations"
CHAPTERS_DIR = STORY_CONTENT_DIR / "chapters"


# ============================================================================
# Zone Slug Extraction Functions
# ============================================================================


def extract_zone_slug_from_imagery(imagery_zone: Dict[str, Any], location_slug: str) -> str:
    """
    Extract unprefixed zone slug from imagery.yaml zone.

    imagery.yaml format uses location-prefixed slugs: {location-slug}-{zone-slug}
    Example: "merchants-rest-tavern-working-hands" → "working-hands"

    Args:
        imagery_zone: Zone dict from imagery.yaml
        location_slug: The location's slug for prefix stripping

    Returns:
        Unprefixed zone slug
    """
    full_slug = imagery_zone.get('slug', '')
    prefix = f"{location_slug}-"

    if full_slug.startswith(prefix):
        return full_slug[len(prefix):]

    # Fallback: return as-is if no prefix match
    return full_slug


def extract_zone_slugs_from_scene_marker(scene_marker_content: str) -> Set[str]:
    """
    Extract zone slugs from chapter SCENE-START HTML comments.

    Scene marker format:
    <!-- SCENE-START id:scn-16-01
         location:"westwall-watchpost"
         primary_zone:"courtyard"
         location_zones:["courtyard","main-gate"]
    -->

    Returns zone slugs from both primary_zone and location_zones.

    Args:
        scene_marker_content: HTML comment string

    Returns:
        Set of unique zone slugs found in the marker
    """
    zone_slugs = set()

    # Extract primary_zone
    primary_match = re.search(r'primary_zone:"([^"]+)"', scene_marker_content)
    if primary_match:
        zone_slugs.add(primary_match.group(1))

    # Extract location_zones array
    zones_match = re.search(r'location_zones:\[([^\]]+)\]', scene_marker_content)
    if zones_match:
        zones_str = zones_match.group(1)
        # Parse JSON-like array: ["zone1","zone2"]
        zones = re.findall(r'"([^"]+)"', zones_str)
        zone_slugs.update(zones)

    return zone_slugs


# ============================================================================
# Zone Name Resolution
# ============================================================================


def slugify_to_name(slug: str) -> str:
    """
    Convert slug to title case name.

    Example: 'working-hands' → 'Working Hands'

    Args:
        slug: URL-friendly slug

    Returns:
        Human-readable name
    """
    return slug.replace('-', ' ').replace('_', ' ').title()


def resolve_zone_name(
    zone_slug: str,
    analysis_zones: List[Dict[str, Any]],
    imagery_zones: List[Dict[str, Any]],
    location_slug: str
) -> str:
    """
    Resolve human-readable name for a zone slug.

    Priority:
    1. location_analysis.yaml name (most authoritative)
    2. imagery.yaml name (fallback)
    3. Slug-to-name conversion (last resort)

    Args:
        zone_slug: The unprefixed zone slug
        analysis_zones: List of zones from location_analysis.yaml
        imagery_zones: List of zones from imagery.yaml
        location_slug: Location slug for prefix stripping

    Returns:
        Human-readable zone name
    """
    # Check location_analysis zones first (most authoritative)
    for zone in analysis_zones:
        if zone.get('slug') == zone_slug:
            return zone.get('name', slugify_to_name(zone_slug))

    # Check imagery zones (need to match against unprefixed slug)
    for zone in imagery_zones:
        unprefixed = extract_zone_slug_from_imagery(zone, location_slug)
        if unprefixed == zone_slug:
            return zone.get('name', slugify_to_name(zone_slug))

    # Last resort: convert slug to name
    return slugify_to_name(zone_slug)


# ============================================================================
# Source Parsers
# ============================================================================


def parse_location_analysis_zones(location_dir: Path) -> List[Dict[str, Any]]:
    """
    Parse zones from location_analysis.yaml.

    Args:
        location_dir: Path to location directory

    Returns:
        List of zone dicts from location_analysis.yaml, or empty list if not found
    """
    analysis_path = location_dir / "location_analysis.yaml"
    if not analysis_path.exists():
        return []

    try:
        with open(analysis_path, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f)

        if not data or 'zones' not in data:
            return []

        zones = data.get('zones', [])
        return [z for z in zones if z and z.get('slug')]

    except Exception as e:
        print(f"⚠ Error parsing location_analysis.yaml in {location_dir.name}: {e}")
        return []


def parse_imagery_zones(location_dir: Path) -> List[Dict[str, Any]]:
    """
    Parse zones from imagery.yaml.

    Args:
        location_dir: Path to location directory

    Returns:
        List of zone dicts from imagery.yaml, or empty list if not found
    """
    imagery_path = location_dir / "imagery.yaml"
    if not imagery_path.exists():
        return []

    try:
        with open(imagery_path, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f)

        if not data:
            return []

        zones = data.get('zones', [])
        return [z for z in zones if z and z.get('slug')]

    except Exception as e:
        print(f"⚠ Error parsing imagery.yaml in {location_dir.name}: {e}")
        return []


def get_location_name(location_dir: Path, location_slug: str) -> str:
    """
    Extract location name from overview.md or location_analysis.yaml.

    Args:
        location_dir: Path to location directory
        location_slug: Fallback slug for default name

    Returns:
        Human-readable location name
    """
    # Try overview.md frontmatter first
    overview_path = location_dir / "overview.md"
    if overview_path.exists():
        try:
            content = overview_path.read_text(encoding='utf-8')
            match = re.search(r'^name:\s*(.+)$', content, re.MULTILINE)
            if match:
                return match.group(1).strip()
        except Exception:
            pass

    # Fallback: location_analysis.yaml
    analysis_path = location_dir / "location_analysis.yaml"
    if analysis_path.exists():
        try:
            with open(analysis_path, 'r', encoding='utf-8') as f:
                data = yaml.safe_load(f)
                if data and 'location_identity' in data:
                    name = data['location_identity'].get('name')
                    if name:
                        return name
        except Exception:
            pass

    # Last resort: slug to title
    return location_slug.replace('-', ' ').title()


# ============================================================================
# Chapter Scanning
# ============================================================================


def find_location_chapter_data(location_slug: str) -> Tuple[Set[str], List[str], Dict[str, List[str]]]:
    """
    Scan all chapter content.md files for scenes referencing this location.
    Extract zone slugs, track which chapters feature this location, and map zones to chapters.

    Args:
        location_slug: The location to search for

    Returns:
        Tuple of:
        - Set of unique zone slugs found in chapter scene markers
        - List of chapter slugs that reference this location (in chapter order)
        - Dict mapping zone slug → list of chapter slugs that feature that zone
    """
    zone_slugs = set()
    chapter_slugs = []
    zone_to_chapters: Dict[str, List[str]] = {}  # Maps zone slug to chapters that use it

    if not CHAPTERS_DIR.exists():
        return zone_slugs, chapter_slugs, zone_to_chapters

    # Scan chapters in order
    for chapter_dir in sorted(CHAPTERS_DIR.glob('ch*')):
        content_path = chapter_dir / 'content.md'
        if not content_path.exists():
            continue

        try:
            with open(content_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # Find all SCENE-START markers
            scene_markers = re.findall(
                r'<!--\s*SCENE-START.*?-->',
                content,
                re.DOTALL
            )

            location_found_in_chapter = False
            chapter_zones_in_this_chapter = set()

            for marker in scene_markers:
                # Check if this scene references our location
                location_match = re.search(r'location:"([^"]+)"', marker)
                if not location_match or location_match.group(1) != location_slug:
                    continue

                location_found_in_chapter = True

                # Extract zone slugs from this scene
                zones_in_scene = extract_zone_slugs_from_scene_marker(marker)
                zone_slugs.update(zones_in_scene)
                chapter_zones_in_this_chapter.update(zones_in_scene)

            # Track chapter slug if location was found
            if location_found_in_chapter:
                chapter_slugs.append(chapter_dir.name)

                # Map each zone in this chapter to the chapter
                for zone_slug in chapter_zones_in_this_chapter:
                    if zone_slug not in zone_to_chapters:
                        zone_to_chapters[zone_slug] = []
                    zone_to_chapters[zone_slug].append(chapter_dir.name)

        except Exception as e:
            print(f"⚠ Error scanning {chapter_dir.name}: {e}")
            continue

    return zone_slugs, chapter_slugs, zone_to_chapters


# ============================================================================
# Zone Consolidation
# ============================================================================


def consolidate_zones(location_dir: Path, location_slug: str, location_name: str) -> Dict[str, Any]:
    """
    Consolidate zones from all three sources.

    Merges unique zone slugs from:
    1. location_analysis.yaml
    2. imagery.yaml (with prefix stripping)
    3. Chapter scene markers

    Args:
        location_dir: Path to location directory
        location_slug: The location's slug
        location_name: Human-readable location name

    Returns:
        Dictionary with metadata and zones for zones.yaml
    """
    # 1. Parse all sources
    analysis_zones = parse_location_analysis_zones(location_dir)
    imagery_zones = parse_imagery_zones(location_dir)
    chapter_zone_slugs, chapter_list, zone_to_chapters = find_location_chapter_data(location_slug)

    # 2. Collect all unique zone slugs
    zone_slugs: Set[str] = set()

    # From location_analysis.yaml
    zone_slugs.update(z['slug'] for z in analysis_zones)

    # From imagery.yaml (strip prefix)
    zone_slugs.update(
        extract_zone_slug_from_imagery(z, location_slug)
        for z in imagery_zones
    )

    # From chapter scene markers
    zone_slugs.update(chapter_zone_slugs)

    # 3. Build zone objects with names and chapter associations
    zones = []
    for slug in sorted(zone_slugs):  # Sort for consistency
        zone_obj = {
            'slug': slug,
            'name': resolve_zone_name(slug, analysis_zones, imagery_zones, location_slug)
        }

        # Add chapter associations if this zone appears in chapters
        if slug in zone_to_chapters:
            zone_obj['featured_in_chapters'] = zone_to_chapters[slug]

        zones.append(zone_obj)

    # 4. Build final structure
    return {
        'metadata': {
            'location_slug': location_slug,
            'location_name': location_name,
            'zone_count': len(zones),
            'featured_in_chapters': chapter_list,
            'sources_processed': {
                'location_analysis': len(analysis_zones) > 0,
                'imagery': len(imagery_zones) > 0,
                'chapters': len(chapter_zone_slugs) > 0
            },
            'last_updated': datetime.now().strftime('%Y-%m-%d')
        },
        'zones': zones
    }


# ============================================================================
# File I/O
# ============================================================================


def write_zones_yaml(location_dir: Path, zones_data: Dict[str, Any]) -> None:
    """
    Write consolidated zones.yaml file.

    Args:
        location_dir: Path to location directory
        zones_data: Dictionary with metadata and zones
    """
    output_path = location_dir / 'zones.yaml'

    with open(output_path, 'w', encoding='utf-8') as f:
        yaml.dump(
            zones_data,
            f,
            default_flow_style=False,
            allow_unicode=True,
            sort_keys=False,
            width=100
        )


def migrate_all_locations(story_content_dir: Path, dry_run: bool = False, specific_location: str = None):
    """
    Process all locations (or specific location) and generate zones.yaml files.

    Args:
        story_content_dir: Path to story-content directory
        dry_run: If True, print what would be done without writing files
        specific_location: Optional specific location slug to process
    """
    locations_dir = story_content_dir / 'locations'

    if not locations_dir.exists():
        print(f"Error: Locations directory not found: {locations_dir}")
        return

    # Determine which locations to process
    if specific_location:
        location_dirs = [locations_dir / specific_location]
        if not location_dirs[0].exists():
            print(f"Error: Location directory not found: {location_dirs[0]}")
            return
    else:
        location_dirs = sorted([d for d in locations_dir.iterdir() if d.is_dir()])

    # Process each location
    processed = 0
    created = 0
    skipped = 0

    for location_dir in location_dirs:
        location_slug = location_dir.name

        try:
            # Get location name
            location_name = get_location_name(location_dir, location_slug)

            # Consolidate zones from all sources
            zones_data = consolidate_zones(location_dir, location_slug, location_name)

            # Skip if no zones found
            if zones_data['metadata']['zone_count'] == 0:
                print(f"⏭️  Skipping {location_slug}: No zones found")
                skipped += 1
                continue

            # Write zones.yaml
            if not dry_run:
                write_zones_yaml(location_dir, zones_data)
                print(f"✅ {location_slug}: {zones_data['metadata']['zone_count']} zones")

                # Show chapter info if available
                chapters = zones_data['metadata']['featured_in_chapters']
                if chapters:
                    print(f"   Featured in: {', '.join(chapters)}")
            else:
                print(f"[DRY RUN] {location_slug}: {zones_data['metadata']['zone_count']} zones")
                chapters = zones_data['metadata']['featured_in_chapters']
                if chapters:
                    print(f"           Featured in: {', '.join(chapters)}")

            processed += 1
            created += zones_data['metadata']['zone_count']

        except Exception as e:
            print(f"❌ Error processing {location_slug}: {e}")
            import traceback
            traceback.print_exc()

    # Summary
    print("\n" + "=" * 50)
    print("SUMMARY")
    print("=" * 50)
    print(f"Locations processed: {processed}")
    print(f"Total zones created: {created}")
    print(f"Locations skipped: {skipped}")

    if dry_run:
        print("\n(No files were written - this was a dry run)")


# ============================================================================
# Entry Point
# ============================================================================


def main():
    """Main entry point"""
    import argparse

    parser = argparse.ArgumentParser(
        description="Consolidate location zones from multiple sources into zones.yaml"
    )
    parser.add_argument('location', nargs='?', help='Specific location slug to process')
    parser.add_argument('--dry-run', action='store_true', help='Preview without writing files')

    args = parser.parse_args()

    migrate_all_locations(
        STORY_CONTENT_DIR,
        dry_run=args.dry_run,
        specific_location=args.location
    )


if __name__ == '__main__':
    main()
