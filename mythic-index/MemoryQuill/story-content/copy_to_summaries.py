#!/usr/bin/env python3
"""
Copy story content files to a consolidated summaries directory with standardized naming.

This script copies files from characters/, locations/, chapters/, core/, and worldbuilding/
directories into a new summaries/ directory with consistent naming patterns:

- Characters: character_<<name>>_<<section>>.md
- Locations: location_<<name>>_<<section>>.md
- Chapters: chapter_<<name>>.md
- Core: core_<<filename>>.md
- Worldbuilding: worldbuilding_<<filename>>.md
"""

import os
import shutil
from pathlib import Path
from typing import Dict, List, Tuple

def create_summaries_directory(base_path: Path) -> Path:
    """Create the summaries directory if it doesn't exist."""
    summaries_dir = base_path / "summaries"
    summaries_dir.mkdir(exist_ok=True)
    return summaries_dir

def copy_character_files(characters_dir: Path, summaries_dir: Path) -> List[str]:
    """Copy character files with naming pattern: character_<<name>>_<<section>>.md"""
    copied_files = []

    if not characters_dir.exists():
        return copied_files

    for char_dir in characters_dir.iterdir():
        if not char_dir.is_dir() or char_dir.name == "character-template":
            continue

        char_name = char_dir.name
        for md_file in char_dir.glob("*.md"):
            section = md_file.stem  # filename without extension
            new_name = f"character_{char_name}_{section}.md"
            dest_path = summaries_dir / new_name

            shutil.copy2(md_file, dest_path)
            copied_files.append(f"{md_file.relative_to(characters_dir.parent)} -> {new_name}")

    return copied_files

def copy_location_files(locations_dir: Path, summaries_dir: Path) -> List[str]:
    """Copy location files with naming pattern: location_<<name>>_<<section>>.md"""
    copied_files = []

    if not locations_dir.exists():
        return copied_files

    for loc_dir in locations_dir.iterdir():
        if not loc_dir.is_dir() or loc_dir.name == "location-template":
            continue

        loc_name = loc_dir.name
        for md_file in loc_dir.glob("*.md"):
            section = md_file.stem  # filename without extension
            new_name = f"location_{loc_name}_{section}.md"
            dest_path = summaries_dir / new_name

            shutil.copy2(md_file, dest_path)
            copied_files.append(f"{md_file.relative_to(locations_dir.parent)} -> {new_name}")

    return copied_files

def copy_chapter_files(chapters_dir: Path, summaries_dir: Path) -> List[str]:
    """Copy chapter files with naming pattern: chapter_<<name>>.md"""
    copied_files = []

    if not chapters_dir.exists():
        return copied_files

    # Handle both subdirectory structure and direct files
    for item in chapters_dir.rglob("*.md"):
        if item.is_file():
            # Skip template or scratch files
            if "template" in item.name.lower() or "scratch" in str(item.parent).lower():
                continue

            # For files in subdirectories, use the directory name as the chapter name
            if item.parent != chapters_dir:
                chapter_name = item.parent.name
                new_name = f"chapter_{chapter_name}.md"
            else:
                # For files directly in chapters/, use the filename
                chapter_name = item.stem
                new_name = f"chapter_{chapter_name}.md"

            dest_path = summaries_dir / new_name

            # Avoid duplicates by checking if file already exists
            if not dest_path.exists():
                shutil.copy2(item, dest_path)
                copied_files.append(f"{item.relative_to(chapters_dir.parent)} -> {new_name}")

    return copied_files

def copy_core_files(core_dir: Path, summaries_dir: Path) -> List[str]:
    """Copy core files with naming pattern: core_<<filename>>.md"""
    copied_files = []

    if not core_dir.exists():
        return copied_files

    for md_file in core_dir.glob("*.md"):
        filename = md_file.stem
        new_name = f"core_{filename}.md"
        dest_path = summaries_dir / new_name

        shutil.copy2(md_file, dest_path)
        copied_files.append(f"{md_file.relative_to(core_dir.parent)} -> {new_name}")

    return copied_files

def copy_worldbuilding_files(worldbuilding_dir: Path, summaries_dir: Path) -> List[str]:
    """Copy worldbuilding files with naming pattern: worldbuilding_<<filename>>.md"""
    copied_files = []

    if not worldbuilding_dir.exists():
        return copied_files

    for md_file in worldbuilding_dir.glob("*.md"):
        filename = md_file.stem
        new_name = f"worldbuilding_{filename}.md"
        dest_path = summaries_dir / new_name

        shutil.copy2(md_file, dest_path)
        copied_files.append(f"{md_file.relative_to(worldbuilding_dir.parent)} -> {new_name}")

    return copied_files

def main():
    """Main function to copy all story content to summaries directory."""
    # Get the directory where this script is located
    base_path = Path(__file__).parent

    # Create summaries directory
    summaries_dir = create_summaries_directory(base_path)
    print(f"Created summaries directory: {summaries_dir}")

    # Define source directories
    characters_dir = base_path / "characters"
    locations_dir = base_path / "locations"
    chapters_dir = base_path / "chapters"
    core_dir = base_path / "core"
    worldbuilding_dir = base_path / "worldbuilding"

    all_copied_files = []

    # Copy files from each category
    print("\nCopying character files...")
    char_files = copy_character_files(characters_dir, summaries_dir)
    all_copied_files.extend(char_files)
    print(f"Copied {len(char_files)} character files")

    print("\nCopying location files...")
    loc_files = copy_location_files(locations_dir, summaries_dir)
    all_copied_files.extend(loc_files)
    print(f"Copied {len(loc_files)} location files")

    print("\nCopying chapter files...")
    chapter_files = copy_chapter_files(chapters_dir, summaries_dir)
    all_copied_files.extend(chapter_files)
    print(f"Copied {len(chapter_files)} chapter files")

    print("\nCopying core files...")
    core_files = copy_core_files(core_dir, summaries_dir)
    all_copied_files.extend(core_files)
    print(f"Copied {len(core_files)} core files")

    print("\nCopying worldbuilding files...")
    worldbuilding_files = copy_worldbuilding_files(worldbuilding_dir, summaries_dir)
    all_copied_files.extend(worldbuilding_files)
    print(f"Copied {len(worldbuilding_files)} worldbuilding files")

    # Summary
    print(f"\n" + "="*60)
    print(f"SUMMARY: Copied {len(all_copied_files)} total files to summaries/")
    print(f"="*60)

    # Optional: Print all copied files for verification
    if len(all_copied_files) < 50:  # Only if not too many files
        print("\nFiles copied:")
        for file_info in all_copied_files:
            print(f"  {file_info}")
    else:
        print(f"\nFiles copied (showing first 10 of {len(all_copied_files)}):")
        for file_info in all_copied_files[:10]:
            print(f"  {file_info}")
        print(f"  ... and {len(all_copied_files) - 10} more files")

if __name__ == "__main__":
    main()