# Mythic Index MCP Server

Model Context Protocol (MCP) server for Mythic Index. It’s designed to be **local-first** (works from your repo checkout), while optionally connecting to **Cloudflare D1** (primary reads) and a **Remote API** (fallback writes + uploads).

This README focuses on **tool behavior**, **imagery workflows**, and **image generation**.

---

## Quickstart

```bash
cd mythic-index/mcp-server
npm ci
npm run build
node dist/index.js
```

## Configuration

The server reads `~/.mythicindex/config.json` (via `src/services/config.ts`).

Example:

```json
{
  "workspace": { "id": "workspace-id", "name": "Story Name", "slug": "story" },
  "paths": {
    "cacheDb": "/absolute/path/to/cache.sqlite",
    "imagesDir": "/absolute/path/to/output-images"
  },
  "imageGeneration": {
    "defaultProvider": "google",
    "providers": {
      "openai": { "apiKey": "sk-...", "model": "gpt-image-1.5", "defaultSize": "1024x1024" },
      "google": { "apiKey": "...", "model": "gemini-3-pro-image-preview" }
    }
  },
  "artStyle": {
    "description": "Dark fantasy, painterly, dramatic lighting",
    "negativePrompts": ["blurry", "low quality"]
  }
}
```

### D1 Environment Variables (optional)

```bash
export CLOUDFLARE_ACCOUNT_ID="..."
export CLOUDFLARE_D1_DATABASE_ID="..."
export CLOUDFLARE_API_TOKEN="..."
```

### MCP Wiring

Project `.mcp.json` example:

```json
{
  "mcpServers": {
    "mythicindex": {
      "command": "node",
      "args": ["/absolute/path/to/mythic-index/mcp-server/dist/index.js"],
      "env": {
        "CLOUDFLARE_ACCOUNT_ID": "...",
        "CLOUDFLARE_D1_DATABASE_ID": "...",
        "CLOUDFLARE_API_TOKEN": "..."
      }
    }
  }
}
```

---

## Key Concepts

### Data Sources (Reads/Writes)

```text
Tool -> (D1 Direct Reads) -> (Remote API fallback) -> (Local SQLite cache)
```

- **D1 Direct**: best for read-heavy tools (`get_*`, `list_*`, search).
- **Remote API**: used for writes + uploads when D1 isn’t available for writes.
- **Local Storage**: cache + offline-first support.

### Story Content (On-Disk)

Some tools read/write on-disk YAML under the repo:

```text
mythic-index/MemoryQuill/story-content/
  characters/<slug>/{imagery.yaml,image_ideas.yaml,images/portrait.png,...}
  locations/<slug>/{imagery.yaml,images/...}
  chapters/<slug>/{imagery.yaml,images/...}
```

### Image Output Locations

There are two “places” images can end up:

```text
1) config.paths.imagesDir      (global output / scratch)
2) story-content/.../images/   (canonical per-entity images)
```

- Tools like `generate_character_portrait` and `generate_character_variation` return images in **`config.paths.imagesDir`**.
- Tools like `generate_images_for_entity`, `generate_new_images`, bulk `regenerate_*`, and `generate_character_images_from_ideas` copy into **`story-content/<entity>/images/`** and update `imagery.yaml`.

### Reference Images (Identity Lock)

**Google/Gemini** supports multi-image “reference-based generation” (identity lock) via `generateWithReferences()`.

```text
portrait.png (+ optional extra refs) + scenario prompt -> Gemini -> new image (same character)
```

**OpenAI** “generation” is prompt-only; **OpenAI editing** can take a single source image + instruction (good for “transform this portrait into a new scene”).

---

## Tool Index (by category)

### Characters
- `get_character`, `list_characters`, `create_character`, `edit_character`
- `add_relationship`, `get_relationships`

### Chapters
- `get_chapter`, `list_chapters`, `create_chapter`, `edit_chapter`
- `append_to_chapter`, `add_scene`, `get_chapter_outline`

### Locations
- `get_location`, `list_locations`, `create_location`, `edit_location`

### Search & Exploration
- `search`, `find_mentions`
- `explore_character`, `explore_location`, `get_writing_context`, `get_recap`, `brainstorm`

### Imagery (prompt planning + YAML)
- `get_content_for_imagery_analysis`, `save_imagery_prompts`, `generate_new_images`

### Images (generation + management)
- `generate_character_portrait`, `generate_character_variation`, `generate_character_images_from_ideas`
- `generate_location_art`, `generate_scene_art`, `generate_cover`, `generate_image`
- `generate_images_for_entity` (preview → generate pipeline)
- `edit_image`
- `upload_image`, `list_local_images`, `set_character_portrait`
- `regenerate_character_images`, `regenerate_location_images`, `regenerate_chapter_images`, `list_regeneration_candidates`

---

## Tool Reference (workflows + usage)

Each tool section includes:
- **Workflow diagram** (ASCII)
- **What it does**
- **Common usage**

### Character Tools

#### `get_character`

```text
LLM -> MCP(get_character) -> character-resolution -> (D1 | Remote | Cache) -> formatted profile
```

- Looks up a character by name/slug (supports fuzzy matching + elicitation).
- Returns a formatted summary with appearance, personality, background, etc.

#### `list_characters`

```text
LLM -> MCP(list_characters) -> (D1 | Remote | Cache) -> filtered list
```

- Lists characters, optionally filtering by `role`, `faction`, `status`.

#### `create_character`

```text
LLM -> MCP(create_character) -> Remote API (write) -> created character
```

- Creates a new character entry (write path).

#### `edit_character`

```text
LLM -> MCP(edit_character) -> Remote API (write) -> updated character
```

- Updates character fields (appearance, personality, etc).

#### `add_relationship`

```text
LLM -> MCP(add_relationship) -> Remote API (write) -> relationship created
```

- Adds a relationship between two characters; can be bidirectional.

#### `get_relationships`

```text
LLM -> MCP(get_relationships) -> (D1 | Remote | Cache) -> relationship graph
```

- Lists relationships for a character (allies/rivals/family/etc).

---

### Chapter Tools

#### `get_chapter`

```text
LLM -> MCP(get_chapter) -> (D1 | Remote | Cache) -> chapter + optional full content
```

- Fetches chapter metadata and optionally full Markdown content.

#### `list_chapters`

```text
LLM -> MCP(list_chapters) -> (D1 | Remote | Cache) -> chapter list
```

- Lists chapters, optionally filtering by `arc` and/or `status`.

#### `create_chapter`

```text
LLM -> MCP(create_chapter) -> Remote API (write) -> new chapter
```

- Creates a new chapter and optional initial content.

#### `edit_chapter`

```text
LLM -> MCP(edit_chapter) -> Remote API (write) -> updated chapter
```

- Updates title/content/summary/metadata for a chapter.

#### `append_to_chapter`

```text
LLM -> MCP(append_to_chapter) -> Remote API (write) -> content appended
```

- Appends text to an existing chapter (optionally inserting a scene break).

#### `add_scene`

```text
LLM -> MCP(add_scene) -> Remote API (write) -> scene appended to chapter
```

- Adds a structured scene block to a chapter (location, mood, purpose, etc).

#### `get_chapter_outline`

```text
LLM -> MCP(get_chapter_outline) -> (D1 | Remote | Cache) -> structured outline
```

- Returns a lightweight view of scenes, flow, word counts.

---

### Location Tools

#### `get_location`

```text
LLM -> MCP(get_location) -> (D1 | Remote | Cache) -> location details
```

- Fetches a location’s description, atmosphere, history, features, inhabitants.

#### `list_locations`

```text
LLM -> MCP(list_locations) -> (D1 | Remote | Cache) -> filtered location list
```

- Lists locations (optionally filtering by `type` or `region`).

#### `create_location`

```text
LLM -> MCP(create_location) -> Remote API (write) -> new location
```

- Creates a new location entry.

#### `edit_location`

```text
LLM -> MCP(edit_location) -> Remote API (write) -> updated location
```

- Updates location fields (description, atmosphere, features, etc).

---

### Search & Exploration Tools

#### `search`

```text
LLM -> MCP(search) -> (D1 LIKE | Remote semantic fallback) -> ranked hits
```

- Searches story content by meaning (not just exact keywords).

#### `find_mentions`

```text
LLM -> MCP(find_mentions) -> on-disk scan -> chapter contexts
```

- Finds all mentions of a character/location across chapters (with context snippets).

#### `explore_character`

```text
LLM -> MCP(explore_character) -> (Cache + on-disk) -> full profile + relationships + appearances
```

- “Tell me everything about X” deep-dive.

#### `explore_location`

```text
LLM -> MCP(explore_location) -> (Cache + on-disk) -> location deep-dive
```

- Full location details, sublocations, and references.

#### `get_writing_context`

```text
LLM -> MCP(get_writing_context) -> load chars/locs/recap -> scene-ready context bundle
```

- Prepares relevant profiles + where-you-left-off context for writing.

#### `get_recap`

```text
LLM -> MCP(get_recap) -> summarize previous chapters -> recap text
```

- Produces “previously on…” for a chapter, optionally character-focused.

#### `brainstorm`

```text
LLM -> MCP(brainstorm) -> guided ideation -> structured ideas
```

- Brainstorms characters/locations/scenes/dialogue using story context.

---

### Imagery Tools (prompt planning + YAML)

#### `get_content_for_imagery_analysis`

```text
LLM -> MCP(get_content_for_imagery_analysis) -> (D1 | Remote | on-disk) -> imagery-ready context
```

- Bundles content + character visuals + existing imagery.yaml to help an LLM write better prompts.

#### `save_imagery_prompts`

```text
LLM -> MCP(save_imagery_prompts) -> write imagery.yaml -> prompts saved
```

- Writes curated prompts into `imagery.yaml` for a chapter/location/character.

#### `generate_new_images`

```text
LLM -> MCP(generate_new_images) -> provider generate -> story-content/<entity>/images -> imagery.yaml updated
```

- Generates images from a provided prompt list and appends them into `imagery.yaml`.
- Does **not** use reference images; use `generate_images_for_entity` (character+google) or `generate_character_variation` for identity lock.

---

### Image Tools (generation + management)

#### `generate_character_portrait`

```text
LLM -> MCP(generate_character_portrait) -> build prompt from profile -> (OpenAI | Google) -> config.paths.imagesDir
```

- Generates a portrait from the character profile (text-only prompt).
- Supports optional `pose` + optional `style` override.

#### `generate_character_variation`

```text
LLM -> MCP(generate_character_variation) -> find images/portrait.png -> Gemini references -> config.paths.imagesDir
```

- Identity-lock “put this character in a new scene”.
- Uses `images/portrait.png` automatically when present; can include extra refs.
- If no portrait exists, falls back to text-only generation.

#### `generate_character_images_from_ideas`

```text
LLM -> MCP(generate_character_images_from_ideas) -> read image_ideas.yaml -> (Gemini refs | OpenAI edit) -> story-content/characters/<slug>/images -> imagery.yaml updated
```

- Batch-generates images for a character by iterating `image_ideas.yaml` scenes.
- Enriches each idea with `imagery.yaml` appearance text, and uses `images/portrait.png` as the anchor reference.
- Defaults to `preview=true`; set `preview=false` to generate.

#### `generate_location_art`

```text
LLM -> MCP(generate_location_art) -> build prompt from location -> (OpenAI | Google) -> config.paths.imagesDir
```

- Generates a location illustration (time-of-day + mood supported).

#### `generate_scene_art`

```text
LLM -> MCP(generate_scene_art) -> prompt passthrough -> (OpenAI | Google) -> config.paths.imagesDir
```

- Generates an illustration from a raw scene description.

#### `generate_cover`

```text
LLM -> MCP(generate_cover) -> cover prompt -> (OpenAI | Google) -> config.paths.imagesDir
```

- Generates cover-like art with space for title text (prompt-driven).

#### `generate_image`

```text
LLM -> MCP(generate_image) -> raw prompt -> (OpenAI | Google) -> config.paths.imagesDir
```

- Lowest-level “generate any image from a detailed description”.

#### `generate_images_for_entity`

```text
LLM -> MCP(generate_images_for_entity) -> preview candidates -> select indices -> generate -> story-content/<entity>/images -> imagery.yaml updated
```

- Unified pipeline:
  - `preview=true` returns ranked prompt candidates (from `imagery.yaml` or auto-constructed).
  - `preview=false` generates chosen prompts (`promptIndices`) and writes images + YAML.
- Special case: `entityType=character` + `provider=google` can use `images/portrait.png` as an identity reference.

#### `edit_image`

```text
LLM -> MCP(edit_image) -> (Gemini | OpenAI edit) -> config.paths.imagesDir
```

- Edits a provided source image using natural language instructions.
- Supports optional `maskPath` (OpenAI) and `preserveComposition` (Gemini).

#### `upload_image`

```text
LLM -> MCP(upload_image) -> Remote API -> Cloudflare Images -> URL
```

- Uploads a local image and links it to a character/location/chapter.

#### `list_local_images`

```text
LLM -> MCP(list_local_images) -> scan config.paths.imagesDir -> list files
```

- Lists locally generated images (optionally “unuploaded only”).

#### `set_character_portrait`

```text
LLM -> MCP(set_character_portrait) -> upload -> Remote API update -> character.portraitUrl set
```

- Uploads a local image and sets it as the character’s portrait URL in the database.

#### `regenerate_character_images`

```text
LLM -> MCP(regenerate_character_images) -> read imagery.yaml prompts -> provider generate -> story-content/characters/<slug>/images -> imagery.yaml updated
```

- Bulk-regenerates images for a character based on prompts in `imagery.yaml`.

#### `regenerate_location_images`

```text
LLM -> MCP(regenerate_location_images) -> read imagery.yaml prompts -> provider generate -> story-content/locations/<slug>/images -> imagery.yaml updated
```

- Bulk-regenerates images for a location.

#### `regenerate_chapter_images`

```text
LLM -> MCP(regenerate_chapter_images) -> read imagery.yaml prompts -> provider generate -> story-content/chapters/<slug>/images -> imagery.yaml updated
```

- Bulk-regenerates images for a chapter.

#### `list_regeneration_candidates`

```text
LLM -> MCP(list_regeneration_candidates) -> scan story-content -> imagery stats
```

- Lists all entities with imagery.yaml that can be regenerated, with counts per provider.

---

## Development

```bash
cd mythic-index/mcp-server
npm run dev
npm run inspector
npm run build
```

## Architecture (high level)

```text
MCP (index.ts)
  -> tools/* (schemas + tool orchestration)
  -> services/* (D1, remote, storage, images, imagery-yaml)
  -> MemoryQuill/story-content (YAML + local assets)
```
