#!/usr/bin/env python3
"""
Quick script to propose better file names for character images.

The script walks `characters/*/images/`, sends each image to the Gemini API,
and asks for a concise kebab-case filename stem. By default it prints the
suggestions; add `--rename` to actually rename files on disk.

Usage:
    python rename_character_images.py              # preview only
    python rename_character_images.py --rename     # apply renames
    python rename_character_images.py --character aldwin-gentleheart

Requirements:
    - google-genai (pip install google-genai pillow)
    - GEMINI_API_KEY or GOOGLE_API_KEY set in the environment
"""

import argparse
import os
import re
import sys
from pathlib import Path
from typing import Iterable, Tuple

import yaml

SUPPORTED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
DEFAULT_MODEL = "gemini-2.0-flash-exp"
SCRIPT_DIR = Path(__file__).parent
CHARACTERS_DIR = SCRIPT_DIR / "characters"


def ensure_deps():
    try:
        from google import genai  # noqa: F401
        from PIL import Image  # noqa: F401
    except ImportError as e:
        print(f"Missing dependency: {e}")
        print("Install with: pip install google-genai pillow")
        sys.exit(1)


def make_client():
    from google import genai

    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        print("Set GEMINI_API_KEY or GOOGLE_API_KEY before running.")
        sys.exit(1)

    return genai.Client()


def iter_images(characters_dir: Path, only_slug: str | None) -> Iterable[Tuple[str, Path]]:
    for slug_dir in sorted(characters_dir.iterdir()):
        if not slug_dir.is_dir():
            continue
        if slug_dir.name == "character-template":
            continue
        if only_slug and slug_dir.name != only_slug:
            continue

        images_dir = slug_dir / "images"
        if not images_dir.exists():
            continue

        for image_path in sorted(images_dir.iterdir()):
            if image_path.suffix.lower() not in SUPPORTED_EXTENSIONS:
                continue
            if image_path.name.lower() in {"portrait.png", "profile.png"}:
                continue
            yield slug_dir.name, image_path


def update_imagery_yaml(slug: str, old_name: str, new_name: str) -> bool:
    imagery_file = CHARACTERS_DIR / slug / "imagery.yaml"
    if not imagery_file.exists():
        return False

    try:
        data = yaml.safe_load(imagery_file.read_text(encoding="utf-8")) or {}
    except Exception as exc:
        print(f"Unable to load imagery.yaml for {slug}: {exc}")
        return False

    relative_old = f"images/{old_name}"
    relative_new = f"images/{new_name}"
    changed = False

    inventory = data.get("image_inventory")
    if isinstance(inventory, list):
        for entry in inventory:
            if entry.get("path") == relative_old:
                entry["path"] = relative_new
                changed = True

            prov = entry.get("provenance")
            if isinstance(prov, dict) and prov.get("original_filename") == old_name:
                prov["original_filename"] = new_name
                changed = True

    if changed:
        imagery_file.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")
    return changed


def clean_stem(slug: str, raw: str) -> str:
    """Normalize model text into a kebab-case filename stem."""
    text = raw.strip().splitlines()[0]
    text = re.sub(r"`+", "", text)  # drop code fences if returned
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    if not text:
        return f"{slug}-image"
    if not text.startswith(slug):
        text = f"{slug}-{text}"
    # collapse repeated dashes
    text = re.sub(r"-{2,}", "-", text)
    return text


def suggest_name(client, model: str, slug: str, image_path: Path) -> str | None:
    """Ask Gemini for a concise filename stem."""
    from PIL import Image

    prompt = (
        "You are renaming character image files. "
        "Return only a short kebab-case filename stem (no extension). "
        "Start with the character slug provided. Use 4-8 words max that describe "
        "the pose, setting, and mood. Do not include dates or version numbers."
    )

    try:
        image = Image.open(image_path)
    except Exception as e:
        print(f"Failed to open {image_path}: {e}")
        return None

    try:
        response = client.models.generate_content(
            model=model,
            contents=[f"Character slug: {slug}\n{prompt}", image],
        )
        return clean_stem(slug, response.text or "")
    except Exception as e:
        print(f"Gemini error for {image_path}: {e}")
        return None


def uniquify(path: Path) -> Path:
    """Add numeric suffix until the path is unique."""
    if not path.exists():
        return path
    stem, suffix = path.stem, path.suffix
    counter = 2
    while True:
        candidate = path.with_name(f"{stem}-{counter}{suffix}")
        if not candidate.exists():
            return candidate
        counter += 1


def main():
    ensure_deps()

    parser = argparse.ArgumentParser(description="Suggest cleaner filenames for character images.")
    parser.add_argument("--character", help="Only process a single character slug.")
    parser.add_argument("--rename", action="store_true", help="Actually rename files instead of preview.")
    parser.add_argument("--model", default=DEFAULT_MODEL, help=f"Gemini model to use (default: {DEFAULT_MODEL}).")
    parser.add_argument("--limit", type=int, help="Stop after processing N images (for quick tests).")
    args = parser.parse_args()

    if not CHARACTERS_DIR.exists():
        print(f"Characters directory not found at {CHARACTERS_DIR}")
        sys.exit(1)

    client = make_client()
    processed = 0

    for slug, image_path in iter_images(CHARACTERS_DIR, args.character):
        if args.limit and processed >= args.limit:
            break

        suggestion = suggest_name(client, args.model, slug, image_path)
        if not suggestion:
            continue

        new_path = image_path.with_name(f"{suggestion}{image_path.suffix.lower()}")
        new_path = uniquify(new_path)
        action = "RENAME" if args.rename else "SUGGEST"
        print(f"[{action}] {image_path} -> {new_path.name}")

        if args.rename and new_path != image_path:
            old_name = image_path.name
            image_path.rename(new_path)
            if update_imagery_yaml(slug, old_name, new_path.name):
                print(f"  updated imagery.yaml for {slug}")

        processed += 1

    if processed == 0:
        print("No images processed.")


if __name__ == "__main__":
    main()
