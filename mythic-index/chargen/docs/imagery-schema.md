# Imagery.yaml Schema Reference

This document provides a comprehensive reference for the imagery.yaml schema used across characters, locations, and chapters. It covers field semantics, prompt compilation behavior, and validation rules.

---

## Table of Contents

1. [Overview](#overview)
2. [Entity Types](#entity-types)
3. [Field Semantics](#field-semantics)
4. [Prompt Compilation](#prompt-compilation)
5. [Validation Rules](#validation-rules)
6. [Type Definitions](#type-definitions)

---

## Overview

Each entity in MemoryQuill (characters, locations, chapters) can have an `imagery.yaml` file that defines visual generation metadata. The chargen system uses these files to:

1. **Parse and validate** imagery specifications
2. **Compile prompts** for AI image generation
3. **Track image inventory** for asset management

### File Locations

```
MemoryQuill/story-content/
├── characters/
│   └── {character-slug}/
│       └── imagery.yaml
├── locations/
│   └── {location-slug}/
│       └── imagery.yaml
└── chapters/
    └── {chapter-slug}/
        └── imagery.yaml
```

---

## Entity Types

### Character Imagery

```yaml
entity_type: character
slug: character-slug
appearance: |
  Detailed physical description of the character...
prompts:
  - "Additional prompt guidance"
image_inventory:
  - image_type: portrait
    image_slug: character-portrait-01
    description: "Standard portrait reference"
    # ... other fields
```

**Image Types:**
| Type | Purpose |
|------|---------|
| `portrait` | Face/bust reference shot |
| `full-body` | Full figure reference |
| `action` | Dynamic action pose |
| `scene` | Character in environmental context |
| `mood` | Emotional state capture |
| `collaborative` | Multi-character scene |

### Location Imagery

```yaml
entity_type: location
slug: location-slug
version: "1.0"
metadata:
  narrative_soul: |
    The emotional/thematic essence of this place...
  one_line_essence: "Short tagline for quick reference"
visual_anchor:
  signature_elements:
    - "Distinctive visual element"
  color_anchors:
    primary: "dominant color description"
  characteristic_light:
    day: "Daylight quality description"
    night: "Nighttime lighting description"
zones:
  - zone_id: zone-name
    zone_description: "Description of the zone"
    narrative_role: "How this zone functions in the story"
    # ... zone-specific fields
    images:
      - image_type: establishing
        image_slug: zone-establishing-01
        # ... image fields
```

**Image Types:**
| Type | Purpose |
|------|---------|
| `establishing` | Wide establishing shot |
| `zone` | Zone-specific view |
| `beat` | Narrative beat within zone |
| `inhabited` | Zone with characters present |
| `temporal` | Time-of-day variant |
| `perspective` | Specific viewpoint |
| `essence` | Atmospheric/mood capture |
| `hero` | Primary/featured shot |
| `anchor` | Key visual anchor |
| `detail` | Close-up detail |
| `mood` | Atmospheric mood shot |

### Chapter Imagery

```yaml
entity_type: chapter
chapter_id: chapter-slug
visual_thesis: |
  Overarching visual theme for the chapter...
mood_distribution:
  somber: 30
  kinetic: 40
  heroic: 30
moments:
  - id: moment-01
    narrative_beat: "Description of what happens"
    location_zone: "location-slug/zone-id"
    visual_weight: high
    transformation_state: before
    characters:
      - slug: character-slug
        role: protagonist
images:
  - image_type: hero
    image_slug: chapter-hero-01
    source_moment: moment-01
    # ... image fields
```

**Image Types:**
| Type | Purpose |
|------|---------|
| `hero` | Chapter opening/establishing shot |
| `anchor` | Pivotal moments, action climaxes |
| `beat` | Narrative beat within scene |
| `detail` | Close-ups, symbolic details |
| `supporting` | Supporting imagery for context |

**Scene Moods:**
| Mood | Usage |
|------|-------|
| `somber` | Grief, loss, melancholy |
| `pastoral` | Peaceful, natural settings |
| `celebratory` | Joy, triumph, celebration |
| `ethereal` | Mystical, otherworldly |
| `intimate` | Close, personal moments |
| `kinetic` | Action, energy, movement |
| `ominous` | Foreboding, danger |
| `heroic` | Triumph, valor, courage |
| `clandestine` | Secret, hidden dealings |
| `tense` | Suspense, anxiety |
| `reverent` | Sacred, respectful |

---

## Field Semantics

### Narrative Fields

| Field | Entity | Semantic Meaning | Prompt Usage |
|-------|--------|------------------|--------------|
| `narrative_soul` | Location | The emotional/thematic essence of a place | Added to style section (weight 5) |
| `one_line_essence` | Location | Short tagline for quick reference | Added to style section (weight 5) |
| `visual_thesis` | Chapter | Overarching visual theme for chapter | Added to style section (weight 5) |
| `narrative_beat` | Moment | Description of what happens in the moment | Added to subject section (weight 2) |
| `mood_rationale` | Image | Why this mood was chosen | Added to style section (weight 5) |

### Visual Weight (Moments)

Controls prompt detail level and generation priority:

| Weight | Effect |
|--------|--------|
| `critical` | Extended prompt length (6000 chars), all sections required, "highly detailed" constraint |
| `high` | Extended prompt (5000 chars), core sections required, "detailed" constraint |
| `medium` | Standard prompt (4000 chars), subject section only |
| `low` | Shortened prompt (3000 chars), minimal requirements |

### Transformation State

Automatically resolves character appearance based on narrative timeline:

| State | Usage |
|-------|-------|
| `before` | Character appearance before transformation (unmarred, original state) |
| `during` | Mid-transformation state |
| `after` | Post-transformation appearance (scarred, changed) |

Works with character `scene_variations` field:
```yaml
scene_variations: |
  BEFORE: unmarred face, clean armor
  DURING: mid-battle, bloodied
  AFTER: scarred left cheek, weathered armor
```

### Palette Specification

```yaml
palette:
  dominant:
    - "primary color 1"
    - "primary color 2"
  accent:
    - "accent color"
  avoid:
    - "color to avoid"  # Added to negative prompts
```

**Avoid colors** are automatically converted to negative prompts: `"neon" → "neon colors"`

### Default Prompt Elements

```yaml
default_prompt_elements:
  must_include:
    - "element that must appear"
  must_avoid:
    - "element to exclude"  # Added to negative prompts
  atmosphere:
    - "atmospheric descriptor"
```

### Style Notes

Zone-specific styling added directly to prompts:

```yaml
images:
  - image_type: zone
    style_notes: "Painterly brushwork, muted earth tones"
```

---

## Prompt Compilation

### Weight Precedence System

Prompt sections are ordered by weight (1 = highest priority, 5 = lowest):

| Weight | Section Type | Content Examples |
|--------|--------------|------------------|
| 1 | Constraints | Image type, format, technical requirements |
| 2 | Subject | Main subject description, character states, narrative beat |
| 3 | Composition | Framing, camera angle, depth |
| 4 | Lighting | Light sources, quality, time of day |
| 5 | Style | Master style, narrative_soul, mood_rationale |

### Source Precedence (Location)

When the same field exists at multiple levels:

1. **Zone/Image-level overrides** (highest priority)
2. **Overview/Entity-level defaults**
3. **Location visual anchor**
4. **Metadata generation defaults**
5. **Global master style** (lowest priority)

### Negative Prompt Merging

Negative prompts are merged from all sources (deduplicated):

1. Zone `negative_prompt`
2. Overview `negative_prompt`
3. Zone `palette.avoid` (converted to "X colors")
4. Overview `palette.avoid` (converted to "X colors")
5. Zone `default_prompt_elements.must_avoid`
6. Global defaults

**Magic/Glow Normalization:**

Legacy "no magic" terms are normalized to avoid banning all fantasy elements:
- `magic effects` → `overt spellcasting, big magical explosions`
- `glowing elements` → `neon rune-glow, excessive glow`
- `fantasy glow` → `neon rune-glow, excessive glow`

---

## Validation Rules

The chargen system uses **strict Zod validation**. Invalid imagery.yaml files will throw `ImagerySchemaError` with detailed issue lists.

### Common Validation Errors

```
ImagerySchemaError: Invalid imagery.yaml for chapter/ch01-example
Issues:
  - path: images[0].image_type
    message: Invalid enum value. Expected 'hero' | 'anchor' | 'beat' | 'detail' | 'supporting'
    received: 'mood'
```

### Skip Validation (Development)

```typescript
// For legacy files during migration
const data = await readImageryYaml('chapter', 'ch01-example', { skipValidation: true });
```

---

## Type Definitions

### ChapterImageType

```typescript
type ChapterImageType =
  | 'hero'       // Chapter opening/establishing shot
  | 'anchor'     // Pivotal moments, action climaxes
  | 'beat'       // Narrative beat within scene
  | 'detail'     // Close-ups, symbolic details
  | 'supporting' // Supporting imagery for context
```

### SceneMood

```typescript
type SceneMood =
  | 'somber'       // Grief, loss
  | 'pastoral'     // Peaceful, natural
  | 'celebratory'  // Joy, triumph
  | 'ethereal'     // Mystical, otherworldly
  | 'intimate'     // Close, personal
  | 'kinetic'      // Action, energy
  | 'ominous'      // Foreboding, danger
  | 'heroic'       // Triumph, valor
  | 'clandestine'  // Secret, hidden
  | 'tense'        // Suspense, anxiety
  | 'reverent'     // Sacred, respectful
```

### ImageType (Location)

```typescript
type ImageType =
  | 'establishing' // Wide establishing shot
  | 'zone'         // Zone-specific view
  | 'beat'         // Narrative beat
  | 'inhabited'    // With characters
  | 'temporal'     // Time-of-day variant
  | 'perspective'  // Specific viewpoint
  | 'essence'      // Atmospheric capture
  | 'hero'         // Primary/featured
  | 'anchor'       // Key visual anchor
  | 'detail'       // Close-up detail
  | 'mood'         // Atmospheric mood
```

### CharacterImageType

```typescript
type CharacterImageType =
  | 'portrait'      // Face/bust reference
  | 'full-body'     // Full figure reference
  | 'action'        // Dynamic pose
  | 'scene'         // Environmental context
  | 'mood'          // Emotional state
  | 'collaborative' // Multi-character scene
```

### VisualWeight

```typescript
type VisualWeight = 'critical' | 'high' | 'medium' | 'low'
```

### TransformationState

```typescript
type TransformationState = 'before' | 'during' | 'after'
```

---

## Key Files

### Type Definitions
- `chargen/src/types/chapter-imagery.ts` - Chapter imagery types
- `chargen/src/types/prompt-ir.ts` - Location/shared types
- `chargen/src/types/character-imagery.ts` - Character imagery types

### Validation
- `chargen/src/services/imagery-schema.ts` - Zod schemas
- `chargen/src/services/imagery-yaml.ts` - YAML parsing with validation

### Prompt Compilation
- `chargen/src/services/prompt-compiler/index.ts` - Main entry point
- `chargen/src/services/prompt-compiler/location-compiler.ts` - Location prompts
- `chargen/src/services/prompt-compiler/chapter-compiler.ts` - Chapter prompts
- `chargen/src/services/prompt-compiler/precedence.ts` - Precedence rules

---

## Migration Guide

If upgrading from an older schema version:

1. **Update image_type values** to match new enums
2. **Add missing mood values** (heroic, clandestine, tense, reverent)
3. **Replace deprecated types** (symbol → beat, pivot → anchor)
4. **Add transformation_state** to moments for automatic character state resolution
5. **Add visual_weight** to moments for detail level control
