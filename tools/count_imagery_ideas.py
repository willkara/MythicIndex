import os
import yaml
import re
from pathlib import Path

BASE_DIR = Path("mythic-index/MemoryQuill/story-content")

def load_yaml(path):
    if not path.exists():
        return None
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)
    except Exception as e:
        # print(f"Error reading {path}: {e}") # Suppress error for cleaner output, we'll try regex
        return None

def count_items_regex(path, item_marker):
    if not path.exists():
        return 0
    try:
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
        # Simple heuristic: count lines starting with the marker (ignoring leading whitespace)
        count = 0
        for line in content.splitlines():
            if line.strip().startswith(item_marker):
                count += 1
        return count
    except Exception:
        return 0

def count_character_ideas():
    print("\n--- Character Imagery Ideas ---")
    char_dir = BASE_DIR / "characters"
    if not char_dir.exists():
        print("Characters directory not found.")
        return

    results = []
    for item in sorted(char_dir.iterdir()):
        if item.is_dir() and not item.name.startswith('.'):
            yaml_path = item / "image-ideas.yaml"
            count = 0
            data = load_yaml(yaml_path)
            if data and "scenes" in data and isinstance(data["scenes"], list):
                count = len(data["scenes"])
            else:
                # Fallback
                count = count_items_regex(yaml_path, "- title:")
            
            results.append((item.name, count))
    
    # Sort by count descending, then name
    results.sort(key=lambda x: (-x[1], x[0]))
    
    for name, count in results:
        print(f"{name}: {count}")

def count_location_ideas():
    print("\n--- Location Imagery Ideas ---")
    loc_dir = BASE_DIR / "locations"
    if not loc_dir.exists():
        print("Locations directory not found.")
        return

    results = []
    for item in sorted(loc_dir.iterdir()):
        if item.is_dir() and not item.name.startswith('.'):
            yaml_path = item / "imagery.yaml"
            count = 0
            data = load_yaml(yaml_path)
            if data and "parts" in data and isinstance(data["parts"], list):
                count = len(data["parts"])
            else:
                # Fallback for locations
                count = count_items_regex(yaml_path, "- name:")
            
            results.append((item.name, count))

    # Sort by count descending, then name
    results.sort(key=lambda x: (-x[1], x[0]))

    for name, count in results:
        print(f"{name}: {count}")

def count_chapter_ideas():
    print("\n--- Chapter Imagery Ideas ---")
    chap_dir = BASE_DIR / "chapters"
    if not chap_dir.exists():
        print("Chapters directory not found.")
        return

    results = []
    for item in sorted(chap_dir.iterdir()):
        if item.is_dir() and not item.name.startswith('.'):
            # Try chapter-imagery.yaml first
            count = 0
            yaml_path = item / "chapter-imagery.yaml"
            if yaml_path.exists():
                data = load_yaml(yaml_path)
                if data and "images" in data and isinstance(data["images"], list):
                    count = len(data["images"])
                else:
                     # Fallback
                    count = count_items_regex(yaml_path, "- custom_id:")
            
            # If 0, try imagery.yaml
            if count == 0:
                yaml_path = item / "imagery.yaml"
                if yaml_path.exists():
                    data = load_yaml(yaml_path)
                    if data and "images" in data and isinstance(data["images"], list):
                        count = len(data["images"])
                    else:
                        # Fallback
                        count = count_items_regex(yaml_path, "- custom_id:")

            results.append((item.name, count))

    # Sort by count descending, then name
    results.sort(key=lambda x: (-x[1], x[0]))

    for name, count in results:
        print(f"{name}: {count}")

def main():
    count_character_ideas()
    count_location_ideas()
    count_chapter_ideas()

if __name__ == "__main__":
    main()
