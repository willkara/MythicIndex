import yaml
from pathlib import Path

chars_dir = Path("MemoryQuill/story-content/characters")
for f in sorted(chars_dir.glob("*/imagery.yaml")):
    data = yaml.safe_load(f.read_text())
    prompts = data.get("prompts", [])
    appearance = data.get("appearance", "")
    if prompts:
        first_prompt = prompts[0]
        print(f"{f.parent.name}:")
        print(f"  prompt type: {type(first_prompt).__name__}")
        print(f"  appearance type: {type(appearance).__name__}")
        if not isinstance(first_prompt, str):
            print(f"  *** PROMPT IS NOT STRING: {repr(first_prompt)}")
        if not isinstance(appearance, str):
            print(f"  *** APPEARANCE IS NOT STRING: {repr(appearance)}")
    else:
        print(f"{f.parent.name}: NO_PROMPTS")
