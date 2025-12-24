/**
 * Character Analysis Batch Planner
 *
 * Plans batch tasks for complete character imagery analysis:
 * - Multimodal appearance extraction (profile.md + portrait.png)
 * - Analysis of all images in images/ directory
 *
 * This replicates the Python script analyze_character_images.py
 * using the Gemini Batch API for 50% cost savings.
 */

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, basename } from 'path';
import { createHash } from 'crypto';
import type { BatchTask, BatchReferenceImage, BatchTaskConfig } from '../../../types/batch.js';
import { getCachedCharacters } from '../../entity-cache.js';
import {
  readImageryYaml,
  getImagesDir,
  getEntityDir,
  type CharacterImagery,
  type ImageInventoryEntry,
} from '../../imagery-yaml.js';
import { getCharacterReferencePortrait } from '../../asset-registry.js';
import { discoverImageFiles } from '../../image-analysis.js';
import { generateTaskKey, computeFileHash, type TaskKeyComponents } from '../task-key.js';
import { filterEntitiesBySlug } from '../slug-filter.js';
import { getPrompt } from '../../../config/index.js';
import { getMimeType } from '../../images/utils.js';

/** Options for character analysis planning */
export interface CharacterAnalysisPlannerOptions {
  /** Filter to specific character slugs */
  slugFilter?: string[];
  /** Skip characters that already have appearance + analyzed images */
  skipAnalyzed?: boolean;
  /** Force re-analyze all images regardless of existing metadata */
  forceReanalyze?: boolean;
  /** Model to use for analysis */
  model: string;
}

/** Task types for character analysis */
export type CharacterAnalysisTaskType = 'appearance' | 'image_analysis';

/** Extended BatchTask with analysis-specific metadata */
export interface CharacterAnalysisTask extends BatchTask {
  analysisType: CharacterAnalysisTaskType;
}

/** Planning result for a character */
export interface CharacterAnalysisPlanResult {
  slug: string;
  name: string;
  appearanceTask?: CharacterAnalysisTask;
  imageAnalysisTasks: CharacterAnalysisTask[];
  skipped: {
    appearance: boolean;
    images: number;
  };
  errors: string[];
}

/**
 * Plan batch tasks for complete character imagery analysis
 */
export async function planCharacterAnalysisTasks(options: CharacterAnalysisPlannerOptions): Promise<{
  tasks: BatchTask[];
  summary: {
    charactersScanned: number;
    appearanceTasks: number;
    imageTasks: number;
    skipped: number;
    errors: string[];
  };
}> {
  const characters = getCachedCharacters();
  const allTasks: BatchTask[] = [];
  let appearanceTasks = 0;
  let imageTasks = 0;
  let totalSkipped = 0;
  const allErrors: string[] = [];

  // Filter characters if specified
  const filteredCharacters = filterEntitiesBySlug(characters, options.slugFilter);

  for (const character of filteredCharacters) {
    try {
      const result = await planSingleCharacterAnalysis(character.slug, character.name, options);

      // Add appearance task if needed
      if (result.appearanceTask) {
        allTasks.push(result.appearanceTask);
        appearanceTasks++;
      }

      // Add image analysis tasks
      allTasks.push(...result.imageAnalysisTasks);
      imageTasks += result.imageAnalysisTasks.length;

      // Track skipped
      if (result.skipped.appearance) totalSkipped++;
      totalSkipped += result.skipped.images;

      // Collect errors
      allErrors.push(...result.errors.map((e) => `[${character.slug}] ${e}`));
    } catch (error) {
      allErrors.push(`[${character.slug}] Failed to plan analysis: ${error}`);
    }
  }

  return {
    tasks: allTasks,
    summary: {
      charactersScanned: filteredCharacters.length,
      appearanceTasks,
      imageTasks,
      skipped: totalSkipped,
      errors: allErrors,
    },
  };
}

/**
 * Plan analysis tasks for a single character
 */
async function planSingleCharacterAnalysis(
  slug: string,
  name: string,
  options: CharacterAnalysisPlannerOptions
): Promise<CharacterAnalysisPlanResult> {
  const errors: string[] = [];
  const imageAnalysisTasks: CharacterAnalysisTask[] = [];
  let appearanceTask: CharacterAnalysisTask | undefined;
  const skipped = { appearance: false, images: 0 };

  // Get paths
  const entityDir = getEntityDir('character', slug);
  const imagesDir = getImagesDir('character', slug);
  const profilePath = join(entityDir, 'profile.md');

  // Get reference portrait using centralized lookup
  const portraitPath = getCharacterReferencePortrait(slug);

  // Load existing imagery.yaml
  const imageryData = await readImageryYaml('character', slug);
  const charImagery = imageryData as CharacterImagery | null;

  // =========================================================================
  // 1. Plan appearance extraction task
  // =========================================================================
  const needsAppearance =
    options.forceReanalyze || !charImagery?.appearance || charImagery.appearance.trim() === '';

  if (needsAppearance && existsSync(profilePath)) {
    try {
      appearanceTask = await createAppearanceTask(slug, name, profilePath, portraitPath, options.model);
    } catch (error) {
      errors.push(`Appearance extraction: ${error}`);
    }
  } else if (!needsAppearance) {
    skipped.appearance = true;
  } else if (!existsSync(profilePath)) {
    errors.push('No profile.md found');
  }

  // =========================================================================
  // 2. Plan image analysis tasks
  // =========================================================================
  if (!existsSync(imagesDir)) {
    return { slug, name, appearanceTask, imageAnalysisTasks, skipped, errors };
  }

  // Discover all image files
  const imageFiles = await discoverImageFiles(imagesDir);
  if (imageFiles.length === 0) {
    return { slug, name, appearanceTask, imageAnalysisTasks, skipped, errors };
  }

  // Get appearance for canon checking (use existing or placeholder)
  const appearance = charImagery?.appearance || '[Appearance will be generated]';

  // Build a map of existing inventory entries by filename
  const existingEntries = new Map<string, ImageInventoryEntry>();
  if (charImagery?.image_inventory) {
    for (const entry of charImagery.image_inventory) {
      const normalizedPath = entry.path.replace(/^images\//, '');
      existingEntries.set(normalizedPath, entry);
    }
  }

  // Plan analysis for each image
  for (const imagePath of imageFiles) {
    const filename = basename(imagePath);

    // Skip portrait.png from analysis (it's the reference, not an analyzed image)
    if (filename === 'portrait.png') continue;

    try {
      const existingEntry = existingEntries.get(filename);

      // Check if analysis is needed
      let needsAnalysis = false;
      if (options.forceReanalyze) {
        needsAnalysis = true;
      } else if (!existingEntry) {
        needsAnalysis = true;
      } else if (!hasRequiredMetadata(existingEntry)) {
        needsAnalysis = true;
      } else if (options.skipAnalyzed) {
        skipped.images++;
        continue;
      }

      if (needsAnalysis) {
        const task = await createImageAnalysisTask(
          slug,
          name,
          appearance,
          imagePath,
          filename,
          options.model
        );
        if (task) {
          imageAnalysisTasks.push(task);
        }
      } else {
        skipped.images++;
      }
    } catch (error) {
      errors.push(`Image "${filename}": ${error}`);
    }
  }

  return { slug, name, appearanceTask, imageAnalysisTasks, skipped, errors };
}

/**
 * Check if an image entry has required metadata
 */
function hasRequiredMetadata(entry: ImageInventoryEntry): boolean {
  // Check for presence of key fields
  if (!entry.content?.title) return false;
  if (!entry.content?.description) return false;
  if (!entry.content?.tags || entry.content.tags.length === 0) return false;
  return true;
}

/**
 * Create a batch task for multimodal appearance extraction
 */
async function createAppearanceTask(
  slug: string,
  name: string,
  profilePath: string,
  portraitPath: string | null,
  model: string
): Promise<CharacterAnalysisTask> {
  const targetId = `appearance-${slug}`;

  // Read profile content
  const profileContent = await readFile(profilePath, 'utf-8');

  // Build reference images
  const referenceImages: BatchReferenceImage[] = [];
  let hasPortrait = false;

  // Add portrait if it exists (the "gospel truth")
  if (portraitPath) {
    hasPortrait = true;
    const sha256 = await computeFileHash(portraitPath);
    referenceImages.push({
      path: portraitPath,
      mime: 'image/png',
      sha256,
      role: 'portrait',
    });
  }

  // Build prompt
  const promptTemplate = hasPortrait
    ? getPrompt('appearance_multimodal')
    : getPrompt('appearance_generator');

  const prompt = `Profile Content:\n${profileContent}\n\n${promptTemplate}`;

  // Build task config (text output only)
  const config: BatchTaskConfig = {
    responseMimeType: 'text/plain',
  };

  // Generate task key
  const keyComponents: TaskKeyComponents = {
    entityType: 'character',
    entitySlug: slug,
    targetId,
    prompt,
    referenceHashes: referenceImages.map((r) => r.sha256),
    model,
    config,
  };

  const taskKey = generateTaskKey(keyComponents);

  // Compute ir_hash
  const irHash = createHash('sha256')
    .update(JSON.stringify({ prompt, model, hasPortrait }))
    .digest('hex')
    .slice(0, 16);

  // Output directory
  const outputDir = getEntityDir('character', slug);

  return {
    key: taskKey,
    kind: 'analyze',
    analysisType: 'appearance',
    entityType: 'character',
    entitySlug: slug,
    targetId,
    prompt,
    referenceImages,
    outputDir,
    outputFileName: 'appearance.txt',
    model,
    config,
    irHash,
    targetMetadata: {
      entity_type: 'character',
      entity_slug: slug,
      name,
      analysis_type: 'appearance',
      has_portrait: hasPortrait,
    },
  };
}

/**
 * Create a batch task for image analysis
 */
async function createImageAnalysisTask(
  slug: string,
  name: string,
  appearance: string,
  imagePath: string,
  filename: string,
  model: string
): Promise<CharacterAnalysisTask | null> {
  try {
    // Compute file hash
    const sha256 = await computeFileHash(imagePath);

    // Build reference image (the image to analyze)
    const referenceImages: BatchReferenceImage[] = [
      {
        path: imagePath,
        mime: getMimeType(imagePath),
        sha256,
        role: 'portrait',
      },
    ];

    // Generate target ID
    const filenameWithoutExt = filename.substring(0, filename.lastIndexOf('.')) || filename;
    const targetId = `analyze-${filenameWithoutExt}`;

    // Build prompt using the enhanced archivist template
    const currentDate = new Date().toISOString().split('T')[0];
    const descriptor = filenameWithoutExt.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const prompt = getPrompt('archivist_enhanced', {
      characterName: name,
      slug,
      appearance,
      date: currentDate,
      filename,
      descriptor,
    });

    // Build task config
    const config: BatchTaskConfig = {
      responseMimeType: 'text/plain',
    };

    // Generate task key
    const keyComponents: TaskKeyComponents = {
      entityType: 'character',
      entitySlug: slug,
      targetId,
      prompt,
      referenceHashes: [sha256],
      model,
      config,
    };

    const taskKey = generateTaskKey(keyComponents);

    // Compute ir_hash
    const irHash = createHash('sha256')
      .update(JSON.stringify({ prompt, sha256, model }))
      .digest('hex')
      .slice(0, 16);

    // Output directory
    const outputDir = join(imagePath, '..');

    return {
      key: taskKey,
      kind: 'analyze',
      analysisType: 'image_analysis',
      entityType: 'character',
      entitySlug: slug,
      targetId,
      prompt,
      referenceImages,
      outputDir,
      outputFileName: filename,
      model,
      config,
      irHash,
      targetMetadata: {
        entity_type: 'character',
        entity_slug: slug,
        name,
        filename,
        analysis_type: 'image_analysis',
      },
    };
  } catch (error) {
    console.error(`Failed to create analysis task for ${filename}: ${error}`);
    return null;
  }
}

/**
 * Discover characters needing analysis
 */
export async function discoverCharactersNeedingFullAnalysis(
  options: Pick<CharacterAnalysisPlannerOptions, 'slugFilter' | 'skipAnalyzed' | 'forceReanalyze'>
): Promise<{
  characters: Array<{
    slug: string;
    name: string;
    needsAppearance: boolean;
    hasPortrait: boolean;
    imagesNeedingAnalysis: number;
    imagesAlreadyAnalyzed: number;
    totalImages: number;
  }>;
  totalAppearanceTasks: number;
  totalImageTasks: number;
}> {
  const characters = getCachedCharacters();
  const result: Array<{
    slug: string;
    name: string;
    needsAppearance: boolean;
    hasPortrait: boolean;
    imagesNeedingAnalysis: number;
    imagesAlreadyAnalyzed: number;
    totalImages: number;
  }> = [];
  let totalAppearanceTasks = 0;
  let totalImageTasks = 0;

  const filteredCharacters = filterEntitiesBySlug(characters, options.slugFilter);

  for (const character of filteredCharacters) {
    const entityDir = getEntityDir('character', character.slug);
    const imagesDir = getImagesDir('character', character.slug);
    const profilePath = join(entityDir, 'profile.md');

    // Get reference portrait using centralized lookup
    const portraitPath = getCharacterReferencePortrait(character.slug);

    // Load existing imagery
    const imageryData = await readImageryYaml('character', character.slug);
    const charImagery = imageryData as CharacterImagery | null;

    // Check if needs appearance
    const needsAppearance =
      options.forceReanalyze ||
      !charImagery?.appearance ||
      charImagery.appearance.trim() === '';

    const hasPortrait = portraitPath !== null;
    const hasProfile = existsSync(profilePath);

    if (needsAppearance && hasProfile) {
      totalAppearanceTasks++;
    }

    // Check images
    if (!existsSync(imagesDir)) {
      if (needsAppearance && hasProfile) {
        result.push({
          slug: character.slug,
          name: character.name,
          needsAppearance,
          hasPortrait,
          imagesNeedingAnalysis: 0,
          imagesAlreadyAnalyzed: 0,
          totalImages: 0,
        });
      }
      continue;
    }

    const imageFiles = await discoverImageFiles(imagesDir);
    // Exclude portrait.png from count
    const nonPortraitImages = imageFiles.filter((f) => !f.endsWith('portrait.png'));

    // Build map of existing entries
    const existingEntries = new Map<string, ImageInventoryEntry>();
    if (charImagery?.image_inventory) {
      for (const entry of charImagery.image_inventory) {
        const normalizedPath = entry.path.replace(/^images\//, '');
        existingEntries.set(normalizedPath, entry);
      }
    }

    // Count images needing analysis
    let imagesNeedingAnalysis = 0;
    let imagesAlreadyAnalyzed = 0;

    for (const imagePath of nonPortraitImages) {
      const filename = basename(imagePath);
      const entry = existingEntries.get(filename);

      if (options.forceReanalyze) {
        imagesNeedingAnalysis++;
      } else if (!entry) {
        imagesNeedingAnalysis++;
      } else if (!hasRequiredMetadata(entry)) {
        imagesNeedingAnalysis++;
      } else {
        imagesAlreadyAnalyzed++;
      }
    }

    totalImageTasks += imagesNeedingAnalysis;

    if (needsAppearance || imagesNeedingAnalysis > 0 || imagesAlreadyAnalyzed > 0) {
      result.push({
        slug: character.slug,
        name: character.name,
        needsAppearance: needsAppearance && hasProfile,
        hasPortrait,
        imagesNeedingAnalysis,
        imagesAlreadyAnalyzed,
        totalImages: nonPortraitImages.length,
      });
    }
  }

  return {
    characters: result,
    totalAppearanceTasks,
    totalImageTasks,
  };
}
