import os
import re
import datetime
from pathlib import Path

CHARACTERS_DIR = Path("/home/willkara/source/MemoryQuill/mythic-index/MemoryQuill/story-content/characters")

def find_and_fix_untracked_images():
    print(f"Scanning {CHARACTERS_DIR} for untracked images and adding to imagery.yaml...\n")
    
    if not CHARACTERS_DIR.exists():
        print(f"Error: Directory {CHARACTERS_DIR} does not exist.")
        return

    total_added = 0
    total_untracked_found = 0

    # Iterate over each character directory
    for char_dir in sorted(CHARACTERS_DIR.iterdir()):
        if not char_dir.is_dir():
            continue
            
        images_dir = char_dir / "images"
        yaml_file = char_dir / "imagery.yaml"
        
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
        yaml_content = ""
        try:
            with open(yaml_file, 'r', encoding='utf-8') as f:
                yaml_content = f.read()
                # Corrected Regex: allow spaces and other characters, but still exclude quotes
                matches = re.findall(r'''file_name:\s*['"]?([^'"]+)['"]?''', yaml_content)
                referenced_files.update(matches)
                
                matches_path = re.findall(r'''file_path:\s*['"]?images/([^'"]+)['"]?''', yaml_content)
                referenced_files.update(matches_path)
        except Exception as e:
            print(f"Error reading {yaml_file}: {e}")
            continue
            
        # 3. Find difference
        untracked = sorted(list(files_on_disk - referenced_files))
        
        if untracked:
            total_untracked_found += len(untracked)
            print(f"Adding {len(untracked)} images to {char_dir.name}/imagery.yaml")
            
            # Prepare new entries
            new_entries = []
            current_time = datetime.datetime.now().isoformat()
            
            for filename in untracked:
                # Create a simple custom_id
                stem = Path(filename).stem
                # Clean stem for ID safety (remove non-alphanumeric except dashes)
                safe_stem = re.sub(r'[^a-zA-Z0-9-]', '-', stem)
                custom_id = f"{char_dir.name}-{safe_stem}"
                
                # Determine role based on filename if possible, else default to gallery
                role = "gallery"
                if "profile" in filename.lower():
                    role = "profile"
                
                entry = f"""- custom_id: {custom_id}
  file_name: {filename}
  file_path: images/{filename}
  prompt_used: "Manual import of existing image"
  generated_at: '{current_time}'
  provider: imported
  model: unknown
  role: {role}
"""
                new_entries.append(entry)
            
            # Append to file
            # Check if "generated_images:" exists
            if "generated_images:" in yaml_content:
                # Find the last line of the generated_images section to append new entries correctly
                # This assumes generated_images is the last major section, and new items append to it
                insert_position = yaml_content.rfind("generated_images:")
                
                # Find where the generated_images list *ends* to append
                # This requires a more robust YAML parsing or careful line manipulation
                # For now, append to the end of the file if 'generated_images:' exists,
                # as the previous approach seemed to partially work and the existing YAMLs are simple.
                with open(yaml_file, 'a', encoding='utf-8') as f:
                    # Ensure we start on a new line if not already there
                    if not yaml_content.endswith('\n'):
                        f.write('\n')
                    f.write('\n'.join(new_entries)) # Join with newline, then write
                    if not new_entries[-1].endswith('\n'): # Ensure last entry also ends with newline
                         f.write('\n')

            else:
                # If generated_images section doesn't exist, create it at the end of the file
                with open(yaml_file, 'a', encoding='utf-8') as f:
                    if not yaml_content.endswith('\n'):
                        f.write('\n')
                    f.write("generated_images:\n")
                    f.write('\n'.join(new_entries))
                    if not new_entries[-1].endswith('\n'):
                        f.write('\n')

            total_added += len(new_entries)

    print(f"\nTotal untracked images found (before fixing): {total_untracked_found}")
    print(f"Total images added to imagery.yaml: {total_added}")
    if total_untracked_found != total_added:
        print("WARNING: Not all untracked images were added. Please re-run the script.")

if __name__ == "__main__":
    find_and_fix_untracked_images()
