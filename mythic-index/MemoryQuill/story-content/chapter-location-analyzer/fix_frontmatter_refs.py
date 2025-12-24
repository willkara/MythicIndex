#!/usr/bin/env python3
"""
Fix Chapter Frontmatter Entity References
==========================================

Corrects character and location slugs in chapter frontmatter to match
actual entity directories.

Usage:
    # Preview changes (dry-run)
    python fix_frontmatter_refs.py --dry-run

    # Apply changes
    python fix_frontmatter_refs.py --apply

    # Process specific chapter
    python fix_frontmatter_refs.py --apply --slug ch02-the-lantern-ward
"""

import re
from pathlib import Path

import typer
import yaml
from loguru import logger

# ============================================================================
# Configuration
# ============================================================================

SCRIPT_DIR = Path(__file__).parent
STORY_CONTENT_DIR = SCRIPT_DIR.parent
CHAPTERS_DIR = STORY_CONTENT_DIR / "chapters"
CHARACTERS_DIR = STORY_CONTENT_DIR / "characters"
LOCATIONS_DIR = STORY_CONTENT_DIR / "locations"

# Known corrections: partial/wrong slug -> correct full slug
CHARACTER_CORRECTIONS = {
    "fayne": "quartermaster-fayne",
    "halden": "medic-halden",
    "lysander": "lysander-valerius",
    "tomaq": "lieutenant-tomaq",
    "archdruid-silvan-oakshield": "archdruid-silvan",
    "lily": "lily-blackwood",
    "mira": "vera-moonwhisper",  # Possible alias?
}

LOCATION_CORRECTIONS = {
    "warehouse-complex": "dock-ward-warehouse-complex",
    "spire-of-learning": "the-spire-of-learning",
    "windborne-roost": "the-windborne-roost",
    "wayward-compass": "the-wayward-compass",
    "silent_hand_safehouse": "silent-hand-facility",  # Underscore -> hyphen + rename
}

# Skip these directories when scanning chapters
SKIP_DIRS = {"drafts", "scratch", "scratch-ideas", "templates"}


# ============================================================================
# Frontmatter Parsing
# ============================================================================


def parse_frontmatter(content: str) -> tuple[dict, str, str]:
    """
    Extract YAML frontmatter and body from markdown content.

    Returns:
        Tuple of (frontmatter_dict, frontmatter_raw, body_text)
    """
    pattern = r"^---\s*\n(.*?)\n---\s*\n(.*)$"
    match = re.match(pattern, content, re.DOTALL)

    if match:
        frontmatter_raw = match.group(1)
        body = match.group(2)
        try:
            frontmatter = yaml.safe_load(frontmatter_raw) or {}
        except yaml.YAMLError as e:
            logger.warning(f"Failed to parse frontmatter: {e}")
            frontmatter = {}
        return frontmatter, frontmatter_raw, body

    return {}, "", content


def rebuild_content(frontmatter: dict, body: str) -> str:
    """Rebuild markdown content with updated frontmatter."""
    # Use yaml.dump with specific formatting for readability
    frontmatter_str = yaml.dump(
        frontmatter,
        default_flow_style=None,  # Use block style for lists, flow for simple values
        allow_unicode=True,
        sort_keys=False,  # Preserve key order
        width=120,
    )
    return f"---\n{frontmatter_str}---\n{body}"


# ============================================================================
# Correction Logic
# ============================================================================


def apply_corrections(slugs: list, corrections: dict) -> tuple[list, list]:
    """
    Apply corrections to a list of slugs.

    Returns:
        Tuple of (corrected_list, changes_made)
        where changes_made is a list of (old, new) tuples
    """
    corrected = []
    changes = []

    for slug in slugs:
        if slug in corrections:
            new_slug = corrections[slug]
            corrected.append(new_slug)
            changes.append((slug, new_slug))
        else:
            corrected.append(slug)

    return corrected, changes


def get_existing_entities() -> tuple[set, set]:
    """Get sets of existing character and location slugs."""
    characters = set()
    locations = set()

    # Scan character directories
    if CHARACTERS_DIR.exists():
        for item in CHARACTERS_DIR.iterdir():
            if item.is_dir() and item.name not in {"drafts", "character-template"}:
                characters.add(item.name)
        # Also check drafts
        drafts_dir = CHARACTERS_DIR / "drafts"
        if drafts_dir.exists():
            for item in drafts_dir.iterdir():
                if item.is_dir():
                    characters.add(item.name)

    # Scan location directories
    if LOCATIONS_DIR.exists():
        for item in LOCATIONS_DIR.iterdir():
            if item.is_dir() and item.name not in {"location-template", "bastion_DO_NOT_USE"}:
                locations.add(item.name)

    return characters, locations


# ============================================================================
# Main Processing
# ============================================================================


def process_chapter(
    chapter_path: Path,
    existing_characters: set,
    existing_locations: set,
    dry_run: bool = True,
) -> dict:
    """
    Process a single chapter and fix frontmatter references.

    Returns:
        Dict with processing results
    """
    content_file = chapter_path / "content.md"
    if not content_file.exists():
        return {"slug": chapter_path.name, "status": "skipped", "reason": "no content.md"}

    content = content_file.read_text(encoding="utf-8")
    frontmatter, frontmatter_raw, body = parse_frontmatter(content)

    if not frontmatter:
        return {"slug": chapter_path.name, "status": "skipped", "reason": "no frontmatter"}

    all_changes = []
    modified = False

    # Process key_characters
    if "key_characters" in frontmatter:
        chars = frontmatter["key_characters"]
        if isinstance(chars, list):
            corrected, changes = apply_corrections(chars, CHARACTER_CORRECTIONS)
            if changes:
                all_changes.extend([("character", old, new) for old, new in changes])
                frontmatter["key_characters"] = corrected
                modified = True

    # Process key_locations
    if "key_locations" in frontmatter:
        locs = frontmatter["key_locations"]
        if isinstance(locs, list):
            corrected, changes = apply_corrections(locs, LOCATION_CORRECTIONS)
            if changes:
                all_changes.extend([("location", old, new) for old, new in changes])
                frontmatter["key_locations"] = corrected
                modified = True

    result = {
        "slug": chapter_path.name,
        "status": "modified" if modified else "unchanged",
        "changes": all_changes,
    }

    # Write changes if not dry run
    if modified and not dry_run:
        new_content = rebuild_content(frontmatter, body)
        content_file.write_text(new_content, encoding="utf-8")
        result["status"] = "written"

    return result


def discover_chapters() -> list[Path]:
    """Find all chapter directories with content.md files."""
    chapters = []

    for item in sorted(CHAPTERS_DIR.iterdir()):
        if not item.is_dir():
            continue
        if item.name in SKIP_DIRS:
            continue

        content_file = item / "content.md"
        if content_file.exists():
            chapters.append(item)

    return chapters


# ============================================================================
# CLI
# ============================================================================

app = typer.Typer(help="Fix chapter frontmatter entity references")


@app.command()
def main(
    dry_run: bool = typer.Option(
        True, "--dry-run/--apply", help="Preview changes without writing (default: dry-run)"
    ),
    slug: str = typer.Option(None, "--slug", "-s", help="Process specific chapter slug"),
    verbose: bool = typer.Option(False, "--verbose", "-v", help="Show all chapters, not just modified"),
):
    """Fix character and location references in chapter frontmatter."""

    # Get existing entities for validation
    existing_characters, existing_locations = get_existing_entities()
    logger.info(f"Found {len(existing_characters)} characters, {len(existing_locations)} locations")

    # Discover chapters
    if slug:
        chapter_path = CHAPTERS_DIR / slug
        if not chapter_path.exists():
            logger.error(f"Chapter not found: {slug}")
            raise typer.Exit(1)
        chapters = [chapter_path]
    else:
        chapters = discover_chapters()

    logger.info(f"Processing {len(chapters)} chapters (dry_run={dry_run})")

    # Process each chapter
    total_changes = 0
    modified_chapters = []

    for chapter_path in chapters:
        result = process_chapter(
            chapter_path,
            existing_characters,
            existing_locations,
            dry_run=dry_run,
        )

        if result["changes"]:
            modified_chapters.append(result)
            total_changes += len(result["changes"])

            logger.info(f"[{result['slug']}] {result['status']}")
            for change_type, old, new in result["changes"]:
                logger.info(f"  {change_type}: {old} -> {new}")
        elif verbose:
            logger.debug(f"[{result['slug']}] {result['status']}")

    # Summary
    logger.info("=" * 60)
    if dry_run:
        logger.info(f"DRY RUN: Would modify {len(modified_chapters)} chapters with {total_changes} changes")
        logger.info("Run with --apply to write changes")
    else:
        logger.info(f"APPLIED: Modified {len(modified_chapters)} chapters with {total_changes} changes")

    # Show unmapped references if any remain
    if verbose:
        show_unmapped_refs(chapters, existing_characters, existing_locations)


def show_unmapped_refs(chapters: list[Path], existing_characters: set, existing_locations: set):
    """Show references that couldn't be mapped to existing entities."""
    unmapped_chars = set()
    unmapped_locs = set()

    for chapter_path in chapters:
        content_file = chapter_path / "content.md"
        if not content_file.exists():
            continue

        content = content_file.read_text(encoding="utf-8")
        frontmatter, _, _ = parse_frontmatter(content)

        # Check characters
        for char in frontmatter.get("key_characters", []):
            corrected = CHARACTER_CORRECTIONS.get(char, char)
            if corrected not in existing_characters:
                unmapped_chars.add(char)

        # Check locations
        for loc in frontmatter.get("key_locations", []):
            corrected = LOCATION_CORRECTIONS.get(loc, loc)
            if corrected not in existing_locations:
                unmapped_locs.add(loc)

    if unmapped_chars:
        logger.warning(f"Unmapped characters ({len(unmapped_chars)}): {sorted(unmapped_chars)}")
    if unmapped_locs:
        logger.warning(f"Unmapped locations ({len(unmapped_locs)}): {sorted(unmapped_locs)}")


if __name__ == "__main__":
    app()
