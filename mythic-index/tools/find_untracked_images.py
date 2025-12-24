import os
import re
from pathlib import Path

CHARACTERS_DIR = Path("/home/willkara/source/MemoryQuill/mythic-index/MemoryQuill/story-content/characters")

def find_untracked_images():
    print(f"Scanning {CHARACTERS_DIR} for untracked images...\n")
    
    results = {}
    
    if not CHARACTERS_DIR.exists():
        print(f"Error: Directory {CHARACTERS_DIR} does not exist.")
        return

    # Iterate over each character directory
    for char_dir in sorted(CHARACTERS_DIR.iterdir()):
        if not char_dir.is_dir():
            continue
            
        images_dir = char_dir / "images"
        yaml_file = char_dir / "imagery.yaml"
        
        # specific check for draft/template folders if needed, but we'll just check existence
        if not images_dir.exists() or not yaml_file.exists():
            continue
            
        # 1. Get list of files on disk
        try:
            image_extensions = {'.png', '.jpg', '.jpeg', '.webp', '.gif'}
            files_on_disk = {
                f.name for f in images_dir.iterdir() 
                if f.is_file() 
                and not f.name.startswith('.')
                and f.suffix.lower() in image_extensions
            }
        except OSError as e:
            print(f"Error reading directory {images_dir}: {e}")
            continue

        if not files_on_disk:
            continue

        # 2. Parse YAML for referenced files
        referenced_files = set()
        try:
            with open(yaml_file, 'r', encoding='utf-8') as f:
                content = f.read()
                # Regex to find file_name: value
                # Using triple quotes to safely include both ' and " in character class
                matches = re.findall(r'''file_name:\s*['"]?([^'"\s]+)['"]?''', content)
                referenced_files.update(matches)
                
                # Also check file_path just in case, stripping 'images/' prefix
                matches_path = re.findall(r'''file_path:\s*['"]?images/([^'"\s]+)['"]?''', content)
                referenced_files.update(matches_path)
        except Exception as e:
            print(f"Error reading {yaml_file}: {e}")
            continue
            
        # 3. Find difference
        untracked = files_on_disk - referenced_files
        
        if untracked:
            results[char_dir.name] = sorted(list(untracked))

    # Print Report
    total_untracked = 0
    if results:
        print(f"{'Character':<30} | {'Count':<5} | {'Untracked Files'}")
        print("-" * 80)
        for char_name, files in results.items():
            count = len(files)
            total_untracked += count
            file_list_str = ", ".join(files[:3]) # Show first 3
            if count > 3:
                file_list_str += f", ... (+{count-3} more)"
            print(f"{char_name:<30} | {count:<5} | {file_list_str}")
            
        print("-" * 80)
        print(f"Total untracked images found: {total_untracked}")
    else:
        print("No untracked images found. All images in folders are referenced in imagery.yaml.")

if __name__ == "__main__":
    find_untracked_images()
