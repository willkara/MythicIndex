/**
 * Image generation and management tools
 */

import { z } from 'zod';
import { getImageService, type ImageProvider } from '../services/images.js';
import { getRemote } from '../services/remote.js';
import * as d1 from '../services/d1.js';
import { getConfig } from '../services/config.js';
import { getStorage } from '../services/storage.js';
import { parse as parseYaml } from 'yaml';
import { readdir } from 'fs/promises';
import { join, dirname } from 'path';
import {
  regenerateEntityImages,
  listRegenerationCandidates,
  previewRegeneration,
  type RegenerationOptions,
} from '../services/bulk-images.js';
import {
  constructCharacterPrompts,
  constructLocationPrompts,
  constructChapterPrompts,
  scoreAndRankPrompts,
  getRecommendedIndices,
  type PromptCandidate,
} from '../services/prompt-construction.js';
import {
  readImageryYaml,
  writeImageryYaml,
  getPromptsForEntity,
  getChapterStyleInfo,
  archiveExistingImages,
  getImagesDir,
  type EntityType,
  type ChapterImagery,
  type CharacterImagery,
  type LocationImagery,
  type GeneratedImageEntry,
  type ExtendedNormalizedPrompt,
  type ChapterStyleTokens,
  type ChapterCharacterPresent,
} from '../services/imagery-yaml.js';
import {
  createReferenceResolverCache,
  resolveChapterPromptReferences,
  resolveLocationReferencePaths,
  resolveCharacterReferencePaths,
} from '../services/reference-images.js';
import type { ImageScenario } from '../services/images.js';
import { mkdir, writeFile } from 'fs/promises';

// Tool schemas
export const generateCharacterPortraitSchema = z.object({
  character: z.string().describe('Character name or slug'),
  style: z.string().optional().describe('Art style override'),
  pose: z.string().optional().describe('Character pose description'),
});

export const generateLocationArtSchema = z.object({
  location: z.string().describe('Location name or slug'),
  timeOfDay: z.enum(['dawn', 'morning', 'noon', 'afternoon', 'dusk', 'night']).optional(),
  mood: z.string().optional().describe('Mood/atmosphere'),
  style: z.string().optional(),
});

export const generateSceneArtSchema = z.object({
  description: z.string().describe('Scene description to visualize'),
  characters: z.array(z.string()).optional().describe('Characters in the scene'),
  location: z.string().optional().describe('Location name'),
  style: z.string().optional(),
});

export const generateCoverSchema = z.object({
  title: z.string().describe('Book/chapter title'),
  subtitle: z.string().optional(),
  style: z.string().optional(),
  mood: z.string().optional(),
});

export const generateFromPromptSchema = z.object({
  prompt: z.string().describe('Full image generation prompt'),
  filename: z.string().optional().describe('Output filename (without extension)'),
});

export const uploadImageSchema = z.object({
  imagePath: z.string().describe('Local path to image file'),
  entityType: z.enum(['character', 'location', 'chapter']),
  entityId: z.string().describe('Entity slug or ID'),
  role: z.enum(['portrait', 'scene', 'header', 'gallery']),
});

export const listLocalImagesSchema = z.object({
  unuploadedOnly: z.boolean().optional().default(false),
});

export const setCharacterPortraitSchema = z.object({
  character: z.string().describe('Character name or slug'),
  imagePath: z.string().describe('Local path to portrait image'),
});

// Tool implementations
export async function generateCharacterPortrait(
  input: z.infer<typeof generateCharacterPortraitSchema>
): Promise<{ path: string; prompt: string; error?: string; guidance?: string }> {
  const imageService = getImageService();

  // Resolve character with fuzzy matching + elicitation
  const { resolveCharacter } = await import('../services/character-resolution.js');
  const resolution = await resolveCharacter(input.character, {
    allowElicitation: true,
    maxCandidates: 5
  });

  if (!resolution.success) {
    return {
      path: '',
      prompt: '',
      error: `Character not found: ${input.character}`,
      guidance: resolution.guidanceMessage || 'No matching characters found.'
    };
  }

  // Use resolved character slug for image generation
  const result = await imageService.generateCharacterPortrait(resolution.character!.slug, {
    style: input.style,
    pose: input.pose,
  });

  return {
    path: result.path,
    prompt: result.prompt,
  };
}

export async function generateLocationArt(
  input: z.infer<typeof generateLocationArtSchema>
): Promise<{ path: string; prompt: string }> {
  const imageService = getImageService();

  const result = await imageService.generateLocationArt(input.location, {
    timeOfDay: input.timeOfDay,
    mood: input.mood,
    style: input.style,
  });

  return {
    path: result.path,
    prompt: result.prompt,
  };
}

export async function generateSceneArt(
  input: z.infer<typeof generateSceneArtSchema>
): Promise<{ path: string; prompt: string }> {
  const imageService = getImageService();

  // Build scene description with character and location context
  let description = input.description;

  if (input.characters?.length) {
    description += `. Characters: ${input.characters.join(', ')}`;
  }

  if (input.location) {
    description += `. Setting: ${input.location}`;
  }

  const result = await imageService.generateSceneArt(description, {
    style: input.style,
  });

  return {
    path: result.path,
    prompt: result.prompt,
  };
}

export async function generateCover(
  input: z.infer<typeof generateCoverSchema>
): Promise<{ path: string; prompt: string }> {
  const imageService = getImageService();

  const prompt = [
    `Book cover for "${input.title}"`,
    input.subtitle ? `Subtitle: ${input.subtitle}` : '',
    input.mood ? `Mood: ${input.mood}` : '',
    'Professional book cover design',
    'Typography space for title',
    input.style || '',
  ].filter(Boolean).join('. ');

  const result = await imageService.generateFromPrompt(
    prompt,
    `cover-${input.title.toLowerCase().replace(/\s+/g, '-')}`,
    { style: input.style }
  );

  return {
    path: result.path,
    prompt: result.prompt,
  };
}

export async function generateFromPrompt(
  input: z.infer<typeof generateFromPromptSchema>
): Promise<{ path: string; prompt: string }> {
  const imageService = getImageService();

  const filename = input.filename || `custom-${Date.now()}`;

  const result = await imageService.generateFromPrompt(input.prompt, filename);

  return {
    path: result.path,
    prompt: result.prompt,
  };
}

export async function uploadImage(
  input: z.infer<typeof uploadImageSchema>
): Promise<{ url: string; id: string }> {
  const remote = getRemote();

  const result = await remote.uploadImage(input.imagePath, {
    entityType: input.entityType,
    entityId: input.entityId,
    role: input.role,
  });

  return result;
}

export async function listLocalImages(
  input: z.infer<typeof listLocalImagesSchema>
): Promise<Array<{ filename: string; path: string; createdAt: string }>> {
  const config = getConfig();
  const imagesDir = config.paths.imagesDir;

  const files = await readdir(imagesDir);
  const images: Array<{ filename: string; path: string; createdAt: string }> = [];

  for (const file of files) {
    if (/\.(png|jpg|jpeg|webp)$/i.test(file)) {
      const path = join(imagesDir, file);
      const { stat } = await import('fs/promises');
      const stats = await stat(path);

      images.push({
        filename: file,
        path,
        createdAt: stats.birthtime.toISOString(),
      });
    }
  }

  // Sort by creation date, newest first
  images.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return images;
}

export async function setCharacterPortrait(
  input: z.infer<typeof setCharacterPortraitSchema>
): Promise<{ character: string; portraitUrl: string }> {
  const remote = getRemote();

  // Resolve character with fuzzy matching
  const { resolveCharacter } = await import('../services/character-resolution.js');
  const resolution = await resolveCharacter(input.character, {
    allowElicitation: true,
    maxCandidates: 5
  });

  if (!resolution.success) {
    throw new Error(
      `Character not found: ${input.character}\n\n${resolution.guidanceMessage}`
    );
  }

  const resolvedSlug = resolution.character!.slug;

  // Get character to find their ID - try D1 first
  let characterId: string;
  let characterName: string;
  let characterSlug: string;

  if (d1.isD1Available()) {
    const row = await d1.getCharacter(resolvedSlug);
    if (!row) {
      throw new Error(`Character not found in database: ${resolvedSlug}`);
    }
    characterId = row.id;
    characterName = row.name;
    characterSlug = row.slug;
  } else {
    const character = await remote.getCharacter(resolvedSlug);
    if (!character) {
      throw new Error(`Character not found in database: ${resolvedSlug}`);
    }
    characterId = character.id;
    characterName = character.name;
    characterSlug = character.slug;
  }

  // Upload the image (still requires remote API)
  const { url } = await remote.uploadImage(input.imagePath, {
    entityType: 'character',
    entityId: characterId,
    role: 'portrait',
  });

  // Update character with portrait URL (still requires remote API)
  await remote.updateCharacter(characterSlug, {
    portraitUrl: url,
  });

  return {
    character: characterName,
    portraitUrl: url,
  };
}

// ============ Bulk Regeneration Tool Schemas ============

export const regenerateCharacterImagesSchema = z.object({
  slug: z.string().describe('Character slug (e.g., "thorne-brightward")'),
  provider: z.enum(['openai', 'google']).describe('Image generation provider to use'),
  dryRun: z.boolean().optional().default(false).describe('Preview what would be generated without API calls'),
  promptIndices: z.array(z.number()).optional().describe('Only regenerate specific prompt indices (0-based)'),
});

export const regenerateLocationImagesSchema = z.object({
  slug: z.string().describe('Location slug (e.g., "brightstone-healers-hall")'),
  provider: z.enum(['openai', 'google']).describe('Image generation provider to use'),
  dryRun: z.boolean().optional().default(false).describe('Preview what would be generated without API calls'),
  zones: z.array(z.string()).optional().describe('Only regenerate specific zones by name'),
});

export const regenerateChapterImagesSchema = z.object({
  slug: z.string().describe('Chapter slug (e.g., "ch07-the-westwall-welcome")'),
  provider: z.enum(['openai', 'google']).describe('Image generation provider to use'),
  dryRun: z.boolean().optional().default(false).describe('Preview what would be generated without API calls'),
  sceneIndices: z.array(z.number()).optional().describe('Only regenerate specific scene indices (0-based)'),
});

export const listRegenerationCandidatesSchema = z.object({
  entityType: z.enum(['character', 'location', 'chapter']).optional().describe('Filter by entity type'),
  filterProvider: z.string().optional().describe('Show only entities with images from this provider (e.g., "imagen")'),
});

// ============ Bulk Regeneration Tool Implementations ============

export async function regenerateCharacterImages(
  input: z.infer<typeof regenerateCharacterImagesSchema>
): Promise<{
  success: boolean;
  dryRun: boolean;
  archivedCount: number;
  generatedCount: number;
  errors: string[];
  details: string;
}> {
  const result = await regenerateEntityImages('character', input.slug, {
    provider: input.provider as ImageProvider,
    dryRun: input.dryRun,
    promptIndices: input.promptIndices,
  });

  const details = result.generatedImages.map(img =>
    `- Prompt ${img.promptIndex}: ${img.imagePath}`
  ).join('\n');

  return {
    success: result.success,
    dryRun: result.dryRun,
    archivedCount: result.archivedCount,
    generatedCount: result.generatedImages.length,
    errors: result.errors.map(e => `Prompt ${e.promptIndex}: ${e.error}`),
    details: details || 'No images generated',
  };
}

export async function regenerateLocationImages(
  input: z.infer<typeof regenerateLocationImagesSchema>
): Promise<{
  success: boolean;
  dryRun: boolean;
  archivedCount: number;
  generatedCount: number;
  errors: string[];
  details: string;
}> {
  // For locations, we may need to filter by zone names
  // For now, use promptIndices if zones are specified
  const options: RegenerationOptions = {
    provider: input.provider as ImageProvider,
    dryRun: input.dryRun,
  };

  // If specific zones requested, we'd need to map zone names to indices
  // For simplicity, regenerate all for now (zones filtering can be enhanced later)

  const result = await regenerateEntityImages('location', input.slug, options);

  const details = result.generatedImages.map(img =>
    `- ${img.sourceName || `Prompt ${img.promptIndex}`}: ${img.imagePath}`
  ).join('\n');

  return {
    success: result.success,
    dryRun: result.dryRun,
    archivedCount: result.archivedCount,
    generatedCount: result.generatedImages.length,
    errors: result.errors.map(e => `Prompt ${e.promptIndex}: ${e.error}`),
    details: details || 'No images generated',
  };
}

export async function regenerateChapterImages(
  input: z.infer<typeof regenerateChapterImagesSchema>
): Promise<{
  success: boolean;
  dryRun: boolean;
  archivedCount: number;
  generatedCount: number;
  errors: string[];
  details: string;
}> {
  const result = await regenerateEntityImages('chapter', input.slug, {
    provider: input.provider as ImageProvider,
    dryRun: input.dryRun,
    promptIndices: input.sceneIndices,
  });

  const details = result.generatedImages.map(img =>
    `- ${img.sourceName || `Scene ${img.promptIndex}`}: ${img.imagePath}`
  ).join('\n');

  return {
    success: result.success,
    dryRun: result.dryRun,
    archivedCount: result.archivedCount,
    generatedCount: result.generatedImages.length,
    errors: result.errors.map(e => `Scene ${e.promptIndex}: ${e.error}`),
    details: details || 'No images generated',
  };
}

export async function listRegenerationCandidatesImpl(
  input: z.infer<typeof listRegenerationCandidatesSchema>
): Promise<{
  count: number;
  candidates: Array<{
    entityType: string;
    slug: string;
    promptCount: number;
    generatedCount: number;
    providers: Record<string, number>;
  }>;
}> {
  const candidates = await listRegenerationCandidates({
    entityType: input.entityType,
    filterProvider: input.filterProvider,
  });

  return {
    count: candidates.length,
    candidates: candidates.map(c => ({
      entityType: c.entityType,
      slug: c.slug,
      promptCount: c.stats.promptCount,
      generatedCount: c.stats.generatedCount,
      providers: c.stats.providers,
    })),
  };
}

// ============ Unified Image Generation Tool ============

export const generateImagesForEntitySchema = z.object({
  entityType: z.enum(['chapter', 'character', 'location']).describe('Type of entity to generate images for'),
  slug: z.string().describe('Entity slug (e.g., "ch05-the-weight-of-the-world" or "veyra-thornwake")'),
  provider: z.enum(['openai', 'google']).describe('Image generation provider to use'),
  model: z.string().optional().describe('Specific model to use (e.g., "imagen-4.0-generate-001", "gemini-3-pro-image-preview", "gpt-image-2"). If not specified, uses config default.'),
  aspect_ratio: z.string().optional().describe('Aspect ratio for the generated image (e.g., "4:5", "16:9").'),
  image_size: z.string().optional().describe('Gemini image size (1K, 2K, 4K).'),
  response_mime_type: z.string().optional().describe('Override response MIME type (default: image/png).'),
  temperature: z.number().optional().describe('Temperature for Gemini image generation.'),
  top_p: z.number().optional().describe('Top-p nucleus sampling for Gemini image generation.'),
  top_k: z.number().optional().describe('Top-k sampling for Gemini image generation.'),
  seed: z.number().optional().describe('Seed for deterministic outputs when supported.'),
  candidate_count: z.number().optional().describe('Number of candidates (Gemini images support 1).'),
  size: z.string().optional().describe('OpenAI image size (e.g., 1024x1024, 1800x2400 for gpt-image-1.5).'),
  use_portrait_references: z
    .boolean()
    .optional()
    .describe('For character+google: use images/portrait.png as reference to lock character identity')
    .default(true),
  preview: z.boolean().optional().default(true).describe('Return prompt candidates for selection instead of generating immediately'),
  promptIndices: z.array(z.number()).optional().describe('Specific prompt indices to generate (required when preview=false after initial call)'),
  count: z.number().optional().describe('Limit number of prompts to consider (default: all)'),
  dryRun: z.boolean().optional().default(false).describe('Show what would be generated without making API calls'),
  archiveExisting: z.boolean().optional().default(true).describe('Archive existing images before generating new ones'),
});

export type GenerateImagesForEntityInput = z.infer<typeof generateImagesForEntitySchema>;

interface PreviewResult {
  mode: 'preview';
  entityType: string;
  slug: string;
  source: 'imagery-yaml' | 'auto-constructed';
  // Style info from Chapter 1 format imagery.yaml
  styleInfo?: {
    style_tokens?: ChapterStyleTokens;
    negative_prompt?: string;
    visual_thesis?: string;
  };
  candidates: Array<{
    index: number;
    title: string;
    prompt: string;
    score: number;
    // Rich metadata from Chapter 1 format
    custom_id?: string;
    image_type?: string;
    aspect_ratio?: string;
    visual_description?: string;
    composition_notes?: string;
    lighting?: string;
    characters_present?: ChapterCharacterPresent[];
    // Legacy metadata for auto-constructed prompts
    metadata?: {
      tension?: string;
      mood?: string;
      characters?: string[];
      location?: string;
    };
  }>;
  recommendedIndices: number[];
  message: string;
}

interface GenerateResult {
  mode: 'generate';
  success: boolean;
  dryRun: boolean;
  entityType: string;
  slug: string;
  archivedCount: number;
  generatedImages: Array<{
    index: number;
    title: string;
    path: string;
    prompt: string;
  }>;
  errors: string[];
}

/**
 * Map entity type to image generation scenario for master style application
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
function generateFilename(slug: string, title: string, index: number): string {
  const dateStamp = new Date().toISOString().split('T')[0];
  const nonce = Date.now().toString(36);
  const sanitizedTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
  return `${slug}-${sanitizedTitle}-${index.toString().padStart(2, '0')}-${dateStamp}-${nonce}.png`;
}

/**
 * Unified image generation tool for any entity type
 * Supports:
 * - Preview mode: returns prompt candidates for user selection
 * - Generate mode: generates images for selected prompts
 * - Auto-constructs prompts from content if no imagery.yaml exists
 */
// Extended candidate type that includes rich metadata from imagery.yaml
interface ExtendedCandidate extends PromptCandidate {
  custom_id?: string;
  image_type?: string;
  aspect_ratio?: string;
  visual_description?: string;
  composition_notes?: string;
  lighting?: string;
  characters_present?: ChapterCharacterPresent[];
  location?: string;
  reference_images?: string[];
  promptSource?: ExtendedNormalizedPrompt['source'];
  sourceIndex?: number;
}

export async function generateImagesForEntity(
  input: GenerateImagesForEntityInput
): Promise<PreviewResult | GenerateResult> {
  const config = getConfig();
  const storage = getStorage();
  const entityType = input.entityType as EntityType;

  // Step 1: Get or construct prompts
  let candidates: ExtendedCandidate[] = [];
  let source: 'imagery-yaml' | 'auto-constructed' = 'auto-constructed';
  let styleInfo: PreviewResult['styleInfo'] = undefined;

  // Check if imagery.yaml exists
  const imageryData = await readImageryYaml(entityType, input.slug);
  const referenceCache = createReferenceResolverCache();

  if (imageryData) {
    // Extract prompts from imagery.yaml (now returns ExtendedNormalizedPrompt[])
    const existingPrompts = getPromptsForEntity(imageryData);
    if (existingPrompts.length > 0) {
      source = 'imagery-yaml';
      candidates = existingPrompts.map((p, idx) => ({
        index: idx,
        title: p.sourceName || `Prompt ${idx + 1}`,
        prompt: p.prompt,
        score: 10 - idx, // Simple scoring based on order
        source: 'imagery-yaml' as const,
        // Rich metadata from Chapter 1 format
        custom_id: p.custom_id,
        image_type: p.image_type,
        aspect_ratio: p.aspect_ratio,
        visual_description: p.visual_description,
        composition_notes: p.composition_notes,
        lighting: p.lighting,
        characters_present: p.characters_present,
        location: p.location,
        reference_images: p.reference_images,
        promptSource: p.source,
        sourceIndex: p.sourceIndex,
      }));

      // Get style info for Chapter 1 format
      styleInfo = getChapterStyleInfo(imageryData) || undefined;
    }
  }

  // If no prompts from imagery.yaml, auto-construct from content
  if (candidates.length === 0) {
    source = 'auto-constructed';

    if (entityType === 'character') {
      // Resolve character with fuzzy matching
      const { resolveCharacter } = await import('../services/character-resolution.js');
      const resolution = await resolveCharacter(input.slug, {
        allowElicitation: !input.dryRun, // Disable elicitation in dry-run mode
        maxCandidates: 5
      });

      if (!resolution.success) {
        if (input.preview) {
          // Preview mode: return error with guidance
          return {
            mode: 'preview',
            entityType: 'character',
            slug: input.slug,
            source: 'auto-constructed',
            candidates: [],
            recommendedIndices: [],
            message: `Character not found: ${input.slug}\n\n${resolution.guidanceMessage}`
          } as PreviewResult;
        } else {
          // Generate mode: throw error with guidance
          throw new Error(
            `Character not found: ${input.slug}\n\n${resolution.guidanceMessage}`
          );
        }
      }

      // Use resolved character for prompt construction
      const character = resolution.character!;
      candidates = constructCharacterPrompts(character);
    } else if (entityType === 'location') {
      const location = storage.getLocation(config.workspace.id, input.slug);
      if (!location) {
        throw new Error(`Location not found: ${input.slug}`);
      }
      candidates = constructLocationPrompts(location);
    } else if (entityType === 'chapter') {
      const chapter = storage.getChapter(config.workspace.id, input.slug);
      if (!chapter) {
        throw new Error(`Chapter not found: ${input.slug}`);
      }
      candidates = constructChapterPrompts(chapter);
    }
  }

  // Apply count limit if specified
  if (input.count && input.count > 0) {
    candidates = scoreAndRankPrompts(candidates, input.count) as ExtendedCandidate[];
  }

  // Step 2: Preview mode - return candidates for selection
  if (input.preview && !input.promptIndices?.length) {
    const recommendedIndices = getRecommendedIndices(candidates, Math.min(5, candidates.length));

    return {
      mode: 'preview',
      entityType: input.entityType,
      slug: input.slug,
      source,
      styleInfo,
      candidates: candidates.map(c => ({
        index: c.index,
        title: c.title,
        prompt: c.prompt,
        score: c.score,
        // Rich metadata from Chapter 1 format
        custom_id: c.custom_id,
        image_type: c.image_type,
        aspect_ratio: c.aspect_ratio,
        visual_description: c.visual_description,
        composition_notes: c.composition_notes,
        lighting: c.lighting,
        characters_present: c.characters_present,
        // Legacy metadata for auto-constructed prompts
        metadata: c.metadata,
      })),
      recommendedIndices,
      message: `Found ${candidates.length} prompt(s) from ${source}. Use promptIndices to select which ones to generate.`,
    };
  }

  // Step 3: Generate mode - generate selected prompts
  const imageService = getImageService();

  // Check provider availability
  if (!imageService.isProviderAvailable(input.provider)) {
    throw new Error(`Provider '${input.provider}' is not available. Configure API key in config.`);
  }

  // Determine which prompts to generate
  const promptsToGenerate = input.promptIndices?.length
    ? candidates.filter(c => input.promptIndices!.includes(c.index))
    : candidates;

  if (promptsToGenerate.length === 0) {
    throw new Error('No prompts to generate. Provide valid promptIndices or set preview=true to see available prompts.');
  }

  // Handle dry run
  if (input.dryRun) {
    return {
      mode: 'generate',
      success: true,
      dryRun: true,
      entityType: input.entityType,
      slug: input.slug,
      archivedCount: 0,
      generatedImages: promptsToGenerate.map(p => ({
        index: p.index,
        title: p.title,
        path: `[DRY RUN] ${generateFilename(input.slug, p.title, p.index)}`,
        prompt: p.prompt,
      })),
      errors: [],
    };
  }

  // Archive existing images if requested
  let archivedCount = 0;
  if (input.archiveExisting) {
    const archiveResult = await archiveExistingImages(entityType, input.slug);
    archivedCount = archiveResult.archivedCount;
  }

  // Ensure images directory exists
  const imagesDir = getImagesDir(entityType, input.slug);
  await mkdir(imagesDir, { recursive: true });

  // Generate images
  const scenario = entityTypeToScenario(entityType);
  const generatedImages: Array<{ index: number; title: string; path: string; prompt: string }> = [];
  const errors: string[] = [];

  // Prepare or update imagery data
  let updatedImageryData = imageryData;

  for (const promptData of promptsToGenerate) {
    try {
      const filename = generateFilename(input.slug, promptData.title, promptData.index);

      // Get aspect ratio from prompt metadata if available
      const aspectRatio = (promptData as ExtendedCandidate).aspect_ratio;

      // Build options object with aspect ratio and model if specified
      const options: any = {};
      if (aspectRatio) options.aspectRatio = aspectRatio;
      if (input.aspect_ratio) options.aspectRatio = input.aspect_ratio;
      if (input.image_size) options.imageSize = input.image_size;
      if (input.response_mime_type) options.responseMimeType = input.response_mime_type;
      if (input.temperature !== undefined) options.temperature = input.temperature;
      if (input.top_p !== undefined) options.topP = input.top_p;
      if (input.top_k !== undefined) options.topK = input.top_k;
      if (input.seed !== undefined) options.seed = input.seed;
      if (input.candidate_count !== undefined) options.candidateCount = input.candidate_count;
      if (input.model) options.model = input.model;
      if (input.size) options.size = input.size;

      // Enrich prompt with character appearance when available to avoid generic outputs
      let promptText = promptData.prompt;
      if (
        entityType === 'character' &&
        imageryData &&
        typeof (imageryData as any).appearance === 'string' &&
        (imageryData as any).appearance.trim().length > 0
      ) {
        promptText = `${promptText}\n\nAppearance details (canonical): ${(imageryData as any).appearance.trim()}`;
      }

      let referencePaths: string[] = [];
      if (input.use_portrait_references !== false) {
        if (entityType === 'character') {
          referencePaths = await resolveCharacterReferencePaths(
            input.slug,
            (promptData as ExtendedCandidate).reference_images,
            referenceCache
          );
        } else if (entityType === 'location') {
          referencePaths = await resolveLocationReferencePaths(
            input.slug,
            (promptData as ExtendedCandidate).reference_images,
            referenceCache
          );
        } else if (entityType === 'chapter' && imageryData) {
          referencePaths = await resolveChapterPromptReferences(
            imageryData as ChapterImagery,
            promptData as ExtendedCandidate,
            referenceCache
          );
        }
      }

      // Generate the image (reference-first when available)
      let result;
      if (referencePaths.length > 0) {
        if (input.provider === 'google') {
          result = await imageService.generateWithReferences(
            referencePaths,
            promptText,
            { ...(Object.keys(options).length > 0 ? options : {}), maxReferences: referencePaths.length },
            filename.replace('.png', ''),
            scenario
          );
        } else {
          const primaryReference = referencePaths[0];
          result = await imageService.editImage(primaryReference, promptText, {
            provider: 'openai',
            model: input.model,
            size: input.size,
            outputFilename: filename.replace('.png', ''),
            preserveComposition: false,
          });
        }
      } else {
        result = await imageService.generateFromPromptWithProvider(
          promptText,
          filename.replace('.png', ''),
          input.provider,
          Object.keys(options).length > 0 ? options : undefined,
          scenario
        );
      }

      // Copy to entity's images directory
      const { readFile: readFileFs } = await import('fs/promises');
      const imageBuffer = await readFileFs(result.path);
      const destPath = join(imagesDir, filename);
      await writeFile(destPath, imageBuffer);

      // Create image entry for imagery.yaml
      // Use existing custom_id from imagery.yaml if available, otherwise generate one
      const customId = (promptData as ExtendedCandidate).custom_id || generateCustomId(input.slug, promptData.index);

      const imageEntry: GeneratedImageEntry = {
        custom_id: customId,
        file_name: filename,
        file_path: `images/${filename}`,
        prompt_index: promptData.index,
        prompt_used: result.prompt,
        provider: result.provider,
        model: result.model,
        aspect_ratio: options.aspectRatio || aspectRatio,
        generated_at: result.createdAt,
      };

      const promptSource = (promptData as ExtendedCandidate).promptSource;
      const sourceIndex = (promptData as ExtendedCandidate).sourceIndex;

      // Update imagery data structure
      if (!updatedImageryData) {
        // Create new imagery data if none exists
        if (entityType === 'character') {
          updatedImageryData = {
            entity_type: 'character',
            slug: input.slug,
            prompts: promptsToGenerate.map(p => p.prompt),
            generated_images: [imageEntry],
          } as CharacterImagery;
        } else if (entityType === 'location') {
          const zoneSlug = `${input.slug}-${promptData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
          const locData: LocationImagery = { overview: undefined, zones: [] };

          if (promptSource === 'overview' || !promptSource) {
            locData.overview = {
              slug: input.slug,
              base_prompt: promptData.prompt,
              generated_images: [imageEntry],
            };
          } else if (promptSource === 'zone') {
            locData.zones = [
              {
                name: promptData.title,
                slug: zoneSlug,
                title: promptData.title,
                base_prompt: promptData.prompt,
                generated_images: [imageEntry],
                image_inventory: [],
              },
            ];
          }

          updatedImageryData = locData as LocationImagery;
        } else if (entityType === 'chapter') {
          updatedImageryData = {
            entity_type: 'chapter',
            slug: input.slug,
            scenes: promptsToGenerate.map(p => ({
              title: p.title,
              base_prompt: p.prompt,
              generated_images: [],
            })),
          } as ChapterImagery;
          // Add the image to the correct scene
          const scene = (updatedImageryData as ChapterImagery).scenes?.find(s => s.title === promptData.title);
          if (scene) {
            scene.generated_images = [imageEntry];
          }
        }
      } else {
        // Add to existing imagery data
        if (entityType === 'character') {
          const charData = updatedImageryData as CharacterImagery;
          charData.generated_images = [...(charData.generated_images || []), imageEntry];
        } else if (entityType === 'location') {
          const locData = updatedImageryData as LocationImagery;
          if (promptSource === 'overview' || !promptSource) {
            if (!locData.overview) {
              locData.overview = {
                slug: input.slug,
                base_prompt: promptData.prompt,
                generated_images: [],
              };
            }
            locData.overview.generated_images = [...(locData.overview.generated_images || []), imageEntry];
          } else if (promptSource === 'zone') {
            const zones = locData.zones || [];
            let zone = typeof sourceIndex === 'number' ? zones[sourceIndex] : undefined;
            if (!zone) {
              zone = zones.find(z => z.name === promptData.title || z.title === promptData.title);
            }
            if (!zone) {
              zone = {
                name: promptData.title,
                slug: `${input.slug}-${promptData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
                title: promptData.title,
                base_prompt: promptData.prompt,
                generated_images: [],
                image_inventory: [],
              };
              locData.zones = [...zones, zone];
            }
            zone.generated_images = [...(zone.generated_images || []), imageEntry];
          }
        } else if (entityType === 'chapter') {
          const chapData = updatedImageryData as ChapterImagery;
          // Try to find matching scene, or add to generated_images
          const scene = chapData.scenes?.find(s => s.title === promptData.title);
          if (scene) {
            scene.generated_images = [...(scene.generated_images || []), imageEntry];
          } else if (chapData.generated_images) {
            chapData.generated_images = [...chapData.generated_images, imageEntry];
          } else {
            chapData.generated_images = [imageEntry];
          }
        }
      }

      generatedImages.push({
        index: promptData.index,
        title: promptData.title,
        path: destPath,
        prompt: result.prompt,
      });
    } catch (error) {
      errors.push(`${promptData.title}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Save updated imagery data
  if (updatedImageryData) {
    await writeImageryYaml(entityType, input.slug, updatedImageryData);
  }

  return {
    mode: 'generate',
    success: errors.length === 0,
    dryRun: false,
    entityType: input.entityType,
    slug: input.slug,
    archivedCount,
    generatedImages,
    errors,
  };
}

// ============ Image Editing Tools ============

export const editImageSchema = z.object({
  sourceImage: z.string().describe('Path to the source image to edit'),
  instruction: z.string().describe('Natural language edit instruction (e.g., "remove the hat", "change background to sunset", "add a sword in hand")'),
  model: z.string().optional().describe('Model to use (default: gemini-3-pro-image-preview for complex edits)'),
  provider: z.enum(['google', 'openai']).optional().describe('Provider to use for edits (default: google)'),
  maskPath: z.string().optional().describe('Optional mask image path (OpenAI edits)'),
  size: z.string().optional().describe('Output size (e.g., 1024x1024, 1800x2400 for gpt-image-1.5)'),
  outputFilename: z.string().optional().describe('Output filename prefix (auto-generated if not specified)'),
  preserveComposition: z.boolean().optional().default(true).describe('Try to preserve the original image composition'),
});

export const generateCharacterVariationSchema = z.object({
  character: z.string().describe('Character name or slug'),
  scenario: z.string().describe('New scenario to place the character in (e.g., "walking into a dimly lit tavern", "riding a horse through a forest", "fighting a dragon")'),
  referenceImages: z.array(z.string()).optional().describe('Paths to reference images (auto-discovers portrait.png if not specified)'),
  model: z.string().optional().describe('Model to use (default: gemini-3-pro-image-preview for best character consistency)'),
  maxReferences: z.number().optional().describe('Maximum number of reference images to use (default: 14, max for Gemini 3 Pro)'),
});

/**
 * Edit an existing image using natural language instructions
 * Uses Gemini's multimodal capabilities to modify images without masks
 */
export async function editImage(
  input: z.infer<typeof editImageSchema>
): Promise<{
  path: string;
  sourceImage: string;
  instruction: string;
  model: string;
  error?: string;
}> {
  const imageService = getImageService();

  const provider = input.provider || 'google';

  // Check provider is available
  if (!imageService.isProviderAvailable(provider)) {
    return {
      path: '',
      sourceImage: input.sourceImage,
      instruction: input.instruction,
      model: '',
      error:
        provider === 'google'
          ? 'Image editing requires Google GenAI provider. Configure GOOGLE_API_KEY.'
          : 'Image editing requires OpenAI provider. Configure OPENAI_API_KEY.',
    };
  }

  // Verify source image exists
  const { access } = await import('fs/promises');
  try {
    await access(input.sourceImage);
  } catch {
    return {
      path: '',
      sourceImage: input.sourceImage,
      instruction: input.instruction,
      model: '',
      error: `Source image not found: ${input.sourceImage}`,
    };
  }

  const result = await imageService.editImage(input.sourceImage, input.instruction, {
    model: input.model,
    preserveComposition: input.preserveComposition,
    provider,
    maskPath: input.maskPath,
    size: input.size,
    outputFilename: input.outputFilename,
  });

  return {
    path: result.path,
    sourceImage: result.sourceImage,
    instruction: result.editInstruction,
    model: result.model,
  };
}

// ============ Character Idea Batch Generation ============

export const generateCharacterImagesFromIdeasSchema = z.object({
  character: z.string().describe('Character name or slug'),
  provider: z.enum(['google', 'openai']).optional().default('google').describe('Provider to use (google uses multi-reference, openai uses image edit)'),
  model: z.string().optional().describe('Model override (e.g., gemini-3-pro-image-preview, gpt-image-1.5)'),
  preview: z.boolean().optional().default(true).describe('Preview ideas and prompts without generating images'),
  dryRun: z.boolean().optional().default(false).describe('Simulate generation and show output paths without API calls'),
  ideaIndices: z.array(z.number().int().nonnegative()).optional().describe('Only generate specific idea indices (0-based)'),
  maxIdeas: z.number().int().positive().optional().describe('Limit number of ideas processed'),
  includeAdditionalReferences: z.boolean().optional().default(true).describe('Include other character images as additional references (Gemini only)'),
  maxReferences: z.number().int().min(1).max(14).optional().default(14).describe('Max reference images for Gemini (1-14)'),
  size: z.string().optional().describe('OpenAI edit output size (e.g., 1024x1024, 1024x1536, 1536x1024)'),
  updateImageryYaml: z.boolean().optional().default(true).describe('Append results to character imagery.yaml (generated_images)'),
});

type ImageIdeaScene = {
  title: string;
  scene?: string;
  pose?: string;
  setting?: string;
  mood?: string;
  tags?: string[];
};

function buildIdeaPrompt(params: {
  characterName: string;
  characterSummary?: string;
  appearance?: string;
  visualConsistency?: string[];
  idea: ImageIdeaScene;
}): string {
  const { characterName, characterSummary, appearance, visualConsistency, idea } = params;

  const lines: string[] = [`${characterName} — ${idea.title}`];

  if (characterSummary) {
    lines.push('', `Character summary: ${characterSummary}`);
  }

  if (idea.scene) lines.push('', `Scene: ${idea.scene}`);
  if (idea.pose) lines.push(`Pose: ${idea.pose}`);
  if (idea.setting) lines.push(`Setting: ${idea.setting}`);
  if (idea.mood) lines.push(`Mood: ${idea.mood}`);
  if (idea.tags?.length) lines.push(`Tags: ${idea.tags.join(', ')}`);

  if (visualConsistency?.length) {
    lines.push('', 'Visual consistency notes:');
    for (const item of visualConsistency) {
      lines.push(`- ${item}`);
    }
  }

  if (appearance && appearance.trim().length > 0) {
    lines.push('', `Appearance details (canonical): ${appearance.trim()}`);
  }

  return lines.join('\n');
}

export async function generateCharacterImagesFromIdeas(
  input: z.infer<typeof generateCharacterImagesFromIdeasSchema>
): Promise<
  | {
      mode: 'preview';
      character: string;
      slug: string;
      ideasPath: string;
      portraitPath: string;
      ideaCount: number;
      selectedCount: number;
      candidates: Array<{ index: number; title: string; prompt: string; tags: string[] }>;
    }
  | {
      mode: 'generate';
      character: string;
      slug: string;
      provider: ImageProvider;
      model?: string;
      dryRun: boolean;
      portraitPath: string;
      referencesUsed: number;
      generatedCount: number;
      generatedImages: Array<{ index: number; title: string; path: string; prompt: string }>;
      errors: string[];
    }
> {
  const imageService = getImageService();

  // Resolve character with fuzzy matching + elicitation
  const { resolveCharacter } = await import('../services/character-resolution.js');
  const resolution = await resolveCharacter(input.character, {
    allowElicitation: true,
    maxCandidates: 5,
  });

  if (!resolution.success) {
    throw new Error(`Character not found: ${input.character}\n\n${resolution.guidanceMessage || ''}`.trim());
  }

  const character = resolution.character!;
  const slug = character.slug;

  const imagesDir = getImagesDir('character', slug);
  const characterDir = dirname(imagesDir);
  const ideasPath = join(characterDir, 'image-ideas.yaml');
  const portraitPath = join(imagesDir, 'portrait.png');

  const { access, readFile } = await import('fs/promises');
  try {
    await access(ideasPath);
  } catch {
    throw new Error(`image-ideas.yaml not found for character: ${slug}\nExpected: ${ideasPath}`);
  }

  // Load imagery.yaml (for canonical appearance enrichment)
  const imageryData = await readImageryYaml('character', slug);
  const charImagery = imageryData as CharacterImagery | null;
  const appearance = charImagery && typeof (charImagery as any).appearance === 'string' ? (charImagery as any).appearance : undefined;

  // Parse idea file
  const rawIdeas = parseYaml(await readFile(ideasPath, 'utf-8')) as any;
  const ideasDocSchema = z.object({
    character: z.object({
      name: z.string().optional(),
      summary: z.string().optional(),
    }).optional(),
    visual_consistency: z.array(z.string()).optional(),
    scenes: z.array(z.object({
      title: z.string(),
      scene: z.string().optional(),
      pose: z.string().optional(),
      setting: z.string().optional(),
      mood: z.string().optional(),
      tags: z.array(z.string()).optional(),
    })).optional(),
  }).passthrough();

  const ideasDoc = ideasDocSchema.parse(rawIdeas);
  const scenes: ImageIdeaScene[] = (ideasDoc.scenes || []).map(s => ({
    title: s.title,
    scene: s.scene,
    pose: s.pose,
    setting: s.setting,
    mood: s.mood,
    tags: s.tags || [],
  }));

  const selectedIndices = input.ideaIndices?.length
    ? scenes.map((_, idx) => idx).filter(idx => input.ideaIndices!.includes(idx))
    : scenes.map((_, idx) => idx);

  const limitedIndices = input.maxIdeas ? selectedIndices.slice(0, input.maxIdeas) : selectedIndices;

  const candidates = limitedIndices.map(index => {
    const idea = scenes[index];
    return {
      index,
      title: idea.title,
      tags: idea.tags || [],
      prompt: buildIdeaPrompt({
        characterName: ideasDoc.character?.name || character.name,
        characterSummary: ideasDoc.character?.summary,
        appearance,
        visualConsistency: ideasDoc.visual_consistency,
        idea,
      }),
    };
  });

  if (input.preview) {
    return {
      mode: 'preview',
      character: character.name,
      slug,
      ideasPath,
      portraitPath,
      ideaCount: scenes.length,
      selectedCount: candidates.length,
      candidates,
    };
  }

  const provider = input.provider as ImageProvider;

  if (!imageService.isProviderAvailable(provider)) {
    throw new Error(
      provider === 'google'
        ? "Google provider not available. Configure 'google' apiKey in config."
        : "OpenAI provider not available. Configure 'openai' apiKey in config."
    );
  }

  // Ensure portrait exists (this workflow is reference-first)
  try {
    await access(portraitPath);
  } catch {
    throw new Error(`portrait.png not found for character: ${slug}\nExpected: ${portraitPath}`);
  }

  // Build reference list (Gemini supports many-shot; OpenAI edit uses the portrait only)
  let referenceImages: string[] = [portraitPath];
  if (provider === 'google' && input.includeAdditionalReferences && (input.maxReferences || 14) > 1) {
    try {
      const files = await readdir(imagesDir);
      const additional = files
        .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
        .filter(f => f !== 'portrait.png')
        .filter(f => !/^mask\\./i.test(f) && !/^mask[-_]/i.test(f))
        .map(f => join(imagesDir, f))
        .slice(0, (input.maxReferences || 14) - 1);
      referenceImages = [portraitPath, ...additional];
    } catch {
      // Ignore additional references if directory read fails
    }
  }

  const { mkdir: mkdirFs } = await import('fs/promises');
  await mkdirFs(imagesDir, { recursive: true });

  const generatedImages: Array<{ index: number; title: string; path: string; prompt: string }> = [];
  const errors: string[] = [];

  // Prepare imagery.yaml update
  let updatedImageryData: CharacterImagery | null = charImagery;

  for (const c of candidates) {
    try {
      const filename = generateFilename(slug, c.title, c.index);
      const destPath = join(imagesDir, filename);

      if (input.dryRun) {
        generatedImages.push({
          index: c.index,
          title: c.title,
          path: `[DRY RUN] ${destPath}`,
          prompt: c.prompt,
        });
        continue;
      }

      // Generate using reference-first approach
      const result =
        provider === 'google'
          ? await imageService.generateWithReferences(referenceImages, c.prompt, {
              model: input.model,
              maxReferences: input.maxReferences,
            }, filename.replace(/\\.png$/i, ''))
          : await imageService.editImage(portraitPath, c.prompt, {
              provider: 'openai',
              model: input.model,
              size: input.size,
              outputFilename: filename.replace(/\\.png$/i, ''),
              preserveComposition: false,
            });

      // Copy output into character images directory
      const { readFile: readFileFs } = await import('fs/promises');
      const imageBuffer = await readFileFs(result.path);
      await writeFile(destPath, imageBuffer);

      // Append to imagery.yaml (legacy generated_images format) if requested
      if (input.updateImageryYaml) {
        if (!updatedImageryData) {
          updatedImageryData = {
            entity_type: 'character',
            slug,
            prompts: [],
            generated_images: [],
          } as CharacterImagery;
        }

        const entry: GeneratedImageEntry = {
          custom_id: generateCustomId(slug, c.index),
          file_name: filename,
          file_path: `images/${filename}`,
          prompt_used: result.prompt,
          provider: provider,
          model: result.model,
          generated_at: result.createdAt,
        };

        updatedImageryData.generated_images = [...(updatedImageryData.generated_images || []), entry];
      }

      generatedImages.push({
        index: c.index,
        title: c.title,
        path: destPath,
        prompt: result.prompt,
      });
    } catch (error) {
      errors.push(`${c.title}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (input.updateImageryYaml && updatedImageryData) {
    await writeImageryYaml('character', slug, updatedImageryData);
  }

  return {
    mode: 'generate',
    character: character.name,
    slug,
    provider,
    model: input.model,
    dryRun: input.dryRun,
    portraitPath,
    referencesUsed: provider === 'google' ? referenceImages.length : 1,
    generatedCount: generatedImages.length,
    generatedImages,
    errors,
  };
}

/**
 * Generate a character in a new scenario using reference images for consistency
 * Uses many-shot approach with character's portrait.png as reference
 */
export async function generateCharacterVariation(
  input: z.infer<typeof generateCharacterVariationSchema>
): Promise<{
  path: string;
  prompt: string;
  referencesUsed: number;
  model: string;
  character: string;
  fallbackMode?: 'text-only';
  error?: string;
  guidance?: string;
}> {
  const imageService = getImageService();
  const config = getConfig();

  // Check Google provider is available
  if (!imageService.isProviderAvailable('google')) {
    return {
      path: '',
      prompt: '',
      referencesUsed: 0,
      model: '',
      character: input.character,
      error: 'Character variation generation requires Google GenAI provider. Configure GOOGLE_API_KEY.',
    };
  }

  // Resolve character with fuzzy matching + elicitation
  const { resolveCharacter } = await import('../services/character-resolution.js');
  const resolution = await resolveCharacter(input.character, {
    allowElicitation: true,
    maxCandidates: 5,
  });

  if (!resolution.success) {
    return {
      path: '',
      prompt: '',
      referencesUsed: 0,
      model: '',
      character: input.character,
      error: `Character not found: ${input.character}`,
      guidance: resolution.guidanceMessage || 'No matching characters found.',
    };
  }

  const character = resolution.character!;

  // Discover portrait image(s) for the character
  const { access, readdir } = await import('fs/promises');
  let referenceImages = input.referenceImages || [];

  if (referenceImages.length === 0) {
    // Auto-discover portrait.png from character's images directory
    const imagesDir = getImagesDir('character', character.slug);
    const portraitPath = join(imagesDir, 'portrait.png');

    try {
      await access(portraitPath);
      referenceImages = [portraitPath];
    } catch {
      // No portrait.png found - will fall back to text-only generation
    }

    // Also check for additional images in the directory
    if (referenceImages.length === 1) {
      try {
        const files = await readdir(imagesDir);
        const additionalImages = files
          .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f) && f !== 'portrait.png')
          .map(f => join(imagesDir, f))
          .slice(0, (input.maxReferences || 14) - 1); // Leave room for portrait
        referenceImages.push(...additionalImages);
      } catch {
        // No additional images found
      }
    }
  }

  // If no reference images, fall back to text-only generation
  if (referenceImages.length === 0) {
    // Build a detailed prompt from character profile
    const profileParts: string[] = [`${character.name} in a new scene: ${input.scenario}`];

    if (character.appearance) {
      const { age, height, build, hair, eyes, distinguishingFeatures, clothing } = character.appearance;
      if (age) profileParts.push(`${age} years old`);
      if (height) profileParts.push(height);
      if (build) profileParts.push(`${build} build`);
      if (hair) profileParts.push(`${hair} hair`);
      if (eyes) profileParts.push(`${eyes} eyes`);
      if (distinguishingFeatures?.length) {
        profileParts.push(distinguishingFeatures.join(', '));
      }
      if (clothing) profileParts.push(`wearing ${clothing}`);
    }

    const fallbackPrompt = profileParts.join(', ');
    const timestamp = Date.now();
    const result = await imageService.generateFromPromptWithProvider(
      fallbackPrompt,
      `${character.slug}-variation-${timestamp}`,
      'google',
      { model: input.model },
      'character'
    );

    return {
      path: result.path,
      prompt: result.prompt,
      referencesUsed: 0,
      model: result.model,
      character: character.name,
      fallbackMode: 'text-only',
    };
  }

  // Use reference images for character consistency
  const result = await imageService.generateWithReferences(referenceImages, input.scenario, {
    model: input.model,
    maxReferences: input.maxReferences,
  });

  // Copy to character's images directory with descriptive name
  const timestamp = new Date().toISOString().split('T')[0];
  const scenarioSlug = input.scenario.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
  const destFilename = `${character.slug}-${scenarioSlug}-${timestamp}.png`;
  const destDir = getImagesDir('character', character.slug);

  try {
    await mkdir(destDir, { recursive: true });
    const { readFile: readFileFs } = await import('fs/promises');
    const imageBuffer = await readFileFs(result.path);
    const destPath = join(destDir, destFilename);
    await writeFile(destPath, imageBuffer);
  } catch {
    // If copying fails, the image is still available at result.path
  }

  return {
    path: result.path,
    prompt: result.prompt,
    referencesUsed: referenceImages.length,
    model: result.model,
    character: character.name,
  };
}
