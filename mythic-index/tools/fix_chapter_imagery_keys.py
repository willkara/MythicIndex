#!/usr/bin/env python3
"""
Fix chapter imagery.yaml files that use 'imagery:' key instead of 'scenes:' key.

This script updates three chapter files to use the correct YAML structure
expected by the parsers.
"""

from pathlib import Path

def fix_chapter_yaml_keys():
    """Fix the YAML key structure in chapter imagery files."""

    chapters_to_fix = [
        'ch26-the-weight-of-success',
        'ch26.5-the-brokers-ledger',
        'ch27-official-channels'
    ]

    base_path = Path('MemoryQuill/story-content/chapters')

    print("=== Fixing Chapter Imagery YAML Keys ===\n")

    for chapter in chapters_to_fix:
        yaml_file = base_path / chapter / 'imagery.yaml'

        if not yaml_file.exists():
            print(f'✗ {chapter}/imagery.yaml not found')
            continue

        # Read the file
        content = yaml_file.read_text(encoding='utf-8')

        # Check if it starts with 'imagery:'
        if content.startswith('imagery:'):
            # Replace only the first occurrence
            new_content = content.replace('imagery:', 'scenes:', 1)

            # Write back
            yaml_file.write_text(new_content, encoding='utf-8')
            print(f'✓ Fixed {chapter}/imagery.yaml')
            print(f'  Changed "imagery:" to "scenes:"')
        elif content.startswith('scenes:'):
            print(f'⊘ {chapter}/imagery.yaml already uses "scenes:" key')
        else:
            print(f'⚠ {chapter}/imagery.yaml has unexpected structure')
            print(f'  First line: {content.split(chr(10))[0][:50]}...')

    print('\n=== Fix Complete ===')
    print('Run verification scan to confirm.')

if __name__ == '__main__':
    fix_chapter_yaml_keys()
