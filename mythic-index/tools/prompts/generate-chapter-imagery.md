# Chapter Imagery Generator Prompt

## Your Task

You are an expert at creating highly detailed visual specifications for narrative fiction. Your task is to generate a comprehensive `imagery.yaml` file for a chapter by analyzing the chapter content, character profiles, location details, and existing visual references.

## Input Files You Must Read

### 1. Core Chapter Content
- **Path**: `MemoryQuill/story-content/chapters/{chapter-slug}/content.md`
- **What to extract**:
  - Scene IDs and narrative beats
  - Emotional arcs and transformations
  - Character interactions and dialogue
  - Location descriptions and atmospheric details
  - Key symbolic moments worth visualizing
  - Lighting and time-of-day cues

### 2. Existing Chapter Imagery (if present)
- **Path**: `MemoryQuill/story-content/chapters/{chapter-slug}/imagery.yaml`
- **What to extract**:
  - Existing moments list
  - Previously defined visual thesis and color palette
  - Character scene variations already documented
  - Generated images to avoid duplication

### 3. Character Profiles
For each character mentioned in the chapter:
- **Path**: `MemoryQuill/story-content/characters/{character-slug}/profile.md`
- **What to extract**:
  - Physical description (height, build, hair, eyes, clothing)
  - Distinguishing features (scars, tattoos, accessories)
  - Body language and typical expressions
  - Emotional state indicators
  - Combat/action postures if relevant

### 4. Location Overview & Imagery
For each location visited in the chapter:
- **Path**: `MemoryQuill/story-content/locations/{location-slug}/overview.md`
- **What to extract**:
  - Architectural materials and construction
  - Spatial layout and sightlines
  - Functional zones and their purposes
  - Canonical visual anchors (colors, textures, distinctive elements)

- **Path**: `MemoryQuill/story-content/locations/{location-slug}/imagery.yaml`
- **What to extract**:
  - Location visual anchor (signature elements, materials, color palette)
  - Zone definitions with visual descriptions
  - Characteristic lighting at different times of day
  - Mood and atmosphere specifications

## Output Structure

Generate a complete `imagery.yaml` file with the following sections:

### 1. Metadata Section
```yaml
metadata:
  entity_type: "chapter-imagery"
  slug: "{chapter-slug}"
  chapter_number: {number}
  chapter_title: "{title}"
  visual_thesis: |
    A 2-3 sentence thematic statement capturing the visual journey of the chapter.
    What is the arc from opening to closing? What visual transformation occurs?
  color_palette:
    primary: ["{color1}", "{color2}", "{color3}", "{color4}"]
    accent: ["{accent1}", "{accent2}", "{accent3}"]
  generation_defaults:
    provider: "openai"
    model: "gpt-image-1"
    quality: "high"
  mood_distribution:
    somber: {count}
    pastoral: {count}
    celebratory: {count}
    ominous: {count}
    tense: {count}
    intimate: {count}
    prestigious: {count}
    mysterious: {count}
    triumphant: {count}
```

**How to derive**:
- **visual_thesis**: Identify the chapter's emotional/visual arc. What changes from beginning to end?
- **color_palette**: Extract from scene descriptions, lighting cues, and location color anchors
- **mood_distribution**: Count how many images should reflect each mood based on scene analysis

### 2. Characters Section
```yaml
characters:
  - ref: "{character-slug}"
    name: "{Character Name}"
    scene_variations: |
      CHAPTER {N} VARIATIONS:
      - SCENE {ID} ({context}): {appearance details}
      - SCENE {ID} ({context}): {appearance details}
      [Document how the character's appearance changes across scenes:
       injuries sustained, costume changes, emotional state visible in posture,
       environmental effects (wet, dusty, bloodied), lighting effects on appearance]
    reference_images:
      - "{character-slug}-official-portrait-01"
      - "{any-other-canonical-reference-images}"
```

**How to derive**:
- List all characters with speaking roles or significant presence
- Track appearance evolution: Do they get injured? Change clothes? Get dirty/wet/bloodied?
- Note emotional state changes that affect expression or body language
- Reference existing character portrait images if available

### 3. Locations Section
```yaml
locations:
  - ref: "{location-slug}"
    zones:
      - id: "{zone-id}"
        chapter_context: |
          {How this zone appears specifically in this chapter.
           Include time of day, weather, lighting, any chapter-specific modifications.
           3-5 sentences grounding the generic zone description in this chapter's narrative.}
      - id: "{zone-id-2}"
        chapter_context: |
          {Chapter-specific context...}
```

**How to derive**:
- List all locations visited in the chapter
- For each location, identify which zones are used (reference the location's imagery.yaml)
- Add chapter-specific context: time of day, weather, narrative events that modify the space
- Include atmospheric details from the content.md that aren't in the generic location description

### 4. Moments Section
```yaml
moments:
  - id: "{chapter-slug}-moment-{NN}"
    scene_id: "scn-{chapter}-{scene}"
    title: "{Evocative 2-4 word title}"
    narrative_beat: |
      {1-2 sentence description of what's happening in this moment.
       What makes this worth visualizing? What story beat does it capture?}
    visual_weight: "{high|medium|low}"
    characters_present:
      - "{character-slug-1}"
      - "{character-slug-2}"
    location_zone: "{location-slug}/{zone-id}"
    transformation_state: "{before|during|after|climax|resolution}"
    recommended_images: {1-3}
    mood: "{primary mood}"
    symbolic_elements:
      - "{object/element and its significance}"
```

**How to derive**:
- **Identify 10-20 key moments** worth visualizing across the chapter
- Prioritize:
  - Opening and closing beats (establish and resolve visual arc)
  - Character introductions and transformations
  - Emotional turning points
  - Action climaxes
  - Symbolic moments (objects, gestures, environmental metaphors)
  - Location establishing shots
- **visual_weight**:
  - high = chapter-defining moments, likely to be featured prominently
  - medium = important but supporting beats
  - low = atmospheric or transitional moments
- **transformation_state**: Where in the chapter's arc does this fall?
- **recommended_images**: How many different compositions/angles would serve this moment?

### 5. Images Section
```yaml
images:
  - custom_id: "{chapter-slug}-img-{moment-NN}-{variant-NN}"
    source_moment: "{chapter-slug}-moment-{NN}"
    scene_id: "scn-{chapter}-{scene}"
    image_type: "{hero|establishing|moment|character|symbol|action}"
    category: ["{category1}", "{category2}"]
    scene_mood: "{mood}"
    mood_rationale: |
      {1-2 sentences explaining why this mood fits this moment.
       What emotional or atmospheric quality should the image convey?}
    aspect_ratio: "{16:9|4:3|1:1|9:16}"
    orientation: "{landscape|portrait|square}"
    size: "{1792x1024|1024x1792|1024x1024}"
    visual_description: |
      {3-5 sentences painting the complete scene.
       What is the viewer seeing? What's in focus? What's in the background?
       What action is frozen in this moment? What draws the eye?}
    composition_notes: |
      {Technical composition guidance:
       Camera angle (wide, medium, close-up, extreme close-up)
       Point of view (high angle, low angle, eye level, over-shoulder)
       Focal point and visual hierarchy
       Foreground/midground/background elements
       Rule of thirds, leading lines, framing devices}
    visual_hook: |
      {The ONE most striking visual element that makes this image memorable.
       The thing that makes someone stop scrolling. 1 sentence.}
    depicts_characters: ["{character-slug-1}", "{character-slug-2}"]
    character_states:
      {character-slug-1}: |
        {Specific appearance details for this moment:
         Posture, expression, action, clothing state, injuries, lighting on face/body.
         Reference the scene_variations documented above.}
    location: "{location-slug}"
    zone: "{zone-id}"
    lighting:
      primary_source: "{sun/moon/lantern/fire/magical/etc.} ({color description})"
      quality: "{harsh|soft|diffused|dramatic|warm|cold|etc.}"
      direction: "{front|back|side|above|below} ({creating what effect})"
      color_temperature: "{warm/cool} ({specific color cast})"
      shadow_depth: "{deep|moderate|soft|minimal}"
      atmospheric: "{fog|smoke|dust|rain|snow|heat shimmer|etc.}"
    palette:
      dominant: ["{primary color 1}", "{primary color 2}"]
      accent: ["{accent color 1}", "{accent color 2}"]
      avoid: ["{color to exclude}", "{another color to exclude}"]
    prompt_used: |
      {The actual prompt to send to the image generation model.
       Should be detailed, specific, and incorporate:
       - Character physical descriptions from profile.md
       - Location architectural details from overview.md and imagery.yaml
       - Lighting specifications from above
       - Composition notes from above
       - Mood and atmosphere
       - Color palette guidance
       Aim for 150-300 words, highly descriptive, comma-separated phrases.}
    negative_prompt: |
      {Styles and elements to avoid:
       Common: cartoon, anime, manga, cel-shaded, plastic, glossy, oversaturated,
       modern clothing, anachronistic elements, wrong time period, etc.
       Specific to this image: any particular things that would break the scene.}
    tags: ["{tag1}", "{tag2}", "{tag3}"]
    generated_at: null
    file_name: null
    file_path: null
```

**How to derive**:
- **Create 1-3 image specs per moment** (based on `recommended_images`)
- **image_type**:
  - hero: The single most important image for the chapter
  - establishing: Location or scene-setting shots
  - moment: Capturing a specific narrative beat
  - character: Character-focused portraits or action shots
  - symbol: Focused on symbolic objects or metaphorical visuals
  - action: Combat, chase, or high-energy movement
- **category**: Combine descriptive tags (moment, location, character, action, symbol, emotional, atmospheric)
- **aspect_ratio & size**:
  - 16:9 landscape (1792x1024) for establishing shots and wide scenes
  - 9:16 portrait (1024x1792) for character-focused verticals
  - 1:1 square (1024x1024) for intimate or symbolic moments
- **Lighting**: Extract from content.md scene descriptions, location characteristic lighting, and narrative context
- **prompt_used**: Synthesize ALL the information into a coherent, detailed prompt:
  - Character physical descriptions from profile.md
  - Location materials and architecture from overview.md and location imagery.yaml
  - Scene-specific details from content.md
  - Lighting, composition, mood, and palette specifications
  - Avoid vague terms; be precise about colors, textures, angles, and spatial relationships

## Generation Guidelines

### Moment Selection Strategy
1. **Chapter Structure Coverage**:
   - Opening: 2-3 moments establishing setting, characters, initial mood
   - Rising Action: 4-6 moments tracking escalation and character reactions
   - Climax: 3-4 moments capturing the peak dramatic beat(s)
   - Resolution: 2-3 moments showing aftermath and transition

2. **Visual Diversity**:
   - Mix wide establishing shots with intimate close-ups
   - Vary locations and characters featured
   - Balance action with contemplative/atmospheric moments
   - Include at least one symbolic/metaphorical image if thematically appropriate

3. **Transformation Tracking**:
   - If a character undergoes physical change (injury, costume, emotional state), create moments showing before/during/after
   - If a location is transformed (damaged, lit differently, occupied vs. empty), capture the change

### Visual Thesis Development
Read the chapter's emotional arc and identify:
- **Opening visual state**: What does the world look like at the start? (Color, light, mood)
- **Transformation**: What changes? (Violence, discovery, loss, triumph, decay, growth)
- **Closing visual state**: How has the visual world shifted by the end?

Example: "A descent from golden twilight into catastrophic fire, then rising from ash into lantern-lit resolve."

### Color Palette Derivation
- Extract colors from scene descriptions in content.md
- Incorporate location color anchors from location imagery.yaml
- Identify emotional color associations (warm/cool, saturated/desaturated)
- Note time-of-day lighting (dawn gold, noon white, dusk copper, night indigo)
- List 3-5 primary colors and 2-4 accent colors
- Specify colors to avoid (e.g., "cold blues" in a warm-toned fire scene)

### Mood Distribution
Count your image specs and categorize by mood:
- **somber**: grief, loss, heaviness, quiet tragedy
- **pastoral**: peace, natural beauty, gentle domesticity
- **celebratory**: joy, triumph, community, lightness
- **ominous**: dread, foreboding, creeping threat
- **tense**: suspense, conflict, danger, urgency
- **intimate**: private moments, vulnerability, connection
- **prestigious**: grandeur, authority, formal ceremony
- **mysterious**: unknown, hidden, enigmatic, strange
- **triumphant**: victory, overcoming, achievement, glory

### Prompt Writing Best Practices
1. **Be Specific**: "A half-elf woman with deep earth-brown skin and jet black mohawk" NOT "a woman"
2. **Lead with Subject**: Start with who/what is the focus
3. **Layer Details**: Subject → action → setting → lighting → atmosphere
4. **Use Commas**: Separate descriptive phrases with commas for AI parsing
5. **Include Technical Terms**: "Low angle shot," "warm backlight," "shallow depth of field"
6. **Reference Styles**: "Painterly realism," "cinematic lighting," "high fantasy illustration"
7. **Specify Materials**: "Weathered oak," "polished marble," "worn leather," "tarnished bronze"
8. **Ground in Space**: "In the foreground," "middle distance," "background receding into"

## Workflow

1. **Read chapter content.md** → Identify scenes, characters, locations, emotional beats
2. **Read character profile.md files** → Extract physical descriptions and personality cues
3. **Read location overview.md and imagery.yaml files** → Extract architectural details and color palettes
4. **Draft metadata** → Visual thesis, color palette, mood distribution
5. **Document characters** → Scene variations and canonical references
6. **Document locations** → Chapter-specific zone contexts
7. **Select 10-20 moments** → Narrative beats worth visualizing
8. **Create 20-40 image specifications** → 1-3 images per moment, with complete details
9. **Review for coherence** → Does the imagery.yaml tell a visual story that matches the narrative?

## Quality Checklist

- [ ] All characters mentioned have documented scene variations
- [ ] All locations have chapter-specific zone contexts
- [ ] Moments cover the full chapter arc (opening → climax → resolution)
- [ ] Visual weight is distributed (not all "high")
- [ ] Image types are varied (establishing, moment, character, symbol, action)
- [ ] Aspect ratios match composition intent (wide for landscapes, tall for portraits)
- [ ] Lighting specifications are grounded in narrative time-of-day and location
- [ ] Color palettes are consistent with visual thesis and location anchors
- [ ] Prompts are 150-300 words and incorporate character/location details from source files
- [ ] Negative prompts exclude anachronisms and style mismatches
- [ ] Mood distribution is counted and listed in metadata
- [ ] Each image has a clear visual hook (the memorable element)

## Example Invocation

"Please generate a complete imagery.yaml file for chapter 5 (ch05-blood-and-lanternlight). The chapter slug is 'ch05-blood-and-lanternlight' and it is chapter number 5. Read all necessary content, character, and location files, then create a comprehensive visual specification following the template above."

## Notes

- **Existing imagery.yaml**: If updating an existing file, preserve any images that have `generated_at`, `file_name`, or `file_path` populated (these have already been generated). Add new moments and images, but don't delete generated content.
- **Reference images**: Use character-slug-official-portrait-01 format for canonical character references. Check if these exist in the character's images/ directory.
- **Scene IDs**: Follow the format "scn-{chapter-number}-{scene-number}" (e.g., "scn-05-03" for chapter 5, scene 3).
- **Moment IDs**: Follow the format "{chapter-slug}-moment-{NN}" with zero-padded numbers (01, 02, etc.).
- **Image IDs**: Follow the format "{chapter-slug}-img-{moment-NN}-{variant-NN}" for traceability.
- **Zone references**: Use "{location-slug}/{zone-id}" format (e.g., "undershade-canyon/rim-overlook").

---

**Now, tell me which chapter you'd like to process, and I'll generate the imagery.yaml file.**
