#!/usr/bin/env python3
"""
MemoryQuill Character Image Analyzer

Analyzes character images using Google Gemini and updates imagery.yaml files
with structured metadata following the MemoryQuill Archivist schema.

## Features
- Parallel processing: Analyze multiple characters simultaneously (default: 10 workers)
- Canon-checking: Compares images against character's canonical appearance
- Auto-generation: Creates imagery.yaml from profile.md if missing
- Incremental mode: Skip already-analyzed images (use --force to re-analyze)
- Rate limit handling: Automatic retry with exponential backoff

## Usage Examples

Basic usage (all characters with 10 workers):
    python analyze_character_images.py

Conservative parallelization (5 workers, ~15 RPM):
    python analyze_character_images.py --workers 5

Aggressive parallelization (15 workers, ~45 RPM):
    python analyze_character_images.py --workers 15

Single character:
    python analyze_character_images.py --character aldwin-gentleheart

Dry-run (preview changes without writing):
    python analyze_character_images.py --dry-run

Force re-analysis of all images:
    python analyze_character_images.py --force

Debug mode with verbose logging:
    python analyze_character_images.py --verbose

## Rate Limit Guidelines (Tier 2: 1000 RPM)

Worker count determines parallel API calls:
- 5 workers  → ~15 RPM (1.5% of limit) - Conservative
- 10 workers → ~30 RPM (3% of limit) - Recommended default
- 15 workers → ~45 RPM (4.5% of limit) - Aggressive, still safe
- 20 workers → ~60 RPM (6% of limit) - Max practical limit

Note: Each worker processes images sequentially, so actual RPM depends on
      average images per character (~5) and analysis time (~20-30s each).

## Performance Expectations

Sequential (1 worker):  3-4 hours for ~56 characters
Parallel (10 workers):  20-25 minutes (10x speedup)
Parallel (15 workers):  15-20 minutes (12-15x speedup)

## Environment Requirements

Required environment variable:
- GOOGLE_API_KEY or GEMINI_API_KEY: Your Google Gemini API key

Check your rate limits at:
https://aistudio.google.com/usage?timeRange=last-28-days&tab=rate-limit

## Error Handling

Rate limit (429) errors are automatically retried with exponential backoff.
If you see frequent rate limit warnings in logs, reduce --workers count.
"""

import argparse
import logging
import os
import re
import shutil
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from threading import Lock
from typing import Optional

import yaml

try:
    from google import genai
    from google.genai.errors import APIError
    from PIL import Image
except ImportError as e:
    print(f"ERROR: Required package not installed: {e}")
    print("Install with: pip install google-genai pillow")
    sys.exit(1)

# =============================================================================
# Configuration
# =============================================================================

SCRIPT_DIR = Path(__file__).parent
CHARACTERS_DIR = SCRIPT_DIR / "characters"
TEMPLATE_DIR = CHARACTERS_DIR / "character-template"
SUPPORTED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
MODEL_NAME = "gemini-3-pro-preview"
MAX_RETRIES = 3
RETRY_DELAY_BASE = 2  # Exponential backoff base in seconds

# =============================================================================
# Logging Setup
# =============================================================================

logger = logging.getLogger("image_analyzer")


def setup_logging(verbose: bool = False, log_file: Optional[str] = None):
    """Configure logging with file and console handlers."""
    level = logging.DEBUG if verbose else logging.INFO

    handlers = [logging.StreamHandler(sys.stdout)]

    if log_file:
        handlers.append(logging.FileHandler(log_file, mode="w"))
    else:
        handlers.append(logging.FileHandler("image_analysis.log", mode="w"))

    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=handlers,
    )


# =============================================================================
# Archivist Prompt
# =============================================================================

ARCHIVIST_PROMPT_TEMPLATE = """You are the **MemoryQuill Visual Archivist**, an expert in narratology and digital asset management. Your task is to analyze this image and generate structured YAML metadata.

## CHARACTER CONTEXT
- **Name:** {character_name}
- **Slug:** {slug}
- **Canonical Appearance:**
{appearance}

## YOUR TASK
Analyze the provided image and output a YAML block following this exact schema.

**IMPORTANT:** Compare the image against the canonical appearance above. Add the `canon` tag ONLY if the image accurately depicts this specific character with matching features (race, hair, eyes, distinguishing marks, attire, etc.).

## OUTPUT SCHEMA
Output ONLY a valid YAML block (no markdown fences, no explanation):

```yaml
- id: "{slug}-[descriptor]-[index]"
  path: "images/{filename}"
  type: "generated"
  status: "approved"

  content:
    title: "Title Case Description (3-6 words)"
    description: "2-3 sentences describing subject, framing, lighting, mood, and artistic style."
    alt_text: "Functional accessibility text for screen readers."
    tags: ["tag1", "tag2", "tag3"]

  provenance:
    source: "imported"
    created_at: "{current_date}"
    original_filename: "{filename}"
```

## GUIDELINES

### ID Naming Convention
- Format: `{slug}-[descriptor]-[index]`
- Example: `aldwin-gentleheart-portrait-01`, `aldwin-gentleheart-action-combat`
- Keep it URL-safe (lowercase, hyphens only)

### Type Classification
- **generated**: Polished, finished render (3D, digital painting, photoreal)
- **imported**: Sketch, concept art, reference photo, loose artwork
- **placeholder**: Geometric shape, grey box, obviously temporary

### Content Writing
- **title**: 3-6 words, evocative but clear
- **description**: Sentence 1 = subject/framing, Sentence 2 = lighting/mood/gear, Sentence 3 (optional) = artistic observation
- **alt_text**: Purely functional, no flowery language

### Tagging (use kebab-case, include 3-5 tags)
1. Shot Type: portrait, full-body, bust, close-up, action-shot
2. Art Style: digital-painting, sketch, oil-style, photorealistic, line-art, concept-art
3. Mood/Lighting: dark, ethereal, warm, cinematic, high-contrast
4. Content: weapon-focus, magic, civilian-attire, armor
5. Canon: Add `canon` ONLY if image matches the canonical appearance above
6. Designation: Add `primary-portrait` if the filename is "portrait.png" (this marks it as the character's official portrait image)

## INPUT DATA
- **Filename:** {filename}
- **Current Date:** {current_date}
{is_primary_portrait}

Now analyze the image and output the YAML block:"""


def build_archivist_prompt(
    character_name: str, slug: str, appearance: str, filename: str
) -> str:
    """Build the archivist prompt with character context."""
    current_date = datetime.now().strftime("%Y-%m-%d")

    # Indent appearance for better formatting
    appearance_indented = "\n".join(
        f"  {line}" for line in appearance.strip().split("\n")
    )

    # Detect if this is the primary portrait file
    is_primary_portrait = ""
    if filename.lower() == "portrait.png":
        is_primary_portrait = "\n\n**IMPORTANT:** This is portrait.png - the character's primary portrait file. Add the `primary-portrait` tag to designate this as the official character portrait."

    return ARCHIVIST_PROMPT_TEMPLATE.format(
        character_name=character_name,
        slug=slug,
        appearance=appearance_indented,
        filename=filename,
        current_date=current_date,
        is_primary_portrait=is_primary_portrait,
    )


# =============================================================================
# Gemini Client
# =============================================================================


def get_gemini_client() -> genai.Client:
    """Initialize and return the Gemini client.

    The SDK auto-detects API key from GEMINI_API_KEY or GOOGLE_API_KEY environment variables.
    """
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        logger.error(
            "No API key found. Set GEMINI_API_KEY or GOOGLE_API_KEY environment variable."
        )
        logger.error("Get your API key from: https://aistudio.google.com/apikey")
        sys.exit(1)

    return genai.Client()  # Auto-detects API key from environment


def generate_imagery_yaml_from_profile(
    client: genai.Client, char_dir: Path, slug: str
) -> Optional[dict]:
    """
    Generate imagery.yaml content by reading profile.md and optionally
    analyzing a portrait image to create a comprehensive appearance field.
    """
    profile_path = char_dir / "profile.md"
    if not profile_path.exists():
        logger.warning(f"  No profile.md found, cannot generate imagery.yaml")
        return None

    # Read profile.md
    try:
        profile_content = profile_path.read_text(encoding="utf-8")
    except Exception as e:
        logger.error(f"  Failed to read profile.md: {e}")
        return None

    # Try to find a representative portrait image
    images_dir = char_dir / "images"
    portrait_image = None
    if images_dir.exists():
        # Prefer portrait.png, fall back to first alphabetical image
        portrait_path = images_dir / "portrait.png"
        if portrait_path.exists():
            try:
                portrait_image = Image.open(portrait_path)
                logger.info(f"  Found portrait.png for appearance analysis")
            except Exception as e:
                logger.warning(f"  Failed to load portrait.png: {e}")

        # If no portrait.png or failed to load, use first available image
        if not portrait_image:
            image_files = sorted(
                [
                    f
                    for f in images_dir.iterdir()
                    if f.is_file() and f.suffix.lower() in SUPPORTED_EXTENSIONS
                ]
            )
            if image_files:
                try:
                    portrait_image = Image.open(image_files[0])
                    logger.info(
                        f"  Using {image_files[0].name} for appearance analysis"
                    )
                except Exception as e:
                    logger.warning(f"  Failed to load {image_files[0].name}: {e}")

    # Build multimodal prompt (text + optional image)
    prompt = """You are a visual character designer. Analyze the character information provided and create a comprehensive, structured appearance description.

SOURCES:
1. Character profile text (narrative/abstract descriptions)
2. Portrait image (if provided - concrete visual details)

Combine information from BOTH sources to create a unified canonical appearance.

OUTPUT FORMAT (plain text, no markdown or YAML markers):
[Character Name] is a [race/class description].

Physical Details:
- Age/Apparent Age: [details from text and/or image]
- Build/Stature: [details from text and/or image]
- Skin/Complexion: [details from text and/or image]
- Hair: [exact color, style from image if available, otherwise from text]
- Eyes: [exact color from image if available, otherwise from text]
- Distinguishing Marks: [details from text and/or image]

Attire/Gear:
- Clothing Style: [details from image if available, otherwise from text]
- Colors/Materials: [exact colors/materials from image if available]
- Weapons/Accessories: [visible in image or described in text]

Vibe/Atmosphere:
- Posture/Movement: [details from text]
- Expression: [from image if available, otherwise from text]
- Lighting/Mood associations: [from image if available, otherwise from text]

CHARACTER PROFILE:
{profile_content}

Generate ONLY the appearance text following the format above. Be specific with colors, materials, and visual details visible in the image."""

    # Make multimodal request (text + optional image)
    contents = [prompt.format(profile_content=profile_content)]
    if portrait_image:
        contents.append(portrait_image)

    try:
        response = client.models.generate_content(model=MODEL_NAME, contents=contents)
        appearance = response.text.strip()
    except Exception as e:
        logger.error(f"  Failed to generate appearance: {e}")
        return None

    # Build minimal imagery.yaml structure
    character_name = get_character_name_from_slug(slug)
    return {
        "entity_type": "character",
        "slug": slug,
        "appearance": appearance,
        "prompts": [f"A character portrait of {character_name}."],
        "image_inventory": [],
    }


def analyze_image_with_gemini(
    client: genai.Client, image_path: Path, prompt: str
) -> Optional[str]:
    """Send image to Gemini for analysis with retry logic.

    Uses PIL Image directly as recommended by google-genai best practices.
    """
    # Load image with PIL (simpler and recommended by google-genai docs)
    try:
        image = Image.open(image_path)
    except Exception as e:
        logger.error(f"Failed to open image {image_path}: {e}")
        return None

    # Retry loop
    for attempt in range(MAX_RETRIES):
        try:
            response = client.models.generate_content(
                model=MODEL_NAME,
                contents=[prompt, image],  # PIL Image passed directly
            )
            return response.text

        except APIError as e:
            error_msg = str(e).lower()

            # Check if it's a rate limit error
            if "rate" in error_msg or "quota" in error_msg or "429" in error_msg:
                delay = RETRY_DELAY_BASE ** (attempt + 1)
                logger.warning(
                    f"Rate limited, retrying in {delay}s... (attempt {attempt + 1}/{MAX_RETRIES})"
                )
                time.sleep(delay)
            else:
                logger.error(f"API error: {e}")
                return None

        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            return None

    logger.error(f"Failed after {MAX_RETRIES} retries")
    return None


def parse_yaml_response(response_text: str) -> Optional[dict]:
    """Parse YAML from Gemini response, handling markdown fences."""
    if not response_text:
        return None

    # Remove markdown code fences if present
    text = response_text.strip()

    # Handle ```yaml ... ``` fences
    if text.startswith("```"):
        lines = text.split("\n")
        # Remove first line (```yaml) and last line (```)
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines)

    try:
        result = yaml.safe_load(text)
        # Expect a list with one item
        if isinstance(result, list) and len(result) > 0:
            return result[0]
        elif isinstance(result, dict):
            return result
        else:
            logger.warning(f"Unexpected YAML structure: {type(result)}")
            return None
    except yaml.YAMLError as e:
        logger.error(f"Failed to parse YAML: {e}")
        logger.debug(f"Raw response:\n{response_text[:500]}")
        return None


# =============================================================================
# Character Processing
# =============================================================================


def load_imagery_yaml(yaml_path: Path) -> Optional[dict]:
    """Load and parse an imagery.yaml file."""
    try:
        with open(yaml_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f)
    except Exception as e:
        logger.error(f"Failed to load {yaml_path}: {e}")
        return None


def save_imagery_yaml(yaml_path: Path, data: dict, dry_run: bool = False):
    """Save imagery.yaml, creating backup first."""
    if dry_run:
        logger.info(f"  [DRY RUN] Would write to {yaml_path.name}")
        return

    # Create backup
    backup_path = yaml_path.with_suffix(".yaml.bak")
    if yaml_path.exists():
        shutil.copy2(yaml_path, backup_path)
        logger.debug(f"  Created backup: {backup_path.name}")

    # Write new file
    with open(yaml_path, "w", encoding="utf-8") as f:
        yaml.dump(
            data,
            f,
            default_flow_style=False,
            allow_unicode=True,
            sort_keys=False,
            width=120,
        )

    logger.debug(f"  Wrote {yaml_path.name}")


def get_character_name_from_slug(slug: str) -> str:
    """Convert slug to display name."""
    return slug.replace("-", " ").title()


def discover_characters(specific_character: Optional[str] = None) -> list[Path]:
    """Discover character directories to process."""
    if specific_character:
        char_dir = CHARACTERS_DIR / specific_character
        if char_dir.exists() and char_dir.is_dir():
            return [char_dir]
        else:
            logger.error(f"Character directory not found: {specific_character}")
            return []

    # Find all character directories (excluding template and drafts)
    characters = []
    for item in CHARACTERS_DIR.iterdir():
        if item.is_dir() and item.name not in ("character-template", "drafts"):
            characters.append(item)

    return sorted(characters, key=lambda p: p.name)


def discover_images(char_dir: Path) -> list[Path]:
    """Find all supported images in a character's images folder."""
    images_dir = char_dir / "images"
    if not images_dir.exists():
        return []

    images = []
    for item in images_dir.iterdir():
        if item.is_file() and item.suffix.lower() in SUPPORTED_EXTENSIONS:
            images.append(item)

    return sorted(images, key=lambda p: p.name)


def process_character(
    client: genai.Client, char_dir: Path, dry_run: bool = False, force: bool = False
) -> tuple[int, int, int]:
    """
    Process all images for a single character.
    Returns (success_count, failure_count, skipped_count).
    """
    slug = char_dir.name
    yaml_path = char_dir / "imagery.yaml"

    # Load existing imagery.yaml or generate if missing
    if not yaml_path.exists():
        logger.info(f"  No imagery.yaml found, attempting to generate...")
        data = generate_imagery_yaml_from_profile(client, char_dir, slug)
        if not data:
            logger.warning(f"  Could not generate imagery.yaml, skipping")
            return 0, 0, 0
        # Save the newly generated file
        save_imagery_yaml(yaml_path, data, dry_run=dry_run)
        if not dry_run:
            logger.info(f"  Generated new imagery.yaml")
    else:
        data = load_imagery_yaml(yaml_path)
        if not data:
            return 0, 0, 0

    # Extract character info
    appearance = data.get("appearance", "")
    character_name = get_character_name_from_slug(slug)

    if not appearance:
        logger.warning(f"  No appearance defined, analysis may be less accurate")

    # Find images
    images = discover_images(char_dir)
    if not images:
        logger.info(f"  No images found")
        return 0, 0, 0

    logger.info(f"  Found {len(images)} image(s)")

    # Track existing inventory entries (for incremental mode)
    existing_filenames = set()
    existing_entries = []
    if not force and data.get("image_inventory"):
        for entry in data["image_inventory"]:
            filename = entry.get("provenance", {}).get("original_filename")
            if filename:
                existing_filenames.add(filename)
                existing_entries.append(entry)
        if existing_filenames:
            logger.info(
                f"  Found {len(existing_filenames)} existing entries (use --force to re-analyze)"
            )

    # Analyze each image
    new_entries = []
    success_count = 0
    failure_count = 0
    skipped_count = 0

    for image_path in images:
        image_name = image_path.name

        # Skip if already analyzed (unless --force)
        if image_name in existing_filenames:
            logger.info(f"    Skipping (already analyzed): {image_name}")
            skipped_count += 1
            continue

        logger.info(f"    Analyzing: {image_name}")

        start_time = time.time()

        # Build prompt
        prompt = build_archivist_prompt(
            character_name=character_name,
            slug=slug,
            appearance=appearance,
            filename=image_name,
        )

        # Call Gemini
        response_text = analyze_image_with_gemini(client, image_path, prompt)

        if response_text:
            entry = parse_yaml_response(response_text)
            if entry:
                new_entries.append(entry)
                elapsed = time.time() - start_time
                logger.info(f"    Done ({elapsed:.1f}s)")
                success_count += 1
            else:
                logger.error(f"    Failed to parse response")
                failure_count += 1
        else:
            logger.error(f"    No response from API")
            failure_count += 1

    # Update imagery.yaml (merge existing + new entries)
    if new_entries or (force and existing_entries):
        # Combine existing entries (preserved) with new entries
        final_inventory = existing_entries + new_entries
        data["image_inventory"] = final_inventory
        save_imagery_yaml(yaml_path, data, dry_run=dry_run)
        logger.info(
            f"  Updated inventory: {len(existing_entries)} existing + {len(new_entries)} new = {len(final_inventory)} total"
        )
    elif not new_entries and skipped_count > 0:
        logger.info(
            f"  No new images to analyze (all {skipped_count} already in inventory)"
        )

    return success_count, failure_count, skipped_count


# =============================================================================
# Main
# =============================================================================


def main():
    parser = argparse.ArgumentParser(
        description="Analyze character images with Google Gemini and update imagery.yaml files"
    )
    parser.add_argument(
        "--character", "-c", help="Process only this character (by slug)"
    )
    parser.add_argument(
        "--dry-run",
        "-n",
        action="store_true",
        help="Preview changes without writing files",
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true", help="Enable DEBUG level logging"
    )
    parser.add_argument(
        "--force",
        "-f",
        action="store_true",
        help="Re-analyze all images, even if already in inventory",
    )
    parser.add_argument(
        "--log-file", "-l", help="Custom log file path (default: image_analysis.log)"
    )
    parser.add_argument(
        "--workers",
        "-w",
        type=int,
        default=10,
        help="Number of parallel workers (default: 10, safe for 1000 RPM)",
    )

    args = parser.parse_args()

    # Setup logging
    setup_logging(verbose=args.verbose, log_file=args.log_file)

    logger.info("=" * 60)
    logger.info("MemoryQuill Character Image Analyzer")
    logger.info("=" * 60)

    if args.dry_run:
        logger.info("DRY RUN MODE - No files will be modified")

    # Initialize Gemini client
    logger.info(f"Using model: {MODEL_NAME}")
    client = get_gemini_client()
    logger.info("Gemini client initialized")

    # Discover characters
    characters = discover_characters(args.character)
    if not characters:
        logger.error("No characters to process")
        sys.exit(1)

    logger.info(f"Found {len(characters)} character(s) to process")
    logger.info("-" * 60)

    # Process each character (parallelized)
    total_success = 0
    total_failure = 0
    total_skipped = 0

    # Limit workers to reasonable range (cap at 20 to avoid diminishing returns)
    max_workers = min(args.workers, 20)
    logger.info(f"Using {max_workers} parallel workers")

    # Thread-safe counters
    stats_lock = Lock()
    completed_count = 0

    def process_with_progress(char_dir, index, total):
        """Wrapper to track progress"""
        slug = char_dir.name
        logger.info(f"[{index}/{total}] Processing: {slug}")
        return process_character(client, char_dir, dry_run=args.dry_run, force=args.force)

    # Submit all tasks
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_char = {
            executor.submit(process_with_progress, char_dir, i, len(characters)): char_dir
            for i, char_dir in enumerate(characters, 1)
        }

        # Collect results as they complete
        for future in as_completed(future_to_char):
            char_dir = future_to_char[future]
            try:
                success, failure, skipped = future.result()

                # Thread-safe aggregation
                with stats_lock:
                    total_success += success
                    total_failure += failure
                    total_skipped += skipped
                    completed_count += 1

                logger.info(f"  Completed {char_dir.name} ({completed_count}/{len(characters)})")

            except Exception as e:
                logger.error(f"  Failed to process {char_dir.name}: {e}")

    # Summary
    logger.info("-" * 60)
    logger.info("SUMMARY")
    logger.info(f"  Characters processed: {len(characters)}")
    logger.info(f"  Images analyzed: {total_success}")
    logger.info(f"  Images skipped (existing): {total_skipped}")
    logger.info(f"  Failures: {total_failure}")
    logger.info("=" * 60)

    if total_failure > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
