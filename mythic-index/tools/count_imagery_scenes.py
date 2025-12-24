"""Calculate total imagery scenes across all chapters, characters, and locations."""
import sys
from pathlib import Path

# Add image-stuff to path
sys.path.insert(0, str(Path('image-stuff').resolve()))

from parsers.chapters import discover_chapters
from parsers.characters import discover_characters
from parsers.locations import discover_locations

chapters_dir = Path('MemoryQuill/story-content/chapters')
characters_dir = Path('MemoryQuill/story-content/characters')
locations_dir = Path('MemoryQuill/story-content/locations')

chapters = discover_chapters(chapters_dir)
characters = discover_characters(characters_dir)
locations = discover_locations(locations_dir)

print(f'=== IMAGE GENERATION CAPACITY ANALYSIS ===\n')

# === CHARACTERS ===
char_total = 0
char_generated = 0
char_pending = 0

for char_name, char_data in characters.items():
    # Each character has multiple prompts, each generates 1 image
    prompt_count = len(char_data.prompts)
    # Check if images exist in the images directory
    if char_data.images_dir.exists():
        existing_images = len(list(char_data.images_dir.glob('*.png'))) + len(list(char_data.images_dir.glob('*.jpg')))
    else:
        existing_images = 0

    char_total += prompt_count
    char_generated += min(existing_images, prompt_count)  # Cap at prompt count
    char_pending += max(0, prompt_count - existing_images)

# === LOCATIONS ===
loc_total = 0
loc_generated = 0
loc_pending = 0

for loc_name, loc_data in locations.items():
    # Overview + zones
    all_zones = [loc_data.overview] + loc_data.zones

    for zone in all_zones:
        loc_total += 1
        if zone.generated_images:
            loc_generated += 1
        else:
            loc_pending += 1

# === CHAPTERS ===
chapter_total = 0
chapter_generated = 0
chapter_pending = 0

chapter_stats = []

for chapter_name in sorted(chapters.keys()):
    ch_data = chapters[chapter_name]
    scene_count = len(ch_data.scenes)

    # Count how many have generated images
    generated_count = sum(1 for scene in ch_data.scenes if scene.generated_images)
    pending_count = scene_count - generated_count

    chapter_stats.append({
        'name': chapter_name,
        'number': ch_data.chapter_number,
        'scenes': scene_count,
        'generated': generated_count,
        'pending': pending_count
    })

    chapter_total += scene_count
    chapter_generated += generated_count
    chapter_pending += pending_count

# === TOTALS ===
total_images = char_total + loc_total + chapter_total
total_generated = char_generated + loc_generated + chapter_generated
total_pending = char_pending + loc_pending + chapter_pending# === BREAKDOWN BY TYPE ===
print(f'📊 BREAKDOWN BY CONTENT TYPE:\n')
print(f'{"Type":<20} {"Total":<10} {"Generated":<12} {"Pending":<10} {"Progress"}')
print('=' * 70)

char_pct = (char_generated / char_total * 100) if char_total > 0 else 0
loc_pct = (loc_generated / loc_total * 100) if loc_total > 0 else 0
chapter_pct = (chapter_generated / chapter_total * 100) if chapter_total > 0 else 0

print(f'🎭 Characters         {char_total:<10} {char_generated:<12} {char_pending:<10} {char_pct:>5.1f}%')
print(f'🏛️  Locations          {loc_total:<10} {loc_generated:<12} {loc_pending:<10} {loc_pct:>5.1f}%')
print(f'📖 Chapters/Scenes    {chapter_total:<10} {chapter_generated:<12} {chapter_pending:<10} {chapter_pct:>5.1f}%')
print('=' * 70)
print(f'{"TOTAL:":<20} {total_images:<10} {total_generated:<12} {total_pending:<10} {(total_generated/total_images*100):>5.1f}%')

# Sort by chapter number
chapter_stats.sort(key=lambda x: float(str(x['number']).replace('.', '.')))

print(f'\n\n� CHAPTER SCENES BREAKDOWN:\n')
print(f'{"Chapter":<35} {"Scenes":<8} {"Generated":<12} {"Pending":<10}')
print('=' * 70)

for stat in chapter_stats:
    status = '✅' if stat['pending'] == 0 else '⏳'
    print(f'{status} {stat["name"]:<33} {stat["scenes"]:<8} {stat["generated"]:<12} {stat["pending"]:<10}')

print('=' * 70)
print(f'{"CHAPTER TOTALS:":<35} {chapter_total:<8} {chapter_generated:<12} {chapter_pending:<10}')

print(f'\n\n📈 OVERALL SUMMARY:\n')
print(f'  Total Content Types:      3 (Characters, Locations, Chapters)')
print(f'  Total Characters:         {len(characters)}')
print(f'  Total Locations:          {len(locations)}')
print(f'  Total Chapters:           {len(chapters)}')
print(f'  Total Images:             {total_images}')
print(f'  Already Generated:        {total_generated} ({total_generated/total_images*100:.1f}%)')
print(f'  Pending Generation:       {total_pending} ({total_pending/total_images*100:.1f}%)')

print(f'\n💡 COST ESTIMATES BY PROVIDER/MODEL:')
print(f'\n  Note: Cost breakdown reflects actual sizes used:')
print(f'    - Characters: 1024x1536 (portrait)')
print(f'    - Locations: 1536x1024 (landscape)')
print(f'    - Chapters: 1024x1536 (portrait)')
print(f'\n  OpenAI gpt-image-1.5:')

# Calculate mixed costs for OpenAI (characters + chapters = portrait, locations = landscape)
portrait_pending = char_pending + chapter_pending  # Characters + Chapters use portrait
landscape_pending = loc_pending  # Locations use landscape

openai_low = (portrait_pending * 0.01632) + (landscape_pending * 0.01600)
openai_medium = (portrait_pending * 0.06336) + (landscape_pending * 0.06272)
openai_high = (portrait_pending * 0.24960) + (landscape_pending * 0.24832)

print(f'    Low quality (mixed):         ${openai_low:.2f}')
print(f'      ({char_pending} char @ 1024x1536 + {chapter_pending} scenes @ 1024x1536 + {loc_pending} loc @ 1536x1024)')
print(f'    Medium quality (mixed):      ${openai_medium:.2f}')
print(f'    High quality (mixed):        ${openai_high:.2f}')
print(f'\n  Google Gemini 2.5 Flash Image:')
print(f'    Standard:                    ${total_pending * 0.039:.2f}')
print(f'\n  Google Imagen (Vertex AI):')
print(f'    Imagen 4 Fast:               ${total_pending * 0.0025:.2f} (0-15M images/month)')
print(f'    Imagen 4:                    ${total_pending * 0.010:.2f} (0-15M images/month)')
print(f'    Imagen 3 Fast:               ${total_pending * 0.003:.2f} (0-15M images/month)')
print(f'    Imagen 3:                    ${total_pending * 0.012:.2f} (0-15M images/month)')
print(f'    Imagen 3 Ultra:              ${total_pending * 0.015:.2f} (0-15M images/month)')

print(f'\n⏱️  TIME ESTIMATES (approximate):')
print(f'  At 30 sec/image:          {total_pending * 30 / 60:.0f} minutes ({total_pending * 30 / 3600:.1f} hours)')
print(f'  At 60 sec/image:          {total_pending * 60 / 60:.0f} minutes ({total_pending * 60 / 3600:.1f} hours)')

# Find chapters with most scenes
print(f'\n🏆 TOP 5 CHAPTERS BY SCENE COUNT:\n')
top_chapters = sorted(chapter_stats, key=lambda x: x['scenes'], reverse=True)[:5]
for i, stat in enumerate(top_chapters, 1):
    print(f'  {i}. {stat["name"]}: {stat["scenes"]} scenes ({stat["pending"]} pending)')

# Find recently fixed chapters
print(f'\n🔧 RECENTLY FIXED CHAPTERS (now ready for generation):\n')
fixed_chapters = ['ch26-the-weight-of-success', 'ch26.5-the-brokers-ledger', 'ch27-official-channels']
for ch_name in fixed_chapters:
    for stat in chapter_stats:
        if stat['name'] == ch_name:
            print(f'  ✨ {stat["name"]}: {stat["scenes"]} scenes ready')
            break
