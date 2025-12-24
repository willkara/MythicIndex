/**
 * LLM-driven imagery generation tools
 * Tools for analyzing content and generating new image prompts
 */

import { z } from 'zod';
import { getStorage } from '../services/storage.js';
import { getConfig } from '../services/config.js';
import { getRemote } from '../services/remote.js';
import { getImageService, type ImageProvider, type ImageScenario, type ImageGenerationOptions } from '../services/images.js';
import * as d1 from '../services/d1.js';
import { getLogger } from '../services/logger.js';
import {
  readImageryYaml,
  writeImageryYaml,
  archiveExistingImages,
  getImagesDir,
  type EntityType,
  type ChapterImagery,
  type CharacterImagery,
  type LocationImagery,
  type ChapterScene,
  type GeneratedImageEntry,
} from '../services/imagery-yaml.js';
import { writeFile, mkdir } from 'fs/promises';
import { join, basename } from 'path';

// ============ Analysis Guidance Templates ============

const CHARACTER_ANALYSIS_GUIDANCE = `## Character Imagery Analysis Guide

When analyzing this character for portrait/imagery ideas, consider:

### Visual Identity
- **Core Features**: What makes this character instantly recognizable? Focus on 2-3 defining visual traits
- **Expression**: What emotion or attitude best represents their personality?
- **Pose/Stance**: What body language reflects their role (confident leader, weary traveler, cunning schemer)?

### Portrait Concepts to Explore
1. **Signature Portrait**: Neutral expression, clear view of distinguishing features
2. **In-Action**: Character doing something central to their identity
3. **Emotional Peak**: A moment of strong emotion that defines them
4. **Relationship Context**: With another character or meaningful object

### Prompt Writing Tips
- Lead with the most distinctive visual feature
- Include lighting that matches their personality (warm, cold, dramatic, soft)
- Specify camera angle (eye-level for equals, low angle for power, high for vulnerability)
- Include environmental hints that reinforce character`;

const CHAPTER_ANALYSIS_GUIDANCE = `## Chapter Imagery Analysis Guide

When analyzing this chapter for scene imagery, evaluate moments on these criteria:

### Selection Criteria (Score 1-5)
1. **Emotional Impact**: Does this moment hit hard? Triumph, loss, fear, wonder?
2. **Visual Wow-Factor**: Would this look stunning as an illustration?
3. **Narrative Significance**: Is this a turning point, revelation, or key character moment?
4. **Uniqueness**: Does it show something we haven't seen before?

### Composition Approaches
- **Wide Establishing**: Show the full scene, environment, and scale
- **Medium Character Focus**: 1-2 characters, emotional expressions visible
- **Close-Up Detail**: Hands, eyes, a significant object
- **Over-Shoulder POV**: See what the POV character sees
- **Dramatic Silhouette**: High contrast, iconic shapes

### Scene Types to Prioritize
- First appearances of important characters/locations
- Confrontations and reveals
- Moments of connection or betrayal
- Action climaxes
- Quiet character moments that reveal depth

### Prompt Structure
1. Scene description (what's happening)
2. Key characters (with visual details from their profiles)
3. Environment/setting details
4. Lighting and mood
5. Composition/framing
6. Art style notes`;

const LOCATION_ANALYSIS_GUIDANCE = `## Location Imagery Analysis Guide

When analyzing this location for imagery, consider:

### Core Visual Identity
- **Defining Feature**: What single element makes this place memorable?
- **Scale**: Intimate room, grand hall, vast landscape?
- **Light Source**: Natural, artificial, magical? Time of day?
- **Atmosphere**: What feeling should the image evoke?

### Viewpoints to Consider
1. **Establishing Shot**: Wide view showing the location's character
2. **Signature Detail**: Close-up of a unique architectural/natural feature
3. **Lived-In View**: Signs of inhabitants, use, history
4. **Dramatic Moment**: The location during a key story event
5. **Time Variation**: Dawn, dusk, storm, celebration

### Environmental Storytelling
- What does the wear and tear tell us about history?
- What objects or details hint at the inhabitants?
- What's the relationship between this place and the world around it?

### Prompt Structure
1. Location type and name
2. Dominant visual features
3. Atmospheric conditions (weather, light, time)
4. Details that convey history/use
5. Mood/emotional tone
6. Art style alignment`;

/**
 * Get entity-specific analysis guidance
 */
function getAnalysisGuidance(entityType: EntityType): string {
  switch (entityType) {
    case 'character':
      return CHARACTER_ANALYSIS_GUIDANCE;
    case 'chapter':
      return CHAPTER_ANALYSIS_GUIDANCE;
    case 'location':
      return LOCATION_ANALYSIS_GUIDANCE;
  }
}

// ============ Tool Schemas ============

export const getContentForImageryAnalysisSchema = z.object({
  entityType: z.enum(['chapter', 'character', 'location']).describe('Type of entity to analyze'),
  slug: z.string().describe('Entity slug (e.g., "ch07-the-westwall-welcome" or "veyra")'),
  includeExistingImagery: z.boolean().optional().default(true).describe('Include existing imagery.yaml for context'),
});

export const saveImageryPromptsSchema = z.object({
  entityType: z.enum(['chapter', 'character', 'location']),
  slug: z.string(),
  prompts: z.array(z.object({
    title: z.string().describe('Scene or image title'),
    visualDescription: z.string().describe('What the image should show'),
    compositionNotes: z.string().optional().describe('Framing, lighting, focus'),
    characterFocus: z.string().optional().describe('Character emotions/actions'),
    narrativeSignificance: z.string().optional().describe('Why this moment matters'),
    symbolicElements: z.string().optional().describe('Symbolic meanings'),
    basePrompt: z.string().describe('The actual image generation prompt'),
    characterSlugs: z.array(z.string()).optional().describe('Characters to auto-enrich'),
  })),
  freshStart: z.boolean().optional().default(false).describe('Archive existing and replace'),
});

export const generateNewImagesSchema = z.object({
  entityType: z.enum(['chapter', 'character', 'location']),
  slug: z.string(),
  provider: z.enum(['openai', 'google']).describe('Image generation provider'),
  model: z.string().optional().describe('Specific model to use (e.g., "imagen-4.0-generate-001", "gemini-3-pro-image-preview", "gpt-image-2"). If not specified, uses config default.'),
  prompts: z.array(z.object({
    title: z.string(),
    prompt: z.string(),
    characterSlugs: z.array(z.string()).optional().describe('Characters to auto-enrich'),
  })),
  archiveExisting: z.boolean().optional().default(false).describe('Archive existing images first'),
});

// ============ Helper Functions ============

/**
 * Build a visual summary for a character (for prompt enrichment)
 */
function buildCharacterVisualSummary(character: any): string {
  if (!character) return '';

  const parts: string[] = [];
  parts.push(`${character.name}:`);

  if (character.appearance) {
    const app = character.appearance;
    if (app.age) parts.push(`${app.age} years old`);
    if (app.height) parts.push(app.height);
    if (app.build) parts.push(`${app.build} build`);
    if (app.hair) parts.push(`${app.hair} hair`);
    if (app.eyes) parts.push(`${app.eyes} eyes`);
    if (app.distinguishingFeatures?.length) {
      parts.push(`Notable features: ${app.distinguishingFeatures.join(', ')}`);
    }
    if (app.clothing) parts.push(`Wearing: ${app.clothing}`);
  }

  return parts.join('. ');
}

/**
 * Enrich a prompt with character visual details
 */
async function enrichPromptWithCharacters(prompt: string, characterSlugs: string[]): Promise<string> {
  if (!characterSlugs?.length) return prompt;

  const config = getConfig();
  const storage = getStorage();
  const { resolveCharacter } = await import('../services/character-resolution.js');

  const characterDetails: string[] = [];
  for (const slug of characterSlugs) {
    // Try fuzzy resolution for each character slug
    const resolution = await resolveCharacter(slug, {
      allowElicitation: false, // Silent fallback for batch operations
      maxCandidates: 1
    });

    if (resolution.success && resolution.character) {
      // Get full character details from D1 or storage
      let char;

      if (d1.isD1Available()) {
        try {
          const charRow = await d1.getCharacter(resolution.character.slug);
          if (charRow) {
            char = parseCharacterFromD1(charRow);
          }
        } catch (error) {
          const logger = getLogger();
          logger.warn('D1 query failed for character enrichment, falling back to storage', { module: 'imagery-generation', slug: resolution.character.slug, error });
        }
      }

      // Fallback to storage
      if (!char) {
        char = storage.getCharacter(config.workspace.id, resolution.character.slug);
      }

      if (char) {
        characterDetails.push(buildCharacterVisualSummary(char));
      }
    }
    // Note: Silent failure - just skip characters that can't be resolved
  }

  if (characterDetails.length === 0) return prompt;

  return `${prompt}\n\nCharacter details:\n${characterDetails.join('\n')}`;
}

/**
 * Map entity type to image generation scenario
 */
function entityTypeToScenario(entityType: EntityType): ImageScenario {
  switch (entityType) {
    case 'character':
      return 'character';
    case 'location':
      return 'location';
    case 'chapter':
      return 'scene';
    default:
      return 'generic';
  }
}

/**
 * Generate unique ID for new image entry
 */
function generateCustomId(slug: string, index: number): string {
  const timestamp = Date.now().toString(36);
  return `${slug}-${index.toString().padStart(2, '0')}-${timestamp}`;
}

/**
 * Generate filename for new image
 */
function generateFilename(slug: string, title: string): string {
  const timestamp = new Date().toISOString().split('T')[0];
  const sanitizedTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
  return `${slug}-${sanitizedTitle}-${timestamp}.png`;
}

// ============ D1 Transformation Helpers ============

/**
 * Parse chapter from D1 ContentItemRow
 */
function parseChapterFromD1(row: d1.ContentItemRow): any {
  let metadata: Record<string, unknown> = {};

  try {
    metadata = row.metadata_json ? JSON.parse(row.metadata_json) : {};
  } catch (error) {
    const logger = getLogger();
    logger.debug('Failed to parse metadata_json for chapter', { module: 'imagery-generation', slug: row.slug, error });
  }

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    number: metadata.number,
    summary: row.summary,
    status: row.status,
    arc: metadata.arc,
    povCharacter: metadata.povCharacter,
    povType: metadata.povType,
    featuredCharacters: metadata.featuredCharacters || [],
    featuredLocations: metadata.featuredLocations || [],
    content: metadata.content,
    scenes: metadata.scenes || [],
    wordCount: row.word_count,
  };
}

/**
 * Parse character from D1 CharacterRow
 */
function parseCharacterFromD1(row: d1.CharacterRow): any {
  const logger = getLogger();

  // Helper to safely parse JSON arrays
  const parseJsonArray = (field: string | null): string[] | undefined => {
    if (!field) return undefined;
    try {
      return JSON.parse(field);
    } catch (error) {
      logger.debug('Failed to parse JSON array', { module: 'imagery-generation', field, error });
      return undefined;
    }
  };

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    role: row.role,
    faction: row.faction,
    occupation: row.occupation,
    appearance: {
      age: row.appearance_age,
      height: row.appearance_height,
      build: row.appearance_build,
      hair: row.appearance_hair,
      eyes: row.appearance_eyes,
      distinguishingFeatures: parseJsonArray(row.appearance_distinguishing_features),
      clothing: row.appearance_clothing,
    },
    personality: row.personality_archetype,
    background: row.background,
    visualSummary: row.visual_summary,
  };
}

/**
 * Parse location from D1 ContentItemRow
 */
function parseLocationFromD1(row: d1.ContentItemRow): any {
  let metadata: Record<string, unknown> = {};

  try {
    metadata = row.metadata_json ? JSON.parse(row.metadata_json) : {};
  } catch (error) {
    const logger = getLogger();
    logger.debug('Failed to parse metadata_json for location', { module: 'imagery-generation', slug: row.slug, error });
  }

  return {
    id: row.id,
    slug: row.slug,
    name: row.title,
    type: metadata.type,
    region: metadata.region,
    description: metadata.description,
    atmosphere: metadata.atmosphere,
    history: metadata.history,
    features: metadata.features,
    inhabitants: metadata.inhabitants,
  };
}

// ============ Tool Implementations ============

export async function getContentForImageryAnalysis(
  input: z.infer<typeof getContentForImageryAnalysisSchema>
): Promise<{
  entityType: string;
  slug: string;
  content: string;
  characters: Array<{ slug: string; name: string; visualSummary: string }>;
  existingImagery: string | null;
  artStyle: string;
  analysisGuidance: string;
}> {
  const config = getConfig();
  const storage = getStorage();
  const remote = getRemote();

  let contentText = '';
  const characters: Array<{ slug: string; name: string; visualSummary: string }> = [];

  if (input.entityType === 'chapter') {
    // Get chapter with full content - try D1 first
    let chapter;

    if (d1.isD1Available()) {
      try {
        const item = await d1.getChapter(input.slug);
        if (item) {
          chapter = parseChapterFromD1(item);
        }
      } catch (error) {
        const logger = getLogger();
        logger.warn('D1 query failed for chapter imagery, falling back to remote', { module: 'imagery-generation', slug: input.slug, error });
      }
    }

    // Fallback to remote API
    if (!chapter) {
      chapter = await remote.getChapter(input.slug);
    }

    if (!chapter) {
      throw new Error(`Chapter not found: ${input.slug}`);
    }

    // Build chapter content summary
    const lines: string[] = [];
    lines.push(`# Chapter ${chapter.number}: ${chapter.title}`);
    if (chapter.summary) lines.push(`\n## Summary\n${chapter.summary}`);
    if (chapter.povCharacter) lines.push(`\n**POV:** ${chapter.povCharacter}`);

    // Scenes
    if (chapter.scenes?.length) {
      lines.push('\n## Scenes');
      for (const scene of chapter.scenes) {
        lines.push(`\n### Scene ${scene.sequence}: ${scene.title || '(untitled)'}`);
        if (scene.location) lines.push(`**Location:** ${scene.location}`);
        if (scene.charactersPresent?.length) lines.push(`**Characters:** ${scene.charactersPresent.join(', ')}`);
        if (scene.mood) lines.push(`**Mood:** ${scene.mood}`);
        if (scene.tension) lines.push(`**Tension:** ${scene.tension}`);
        if (scene.summary) lines.push(scene.summary);
      }
    }

    // Full chapter content
    if (chapter.content) {
      lines.push('\n## Full Text');
      lines.push(chapter.content);
    }

    contentText = lines.join('\n');

    // Get featured characters with visuals - try D1 first
    const featuredNames = [
      ...(chapter.featuredCharacters || []),
      chapter.povCharacter,
    ].filter(Boolean) as string[];

    for (const name of [...new Set(featuredNames)]) {
      let char;

      // Try D1 first
      if (d1.isD1Available()) {
        try {
          const charRow = await d1.getCharacter(name);
          if (charRow) {
            char = parseCharacterFromD1(charRow);
          }
        } catch (error) {
          const logger = getLogger();
          logger.warn('D1 query failed for featured character, falling back to storage', { module: 'imagery-generation', character: name, error });
        }
      }

      // Fallback to storage
      if (!char) {
        char = storage.getCharacter(config.workspace.id, name);
      }

      if (char) {
        characters.push({
          slug: char.slug,
          name: char.name,
          visualSummary: buildCharacterVisualSummary(char),
        });
      }
    }

  } else if (input.entityType === 'character') {
    // Resolve character with fuzzy matching
    const { resolveCharacter } = await import('../services/character-resolution.js');
    const resolution = await resolveCharacter(input.slug, {
      allowElicitation: true,
      maxCandidates: 5
    });

    if (!resolution.success) {
      throw new Error(
        `Character not found: ${input.slug}\n\n${resolution.guidanceMessage || 'No matching characters found.'}`
      );
    }

    // Use resolved character slug to get full details
    const resolvedSlug = resolution.character!.slug;
    let char;

    if (d1.isD1Available()) {
      try {
        const charRow = await d1.getCharacter(resolvedSlug);
        if (charRow) {
          char = parseCharacterFromD1(charRow);
        }
      } catch (error) {
        const logger = getLogger();
        logger.warn('D1 query failed for character imagery, falling back to storage', { module: 'imagery-generation', slug: resolvedSlug, error });
      }
    }

    // Fallback to storage
    if (!char) {
      char = storage.getCharacter(config.workspace.id, resolvedSlug);
    }

    if (!char) {
      throw new Error(`Character data not found for: ${resolvedSlug}`);
    }

    const lines: string[] = [];
    lines.push(`# Character: ${char.name}`);
    if (char.role) lines.push(`**Role:** ${char.role}`);
    if (char.faction) lines.push(`**Faction:** ${char.faction}`);
    if (char.occupation) lines.push(`**Occupation:** ${char.occupation}`);

    // Appearance
    if (char.appearance) {
      lines.push('\n## Appearance');
      const app = char.appearance;
      if (app.age) lines.push(`- Age: ${app.age}`);
      if (app.height) lines.push(`- Height: ${app.height}`);
      if (app.build) lines.push(`- Build: ${app.build}`);
      if (app.hair) lines.push(`- Hair: ${app.hair}`);
      if (app.eyes) lines.push(`- Eyes: ${app.eyes}`);
      if (app.distinguishingFeatures?.length) {
        lines.push(`- Distinguishing features: ${app.distinguishingFeatures.join(', ')}`);
      }
      if (app.clothing) lines.push(`- Typical clothing: ${app.clothing}`);
    }

    if (char.personality) lines.push(`\n## Personality\n${char.personality}`);
    if (char.background) lines.push(`\n## Background\n${char.background}`);

    contentText = lines.join('\n');

    // The character itself
    characters.push({
      slug: char.slug,
      name: char.name,
      visualSummary: buildCharacterVisualSummary(char),
    });

  } else if (input.entityType === 'location') {
    // Get location details - try D1 first
    let loc;

    if (d1.isD1Available()) {
      try {
        const locRow = await d1.getLocation(input.slug);
        if (locRow) {
          loc = parseLocationFromD1(locRow);
        }
      } catch (error) {
        const logger = getLogger();
        logger.warn('D1 query failed for location imagery, falling back to storage', { module: 'imagery-generation', slug: input.slug, error });
      }
    }

    // Fallback to storage
    if (!loc) {
      loc = storage.getLocation(config.workspace.id, input.slug);
    }

    if (!loc) {
      throw new Error(`Location not found: ${input.slug}`);
    }

    const lines: string[] = [];
    lines.push(`# Location: ${loc.name}`);
    if (loc.type) lines.push(`**Type:** ${loc.type}`);
    if (loc.region) lines.push(`**Region:** ${loc.region}`);

    if (loc.description) lines.push(`\n## Description\n${loc.description}`);
    if (loc.atmosphere) lines.push(`\n## Atmosphere\n${loc.atmosphere}`);
    if (loc.history) lines.push(`\n## History\n${loc.history}`);

    if (loc.features?.length) {
      lines.push('\n## Notable Features');
      loc.features.forEach((f: string) => lines.push(`- ${f}`));
    }

    if (loc.inhabitants?.length) {
      lines.push('\n## Inhabitants');
      loc.inhabitants.forEach((i: string) => lines.push(`- ${i}`));

      // Get visuals for inhabitants - try D1 first
      for (const name of loc.inhabitants) {
        let char;

        // Try D1 first
        if (d1.isD1Available()) {
          try {
            const charRow = await d1.getCharacter(name);
            if (charRow) {
              char = parseCharacterFromD1(charRow);
            }
          } catch (error) {
            const logger = getLogger();
            logger.warn('D1 query failed for inhabitant character, falling back to storage', { module: 'imagery-generation', character: name, error });
          }
        }

        // Fallback to storage
        if (!char) {
          char = storage.getCharacter(config.workspace.id, name);
        }

        if (char) {
          characters.push({
            slug: char.slug,
            name: char.name,
            visualSummary: buildCharacterVisualSummary(char),
          });
        }
      }
    }

    contentText = lines.join('\n');
  }

  // Get existing imagery
  let existingImagery: string | null = null;
  if (input.includeExistingImagery) {
    const imagery = await readImageryYaml(input.entityType as EntityType, input.slug);
    if (imagery) {
      existingImagery = JSON.stringify(imagery, null, 2);
    }
  }

  // Get art style
  const artStyle = config.artStyle?.description || 'Digital illustration, detailed, high quality';

  return {
    entityType: input.entityType,
    slug: input.slug,
    content: contentText,
    characters,
    existingImagery,
    artStyle,
    analysisGuidance: getAnalysisGuidance(input.entityType as EntityType),
  };
}

export async function saveImageryPrompts(
  input: z.infer<typeof saveImageryPromptsSchema>
): Promise<{
  success: boolean;
  savedCount: number;
  archivedCount: number;
  message: string;
}> {
  const entityType = input.entityType as EntityType;

  // Handle fresh start (archive existing)
  let archivedCount = 0;
  if (input.freshStart) {
    const archiveResult = await archiveExistingImages(entityType, input.slug);
    archivedCount = archiveResult.archivedCount;
  }

  // Read existing or create new imagery data
  let imageryData = await readImageryYaml(entityType, input.slug);

  if (entityType === 'chapter') {
    const scenes: ChapterScene[] = input.prompts.map((p, idx) => ({
      title: p.title,
      visual_description: p.visualDescription,
      composition_notes: p.compositionNotes,
      character_focus: p.characterFocus,
      narrative_significance: p.narrativeSignificance,
      symbolic_elements: p.symbolicElements,
      base_prompt: p.basePrompt,
      generated_images: [],
    }));

    if (input.freshStart || !imageryData) {
      // Create new
      imageryData = {
        entity_type: 'chapter',
        slug: input.slug,
        scenes,
      } as ChapterImagery;
    } else {
      // Append to existing scenes
      const existing = imageryData as ChapterImagery;
      existing.scenes = [...(existing.scenes || []), ...scenes];
      imageryData = existing;
    }

  } else if (entityType === 'character') {
    const newPrompts = input.prompts.map(p => p.basePrompt);

    if (input.freshStart || !imageryData) {
      imageryData = {
        entity_type: 'character',
        slug: input.slug,
        prompts: newPrompts,
        generated_images: [],
      } as CharacterImagery;
    } else {
      const existing = imageryData as CharacterImagery;
      existing.prompts = [...(existing.prompts || []), ...newPrompts];
      imageryData = existing;
    }

  } else if (entityType === 'location') {
    // For locations, add to zones
    const newZones = input.prompts.map(p => ({
      name: p.title,
      slug: `${input.slug}-${p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      title: p.title,
      visual_description: p.visualDescription,
      composition_notes: p.compositionNotes,
      base_prompt: p.basePrompt,
      generated_images: [],
      image_inventory: [],
    }));

    if (input.freshStart || !imageryData) {
      imageryData = {
        overview: undefined,
        zones: newZones,
      } as LocationImagery;
    } else {
      const existing = imageryData as LocationImagery;
      existing.zones = [...(existing.zones || []), ...newZones];
      imageryData = existing;
    }
  }

  // Save
  await writeImageryYaml(entityType, input.slug, imageryData!);

  return {
    success: true,
    savedCount: input.prompts.length,
    archivedCount,
    message: input.freshStart
      ? `Archived ${archivedCount} images and saved ${input.prompts.length} new prompts`
      : `Added ${input.prompts.length} new prompts to existing imagery`,
  };
}

export async function generateNewImages(
  input: z.infer<typeof generateNewImagesSchema>
): Promise<{
  success: boolean;
  generatedCount: number;
  archivedCount: number;
  images: Array<{ title: string; path: string }>;
  errors: string[];
}> {
  const entityType = input.entityType as EntityType;
  const imageService = getImageService();

  // Check provider availability
  if (!imageService.isProviderAvailable(input.provider as ImageProvider)) {
    throw new Error(`Provider '${input.provider}' is not available. Configure API key in config.`);
  }

  // Handle archiving if requested
  let archivedCount = 0;
  if (input.archiveExisting) {
    const archiveResult = await archiveExistingImages(entityType, input.slug);
    archivedCount = archiveResult.archivedCount;
  }

  // Ensure images directory exists
  const imagesDir = getImagesDir(entityType, input.slug);
  await mkdir(imagesDir, { recursive: true });

  // Determine the appropriate scenario for master style application
  const scenario = entityTypeToScenario(entityType);

  // Read or create imagery data
  let imageryData = await readImageryYaml(entityType, input.slug);

  const generatedImages: Array<{ title: string; path: string }> = [];
  const errors: string[] = [];

  for (let i = 0; i < input.prompts.length; i++) {
    const promptData = input.prompts[i];

    try {
      // Enrich prompt with character visuals
      let enrichedPrompt = promptData.prompt;
      if (promptData.characterSlugs?.length) {
        enrichedPrompt = await enrichPromptWithCharacters(enrichedPrompt, promptData.characterSlugs);
      }

      // Note: Master style is now applied automatically by the image service

      // Generate filename
      const filename = generateFilename(input.slug, promptData.title);

      // Build options object with model if specified, and check for custom style override
      const options: ImageGenerationOptions = input.model ? { model: input.model } : {};

      // Check for character-specific style override
      if (entityType === 'character' && imageryData) {
        const charData = imageryData as CharacterImagery;
        if (charData.custom_style_override) {
          options.style = charData.custom_style_override;
        }
      }

      // Generate image with scenario for proper master style application
      const result = await imageService.generateFromPromptWithProvider(
        enrichedPrompt,
        filename.replace('.png', ''),
        input.provider as ImageProvider,
        options,
        scenario
      );

      // Copy to entity's images directory
      const { readFile: readFileFs } = await import('fs/promises');
      const imageBuffer = await readFileFs(result.path);
      const destPath = join(imagesDir, filename);
      await writeFile(destPath, imageBuffer);

      // Create image entry
      // result.prompt contains the full styled prompt from the image service
      const imageEntry: GeneratedImageEntry = {
        custom_id: generateCustomId(input.slug, i),
        file_name: filename,
        file_path: `images/${filename}`,
        prompt_used: result.prompt,
        provider: result.provider,
        model: result.model,
        generated_at: result.createdAt,
      };

      // Add to imagery data
      if (entityType === 'chapter') {
        if (!imageryData) {
          imageryData = { entity_type: 'chapter', slug: input.slug, scenes: [] } as ChapterImagery;
        }
        const chapterData = imageryData as ChapterImagery;

        // Find or create scene
        let scene = chapterData.scenes?.find(s => s.title === promptData.title);
        if (!scene) {
          scene = {
            title: promptData.title,
            base_prompt: promptData.prompt,
            generated_images: [],
          };
          chapterData.scenes = [...(chapterData.scenes || []), scene];
        }
        scene.generated_images = [...(scene.generated_images || []), imageEntry];

      } else if (entityType === 'character') {
        if (!imageryData) {
          imageryData = { entity_type: 'character', slug: input.slug, prompts: [], generated_images: [] } as CharacterImagery;
        }
        const charData = imageryData as CharacterImagery;
        charData.generated_images = [...(charData.generated_images || []), imageEntry];

      } else if (entityType === 'location') {
        if (!imageryData) {
          imageryData = { zones: [] } as LocationImagery;
        }
        const locData = imageryData as LocationImagery;

        // Find or create zone
        let zone = locData.zones?.find(z => z.name === promptData.title || z.title === promptData.title);
        if (!zone) {
          zone = {
            name: promptData.title,
            slug: `${input.slug}-${promptData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
            title: promptData.title,
            base_prompt: promptData.prompt,
            generated_images: [],
            image_inventory: [],
          };
          locData.zones = [...(locData.zones || []), zone];
        }
        zone.generated_images = [...(zone.generated_images || []), imageEntry];
      }

      generatedImages.push({ title: promptData.title, path: destPath });

    } catch (error) {
      errors.push(`${promptData.title}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Save updated imagery data
  if (imageryData) {
    await writeImageryYaml(entityType, input.slug, imageryData);
  }

  return {
    success: errors.length === 0,
    generatedCount: generatedImages.length,
    archivedCount,
    images: generatedImages,
    errors,
  };
}
