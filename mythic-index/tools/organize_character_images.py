import os
import shutil
import glob
from pathlib import Path

def organize_images():
    base_dir = Path("../MemoryQuill/story-content/characters")
    
    if not base_dir.exists():
        print(f"Error: Base directory {base_dir} does not exist.")
        return

    print(f"Scanning characters in {base_dir}...")
    
    characters_processed = 0
    images_moved = 0
    jsons_deleted = 0

    for character_dir in base_dir.iterdir():
        if not character_dir.is_dir():
            continue

        generated_images_dir = character_dir / "generated_images"
        images_dir = character_dir / "images"

        if generated_images_dir.exists():
            print(f"Processing {character_dir.name}...")
            characters_processed += 1
            
            # Ensure destination images directory exists
            if not images_dir.exists():
                images_dir.mkdir(exist_ok=True)
                print(f"  Created images directory: {images_dir}")

            # Move images
            image_extensions = ['*.jpg', '*.jpeg', '*.png', '*.gif', '*.webp']
            for ext in image_extensions:
                # Use glob on the directory path properly
                for image_file in generated_images_dir.glob(ext):
                    dest_file = images_dir / image_file.name
                    
                    # Handle potential naming conflicts
                    if dest_file.exists():
                        print(f"  Warning: File {dest_file.name} already exists in destination. Skipping.")
                        continue
                        
                    try:
                        shutil.move(str(image_file), str(dest_file))
                        print(f"  Moved: {image_file.name}")
                        images_moved += 1
                    except Exception as e:
                        print(f"  Error moving {image_file.name}: {e}")

            # Delete JSONs
            for json_file in generated_images_dir.glob("*.json"):
                try:
                    os.remove(json_file)
                    print(f"  Deleted: {json_file.name}")
                    jsons_deleted += 1
                except Exception as e:
                    print(f"  Error deleting {json_file.name}: {e}")

            # Optional: Remove generated_images if empty
            if not any(generated_images_dir.iterdir()):
                try:
                    generated_images_dir.rmdir()
                    print(f"  Removed empty directory: {generated_images_dir}")
                except Exception as e:
                    print(f"  Error removing directory {generated_images_dir}: {e}")
            else:
                print(f"  Directory {generated_images_dir} is not empty, skipping removal.")
                # List what's left for clarity
                print(f"  Remaining files: {[f.name for f in generated_images_dir.iterdir()]}")

    print("-" * 30)
    print(f"Summary:")
    print(f"Characters processed: {characters_processed}")
    print(f"Images moved: {images_moved}")
    print(f"JSON files deleted: {jsons_deleted}")

if __name__ == "__main__":
    # Change working directory to the script's location's parent (mythic-index)
    # or handle paths relative to where the script is run. 
    # Since I'm running from root, and the script is in mythic-index/tools,
    # and the target is mythic-index/MemoryQuill..., let's adjust the path logic inside the function 
    # or just assume the script is run from mythic-index/tools.
    
    # Let's align with the likely execution context: 
    # If run from project root: python mythic-index/tools/organize_character_images.py
    # Then current CWD is project root.
    
    # Adjust base_dir relative to project root if CWD is project root
    # or allow it to work relative to the script file.
    
    script_location = Path(__file__).resolve()
    # Assuming script is in mythic-index/tools/
    # Target is mythic-index/MemoryQuill/story-content/characters
    
    # Navigate: tools -> mythic-index -> MemoryQuill -> story-content -> characters
    target_path = script_location.parent.parent / "MemoryQuill" / "story-content" / "characters"
    
    if not target_path.exists():
        # Fallback for if we are in project root and not using the relative path from script location correctly
        # Try direct path from root
        target_path = Path("mythic-index/MemoryQuill/story-content/characters")
    
    if target_path.exists():
        # Monkey patch the base_dir in the function or pass it as arg
        # Let's just pass it as arg to be clean.
        pass
    else:
        print(f"Critical Error: Could not resolve path to characters directory. Searched: {target_path}")
        exit(1)

    # Redefine function to take path to avoid scope issues with the previous simple implementation
    def run_organization(base_path):
        print(f"Targeting: {base_path}")
        characters_processed = 0
        images_moved = 0
        jsons_deleted = 0

        for character_dir in base_path.iterdir():
            if not character_dir.is_dir():
                continue

            generated_images_dir = character_dir / "generated_images"
            images_dir = character_dir / "images"

            if generated_images_dir.exists():
                print(f"Processing {character_dir.name}...")
                characters_processed += 1
                
                # Ensure destination images directory exists
                if not images_dir.exists():
                    images_dir.mkdir(exist_ok=True)
                    print(f"  Created images directory: {images_dir}")

                # Move images
                image_extensions = ['*.jpg', '*.jpeg', '*.png', '*.gif', '*.webp']
                for ext in image_extensions:
                    for image_file in generated_images_dir.glob(ext):
                        dest_file = images_dir / image_file.name
                        
                        if dest_file.exists():
                            print(f"  Warning: File {dest_file.name} already exists in destination. Skipping.")
                            continue
                            
                        try:
                            shutil.move(str(image_file), str(dest_file))
                            print(f"  Moved: {image_file.name}")
                            images_moved += 1
                        except Exception as e:
                            print(f"  Error moving {image_file.name}: {e}")

                # Delete JSONs
                for json_file in generated_images_dir.glob("*.json"):
                    try:
                        os.remove(json_file)
                        print(f"  Deleted: {json_file.name}")
                        jsons_deleted += 1
                    except Exception as e:
                        print(f"  Error deleting {json_file.name}: {e}")

                # Optional: Remove generated_images if empty
                if not any(generated_images_dir.iterdir()):
                    try:
                        generated_images_dir.rmdir()
                        print(f"  Removed empty directory: {generated_images_dir}")
                    except Exception as e:
                        print(f"  Error removing directory {generated_images_dir}: {e}")
                else:
                    print(f"  Directory {generated_images_dir} is not empty, skipping removal.")
                    print(f"  Remaining files: {[f.name for f in generated_images_dir.iterdir()]}")

        print("-" * 30)
        print(f"Summary:")
        print(f"Characters processed: {characters_processed}")
        print(f"Images moved: {images_moved}")
        print(f"JSON files deleted: {jsons_deleted}")

    run_organization(target_path)
