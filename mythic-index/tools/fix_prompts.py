import yaml
from pathlib import Path

# Characters with problematic prompts (4th prompt has colons causing dict parsing)
characters_to_fix = [
    "aldwin-gentleheart",
    "kaida-shadowstep",
    "lady-moira-blackwater",
    "marcus-heartbridge",
    "sergeant-kelen",
    "thorne-brightward",
    "veyra-thornwake",
]

chars_dir = Path("MemoryQuill/story-content/characters")

for char_name in characters_to_fix:
    imagery_file = chars_dir / char_name / "imagery.yaml"

    if not imagery_file.exists():
        print(f"Skipping {char_name} - file not found")
        continue

    # Read the YAML
    with open(imagery_file, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)

    prompts = data.get("prompts", [])

    # Check if prompt 4 is a dict (the problematic one)
    if len(prompts) >= 4 and isinstance(prompts[3], dict):
        # Convert dict back to string (YAML parsed it wrong)
        # The dict has one key-value pair where the key is the main text
        # and the value is the quoted part
        prompt_dict = prompts[3]
        # Reconstruct the original string
        key = list(prompt_dict.keys())[0]
        value = prompt_dict[key]
        reconstructed = f'{key}: "{value}"'

        print(f"Fixing {char_name}")
        print(f"  Original (dict): {prompt_dict}")
        print(f"  Reconstructed: {reconstructed[:100]}...")

        # Replace in prompts list
        prompts[3] = reconstructed
        data["prompts"] = prompts

        # Write back to file with proper YAML formatting
        # We need to manually format to ensure prompts are quoted
        with open(imagery_file, "w", encoding="utf-8") as f:
            f.write("appearance: |\n")
            appearance = data["appearance"]
            for line in appearance.split("\n"):
                f.write(f"  {line}\n")
            f.write("\nprompts:\n")
            for prompt in prompts:
                # Escape quotes and wrap in quotes
                escaped = prompt.replace("\\", "\\\\").replace('"', '\\"')
                f.write(f'  - "{escaped}"\n')

        print(f"  ✓ Fixed {char_name}\n")
    else:
        print(f"Skipping {char_name} - prompt 4 is already a string")

print("\nDone!")
