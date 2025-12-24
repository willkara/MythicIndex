#!/usr/bin/env python3
"""
Fix imagery.yaml reference files to ensure they point to existing files.

This script validates all references in imagery.yaml files and ensures:
1. Character references point to profile.md (not content.md)
2. Location references point to overview.md or description.md
3. Chapter references point to content.md
4. No empty file references exist
5. All referenced files actually exist
"""

import sys
from pathlib import Path
from typing import Dict, List
import yaml

def get_entity_content_file(entity_type: str) -> str:
    """Get the appropriate content file for an entity type."""
    mapping = {
        'characters': 'profile.md',
        'locations': 'overview.md',
        'chapters': 'content.md',
        'worldbuilding': 'overview.md'
    }
    return mapping.get(entity_type, 'content.md')

def validate_and_fix_reference(ref: Dict, story_content_dir: Path) -> Dict:
    """Validate and fix a single reference entry."""
    if not ref or not isinstance(ref, dict):
        return None

    # Get reference properties
    placeholder = ref.get('placeholder', '')
    file_path = ref.get('file', '')
    section = ref.get('section', '')

    # Skip if placeholder is empty
    if not placeholder:
        print(f"  [WARN] Skipping reference with empty placeholder")
        return None

    # Skip if file path is empty
    if not file_path:
        print(f"  [ERROR] Empty file path for placeholder '{placeholder}'")
        return None

    # Parse the file path
    parts = Path(file_path).parts
    if len(parts) < 2:
        print(f"  [ERROR] Invalid file path format: {file_path}")
        return None

    entity_type = parts[0]  # e.g., 'characters', 'locations', 'chapters'
    entity_slug = parts[1]   # e.g., 'grimjaw-ironbeard'

    # Construct the entity directory
    entity_dir = story_content_dir / entity_type / entity_slug

    if not entity_dir.exists():
        print(f"  [ERROR] Entity directory doesn't exist: {entity_dir}")
        return None

    # Check if specified file exists
    specified_file = entity_dir / parts[-1] if len(parts) > 2 else None

    if specified_file and specified_file.exists():
        print(f"  [OK] Valid reference: {file_path}")
        return ref

    # File doesn't exist - try to fix it
    correct_filename = get_entity_content_file(entity_type)
    correct_path = f"{entity_type}/{entity_slug}/{correct_filename}"
    correct_file = entity_dir / correct_filename

    if correct_file.exists():
        print(f"  [FIX] {file_path} -> {correct_path}")
        return {
            'placeholder': placeholder,
            'file': correct_path,
            'section': section or 'Visual Summary'
        }

    # Try alternative files
    alternatives = {
        'characters': ['profile.md', 'background.md', 'description.md'],
        'locations': ['overview.md', 'description.md', 'details.md'],
        'chapters': ['content.md']
    }

    for alt_file in alternatives.get(entity_type, []):
        alt_path = entity_dir / alt_file
        if alt_path.exists():
            fixed_path = f"{entity_type}/{entity_slug}/{alt_file}"
            print(f"  [FIX] {file_path} -> {fixed_path}")
            return {
                'placeholder': placeholder,
                'file': fixed_path,
                'section': section or 'Visual Summary'
            }

    print(f"  [ERROR] No valid file found in {entity_dir}")
    return None

def process_imagery_file(imagery_path: Path, story_content_dir: Path, dry_run: bool = True) -> bool:
    """Process a single imagery.yaml file."""
    print(f"\n[FILE] Processing: {imagery_path.relative_to(story_content_dir.parent)}")

    try:
        with open(imagery_path, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f)

        if not data:
            print("  [WARN] Empty YAML file")
            return False

        modified = False

        # Handle chapter imagery (has scenes array)
        if 'scenes' in data:
            for scene_idx, scene in enumerate(data['scenes']):
                if 'references' not in scene or not scene['references']:
                    continue

                print(f"\n  Scene: {scene.get('slug', f'scene-{scene_idx}')}")

                fixed_refs = []
                for ref in scene['references']:
                    fixed_ref = validate_and_fix_reference(ref, story_content_dir)
                    if fixed_ref:
                        fixed_refs.append(fixed_ref)
                        if fixed_ref != ref:
                            modified = True

                if len(fixed_refs) != len(scene['references']):
                    print(f"    Removed {len(scene['references']) - len(fixed_refs)} invalid references")
                    modified = True

                scene['references'] = fixed_refs

        # Handle character/location imagery (has prompts at root)
        elif 'prompts' in data:
            # Character and location imagery files don't typically have references
            # but if they do, validate them
            if 'references' in data and data['references']:
                print(f"\n  Entity references:")
                fixed_refs = []
                for ref in data['references']:
                    fixed_ref = validate_and_fix_reference(ref, story_content_dir)
                    if fixed_ref:
                        fixed_refs.append(fixed_ref)
                        if fixed_ref != ref:
                            modified = True

                if len(fixed_refs) != len(data['references']):
                    modified = True

                data['references'] = fixed_refs

        # Write back if modified and not dry run
        if modified:
            if dry_run:
                print(f"\n  [DRY-RUN] Would save changes to {imagery_path.name}")
            else:
                with open(imagery_path, 'w', encoding='utf-8') as f:
                    yaml.safe_dump(data, f, default_flow_style=False, allow_unicode=True, width=120)
                print(f"\n  [SAVED] Changes to {imagery_path.name}")
            return True
        else:
            print(f"  [OK] No changes needed")
            return False

    except Exception as e:
        print(f"  [ERROR] Processing file: {e}")
        return False

def main():
    """Main function to process all imagery.yaml files."""
    import argparse

    # Fix Windows console encoding
    if sys.platform == 'win32':
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

    parser = argparse.ArgumentParser(description='Fix imagery.yaml reference files')
    parser.add_argument('--story-content-dir', default='MemoryQuill/story-content',
                       help='Path to story-content directory')
    parser.add_argument('--dry-run', action='store_true',
                       help='Preview changes without saving')
    parser.add_argument('--entity-type', choices=['characters', 'locations', 'chapters', 'all'],
                       default='all', help='Which entity type to process')

    args = parser.parse_args()

    story_content_dir = Path(args.story_content_dir)
    if not story_content_dir.exists():
        print(f"[ERROR] Story content directory not found: {story_content_dir}")
        sys.exit(1)

    print(f"[SCAN] Scanning {story_content_dir}")
    print(f"{'[DRY RUN MODE]' if args.dry_run else '[WRITE MODE]'}")
    print("=" * 80)

    # Collect all imagery.yaml files
    entity_types = ['chapters', 'characters', 'locations'] if args.entity_type == 'all' else [args.entity_type]

    total_files = 0
    modified_files = 0

    for entity_type in entity_types:
        entity_dir = story_content_dir / entity_type
        if not entity_dir.exists():
            continue

        imagery_files = list(entity_dir.glob('*/imagery.yaml'))
        print(f"\n\n{'='*80}")
        print(f"[{entity_type.upper()}] Found {len(imagery_files)} imagery.yaml files")
        print(f"{'='*80}")

        for imagery_file in sorted(imagery_files):
            total_files += 1
            if process_imagery_file(imagery_file, story_content_dir, args.dry_run):
                modified_files += 1

    print(f"\n\n{'='*80}")
    print(f"[SUMMARY]")
    print(f"{'='*80}")
    print(f"Total files processed: {total_files}")
    print(f"Files {'needing changes' if args.dry_run else 'modified'}: {modified_files}")

    if args.dry_run and modified_files > 0:
        print(f"\n[TIP] Run without --dry-run to apply changes")

if __name__ == '__main__':
    main()
