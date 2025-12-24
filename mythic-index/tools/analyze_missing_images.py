import json
from pathlib import Path
import sys

# Add current directory to path to import sibling module
sys.path.append(str(Path(__file__).parent))
try:
    from rebuild_image_links import parse_imagery_yaml_minimal, ImageryEntry
except ImportError:
    # Fallback if running from root
    sys.path.append("mythic-index/tools")
    from rebuild_image_links import parse_imagery_yaml_minimal, ImageryEntry

STORY_CONTENT_PATH = Path("mythic-index/MemoryQuill/story-content")

def analyze_missing_images():
    missing_images = []
    
    # Find all imagery.yaml files
    yaml_files = list(STORY_CONTENT_PATH.rglob("imagery.yaml"))
    
    print(f"Found {len(yaml_files)} imagery.yaml files.")
    
    for yaml_path in yaml_files:
        try:
            # Use the robust regex parser
            entity_type, slug, entries = parse_imagery_yaml_minimal(yaml_path)
            
            if not entity_type or not slug:
                continue
                
            base_dir = yaml_path.parent
            
            for entry in entries:
                file_path = entry.storage_path
                # In rebuild_image_links, storage_path is extracted from YAML
                
                full_path = base_dir / file_path
                
                if not full_path.exists():
                    # We need the prompt to regenerate it.
                    # The regex parser in rebuild_image_links DOES NOT extract prompts.
                    # It only extracts paths and roles.
                    # So we DO need to parse the YAML text to find the prompt associated with the file_path.
                    pass

        except Exception as e:
            print(f"Error parsing {yaml_path}: {e}")

    # Since we can't use pyyaml and the regex parser doesn't get prompts, 
    # we need a custom regex parser that extracts prompts too.
    # Let's rewrite the analysis logic to regex-search for prompts near file_paths.
    pass

def analyze_with_regex():
    import re
    
    missing_images = []
    yaml_files = list(STORY_CONTENT_PATH.rglob("imagery.yaml"))
    print(f"Found {len(yaml_files)} imagery.yaml files.")

    # Regex to find image blocks
    # Looking for:
    # - custom_id: ...
    #   ...
    #   file_path: ...
    #   prompt_used: ...
    
    # We'll read the whole file and split by "- custom_id:" or "generated_images:"
    
    for yaml_path in yaml_files:
        content = yaml_path.read_text(encoding='utf-8', errors='replace')
        base_dir = yaml_path.parent
        
        # Simple line iteration state machine
        lines = content.splitlines()
        current_image = {}
        
        for line in lines:
            line = line.strip()
            if line.startswith("- custom_id:") or line.startswith("- file_name:"):
                # New image block, save previous if valid
                if 'file_path' in current_image:
                    check_and_add(current_image, base_dir, yaml_path, missing_images)
                current_image = {}
            
            if ": " in line:
                key, val = line.split(": ", 1)
                key = key.strip("- ")
                val = val.strip().strip("'").strip('"')
                
                if key == "file_path":
                    current_image['file_path'] = val
                elif key == "prompt_used":
                    current_image['prompt'] = val
                elif key == "prompt" and 'prompt' not in current_image:
                    current_image['prompt'] = val
                    
        # Check last one
        if 'file_path' in current_image:
             check_and_add(current_image, base_dir, yaml_path, missing_images)
             
    print(f"Total missing images: {len(missing_images)}")
    with open("mythic-index/tools/missing_images_report.json", "w") as f:
        json.dump(missing_images, f, indent=2)

def check_and_add(img_data, base_dir, yaml_path, list_ref):
    if not img_data.get('file_path'):
        return
        
    full_path = base_dir / img_data['file_path']
    if not full_path.exists():
        list_ref.append({
            "file_path": img_data['file_path'],
            "full_path": str(full_path),
            "prompt": img_data.get('prompt', "NO PROMPT FOUND"),
            "yaml_path": str(yaml_path)
        })

if __name__ == "__main__":
    analyze_with_regex()
