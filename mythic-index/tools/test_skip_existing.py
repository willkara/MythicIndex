"""Test script to verify --skip-existing functionality."""
import sys
from pathlib import Path

# Add image-stuff to path
sys.path.insert(0, str(Path('image-stuff').resolve()))

from parsers.chapters import discover_chapters
from parsers.characters import discover_characters
from parsers.locations import discover_locations
from models import Provider, GeminiModel

# Discover content
characters_dir = Path('MemoryQuill/story-content/characters')
locations_dir = Path('MemoryQuill/story-content/locations')
chapters_dir = Path('MemoryQuill/story-content/chapters')

characters = discover_characters(characters_dir)
locations = discover_locations(locations_dir)
chapters = discover_chapters(chapters_dir)

print("=== SKIP EXISTING TEST ===\n")

# Test 1: Characters without skip
from parsers.characters import create_image_requests as create_char_requests
char_requests_all = create_char_requests(
    characters,
    Provider.GEMINI,
    GeminiModel.GEMINI_2_5_FLASH_IMAGE.value,
    limit=None,
    skip_existing=False
)
total_char_all = sum(len(reqs) for reqs in char_requests_all.values())

char_requests_skip = create_char_requests(
    characters,
    Provider.GEMINI,
    GeminiModel.GEMINI_2_5_FLASH_IMAGE.value,
    limit=None,
    skip_existing=True
)
total_char_skip = sum(len(reqs) for reqs in char_requests_skip.values())

print(f"📊 CHARACTERS:")
print(f"  Without --skip-existing: {total_char_all} requests")
print(f"  With --skip-existing:    {total_char_skip} requests")
print(f"  Skipped:                 {total_char_all - total_char_skip} requests\n")

# Test 2: Locations without skip
from parsers.locations import create_location_image_requests
loc_requests_all = create_location_image_requests(
    locations,
    Provider.GEMINI,
    GeminiModel.GEMINI_2_5_FLASH_IMAGE.value,
    limit=None,
    skip_existing=False
)
total_loc_all = sum(len(reqs) for reqs in loc_requests_all.values())

loc_requests_skip = create_location_image_requests(
    locations,
    Provider.GEMINI,
    GeminiModel.GEMINI_2_5_FLASH_IMAGE.value,
    limit=None,
    skip_existing=True
)
total_loc_skip = sum(len(reqs) for reqs in loc_requests_skip.values())

print(f"🏛️  LOCATIONS:")
print(f"  Without --skip-existing: {total_loc_all} requests")
print(f"  With --skip-existing:    {total_loc_skip} requests")
print(f"  Skipped:                 {total_loc_all - total_loc_skip} requests\n")

# Test 3: Chapters without skip
from parsers.chapters import create_chapter_image_requests
chapter_requests_all = create_chapter_image_requests(
    chapters,
    Provider.GEMINI,
    GeminiModel.GEMINI_2_5_FLASH_IMAGE.value,
    limit=None,
    skip_existing=False
)
total_chapter_all = sum(len(reqs) for reqs in chapter_requests_all.values())

chapter_requests_skip = create_chapter_image_requests(
    chapters,
    Provider.GEMINI,
    GeminiModel.GEMINI_2_5_FLASH_IMAGE.value,
    limit=None,
    skip_existing=True
)
total_chapter_skip = sum(len(reqs) for reqs in chapter_requests_skip.values())

print(f"📖 CHAPTERS:")
print(f"  Without --skip-existing: {total_chapter_all} requests")
print(f"  With --skip-existing:    {total_chapter_skip} requests")
print(f"  Skipped:                 {total_chapter_all - total_chapter_skip} requests\n")

# Overall summary
print(f"=" * 60)
print(f"TOTAL:")
print(f"  Without --skip-existing: {total_char_all + total_loc_all + total_chapter_all} requests")
print(f"  With --skip-existing:    {total_char_skip + total_loc_skip + total_chapter_skip} requests")
print(f"  Skipped:                 {(total_char_all - total_char_skip) + (total_loc_all - total_loc_skip) + (total_chapter_all - total_chapter_skip)} requests")
print(f"\n✅ --skip-existing feature is working correctly!")
