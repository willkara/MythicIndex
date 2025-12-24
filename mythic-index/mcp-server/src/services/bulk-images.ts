/**
 * Bulk image generation service
 * Orchestrates regeneration of images for characters, locations, and chapters
 */

import { join, basename } from 'path';
import { writeFile, mkdir } from 'fs/promises';
import { getImageService, type ImageProvider, type GeneratedImage, type ImageScenario } from './images.js';
import {
  readImageryYaml,
  writeImageryYaml,
  archiveExistingImages,
  markImagesAsArchived,
  getPromptsForEntity,
  getImagesDir,
  listEntitiesWithImagery,
  getImageryStats,
  addGeneratedImage,
  type EntityType,
  type ImageryData,
  type ChapterImagery,
  type ExtendedNormalizedPrompt,
  type GeneratedImageEntry,
  type ImageryStats,
} from './imagery-yaml.js';
import {
  createReferenceResolverCache,
  resolveChapterPromptReferences,
  resolveLocationReferencePaths,
  resolveCharacterReferencePaths,
} from './reference-images.js';

export interface RegenerationOptions {
  provider: ImageProvider;
  dryRun?: boolean;
  promptIndices?: number[];
  size?: string;
  quality?: 'standard' | 'hd';
}

export interface RegenerationResult {
  slug: string;
  entityType: EntityType;
  success: boolean;
  dryRun: boolean;
  archivedCount: number;
  archivePath: string | null;
  generatedImages: Array<{
    promptIndex: number;
    promptSource: string;
    sourceName?: string;
    imagePath: string;
    prompt: string;
  }>;
  errors: Array<{
    promptIndex: number;
    error: string;
  }>;
}

export interface RegenerationCandidate {
  slug: string;
  entityType: EntityType;
  stats: ImageryStats;
}

/**
 * Map entity type to image generation scenario
 */
function entityTypeToScenario(entityType: EntityType): ImageScenario {
  switch (entityType) {
    case 'character':
      return 'character';
    case 'location':
      // Default to 'location' (interior); exterior detection happens in ImageService
      // when using generateLocationArt, but for bulk ops we use generic prompts
      return 'location';
    case 'chapter':
      return 'scene';
    default:
      return 'generic';
  }
}

/**
 * Generate a unique custom_id for a new image
 */
function generateCustomId(slug: string, promptIndex: number): string {
  const timestamp = Date.now().toString(36);
  return `${slug}-${promptIndex.toString().padStart(2, '0')}-${timestamp}`;
}

/**
 * Generate a filename for a new image
 */
function generateFilename(slug: string, promptIndex: number): string {
  const timestamp = new Date().toISOString().split('T')[0];
  return `${slug}-${promptIndex.toString().padStart(2, '0')}-${timestamp}.png`;
}

/**
 * Create a generated image entry from a generation result
 */
function createImageEntry(
  result: GeneratedImage,
  slug: string,
  promptIndex: number,
  promptUsed: string
): GeneratedImageEntry {
  const filename = basename(result.path);
  return {
    custom_id: generateCustomId(slug, promptIndex),
    file_name: filename,
    file_path: `images/${filename}`,
    prompt_index: promptIndex,
    prompt_used: promptUsed,
    provider: result.provider,
    model: result.model,
    generated_at: result.createdAt,
    provider_metadata: {},
  };
}

/**
 * Regenerate all images for an entity
 */
export async function regenerateEntityImages(
  entityType: EntityType,
  slug: string,
  options: RegenerationOptions
): Promise<RegenerationResult> {
  const result: RegenerationResult = {
    slug,
    entityType,
    success: true,
    dryRun: options.dryRun || false,
    archivedCount: 0,
    archivePath: null,
    generatedImages: [],
    errors: [],
  };

  // Read imagery data
  const imageryData = await readImageryYaml(entityType, slug);
  if (!imageryData) {
    result.success = false;
    result.errors.push({ promptIndex: -1, error: `No imagery.yaml found for ${entityType}/${slug}` });
    return result;
  }
  const referenceCache = createReferenceResolverCache();

  // Get prompts to regenerate
  const allPrompts = getPromptsForEntity(imageryData) as ExtendedNormalizedPrompt[];
  const promptsToGenerate = options.promptIndices
    ? allPrompts.filter(p => options.promptIndices!.includes(p.index))
    : allPrompts;

  if (promptsToGenerate.length === 0) {
    result.success = false;
    result.errors.push({ promptIndex: -1, error: 'No prompts found to generate' });
    return result;
  }

  // If dry run, just return what would be generated
  if (options.dryRun) {
    for (const prompt of promptsToGenerate) {
      result.generatedImages.push({
        promptIndex: prompt.index,
        promptSource: prompt.source,
        sourceName: prompt.sourceName,
        imagePath: `[DRY RUN] ${generateFilename(slug, prompt.index)}`,
        prompt: prompt.prompt,
      });
    }
    return result;
  }

  // Check provider availability
  const imageService = getImageService();
  if (!imageService.isProviderAvailable(options.provider)) {
    result.success = false;
    result.errors.push({
      promptIndex: -1,
      error: `Provider '${options.provider}' is not available. Configure API key in config.`,
    });
    return result;
  }

  // Archive existing images
  const archiveResult = await archiveExistingImages(entityType, slug);
  result.archivedCount = archiveResult.archivedCount;
  result.archivePath = archiveResult.archivePath;

  // Update imagery data to mark old images as archived
  let updatedImageryData = imageryData;
  if (archiveResult.archivePath) {
    updatedImageryData = markImagesAsArchived(
      imageryData,
      archiveResult.archivePath,
      new Date().toISOString()
    );
  }

  // Ensure images directory exists
  const imagesDir = getImagesDir(entityType, slug);
  await mkdir(imagesDir, { recursive: true });

  // Determine the appropriate scenario for master style application
  const scenario = entityTypeToScenario(entityType);

  // Generate images for each prompt
  for (const promptData of promptsToGenerate) {
    try {
      // Master style is now applied automatically by the image service
      // based on the scenario - no need to enhance prompt here

      // Generate the image
      const filename = generateFilename(slug, promptData.index);
      let referencePaths: string[] = [];
      if (entityType === 'character') {
        referencePaths = await resolveCharacterReferencePaths(slug, promptData.reference_images, referenceCache);
      } else if (entityType === 'location') {
        referencePaths = await resolveLocationReferencePaths(slug, promptData.reference_images, referenceCache);
      } else if (entityType === 'chapter') {
        referencePaths = await resolveChapterPromptReferences(
          imageryData as ChapterImagery,
          promptData as ExtendedNormalizedPrompt,
          referenceCache
        );
      }

      let generated;
      if (referencePaths.length > 0) {
        if (options.provider === 'google') {
          generated = await imageService.generateWithReferences(
            referencePaths,
            promptData.prompt,
            {
              size: options.size,
              quality: options.quality,
              maxReferences: referencePaths.length,
            },
            filename.replace('.png', ''),
            scenario
          );
        } else {
          const primaryReference = referencePaths[0];
          generated = await imageService.editImage(primaryReference, promptData.prompt, {
            provider: 'openai',
            size: options.size,
            outputFilename: filename.replace('.png', ''),
            preserveComposition: false,
          });
        }
      } else {
        generated = await imageService.generateFromPromptWithProvider(
          promptData.prompt,
          filename.replace('.png', ''),
          options.provider,
          {
            size: options.size,
            quality: options.quality,
          },
          scenario
        );
      }

      // Copy the generated image to the entity's images directory
      // The image service saves to ~/.mythicindex/images/, we need to copy to entity dir
      const { readFile: readFileFs } = await import('fs/promises');
      const imageBuffer = await readFileFs(generated.path);
      const destPath = join(imagesDir, filename);
      await writeFile(destPath, imageBuffer);

      // Create entry for imagery.yaml
      // generated.prompt contains the full styled prompt
      const imageEntry = createImageEntry(generated, slug, promptData.index, generated.prompt);
      imageEntry.file_name = filename;
      imageEntry.file_path = `images/${filename}`;

      // Add to imagery data
      updatedImageryData = addGeneratedImage(
        updatedImageryData,
        imageEntry,
        promptData.source,
        promptData.source === 'overview' ? undefined : promptData.sourceIndex ?? promptData.index
      );

      result.generatedImages.push({
        promptIndex: promptData.index,
        promptSource: promptData.source,
        sourceName: promptData.sourceName,
        imagePath: destPath,
        prompt: generated.prompt,
      });
    } catch (error) {
      result.errors.push({
        promptIndex: promptData.index,
        error: error instanceof Error ? error.message : String(error),
      });
      result.success = false;
    }
  }

  // Save updated imagery data
  await writeImageryYaml(entityType, slug, updatedImageryData);

  return result;
}

/**
 * List all entities that are candidates for regeneration
 */
export async function listRegenerationCandidates(
  options?: {
    entityType?: EntityType;
    filterProvider?: string;
  }
): Promise<RegenerationCandidate[]> {
  const candidates: RegenerationCandidate[] = [];
  const entityTypes: EntityType[] = options?.entityType
    ? [options.entityType]
    : ['character', 'location', 'chapter'];

  for (const entityType of entityTypes) {
    const slugs = await listEntitiesWithImagery(entityType);

    for (const slug of slugs) {
      const stats = await getImageryStats(entityType, slug);
      if (!stats) continue;

      // Filter by provider if specified
      if (options?.filterProvider) {
        const providerCount = stats.providers[options.filterProvider] || 0;
        if (providerCount === 0) continue;
      }

      candidates.push({
        slug,
        entityType,
        stats,
      });
    }
  }

  return candidates;
}

/**
 * Get detailed information about what would be regenerated for an entity
 */
export async function previewRegeneration(
  entityType: EntityType,
  slug: string
): Promise<{
  prompts: ExtendedNormalizedPrompt[];
  currentImages: number;
  providers: Record<string, number>;
} | null> {
  const imageryData = await readImageryYaml(entityType, slug);
  if (!imageryData) return null;

  const prompts = getPromptsForEntity(imageryData);
  const stats = await getImageryStats(entityType, slug);

  return {
    prompts,
    currentImages: stats?.generatedCount || 0,
    providers: stats?.providers || {},
  };
}
