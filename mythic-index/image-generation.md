# Character Imagery Generation Guide

## Overview

MemoryQuill provides multiple tools and workflows for generating character imagery through the MCP server. The system supports:
- Single character portrait generation
- Bulk regeneration from existing imagery.yaml files
- AI-assisted prompt creation and refinement
- Multiple image providers (OpenAI DALL-E 3, Google Gemini)
- Rich metadata tracking with the new `image_inventory[]` format

---

## Prerequisites

### 1. Environment Setup
- **OpenAI API Key**: Set `OPENAI_API_KEY` environment variable for DALL-E 3
- **Google API Key**: Set `GOOGLE_API_KEY` environment variable for Gemini (optional)
- **MCP Server Running**: Ensure the MCP server is built and accessible

### 2. Character Requirements
- Character must exist in the story content with a `profile.md` file
- Character directory: `MemoryQuill/story-content/characters/{character-slug}/`
- Character profile should include appearance details

---

## Method 1: Quick Character Portrait (Simplest)

**Use Case**: Generate a single portrait for an existing character

### MCP Tool: `generateCharacterPortrait`

**Location**: `mcp-server/src/tools/images.ts`

### Usage

```
Tool: generateCharacterPortrait
Parameters:
  - characterName: "Veyra" (fuzzy matching supported)
  - provider: "openai" or "google" (optional, defaults to config)
  - filename: "veyra-portrait" (optional)
```

### What Happens

1. **Name Resolution**
   - Fuzzy matches input "Veyra" → "veyra-thornwake"
   - Auto-selects if single match found
   - Prompts user if multiple matches (e.g., "vera" could match "Vera" or "Veyra")

2. **Character Data Retrieval**
   - Loads character profile from D1 database or storage
   - Extracts appearance details: age, height, build, hair, eyes, features, clothing

3. **Prompt Construction**
   - Base prompt: "Portrait of {Character Name}, {appearance summary}"
   - Auto-enriched with character visual details
   - Master style applied (classical oil painting, chiaroscuro lighting, etc.)

4. **Image Generation**
   - Sends prompt to specified provider (OpenAI DALL-E 3 by default)
   - Image saved to: `characters/{slug}/images/{filename}.png`

5. **Metadata Update**
   - Creates/updates `imagery.yaml` in character directory
   - Adds entry to `image_inventory[]` array with:
     - Generated image path
     - Full prompt used
     - Provider and model information
     - Generation timestamp
     - Status: "approved"

### Example Output

```yaml
# characters/veyra-thornwake/imagery.yaml
image_inventory:
  - id: veyra-thornwake-portrait-01
    path: images/veyra-portrait-2025-12-17.png
    type: generated
    status: approved
    content:
      title: Veyra Thornwake Portrait
      description: Portrait of half-elf ranger with dark mohawk and lantern
      alt_text: Wiry half-elf woman with dark mohawk braids
      tags: [portrait, character-art, canon]
    provenance:
      source: generated
      created_at: '2025-12-17'
      generation_params:
        prompt_used: "Portrait of Veyra Thornwake: wiry half-elf ranger..."
        provider: openai
        model: dall-e-3
        size: 1024x1024
        quality: hd
```

---

## Method 2: AI-Assisted Prompt Creation (Recommended)

**Use Case**: Create high-quality custom prompts with AI assistance

### Step 1: Get Content for Analysis

**MCP Tool**: `getContentForImageryAnalysis`

```
Parameters:
  - entity_type: "character"
  - slug: "veyra-thornwake"
```

**Returns**:
- Full character profile (appearance, personality, background)
- Existing imagery.yaml (if any)
- Character visual summary
- Art style guidance
- Analysis template with suggestions

**Use This To**: Understand the character's visual elements and get AI suggestions for effective prompts

### Step 2: Save Custom Prompts

**MCP Tool**: `saveImageryPrompts`

```
Parameters:
  - entity_type: "character"
  - slug: "veyra-thornwake"
  - prompts: [
      {
        title: "Veyra with Lantern",
        visual_description: "Half-elf ranger holding her signature lantern aloft..."
      },
      {
        title: "Veyra in Combat Stance",
        visual_description: "Wiry ranger in defensive crouch, blade drawn..."
      }
    ]
```

**What Happens**:
- Prompts saved to `imagery.yaml` under `prompts` array
- Can append to existing prompts or replace
- Prompts become available for image generation

### Step 3: Generate Images from Saved Prompts

**MCP Tool**: `generateNewImages`

```
Parameters:
  - entity_type: "character"
  - slug: "veyra-thornwake"
  - provider: "openai"
  - prompts: [0, 1]  # Generate first two prompts
```

**What Happens**:
- Reads prompts from imagery.yaml
- Enriches each prompt with character visual details
- Applies master style system
- Generates images via specified provider
- Saves images to `images/` directory
- Updates `image_inventory[]` with metadata

---

## Method 3: Unified Entity Generation (Most Flexible)

**Use Case**: Preview prompts before generating, or generate from auto-constructed prompts

### MCP Tool: `generateImagesForEntity`

**Location**: `mcp-server/src/tools/images.ts`

### Mode 1: Preview Mode

```
Parameters:
  - entity_type: "character"
  - slug: "veyra-thornwake"
  - mode: "preview"
  - provider: "openai"
```

**Returns**:
- Array of candidate prompts (either from imagery.yaml or auto-constructed)
- Prompt indices for selection
- Preview of what would be generated
- Option to select specific prompts

**Use This To**: See what prompts exist before committing to generation

### Mode 2: Generate Mode

```
Parameters:
  - entity_type: "character"
  - slug: "veyra-thornwake"
  - mode: "generate"
  - provider: "openai"
  - prompt_indices: [0, 2]  # Optional: select specific prompts
```

**What Happens**:
- If no imagery.yaml exists: Auto-constructs prompts from character profile
- If imagery.yaml exists: Uses existing prompts
- Generates selected prompts (or all if not specified)
- Saves images and updates metadata

---

## Method 4: Bulk Regeneration (For Existing Imagery)

**Use Case**: Regenerate all images for a character with new settings or provider

### MCP Tool: `regenerateCharacterImages`

**Location**: `mcp-server/src/tools/images.ts`

### Usage

```
Parameters:
  - character: "veyra-thornwake" (slug or fuzzy name)
  - provider: "openai"
  - dry_run: true  # Preview what would happen
```

**What Happens**:

1. **Dry Run Mode** (`dry_run: true`):
   - Lists all prompts in imagery.yaml
   - Shows what would be generated
   - No actual generation or file changes

2. **Generation Mode** (`dry_run: false`):
   - Archives existing generated images (moves to ARCHIVED_IMAGES/)
   - Regenerates all images from prompts
   - Updates imagery.yaml with new metadata
   - Preserves prompt history

### Advanced Options

```
Parameters:
  - character: "veyra-thornwake"
  - provider: "google"  # Use Gemini instead of DALL-E
  - prompt_indices: [0, 3, 5]  # Only regenerate specific prompts
  - dry_run: false
```

---

## Method 5: Character Variations (Consistency Mode)

**Use Case**: Generate variations of a character while maintaining visual consistency

### MCP Tool: `generateCharacterVariation`

**Location**: `mcp-server/src/tools/images.ts`

### Usage

```
Parameters:
  - character: "veyra-thornwake"
  - variation_description: "Veyra sitting by a campfire, relaxed"
  - reference_images: [
      "images/veyra-portrait-01.png",
      "images/veyra-combat-02.png"
    ]
  - provider: "google"  # Gemini supports many-shot prompting
```

**What Happens**:
- Uses 1-14 reference images to establish visual consistency
- Generates new pose/scene while maintaining character appearance
- Leverages Gemini's many-shot prompting capability
- Saves variation with metadata linking to reference images

**Use This For**:
- Generating multiple poses of the same character
- Maintaining consistent appearance across scenes
- Creating character expression sheets

---

## Understanding the Master Style System

All generated images automatically receive style enhancements through the master style system:

### Universal Style Suffix (Applied to ALL Images)

```
"classical oil painting, slight impasto texture, digital fantasy concept art,
matte painting, heavy shadows, chiaroscuro lighting, Rembrandt lighting,
volumetric atmosphere, muted earth tones, gritty realism, 19th-century portraiture"

Art by: Greg Rutkowski, John Singer Sargent, Rembrandt
```

### Character-Specific Enhancements

```
"expressive face, distinct facial features, cinematic lighting, medium shot,
thick brushwork, matte finish, dramatic side lighting, deep shadows,
warm golden tones, detailed texture on metal and cloth"
```

### Negative Prompts (Auto-Applied)

```
"photograph, photo, photography, modern, contemporary, anime, manga,
cartoon, caricature, comic book, oversaturated colors, neon, bright colors"
```

**Result**: Consistent visual style across all generated imagery

---

## Understanding Character Resolution (Fuzzy Matching)

The system uses intelligent fuzzy matching for character names:

### How It Works

1. **Exact Match First**: Tries exact slug match (fastest)
2. **Fuzzy Search**: If no exact match, searches all character names
3. **Threshold**: Uses 60% similarity threshold
4. **Auto-Select**: If single match found, auto-selects
5. **User Elicitation**: If multiple matches, prompts user to choose

### Examples

```
Input: "veyra" → Matches: "Veyra Thornwake" ✓ (auto-selected)
Input: "vera" → Matches: "Veyra Thornwake", "Vera Moonwhisper" → User chooses
Input: "thorn" → Matches: "Thorne Brightward", "Veyra Thornwake" → User chooses
Input: "aldwin" → Matches: "Aldwin Gentleheart" ✓ (auto-selected)
```

**Benefit**: No need to remember exact slugs or spellings

---

## Character Imagery File Structure

### Directory Layout

```
MemoryQuill/story-content/characters/veyra-thornwake/
├── profile.md              # Source character data
├── imagery.yaml            # Image metadata & prompts
└── images/
    ├── portrait.png        # Primary portrait (optional)
    ├── veyra-portrait-2025-12-17.png
    ├── veyra-combat-2025-12-17.png
    └── ARCHIVED_IMAGES/    # Previous generations
        └── veyra-portrait-2025-12-15.png
```

### imagery.yaml Structure (NEW FORMAT)

```yaml
entity_type: character
slug: veyra-thornwake
appearance: |
  Multiline character appearance description
  (extracted from profile.md)

prompts:
  - A character portrait of Veyra Thornwake
  - Veyra Thornwake holding her signature lantern aloft

image_inventory:
  - id: veyra-thornwake-portrait-01
    path: images/veyra-portrait-2025-12-17.png
    type: generated              # generated|imported|edited
    status: approved             # approved|draft|archived|rejected
    content:
      title: Veyra Thornwake Portrait
      description: Portrait showing half-elf ranger with dark mohawk...
      alt_text: Wiry half-elf woman with dark mohawk braids holding lantern
      tags: [portrait, character-art, canon, ranger]
    provenance:
      source: generated
      created_at: '2025-12-17'
      original_filename: veyra-portrait-2025-12-17.png
      generation_params:
        prompt_used: "Portrait of Veyra Thornwake: wiry half-elf ranger..."
        provider: openai
        model: dall-e-3
        size: 1024x1024
        quality: hd
```

---

## Provider Comparison

### OpenAI (DALL-E 3)

**Strengths**:
- High-quality, detailed portraits
- Good at following complex prompts
- Consistent artistic style
- Fast generation (typically <30 seconds)

**Configuration**:
```
Provider: "openai"
Model: "dall-e-3"
Sizes: 1024x1024 (default), 1024x1792, 1792x1024
Quality: "standard" or "hd"
```

**Costs**: ~$0.04-0.08 per image (depending on size/quality)

### Google GenAI (Gemini)

**Strengths**:
- Supports many-shot prompting (reference images)
- Image editing capabilities
- Good at variations with consistency
- Lower cost

**Configuration**:
```
Provider: "google"
Model: "gemini-2.5-flash-image" or "gemini-3-pro-image"
Sizes: Various aspect ratios supported
```

**Costs**: Lower than DALL-E 3

**Recommendation**: Use OpenAI for initial portraits, Google for variations

---

## Common Workflows

### Workflow 1: New Character, First Portrait

```
1. Use `generateCharacterPortrait`
   - Input: characterName: "Veyra"
   - Provider: "openai"
   - Result: Single high-quality portrait saved

2. Review generated image

3. If satisfied: Done!
   If needs refinement: Use Method 2 (AI-assisted prompts)
```

### Workflow 2: Multiple Poses/Expressions

```
1. Use `getContentForImageryAnalysis`
   - Understand character visual elements

2. Use `saveImageryPrompts`
   - Create prompts for different poses:
     * "Veyra in combat stance"
     * "Veyra examining a map"
     * "Veyra smiling at a companion"

3. Use `generateNewImages`
   - Generate all saved prompts
   - Review results

4. Optional: Use `generateCharacterVariation`
   - Reference best images for consistency
   - Generate additional variations
```

### Workflow 3: Regenerate with Different Provider

```
1. Use `regenerateCharacterImages` (dry_run: true)
   - Preview existing prompts

2. Use `regenerateCharacterImages` (dry_run: false)
   - Provider: "google"
   - Archives old images
   - Generates new versions with Gemini
```

### Workflow 4: Bulk Generation for Multiple Characters

```
For each character:
  1. Use `generateImagesForEntity` (mode: "preview")
     - See what would be generated

  2. Use `generateImagesForEntity` (mode: "generate")
     - Generate from auto-constructed prompts
     - Or specify custom prompt_indices

  Rate limiting: 2-second delay between API calls
```

---

## Troubleshooting

### Issue: "Character not found"

**Solutions**:
- Check character slug in `MemoryQuill/story-content/characters/`
- Try full character name instead of partial
- Use fuzzy matching by typing partial name and selecting from options

### Issue: "API key not configured"

**Solutions**:
- Set `OPENAI_API_KEY` environment variable for DALL-E
- Set `GOOGLE_API_KEY` environment variable for Gemini
- Check MCP server configuration

### Issue: "Failed to generate image"

**Solutions**:
- Check provider API status
- Verify prompt isn't triggering content filters
- Try different provider (openai vs google)
- Review full error message for specifics

### Issue: "imagery.yaml not updating"

**Solutions**:
- Check file permissions in character directory
- Verify imagery.yaml is valid YAML syntax
- Check MCP server logs for write errors

---

## Best Practices

### 1. Start Simple
- Use `generateCharacterPortrait` for first image
- Review before creating multiple variations

### 2. Leverage AI Assistance
- Use `getContentForImageryAnalysis` to understand character visuals
- Let AI suggest effective prompt elements

### 3. Maintain Visual Consistency
- Use `generateCharacterVariation` with reference images
- Keep same provider for character series
- Reference best portrait for subsequent generations

### 4. Organize Prompts
- Use descriptive titles in `saveImageryPrompts`
- Group related prompts (portraits, actions, emotions)
- Document prompt intent in visual_description

### 5. Use Dry Runs
- Always `dry_run: true` first for bulk operations
- Preview what will be generated/archived
- Avoid accidental overwrites

### 6. Manage Metadata
- Tag images appropriately (portrait, action, canonical, etc.)
- Use descriptive titles and alt text
- Track which images are approved vs drafts

---

## Advanced Features

### Character Visual Enrichment

The system automatically enriches prompts with detailed character visuals:

**Input Prompt**: "Portrait of Veyra Thornwake"

**Auto-Enriched**:
```
"Portrait of Veyra Thornwake
Character details: Veyra Thornwake - half-elf, appears mid-20s,
wiry and lean build, 5'7" tall, dark mohawk with side braids,
intense focused eyes, weathered leather coat, swirling tattoos
on arms, carries signature lantern, practical ranger gear"
```

**Benefit**: Consistent character appearance without manually repeating details

### Prompt Scoring & Ranking

When auto-constructing prompts, the system scores candidates:

**Scoring Criteria**:
- Length (50-150 words ideal)
- Detail level (specific descriptions score higher)
- Clarity (actionable visual elements)
- Narrative relevance

**Result**: Best prompts ranked first in preview mode

### Image Archiving

Previous generations automatically archived during regeneration:

```
Before: images/veyra-portrait.png
After regeneration:
  - images/veyra-portrait-new.png (active)
  - ARCHIVED_IMAGES/veyra-portrait-old.png (preserved)
```

**Benefit**: Never lose previous work, can compare generations

---

## Integration with Frontend

Generated images integrate with the frontend display:

1. **imagery.yaml** parsed by ingestion pipeline
2. **Images uploaded** to Cloudflare Images CDN
3. **URLs formatted**: `https://imagedelivery.net/{account}/{id}/{variant}`
4. **Character profiles** display images from `image_inventory[]`
5. **Metadata shown**: titles, descriptions, tags

---

## Summary: Quick Reference

| Goal | Tool | Parameters | Output |
|------|------|------------|--------|
| Single portrait | `generateCharacterPortrait` | characterName, provider | 1 portrait image |
| AI-guided prompts | `getContentForImageryAnalysis` → `saveImageryPrompts` → `generateNewImages` | entity_type, slug, prompts | Multiple custom images |
| Preview first | `generateImagesForEntity` | mode: "preview" | Prompt candidates |
| Generate images | `generateImagesForEntity` | mode: "generate" | Generated images |
| Regenerate all | `regenerateCharacterImages` | character, provider | All images regenerated |
| Variations | `generateCharacterVariation` | character, description, references | Consistent variation |

---

## Next Steps After Generation

1. **Review Generated Images**: Check quality and accuracy
2. **Update Status**: Mark approved images in imagery.yaml
3. **Add Metadata**: Enrich titles, descriptions, tags
4. **Frontend Ingestion**: Run ingestion pipeline to update database
5. **Publish**: Images appear on character profiles
6. **Iterate**: Regenerate or create variations as needed

---

## Configuration Files Reference

### MCP Server Config
- **Location**: `mcp-server/src/types/config.ts`
- **Key Settings**:
  - Default provider
  - Master art style
  - Negative prompts
  - Output directories

### Character Profile
- **Location**: `characters/{slug}/profile.md`
- **Required Sections**:
  - `## Appearance` - Visual details for prompt enrichment
  - `## Personality` - Optional but enhances portraits

### Imagery YAML
- **Location**: `characters/{slug}/imagery.yaml`
- **Schema**: See "Character Imagery File Structure" section above

---

This guide provides complete coverage of character imagery generation workflows in MemoryQuill. Choose the method that best fits your use case, from simple single portraits to complex multi-image generation with AI assistance.
