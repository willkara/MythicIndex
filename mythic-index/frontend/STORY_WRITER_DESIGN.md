# Story Content Writer Module - Design Document

## Executive Summary

This document outlines the design for a comprehensive story content writer module for the MythicIndex frontend. The module will provide dedicated editing interfaces for all entity types (chapters, characters, locations, scenes) with full integration to Cloudflare Vectorize for semantic search.

**Current State:**
- ✅ Single markdown upload UI at `/admin/upload`
- ✅ Vectorize integration functional but **block-level** (not entity-level as documented)
- ❌ No dedicated entity editors
- ❌ No CRUD operations beyond markdown upload
- ❌ No chargen CLI → frontend integration

**Target State:**
- ✅ Dedicated editor for each entity type
- ✅ Entity-level embeddings (matching CLAUDE.md documentation)
- ✅ Full CRUD operations with server actions
- ✅ Automatic embedding generation on save
- ✅ Rich relationship management UI

---

## Schema Analysis

### Entity Type Overview

| Entity | Primary Table | Supporting Tables | Key Fields | Relationships |
|--------|---------------|-------------------|------------|---------------|
| **Chapter** | `content_item` (kind='chapter') | `content_revision`, `content_section`, `content_block`, `scene` | title, slug, summary, wordCount | → scenes, → blocks |
| **Character** | `character` | `content_item`, `character_relationship`, `scene_character` | name, race, class, appearance, personality | → relationships, → scenes, → portrait |
| **Location** | `location` | `content_item`, `location_zone`, `scene_zone` | name, type, region, atmosphere, history | → zones, → scenes, → parent |
| **Scene** | `scene` | `scene_segment`, `scene_character`, `scene_zone`, `scene_tag` | title, synopsis, sequenceOrder, sceneWhen | → chapter, → characters, → location, → zones |
| **Zone** | `location_zone` | `scene_zone`, `image_link` | name, type, physicalDescription, narrativeFunction | → location, → scenes, → parent zone |

---

## Entity-Specific Requirements

### 1. CHAPTERS

**Schema Tables:**
- `content_item` (kind='chapter', status='draft'|'published')
- `content_revision` (versioning)
- `content_section` (hierarchical structure)
- `content_block` (prose, dialogue, scene_header)
- `scene` (scene metadata)

**Required Fields:**
- `title` (text)
- `slug` (auto-generated from title, unique)
- `summary` (textarea, optional)
- `status` ('draft' | 'published')

**Content Structure:**
- Sections (ordered, types: 'chapter' | 'scene' | 'act')
  - Blocks (ordered, types: 'prose' | 'dialogue' | 'scene_header')
    - Block data: `textPayload` or `richPayload` (JSON)
    - `wordCount` (auto-calculated)
    - `isSceneAnchor` (boolean)

**Relationships:**
- → Scenes (one-to-many)
- → Images via `image_link`

**Embedding Strategy:**
- **Entity-level**: Entire chapter content embedded as single 1024-dim vector
- Metadata: `{ kind: 'chapter', slug, title, textPreview: first 100 chars }`
- Vector ID = `content_item.id`

---

### 2. CHARACTERS

**Schema Tables:**
- `character` (primary entity)
- `content_item` (optional prose description via `contentItemId`)
- `character_relationship` (directed relationships)
- `scene_character` (scene appearances)
- `image_asset` + `image_link` (portrait)

**Required Fields:**
- `name` (text)
- `slug` (auto-generated, unique)
- `workspaceId` (auto-populated)

**Optional Structured Fields (from YAML frontmatter ingestion):**

**Basic Info:**
- `aliases` (JSON array of strings)
- `race` (text)
- `characterClass` (text)
- `role` (select: 'protagonist' | 'antagonist' | 'supporting' | 'minor')
- `status` (select: 'alive' | 'dead' | 'unknown', default 'alive')
- `firstAppearance` (chapter slug reference)

**Appearance:**
- `appearanceAge` (text)
- `appearanceHeight` (text)
- `appearanceBuild` (text)
- `appearanceHair` (text)
- `appearanceEyes` (text)
- `appearanceDistinguishingFeatures` (JSON array)
- `appearanceClothing` (text)
- `visualSummary` (textarea)

**Personality:**
- `personalityArchetype` (text)
- `personalityTemperament` (text)
- `personalityPositiveTraits` (JSON array)
- `personalityNegativeTraits` (JSON array)
- `personalityMoralAlignment` (text)

**Background & Psychology:**
- `background` (textarea)
- `motivations` (JSON array)
- `fears` (JSON array)
- `secrets` (JSON array)

**Combat:**
- `primaryWeapons` (text)
- `fightingStyle` (text)
- `tacticalRole` (text)

**Voice:**
- `speechStyle` (text)
- `signaturePhrases` (JSON array)

**Story:**
- `faction` (text)
- `occupation` (text)
- `notes` (textarea)

**Media:**
- `portraitImageId` (FK to image_asset)

**Relationships:**
- → Outgoing relationships (one-to-many character_relationship)
- → Incoming relationships (one-to-many character_relationship)
- → Scene appearances (many-to-many via scene_character)
- → Content item (optional prose description)

**Embedding Strategy:**
- **Entity-level**: Full character profile embedded as single vector
- Concatenate: name + aliases + race + class + visual summary + personality traits + background
- Metadata: `{ kind: 'character', slug, title: name, textPreview }`
- Vector ID = `character.id`

---

### 3. LOCATIONS

**Schema Tables:**
- `location` (primary entity)
- `content_item` (optional prose description via `contentItemId`)
- `location_zone` (zones within location)
- `scene_zone` (zone appearances in scenes)
- `image_link` (location images)

**Required Fields:**
- `name` (text)
- `slug` (auto-generated, unique)
- `workspaceId` (auto-populated)

**Optional Structured Fields:**

**Basic Info:**
- `locationType` (select: 'city' | 'town' | 'village' | 'building' | 'room' | 'region' | 'landmark' | 'natural')
- `region` (text)
- `parentLocationId` (FK to location, dropdown)

**Descriptions:**
- `quickDescription` (textarea)
- `visualSummary` (textarea)
- `atmosphere` (textarea)
- `history` (textarea)

**Content:**
- `notableLandmarks` (JSON array)
- `keyPersonnel` (JSON array of character slugs - multi-select autocomplete)

**Extended:**
- `storyRole` (textarea - plot relevance, symbolic meaning)
- `hazardsDangers` (JSON array)
- `connections` (JSON array of location slugs/names)
- `accessibility` (textarea - access restrictions, hidden paths)
- `significanceLevel` (select: 'high' | 'medium' | 'low')
- `firstAppearance` (chapter slug reference)

**Relationships:**
- → Parent location (self-referencing)
- → Child locations (one-to-many)
- → Zones (one-to-many location_zone)
- → Content item (optional prose)
- → Scenes via zones (many-to-many via scene_zone)

**Embedding Strategy:**
- **Entity-level**: Full location overview embedded as single vector
- Concatenate: name + type + quick description + visual summary + atmosphere + history + story role
- Metadata: `{ kind: 'location', slug, title: name, textPreview }`
- Vector ID = `location.id`

---

### 4. SCENES

**Schema Tables:**
- `scene` (primary metadata)
- `scene_segment` (links to content_block for content)
- `scene_character` (character appearances)
- `scene_zone` (zone appearances)
- `scene_tag` (flexible tagging)

**Required Fields:**
- `contentId` (FK to content_item - parent chapter)
- `revisionId` (FK to content_revision)
- `slug` (auto-generated, unique within chapter)
- `sequenceOrder` (integer, position in chapter)

**Optional Fields:**
- `title` (text)
- `synopsis` (textarea)
- `sceneWhen` (text - temporal info)
- `primaryLocationId` (FK to location, dropdown)
- `povEntityId` (FK to character, dropdown)
- `estReadSeconds` (integer, auto-calculated)

**Relationships:**
- → Parent chapter (many-to-one content_item)
- → Content blocks via scene_segment (many-to-many)
- → Characters via scene_character (many-to-many with role)
- → Zones via scene_zone (many-to-many with role)
- → Tags via scene_tag (one-to-many)

**Embedding Strategy:**
- **Block-level OR entity-level** (configurable)
- Option A: Embed entire scene (title + synopsis + concatenated block text)
- Option B: Keep block-level for fine-grained search
- Metadata: `{ kind: 'scene', slug, title, chapterSlug, textPreview }`

---

### 5. ZONES

**Schema Tables:**
- `location_zone` (primary entity)
- `scene_zone` (scene appearances)
- `image_link` (zone-specific imagery)

**Required Fields:**
- `locationId` (FK to location, dropdown)
- `slug` (auto-generated, unique within location)
- `name` (text)

**Optional Fields:**
- `zoneType` (select: 'perimeter' | 'threshold' | 'heart' | 'forge' | 'liminal' | 'sanctuary')
- `locationWithin` (text)
- `parentZoneId` (FK to location_zone - hierarchical zones)
- `physicalDescription` (textarea)
- `narrativeFunction` (textarea)
- `emotionalRegister` (text)
- `signatureDetails` (JSON array)
- `moodAffinity` (JSON array)
- `characterAssociations` (JSON array)
- `lightConditions` (JSON object)
- `firstAppearance` (chapter slug reference)
- `storySignificance` (select: 'high' | 'medium' | 'low')

**Relationships:**
- → Parent location (many-to-one)
- → Parent zone (self-referencing, optional)
- → Child zones (one-to-many)
- → Scene appearances (many-to-many via scene_zone)

**Embedding Strategy:**
- **Entity-level**: Full zone description embedded as single vector
- Concatenate: name + type + physical description + narrative function + emotional register
- Metadata: `{ kind: 'zone', slug, title: name, locationSlug, textPreview }`
- Vector ID = `location_zone.id`

---

## Proposed Form Structure

### Chapter Editor (`/writer/chapters/[slug]`)

**Layout:**
```
┌─────────────────────────────────────────────────┐
│ Chapter Editor                                  │
├─────────────────────────────────────────────────┤
│ Title: [________________]  Slug: [auto-filled]  │
│ Status: [Draft ▼]                               │
│ Summary:                                        │
│ [_________________________________________]     │
│                                                 │
│ ┌─ Content Sections ──────────────────────┐    │
│ │ Section 1: Opening                      │    │
│ │   [+ Add Block]                         │    │
│ │   ┌─ Block 1 (prose) ─────────────┐     │    │
│ │   │ [Rich text editor...]         │     │    │
│ │   │ [Delete] [Move Up] [Move Down]│     │    │
│ │   └───────────────────────────────┘     │    │
│ │   [+ Add Block]                         │    │
│ │ [+ Add Section]                         │    │
│ └─────────────────────────────────────────┘    │
│                                                 │
│ ┌─ Scenes ────────────────────────────────┐    │
│ │ Scene 1: [Title] [Edit] [Delete]        │    │
│ │ Scene 2: [Title] [Edit] [Delete]        │    │
│ │ [+ Create Scene]                        │    │
│ └─────────────────────────────────────────┘    │
│                                                 │
│ [Save Draft] [Publish] [Cancel]                │
└─────────────────────────────────────────────────┘
```

**Form Fields:**
- Title (text input, required)
- Slug (auto-generated from title, editable)
- Status (select: draft | published)
- Summary (textarea, optional)
- **Content Builder:**
  - Sections (collapsible, reorderable)
    - Section type (select: chapter | scene | act)
    - Section title (optional)
    - Blocks (reorderable)
      - Block type (select: prose | dialogue | scene_header)
      - Block content (rich text or JSON editor)
      - Scene anchor flag (checkbox)

**Actions:**
- Create new chapter
- Update existing chapter
- Delete chapter
- Generate embedding (automatic on save)
- Preview chapter

---

### Character Editor (`/writer/characters/[slug]`)

**Layout:**
```
┌─────────────────────────────────────────────────┐
│ Character Profile Editor                        │
├─────────────────────────────────────────────────┤
│ ┌─ Basic Info ────────────────────────────┐    │
│ │ Name: [________________] *required       │    │
│ │ Slug: [auto-filled]                      │    │
│ │ Aliases: [tag input] (+ Add)             │    │
│ │ Race: [____________]                     │    │
│ │ Class: [____________]                    │    │
│ │ Role: [Protagonist ▼]                    │    │
│ │ Status: [Alive ▼]                        │    │
│ │ First Appearance: [Select Chapter ▼]     │    │
│ │ Faction: [____________]                  │    │
│ │ Occupation: [____________]               │    │
│ └─────────────────────────────────────────┘    │
│                                                 │
│ ┌─ Appearance ────────────────────────────┐    │
│ │ Age: [____] Height: [____] Build: [____] │    │
│ │ Hair: [____] Eyes: [____]                │    │
│ │ Clothing: [________________________]     │    │
│ │ Distinguishing Features: [tag input]     │    │
│ │ Visual Summary:                          │    │
│ │ [_________________________________]      │    │
│ └─────────────────────────────────────────┘    │
│                                                 │
│ ┌─ Personality ───────────────────────────┐    │
│ │ Archetype: [____________]                │    │
│ │ Temperament: [____________]              │    │
│ │ Positive Traits: [tag input]             │    │
│ │ Negative Traits: [tag input]             │    │
│ │ Moral Alignment: [____________]          │    │
│ └─────────────────────────────────────────┘    │
│                                                 │
│ ┌─ Background & Psychology ───────────────┐    │
│ │ Background: [textarea]                   │    │
│ │ Motivations: [tag input]                 │    │
│ │ Fears: [tag input]                       │    │
│ │ Secrets: [tag input]                     │    │
│ └─────────────────────────────────────────┘    │
│                                                 │
│ ┌─ Combat ────────────────────────────────┐    │
│ │ Primary Weapons: [____________]          │    │
│ │ Fighting Style: [____________]           │    │
│ │ Tactical Role: [____________]            │    │
│ └─────────────────────────────────────────┘    │
│                                                 │
│ ┌─ Voice & Speech ────────────────────────┐    │
│ │ Speech Style: [____________]             │    │
│ │ Signature Phrases: [tag input]           │    │
│ └─────────────────────────────────────────┘    │
│                                                 │
│ ┌─ Relationships ─────────────────────────┐    │
│ │ [Character] → [Type] → [Character]       │    │
│ │ [+ Add Relationship]                     │    │
│ └─────────────────────────────────────────┘    │
│                                                 │
│ ┌─ Portrait ──────────────────────────────┐    │
│ │ [Image Preview]                          │    │
│ │ [Upload New] [Select Existing]           │    │
│ └─────────────────────────────────────────┘    │
│                                                 │
│ Notes: [textarea]                               │
│                                                 │
│ [Save] [Save & Generate Embedding] [Cancel]    │
└─────────────────────────────────────────────────┘
```

**Form Sections:**
1. **Basic Info** (collapsed by default after first save)
2. **Appearance** (expanded)
3. **Personality** (expanded)
4. **Background & Psychology** (expanded)
5. **Combat** (collapsed)
6. **Voice & Speech** (collapsed)
7. **Relationships** (expanded)
8. **Portrait** (collapsed)

**Custom Components Needed:**
- Tag input for arrays (aliases, traits, motivations, etc.)
- Relationship manager (bidirectional graph UI)
- Image selector/uploader
- Chapter/character autocomplete selects

---

### Location Editor (`/writer/locations/[slug]`)

**Layout:**
```
┌─────────────────────────────────────────────────┐
│ Location Editor                                 │
├─────────────────────────────────────────────────┤
│ ┌─ Basic Info ────────────────────────────┐    │
│ │ Name: [________________] *required       │    │
│ │ Slug: [auto-filled]                      │    │
│ │ Type: [City ▼]                           │    │
│ │ Region: [____________]                   │    │
│ │ Parent Location: [Select ▼]             │    │
│ │ Significance: [High ▼]                   │    │
│ │ First Appearance: [Select Chapter ▼]     │    │
│ └─────────────────────────────────────────┘    │
│                                                 │
│ ┌─ Descriptions ──────────────────────────┐    │
│ │ Quick Description: [textarea]            │    │
│ │ Visual Summary: [textarea]               │    │
│ │ Atmosphere: [textarea]                   │    │
│ │ History: [textarea]                      │    │
│ │ Story Role: [textarea]                   │    │
│ │ Accessibility: [textarea]                │    │
│ └─────────────────────────────────────────┘    │
│                                                 │
│ ┌─ Content ───────────────────────────────┐    │
│ │ Notable Landmarks: [tag input]           │    │
│ │ Key Personnel: [character multi-select]  │    │
│ │ Hazards/Dangers: [tag input]             │    │
│ │ Connections: [location multi-select]     │    │
│ └─────────────────────────────────────────┘    │
│                                                 │
│ ┌─ Zones ─────────────────────────────────┐    │
│ │ Zone 1: [Name] [Type] [Edit] [Delete]   │    │
│ │ Zone 2: [Name] [Type] [Edit] [Delete]   │    │
│ │ [+ Create Zone]                          │    │
│ └─────────────────────────────────────────┘    │
│                                                 │
│ [Save] [Save & Generate Embedding] [Cancel]    │
└─────────────────────────────────────────────────┘
```

---

### Scene Editor (`/writer/scenes/[slug]`)

**Layout:**
```
┌─────────────────────────────────────────────────┐
│ Scene Editor                                    │
├─────────────────────────────────────────────────┤
│ Chapter: [Select Chapter ▼] *required           │
│ Title: [________________]                       │
│ Slug: [auto-filled]                             │
│ Sequence Order: [___] (position in chapter)     │
│                                                 │
│ Synopsis:                                       │
│ [_________________________________________]     │
│                                                 │
│ ┌─ Scene Metadata ────────────────────────┐    │
│ │ When: [____________]                     │    │
│ │ Primary Location: [Select ▼]            │    │
│ │ POV Character: [Select ▼]               │    │
│ └─────────────────────────────────────────┘    │
│                                                 │
│ ┌─ Characters ────────────────────────────┐    │
│ │ [Character] [Role: POV/Major/Minor ▼]    │    │
│ │ [+ Add Character]                        │    │
│ └─────────────────────────────────────────┘    │
│                                                 │
│ ┌─ Zones ─────────────────────────────────┐    │
│ │ [Zone] [Role: Primary/Secondary ▼]       │    │
│ │ [+ Add Zone]                             │    │
│ └─────────────────────────────────────────┘    │
│                                                 │
│ ┌─ Tags ──────────────────────────────────┐    │
│ │ [tag input] (action, dialogue, etc.)     │    │
│ └─────────────────────────────────────────┘    │
│                                                 │
│ ┌─ Content Blocks (from Chapter) ─────────┐    │
│ │ [List of available blocks from chapter]  │    │
│ │ [Link Block to Scene]                    │    │
│ └─────────────────────────────────────────┘    │
│                                                 │
│ [Save] [Cancel]                                │
└─────────────────────────────────────────────────┘
```

---

### Zone Editor (`/writer/zones/[slug]`)

**Layout:**
```
┌─────────────────────────────────────────────────┐
│ Zone Editor                                     │
├─────────────────────────────────────────────────┤
│ Location: [Select Location ▼] *required         │
│ Name: [________________] *required              │
│ Slug: [auto-filled]                             │
│ Type: [Threshold ▼]                             │
│                                                 │
│ Parent Zone: [Select Zone ▼] (optional)         │
│ Location Within: [____________]                 │
│                                                 │
│ ┌─ Descriptions ──────────────────────────┐    │
│ │ Physical Description: [textarea]         │    │
│ │ Narrative Function: [textarea]           │    │
│ │ Emotional Register: [____________]       │    │
│ └─────────────────────────────────────────┘    │
│                                                 │
│ ┌─ Details ───────────────────────────────┐    │
│ │ Signature Details: [tag input]           │    │
│ │ Mood Affinity: [tag input]               │    │
│ │ Character Associations: [tag input]      │    │
│ │ Light Conditions: [JSON editor]          │    │
│ └─────────────────────────────────────────┘    │
│                                                 │
│ ┌─ Story Info ────────────────────────────┐    │
│ │ First Appearance: [Select Chapter ▼]     │    │
│ │ Story Significance: [High ▼]             │    │
│ └─────────────────────────────────────────┘    │
│                                                 │
│ [Save] [Save & Generate Embedding] [Cancel]    │
└─────────────────────────────────────────────────┘
```

---

## Vectorize Integration Strategy

### Current vs. Target Architecture

**Current (Block-Level):**
```
Upload Markdown
  → Parse blocks (paragraphs, dialogue)
  → Insert into D1 (content_block table)
  → Generate embedding per block
  → Store in Vectorize (vector ID = block.id)
  → Search returns individual blocks
```

**Target (Entity-Level):**
```
Create/Update Entity (Chapter/Character/Location/Zone)
  → Insert/Update into D1 (content_item, character, location, etc.)
  → Concatenate all entity text fields
  → Generate single embedding for entire entity
  → Upsert to Vectorize (vector ID = entity.id)
  → Search returns whole entities
```

### Benefits of Entity-Level:
1. **Preserves narrative context** (no fragmentation)
2. **Simpler ID mapping** (1 vector = 1 entity)
3. **Smaller index** (~115 entities vs ~10,000+ blocks)
4. **Better search relevance** (whole chapters, not snippets)
5. **Matches BGE-M3 capacity** (8,192 tokens = ~32K chars = full chapter)

### Implementation Plan:

#### Phase 1: Add Entity-Level Embedding Service
**File:** `mythic-index/frontend/src/lib/server/ai/embedding-entity.ts`

```typescript
export class EntityEmbeddingService {
  async embedChapter(contentId: string, db: D1Database): Promise<void>
  async embedCharacter(characterId: string, db: D1Database): Promise<void>
  async embedLocation(locationId: string, db: D1Database): Promise<void>
  async embedZone(zoneId: string, db: D1Database): Promise<void>

  private async generateAndUpsert(
    id: string,
    text: string,
    metadata: VectorMetadata,
    vectorize: VectorizeIndex
  ): Promise<void>
}
```

#### Phase 2: Update Server Actions
**Files:**
- `src/routes/writer/chapters/[slug]/+page.server.ts`
- `src/routes/writer/characters/[slug]/+page.server.ts`
- `src/routes/writer/locations/[slug]/+page.server.ts`
- `src/routes/writer/zones/[slug]/+page.server.ts`

**Actions:**
- `create` - Insert entity + generate embedding
- `update` - Update entity + regenerate embedding
- `delete` - Delete entity + remove from Vectorize

#### Phase 3: Migration Strategy
**Goal:** Transition from block-level to entity-level embeddings

**Option A: Clean Slate**
1. Delete all existing Vectorize vectors
2. Batch re-embed all entities
3. Update search to query entity-level index

**Option B: Dual Index**
1. Keep block-level index for legacy search
2. Create new entity-level index
3. Gradually migrate search queries

**Recommendation:** Option A (clean slate) - simpler, matches documented architecture

---

## Technical Implementation Details

### Required New Routes

```
/writer
├── /chapters
│   ├── /new                  → +page.svelte (create form)
│   └── /[slug]               → +page.svelte (edit form)
│       └── +page.server.ts   → load, actions: { create, update, delete }
├── /characters
│   ├── /new
│   └── /[slug]
│       └── +page.server.ts
├── /locations
│   ├── /new
│   └── /[slug]
│       └── +page.server.ts
├── /scenes
│   ├── /new
│   └── /[slug]
│       └── +page.server.ts
└── /zones
    ├── /new
    └── /[slug]
        └── +page.server.ts
```

### Required New Components

```
/lib/components/writer
├── /forms
│   ├── ChapterForm.svelte
│   ├── CharacterForm.svelte
│   ├── LocationForm.svelte
│   ├── SceneForm.svelte
│   └── ZoneForm.svelte
├── /inputs
│   ├── TagInput.svelte          → Array field editor (add/remove tags)
│   ├── RelationshipManager.svelte → Character relationships UI
│   ├── BlockEditor.svelte       → Content block editing
│   ├── ImageSelector.svelte     → Image asset picker
│   └── EntityAutocomplete.svelte → Character/location/chapter search
├── /blocks
│   ├── ProseBlock.svelte        → Prose content editor
│   ├── DialogueBlock.svelte     → Dialogue editor
│   └── SceneHeaderBlock.svelte  → Scene header editor
└── /ui
    ├── FormSection.svelte       → Collapsible form section
    └── SaveStatus.svelte        → Auto-save indicator
```

### Server-Side Utilities

```
/lib/server/writer
├── validation.ts         → Zod schemas for each entity
├── slug-generator.ts     → Auto-generate slugs from titles
├── embedding-entity.ts   → Entity-level embedding service
└── crud.ts               → Reusable CRUD operations
```

### Database Helpers

```typescript
// Example: Character CRUD
export async function createCharacter(
  db: D1Database,
  data: CharacterInput,
  workspaceId: string
): Promise<Character> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(character).values({
    id,
    workspaceId,
    slug: generateSlug(data.name),
    name: data.name,
    // ... all other fields
    createdAt: now,
    updatedAt: now,
  });

  return { id, ...data };
}
```

---

## Migration from Markdown Upload

### Current Workflow:
1. User uploads markdown file
2. Parser extracts frontmatter + blocks
3. Inserts into content_item + content_revision + content_section + content_block
4. Generates block-level embeddings

### New Workflow:
1. User creates entity via form
2. Form submits structured data
3. Server action inserts into appropriate tables
4. Generates entity-level embedding

### Coexistence Strategy:
- Keep `/admin/upload` for batch markdown imports
- Add `/writer/*` for granular entity editing
- Eventually deprecate markdown upload in favor of rich forms

---

## Next Steps

### Phase 1: Foundation (Week 1)
- [ ] Create route structure (`/writer/*`)
- [ ] Build reusable form components (TagInput, FormSection)
- [ ] Implement slug generation utility
- [ ] Set up Zod validation schemas

### Phase 2: Character Editor (Week 2)
- [ ] Character form with all fields
- [ ] Relationship manager UI
- [ ] Portrait image selector
- [ ] Server actions (create, update, delete)
- [ ] Entity-level embedding on save

### Phase 3: Location Editor (Week 3)
- [ ] Location form with all fields
- [ ] Zone management UI
- [ ] Parent location selector
- [ ] Key personnel multi-select
- [ ] Entity-level embedding

### Phase 4: Chapter Editor (Week 4)
- [ ] Chapter metadata form
- [ ] Section/block builder UI
- [ ] Scene manager
- [ ] Rich text or markdown editor
- [ ] Entity-level embedding

### Phase 5: Scene & Zone Editors (Week 5)
- [ ] Scene form with character/zone/tag links
- [ ] Zone form with hierarchical parent selector
- [ ] Block linkage UI for scenes

### Phase 6: Vectorize Migration (Week 6)
- [ ] Implement EntityEmbeddingService
- [ ] Batch re-embed all entities
- [ ] Update search to query entity-level
- [ ] Delete legacy block-level embeddings

---

## Open Questions

1. **Rich Text Editor:** Use Tiptap, ProseMirror, or simple markdown?
2. **Auto-save:** Implement draft auto-save every N seconds?
3. **Revision History:** Show revision diffs in UI?
4. **Validation:** Client-side (Svelte) + server-side (Zod)?
5. **Permissions:** Who can create/edit/delete? (Future: role-based access)
6. **Image Upload:** Allow direct upload from forms or require admin upload first?
7. **Batch Operations:** Support bulk import from chargen CLI?
8. **Real-time Preview:** Live preview of formatted content while editing?

---

## Success Metrics

- [ ] All entity types have dedicated editors
- [ ] Forms match schema 1:1 (all fields editable)
- [ ] Entity-level embeddings generate on save
- [ ] Search returns whole entities (not blocks)
- [ ] Vectorize index contains ~115 vectors (not 10K+)
- [ ] Chargen CLI can optionally sync to frontend
- [ ] No orphaned data (all relationships valid)
- [ ] 100% schema compliance
