# Chapter Imagery Generator - Usage Guide

This tool helps you create comprehensive `imagery.yaml` files for chapters by automatically gathering all necessary context (chapter content, character profiles, location details) and generating an optimized prompt for an LLM.

## Quick Start

### 1. Generate a prompt for a chapter:

```bash
cd mythic-index/tools/ingestion
./generate_chapter_imagery.py ch01-ash-and-compass
```

This will:
- Read the chapter's `content.md`
- Find all referenced characters and read their `profile.md` files
- Find all referenced locations and read their `overview.md` and `imagery.yaml` files
- Load the existing `imagery.yaml` if present
- Combine everything into a comprehensive prompt
- Output the prompt to stdout

### 2. Send the prompt to Claude:

**Option A: Copy-paste**
```bash
./generate_chapter_imagery.py ch01-ash-and-compass > /tmp/prompt.txt
# Copy contents and paste into Claude
```

**Option B: Pipe to Claude API** (if you have API access)
```bash
./generate_chapter_imagery.py ch01-ash-and-compass | \
  your-llm-client --model claude-3-5-sonnet > ch01-imagery.yaml
```

**Option C: Use Claude Code directly**
```bash
# Just copy the output and paste into this conversation
./generate_chapter_imagery.py ch01-ash-and-compass
```

### 3. Save the generated YAML:

Claude will output a complete `imagery.yaml` file. Save it to:
```
MemoryQuill/story-content/chapters/{chapter-slug}/imagery.yaml
```

## Command Options

```bash
./generate_chapter_imagery.py <chapter-slug> [options]

Arguments:
  chapter-slug          Chapter identifier (e.g., ch01-ash-and-compass)

Options:
  --output PATH         Specify output file path
  --dry-run            Print the prompt length and summary without full output
  --help               Show help message
```

## Examples

### Create imagery for a new chapter:
```bash
./generate_chapter_imagery.py ch05-blood-and-lanternlight
```

### Update existing imagery for a chapter:
```bash
# The script automatically detects existing imagery.yaml
# and includes it in the context so Claude can preserve
# already-generated images while adding new ones
./generate_chapter_imagery.py ch01-ash-and-compass
```

### Check what would be included (dry run):
```bash
./generate_chapter_imagery.py ch03-smoke-and-steel --dry-run
```

## How It Works

### 1. Context Collection Phase

The script automatically:

1. **Reads chapter content** from `chapters/{slug}/content.md`
2. **Scans for character references** (patterns like `[[character-name]]`)
3. **Reads character profiles** from `characters/{slug}/profile.md`
4. **Scans for location references**
5. **Reads location overviews** from `locations/{slug}/overview.md`
6. **Reads location imagery specs** from `locations/{slug}/imagery.yaml`
7. **Loads existing chapter imagery** if present

### 2. Prompt Construction Phase

The script:

1. **Loads the prompt template** from `tools/prompts/generate-chapter-imagery.md`
2. **Injects all collected context** into the prompt
3. **Adds specific instructions** based on whether imagery already exists
4. **Outputs a complete, self-contained prompt** ready for LLM processing

### 3. LLM Generation Phase (Manual)

You send the prompt to Claude, which:

1. **Analyzes the chapter narrative arc**
2. **Identifies key visual moments** (10-20 per chapter)
3. **Extracts character appearance details** from profiles
4. **Pulls location visual anchors** from location files
5. **Generates detailed image specifications** with:
   - Visual descriptions
   - Composition notes
   - Lighting specifications
   - AI-ready prompts (150-300 words each)
   - Negative prompts
   - Color palettes
   - Character states
   - Mood rationales

### 4. Review and Save Phase (Manual)

You:

1. **Review the generated YAML** for accuracy and completeness
2. **Edit as needed** to refine visual descriptions or add context
3. **Save to the chapter directory** as `imagery.yaml`
4. **Use for image generation** with AI image models

## What Gets Generated

A complete `imagery.yaml` file with:

### Metadata Section
- Visual thesis (the chapter's visual arc)
- Color palette (primary and accent colors)
- Mood distribution (how many images per mood)

### Characters Section
- Scene variations documenting appearance changes across the chapter
- Reference images for canonical character portraits

### Locations Section
- Chapter-specific context for each location zone used

### Moments Section (10-20 entries)
- Key narrative beats worth visualizing
- Visual weight (high/medium/low priority)
- Characters present, location zone, transformation state
- Recommended number of images per moment

### Images Section (20-40 entries)
- Detailed specifications for each image
- Visual descriptions (what you see)
- Composition notes (how it's framed)
- Lighting specifications (quality, direction, color)
- Color palettes (dominant and accent colors)
- **AI-ready prompts** (150-300 words, ready to send to DALL-E, Midjourney, etc.)
- Negative prompts (what to avoid)
- Character states (appearance details for this specific moment)

## Character Reference Detection

The script uses pattern matching to find character references in chapter content:

- `[[character-slug]]` - Standard wiki-style links
- Character names in dialogue attributions
- Scene markers mentioning characters

**Pro tip**: To ensure characters are detected, use `[[character-slug]]` format in your chapter content.

## Location Reference Detection

The script looks for:

- `Location: [[location-slug]]` - Explicit scene markers
- `Setting: [[location-slug]]` - Alternative format
- `[[location-slug]]` - Standard wiki links

**Pro tip**: Use explicit `Location: [[slug]]` markers in scene headers for reliable detection.

## Updating Existing Imagery

If a chapter already has an `imagery.yaml` file, the script will:

1. **Include the existing file** in the prompt context
2. **Instruct Claude to preserve** any images that have been generated (those with `generated_at`, `file_name`, or `file_path` populated)
3. **Allow addition** of new moments and images
4. **Allow refinement** of existing specs that lack detail

This enables incremental improvement of imagery files without losing already-generated images.

## Integration with Image Generation

Once you have an `imagery.yaml` file, you can:

1. **Use the `prompt_used` field** from each image spec to generate images with AI models
2. **Reference the `negative_prompt`** to exclude unwanted styles
3. **Follow the `size` specification** for aspect ratio and dimensions
4. **Update the `generated_at`, `file_name`, and `file_path`** fields when images are created

## Tips for Best Results

### For Chapter Content:
- Use clear scene markers with location and time-of-day
- Include vivid environmental and lighting descriptions
- Note character emotional states and physical changes
- Mark symbolic moments or significant objects

### For Character Profiles:
- Keep the "Physical Description" section detailed and up-to-date
- Include distinguishing features (scars, tattoos, accessories)
- Document typical clothing and gear
- Note body language and expression patterns

### For Location Files:
- Provide detailed material descriptions in `overview.md`
- Specify color palettes in location `imagery.yaml`
- Document characteristic lighting at different times of day
- Define zones clearly with functional and visual descriptions

### For Generated Imagery:
- Review prompts for accuracy against source material
- Check that character descriptions match profiles
- Verify location details align with overviews
- Ensure color palettes support the chapter's emotional arc
- Validate that moments cover the full narrative arc

## Troubleshooting

### "Could not find MemoryQuill/story-content directory"
Make sure you're running the script from within the repository. The script searches upward from its location to find the content directory.

### "No content.md found"
Check that:
- The chapter slug is correct
- The chapter directory exists at `MemoryQuill/story-content/chapters/{slug}/`
- The file is named `content.md` (not `chapter.md` or similar)

### Missing character or location context
The script only includes characters and locations it can detect in the content. If important entities are missing:
- Add explicit references like `[[character-slug]]` or `Location: [[location-slug]]`
- Or manually add their files to the prompt after generation

### Prompt is too long for LLM context window
Some LLMs have context limits. If the prompt is too large:
- Use `--dry-run` to check prompt length
- Consider processing the chapter in sections
- Or manually trim less-relevant character/location details from the prompt

## Files Created by This Tool

```
mythic-index/
├── tools/
│   ├── prompts/
│   │   ├── generate-chapter-imagery.md      # Prompt template (this is what guides Claude)
│   │   └── IMAGERY_GENERATOR_USAGE.md       # This usage guide
│   └── ingestion/
│       └── generate_chapter_imagery.py      # The script
```

## Future Enhancements

Potential improvements:
- Direct API integration for automated generation
- Batch processing of multiple chapters
- Validation of generated YAML against schema
- Integration with image generation services
- Preview generation of sample prompts
- Character/location reference graph visualization

## Support

For issues or questions:
- Check the prompt template at `tools/prompts/generate-chapter-imagery.md`
- Review example imagery.yaml files in existing chapters
- Consult the project's CLAUDE.md for architecture details
