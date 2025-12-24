"""Fix imagery.yaml slugs to follow proper ch{number}-{name} convention."""
import yaml
from pathlib import Path

files = [
    ('MemoryQuill/story-content/chapters/ch26-the-weight-of-success/imagery.yaml', '26'),
    ('MemoryQuill/story-content/chapters/ch26.5-the-brokers-ledger/imagery.yaml', '26.5'),
    ('MemoryQuill/story-content/chapters/ch27-official-channels/imagery.yaml', '27')
]

for file_path, chapter_num in files:
    path = Path(file_path)
    print(f'\n=== Fixing {path.name} (Chapter {chapter_num}) ===')

    with open(path, 'r', encoding='utf-8') as f:
        data = yaml.safe_load(f)

    # Fix each scene slug
    modified = False
    for scene in data.get('scenes', []):
        old_slug = scene.get('slug', '')
        expected_prefix = f'ch{chapter_num}-'

        if not old_slug.startswith(expected_prefix):
            new_slug = f"{expected_prefix}{old_slug}"
            print(f'  "{old_slug}" → "{new_slug}"')
            scene['slug'] = new_slug
            modified = True

    # Write back to file
    if modified:
        with open(path, 'w', encoding='utf-8') as f:
            yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
        print(f'✅ Saved {path.name}')
    else:
        print(f'  No changes needed')

print('\n✅ All imagery.yaml files updated!')
