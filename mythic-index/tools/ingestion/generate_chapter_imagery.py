#!/usr/bin/env python3
"""
Generate or update chapter imagery.yaml files by reading chapter content,
character profiles, and location details.

This script constructs a comprehensive prompt for an LLM to generate
detailed visual specifications for chapter illustrations.
"""

import argparse
import sys
from pathlib import Path
import yaml
import re


def find_story_content_root():
    """Find the MemoryQuill/story-content directory."""
    current = Path(__file__).resolve().parent
    while current != current.parent:
        candidate = current / "MemoryQuill" / "story-content"
        if candidate.exists():
            return candidate
        current = current.parent
    raise FileNotFoundError("Could not find MemoryQuill/story-content directory")


def read_file_safe(path: Path) -> str | None:
    """Read a file if it exists, return None otherwise."""
    if path.exists():
        return path.read_text(encoding='utf-8')
    return None


def extract_references_from_content(content: str) -> dict:
    """
    Extract character and location references from chapter content.

    Returns:
        dict with 'characters' and 'locations' sets
    """
    refs = {
        'characters': set(),
        'locations': set()
    }

    # Look for character references in typical patterns
    # e.g., [[veyra-thornwake]], or in scene markers
    char_pattern = r'\[\[([a-z-]+)\]\]'
    for match in re.finditer(char_pattern, content):
        slug = match.group(1)
        # Heuristic: character slugs often contain names
        # Could also check if the path exists in characters/
        refs['characters'].add(slug)

    # Look for location references
    # Often mentioned in scene headers or explicit markers
    loc_pattern = r'(?:Location|Setting):\s*\[\[([a-z-]+)\]\]'
    for match in re.finditer(loc_pattern, content):
        refs['locations'].add(match.group(1))

    return refs


def collect_chapter_context(story_root: Path, chapter_slug: str) -> dict:
    """
    Collect all context needed to generate imagery.yaml for a chapter.

    Args:
        story_root: Path to MemoryQuill/story-content
        chapter_slug: Chapter identifier (e.g., 'ch01-ash-and-compass')

    Returns:
        Dictionary with all collected content
    """
    context = {
        'chapter_slug': chapter_slug,
        'content_md': None,
        'existing_imagery': None,
        'characters': {},
        'locations': {}
    }

    chapter_dir = story_root / "chapters" / chapter_slug

    # 1. Read chapter content
    content_path = chapter_dir / "content.md"
    context['content_md'] = read_file_safe(content_path)
    if not context['content_md']:
        print(f"⚠️  Warning: No content.md found at {content_path}", file=sys.stderr)
        return context

    # 2. Read existing imagery if present
    imagery_path = chapter_dir / "imagery.yaml"
    if imagery_path.exists():
        try:
            with open(imagery_path, 'r', encoding='utf-8') as f:
                context['existing_imagery'] = yaml.safe_load(f)
        except yaml.YAMLError as e:
            print(f"⚠️  Warning: Could not parse existing imagery.yaml: {e}", file=sys.stderr)

    # 3. Extract character and location references
    refs = extract_references_from_content(context['content_md'])

    # 4. Read character profiles
    for char_slug in refs['characters']:
        char_dir = story_root / "characters" / char_slug
        profile_path = char_dir / "profile.md"
        profile_content = read_file_safe(profile_path)
        if profile_content:
            context['characters'][char_slug] = {
                'profile_md': profile_content,
                'slug': char_slug
            }

    # 5. Read location overviews and imagery
    for loc_slug in refs['locations']:
        loc_dir = story_root / "locations" / loc_slug
        overview_path = loc_dir / "overview.md"
        imagery_path = loc_dir / "imagery.yaml"

        loc_data = {'slug': loc_slug}

        overview_content = read_file_safe(overview_path)
        if overview_content:
            loc_data['overview_md'] = overview_content

        if imagery_path.exists():
            try:
                with open(imagery_path, 'r', encoding='utf-8') as f:
                    loc_data['imagery_yaml'] = yaml.safe_load(f)
            except yaml.YAMLError as e:
                print(f"⚠️  Warning: Could not parse {imagery_path}: {e}", file=sys.stderr)

        if 'overview_md' in loc_data or 'imagery_yaml' in loc_data:
            context['locations'][loc_slug] = loc_data

    return context


def build_generation_prompt(context: dict, prompt_template: str) -> str:
    """
    Build the complete prompt for LLM by combining template with context.

    Args:
        context: Dictionary from collect_chapter_context()
        prompt_template: The prompt template from generate-chapter-imagery.md

    Returns:
        Complete prompt string ready to send to LLM
    """
    chapter_slug = context['chapter_slug']

    prompt = f"{prompt_template}\n\n"
    prompt += "=" * 80 + "\n"
    prompt += "## CONTEXT FOR THIS CHAPTER\n"
    prompt += "=" * 80 + "\n\n"

    # Chapter content
    if context['content_md']:
        prompt += f"### Chapter Content: {chapter_slug}\n\n"
        prompt += "```markdown\n"
        prompt += context['content_md']
        prompt += "\n```\n\n"

    # Existing imagery
    if context['existing_imagery']:
        prompt += f"### Existing imagery.yaml for {chapter_slug}\n\n"
        prompt += "```yaml\n"
        prompt += yaml.dump(context['existing_imagery'], default_flow_style=False, sort_keys=False)
        prompt += "\n```\n\n"
        prompt += "⚠️ **Note**: Preserve any images with `generated_at`, `file_name`, or `file_path` populated.\n\n"

    # Character profiles
    if context['characters']:
        prompt += "### Character Profiles\n\n"
        for char_slug, char_data in context['characters'].items():
            prompt += f"#### Character: {char_slug}\n\n"
            prompt += "```markdown\n"
            prompt += char_data['profile_md']
            prompt += "\n```\n\n"

    # Location details
    if context['locations']:
        prompt += "### Location Details\n\n"
        for loc_slug, loc_data in context['locations'].items():
            prompt += f"#### Location: {loc_slug}\n\n"

            if 'overview_md' in loc_data:
                prompt += "**Overview (overview.md)**:\n\n"
                prompt += "```markdown\n"
                prompt += loc_data['overview_md']
                prompt += "\n```\n\n"

            if 'imagery_yaml' in loc_data:
                prompt += "**Visual Specifications (imagery.yaml)**:\n\n"
                prompt += "```yaml\n"
                prompt += yaml.dump(loc_data['imagery_yaml'], default_flow_style=False, sort_keys=False)
                prompt += "\n```\n\n"

    # Final instruction
    prompt += "=" * 80 + "\n"
    prompt += "## YOUR TASK\n"
    prompt += "=" * 80 + "\n\n"
    prompt += f"Generate a complete `imagery.yaml` file for **{chapter_slug}** following the template structure above.\n\n"

    if context['existing_imagery']:
        prompt += "Since an existing imagery.yaml was provided, you should:\n"
        prompt += "1. Preserve all existing images that have been generated (check for generated_at, file_name, file_path)\n"
        prompt += "2. Add new moments and images as appropriate\n"
        prompt += "3. Update or refine existing moment/image specifications if they lack detail\n\n"
    else:
        prompt += "Create the imagery.yaml from scratch, covering the full chapter narrative.\n\n"

    prompt += "Focus on:\n"
    prompt += "- Extracting the visual arc and emotional transformation of the chapter\n"
    prompt += "- Identifying 10-20 key moments worth visualizing\n"
    prompt += "- Creating detailed, AI-ready image prompts incorporating character and location details\n"
    prompt += "- Ensuring visual coherence and narrative progression\n\n"
    prompt += "Output ONLY the YAML content (no markdown fences, no explanations).\n"

    return prompt


def main():
    parser = argparse.ArgumentParser(
        description="Generate chapter imagery.yaml files with LLM assistance"
    )
    parser.add_argument(
        'chapter_slug',
        help='Chapter slug (e.g., ch01-ash-and-compass)'
    )
    parser.add_argument(
        '--output',
        help='Output file path (default: chapter imagery.yaml location)',
        type=Path
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Print the prompt instead of generating imagery'
    )

    args = parser.parse_args()

    # Find story content root
    try:
        story_root = find_story_content_root()
    except FileNotFoundError as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"📁 Story content root: {story_root}")
    print(f"🎬 Processing chapter: {args.chapter_slug}")

    # Collect all context
    print("\n📖 Collecting context...")
    context = collect_chapter_context(story_root, args.chapter_slug)

    if not context['content_md']:
        print(f"❌ Error: Could not read chapter content for {args.chapter_slug}", file=sys.stderr)
        sys.exit(1)

    print(f"   ✓ Chapter content loaded")
    if context['existing_imagery']:
        print(f"   ✓ Existing imagery.yaml found")
    print(f"   ✓ {len(context['characters'])} character(s) referenced")
    print(f"   ✓ {len(context['locations'])} location(s) referenced")

    # Load prompt template
    prompt_template_path = Path(__file__).parent.parent / "prompts" / "generate-chapter-imagery.md"
    if not prompt_template_path.exists():
        print(f"❌ Error: Prompt template not found at {prompt_template_path}", file=sys.stderr)
        sys.exit(1)

    prompt_template = prompt_template_path.read_text(encoding='utf-8')

    # Build full prompt
    print("\n🔧 Building generation prompt...")
    full_prompt = build_generation_prompt(context, prompt_template)

    if args.dry_run:
        print("\n" + "=" * 80)
        print("DRY RUN - GENERATED PROMPT:")
        print("=" * 80)
        print(full_prompt)
        print("=" * 80)
        print(f"\nPrompt length: {len(full_prompt)} characters")
        return

    # Output the prompt for piping to LLM
    print("\n" + "=" * 80)
    print("PROMPT READY - Send this to your LLM:")
    print("=" * 80 + "\n")
    print(full_prompt)

    # Suggest output path
    output_path = args.output or (story_root / "chapters" / args.chapter_slug / "imagery.yaml")
    print("\n" + "=" * 80)
    print(f"💾 Suggested output path: {output_path}")
    print("=" * 80)


if __name__ == "__main__":
    main()
