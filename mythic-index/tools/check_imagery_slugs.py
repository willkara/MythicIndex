"""Check imagery.yaml slug formats for ch26, ch26.5, and ch27."""
import yaml
from pathlib import Path

files = [
    'MemoryQuill/story-content/chapters/ch26-the-weight-of-success/imagery.yaml',
    'MemoryQuill/story-content/chapters/ch26.5-the-brokers-ledger/imagery.yaml',
    'MemoryQuill/story-content/chapters/ch27-official-channels/imagery.yaml'
]

for file_path in files:
    path = Path(file_path)
    with open(path, 'r', encoding='utf-8') as f:
        data = yaml.safe_load(f)

    chapter_num = data.get('chapter_number', '')
    print(f'\n=== {path.name} (Chapter {chapter_num}) ===')

    for i, scene in enumerate(data.get('scenes', []), 1):
        slug = scene.get('slug', '')
        title = scene.get('title', '')
        print(f'{i}. slug: "{slug}"')
        print(f'   title: "{title}"')

        # Check if slug follows proper convention
        expected_prefix = f'ch{chapter_num}-'
        if not slug.startswith(expected_prefix):
            print(f'   ❌ NEEDS FIX: Should start with "{expected_prefix}"')
        else:
            print(f'   ✅ OK')
