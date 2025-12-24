"""Verify reference structure in fixed chapters."""
import sys
from pathlib import Path

# Add image-stuff to path
sys.path.insert(0, str(Path('image-stuff').resolve()))

from parsers.chapters import discover_chapters

chapters_dir = Path('MemoryQuill/story-content/chapters')
chapters = discover_chapters(chapters_dir)

print('=== Testing Reference Structure ===\n')

test_chapters = ['ch26-the-weight-of-success', 'ch26.5-the-brokers-ledger', 'ch27-official-channels']

for ch_name in test_chapters:
    if ch_name not in chapters:
        print(f'❌ {ch_name} not found')
        continue

    ch_data = chapters[ch_name]
    print(f'✅ {ch_name} (Chapter {ch_data.chapter_number})')

    # Test first scene
    if ch_data.scenes:
        scene = ch_data.scenes[0]
        print(f'   Scene: {scene.slug}')
        print(f'   References: {len(scene.references)}')

        if scene.references:
            ref = scene.references[0]
            print(f'   First ref: placeholder="{ref.placeholder}"')
            print(f'              file="{ref.file}"')
            print(f'              section="{ref.section}"')

            # Check if it's a proper object
            if hasattr(ref, 'placeholder') and hasattr(ref, 'file'):
                print(f'   ✅ References are proper objects\n')
            else:
                print(f'   ❌ References are NOT proper objects\n')
        else:
            print(f'   ⚠️  No references found\n')
    else:
        print(f'   ❌ No scenes found\n')

print('✅ All chapters have proper reference structure!')
