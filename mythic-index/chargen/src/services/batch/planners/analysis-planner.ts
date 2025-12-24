/**
 * Image Analysis Batch Planner
 *
 * Discovers character images needing analysis and generates batch tasks
 * for enhanced metadata extraction via Gemini Vision API.
 */

import { existsSync } from 'fs';
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
import { discoverImageFiles } from '../../image-analysis.js';
import { generateTaskKey, computeFileHash, type TaskKeyComponents } from '../task-key.js';
import { filterEntitiesBySlug } from '../slug-filter.js';

/** Options for analysis planning */
export interface AnalysisPlannerOptions {
  /** Filter to specific character slugs */
  slugFilter?: string[];
  /** Skip images that already have enhanced metadata */
  skipEnhanced?: boolean;
  /** Re-analyze all images regardless of existing metadata */
  reAnalyze?: boolean;
  /** Model to use for analysis */
  model: string;
}

/** Analysis detection result */
export interface AnalysisNeeded {
  imagePath: string;
  filename: string;
  reason: 'no_metadata' | 'basic_metadata' | 're_analyze';
  existingEntry?: ImageInventoryEntry;
}

/** Planning result for a character */
export interface AnalysisPlanResult {
  slug: string;
  name: string;
  tasks: BatchTask[];
  skipped: number;
  errors: string[];
}

/**
 * Check if an image entry has enhanced metadata
 */
function hasEnhancedMetadata(entry: ImageInventoryEntry): boolean {
  // Check for presence of enhanced fields
  if (entry.image_type) return true;
  if (entry.lighting) return true;
  if (entry.palette) return true;
  if (entry.canon_analysis) return true;
  if (entry.content?.composition_notes) return true;
  if (entry.content?.narrative_significance) return true;
  if (entry.content?.symbolic_elements) return true;

  return false;
}

/**
 * Plan batch analysis tasks for all characters
 */
export async function planAnalysisTasks(options: AnalysisPlannerOptions): Promise<{
  tasks: BatchTask[];
  summary: {
    charactersScanned: number;
    totalTasks: number;
    skipped: number;
    errors: string[];
  };
}> {
  const characters = getCachedCharacters();
  const allTasks: BatchTask[] = [];
  let totalSkipped = 0;
  const allErrors: string[] = [];

  // Filter characters if specified
  const filteredCharacters = filterEntitiesBySlug(characters, options.slugFilter);

  for (const character of filteredCharacters) {
    try {
      const result = await planSingleCharacterAnalysis(character.slug, character.name, options);
      allTasks.push(...result.tasks);
      totalSkipped += result.skipped;
      allErrors.push(...result.errors.map((e) => `[${character.slug}] ${e}`));
    } catch (error) {
      allErrors.push(`[${character.slug}] Failed to plan analysis: ${error}`);
    }
  }

  return {
    tasks: allTasks,
    summary: {
      charactersScanned: filteredCharacters.length,
      totalTasks: allTasks.length,
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
  options: AnalysisPlannerOptions
): Promise<AnalysisPlanResult> {
  const tasks: BatchTask[] = [];
  const errors: string[] = [];
  let skipped = 0;

  // Get paths
  const imagesDir = getImagesDir('character', slug);
  const _entityDir = getEntityDir('character', slug);

  // Check if images directory exists
  if (!existsSync(imagesDir)) {
    return { slug, name, tasks, skipped, errors: ['No images directory'] };
  }

  // Discover all image files
  const imageFiles = await discoverImageFiles(imagesDir);
  if (imageFiles.length === 0) {
    return { slug, name, tasks, skipped, errors: ['No image files found'] };
  }

  // Load existing imagery.yaml
  const imageryData = await readImageryYaml('character', slug);
  const charImagery = imageryData as CharacterImagery | null;

  // Get appearance from imagery.yaml or profile
  let appearance = '';
  if (charImagery?.appearance) {
    appearance = charImagery.appearance;
  }

  // Build a map of existing inventory entries by path
  const existingEntries = new Map<string, ImageInventoryEntry>();
  if (charImagery?.image_inventory) {
    for (const entry of charImagery.image_inventory) {
      // Normalize path for comparison
      const normalizedPath = entry.path.replace(/^images\//, '');
      existingEntries.set(normalizedPath, entry);
    }
  }

  // Determine which images need analysis
  for (const imagePath of imageFiles) {
    const filename = basename(imagePath);
    const relativePath = filename; // Just the filename

    try {
      const existingEntry = existingEntries.get(relativePath);

      // Determine if analysis is needed
      let analysisNeeded: AnalysisNeeded | null = null;

      if (options.reAnalyze) {
        // Force re-analyze all
        analysisNeeded = {
          imagePath,
          filename,
          reason: 're_analyze',
          existingEntry,
        };
      } else if (!existingEntry) {
        // No metadata at all
        analysisNeeded = {
          imagePath,
          filename,
          reason: 'no_metadata',
        };
      } else if (options.skipEnhanced && hasEnhancedMetadata(existingEntry)) {
        // Already has enhanced metadata, skip
        skipped++;
        continue;
      } else if (!hasEnhancedMetadata(existingEntry)) {
        // Has basic metadata but not enhanced
        analysisNeeded = {
          imagePath,
          filename,
          reason: 'basic_metadata',
          existingEntry,
        };
      } else {
        // Has enhanced metadata and not re-analyzing
        skipped++;
        continue;
      }

      if (analysisNeeded) {
        const task = await createAnalysisTask(
          slug,
          name,
          appearance,
          analysisNeeded,
          options.model
        );
        if (task) {
          tasks.push(task);
        }
      }
    } catch (error) {
      errors.push(`Image "${filename}": ${error}`);
    }
  }

  return { slug, name, tasks, skipped, errors };
}

/**
 * Create a batch task for image analysis
 */
async function createAnalysisTask(
  slug: string,
  name: string,
  appearance: string,
  analysis: AnalysisNeeded,
  model: string
): Promise<BatchTask | null> {
  const { imagePath, filename, reason, existingEntry } = analysis;

  try {
    // Compute file hash for the image
    const sha256 = await computeFileHash(imagePath);

    // Build reference image (the image to analyze)
    const referenceImages: BatchReferenceImage[] = [
      {
        path: imagePath,
        mime: getMimeType(imagePath),
        sha256,
        role: 'portrait', // Using portrait as the role for character image analysis
      },
    ];

    // Generate target ID from filename
    const filenameWithoutExt = filename.substring(0, filename.lastIndexOf('.')) || filename;
    const targetId = `analyze-${filenameWithoutExt}`;

    // Build the analysis prompt
    const prompt = buildAnalysisPrompt(name, slug, appearance, filename);

    // Build task config (analysis doesn't generate images, just text)
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

    // Compute ir_hash from analysis parameters
    const irHash = createHash('sha256')
      .update(JSON.stringify({ prompt, sha256, model }))
      .digest('hex')
      .slice(0, 16);

    // Output directory for analysis results (same as images dir)
    const outputDir = join(imagePath, '..');

    // Create task
    const task: BatchTask = {
      key: taskKey,
      kind: 'analyze',
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
        analysis_reason: reason,
        existing_id: existingEntry?.id,
      },
    };

    return task;
  } catch (error) {
    console.error(`Failed to create analysis task for ${filename}: ${error}`);
    return null;
  }
}

/**
 * Build the analysis prompt for enhanced metadata extraction
 */
function buildAnalysisPrompt(
  name: string,
  slug: string,
  appearance: string,
  filename: string
): string {
  const currentDate = new Date().toISOString().split('T')[0];
  const filenameWithoutExt = filename.substring(0, filename.lastIndexOf('.')) || filename;
  const descriptor = filenameWithoutExt.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  // This is a simplified version of the enhanced prompt
  // The full prompt is in image-analysis.ts ARCHIVIST_PROMPT_TEMPLATE
  return `Analyze this image of the character "${name}" (slug: ${slug}).

Canonical Appearance:
${appearance || 'Not provided'}

Output a YAML block with enhanced metadata including:
- image_type (portrait, action, scene, mood, collaborative)
- image_subtype
- content (title, description, alt_text, tags, composition_notes, narrative_significance, symbolic_elements)
- lighting (primary_source, quality, direction, color_temperature, shadow_depth, atmospheric)
- palette (dominant colors, accent colors)
- canon_analysis (matches_description, verified_features, notes)
- provenance (source: imported, created_at: ${currentDate}, original_filename: ${filename})

id: "${slug}-${descriptor}-01"
path: "images/${filename}"
type: "generated"
status: "approved"`;
}

/**
 * Get MIME type from file extension
 */
function getMimeType(filePath: string): string {
  const ext = filePath.toLowerCase().split('.').pop();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    default:
      return 'image/png';
  }
}

/**
 * Discover characters that need image analysis
 */
export async function discoverCharactersNeedingAnalysis(
  options: Pick<AnalysisPlannerOptions, 'slugFilter' | 'skipEnhanced' | 'reAnalyze'>
): Promise<{
  characters: Array<{
    slug: string;
    name: string;
    imagesNeedingAnalysis: number;
    imagesWithEnhancedMetadata: number;
    totalImages: number;
  }>;
  totalNeedingAnalysis: number;
}> {
  const characters = getCachedCharacters();
  const result: Array<{
    slug: string;
    name: string;
    imagesNeedingAnalysis: number;
    imagesWithEnhancedMetadata: number;
    totalImages: number;
  }> = [];
  let totalNeedingAnalysis = 0;

  const filteredCharacters = filterEntitiesBySlug(characters, options.slugFilter);

  for (const character of filteredCharacters) {
    const imagesDir = getImagesDir('character', character.slug);
    if (!existsSync(imagesDir)) continue;

    const imageFiles = await discoverImageFiles(imagesDir);
    if (imageFiles.length === 0) continue;

    const imageryData = await readImageryYaml('character', character.slug);
    const charImagery = imageryData as CharacterImagery | null;

    let withEnhanced = 0;
    let needingAnalysis = 0;

    // Build map of existing entries
    const existingEntries = new Map<string, ImageInventoryEntry>();
    if (charImagery?.image_inventory) {
      for (const entry of charImagery.image_inventory) {
        const normalizedPath = entry.path.replace(/^images\//, '');
        existingEntries.set(normalizedPath, entry);
      }
    }

    // Count images
    for (const imagePath of imageFiles) {
      const filename = basename(imagePath);
      const entry = existingEntries.get(filename);

      if (options.reAnalyze) {
        needingAnalysis++;
      } else if (!entry) {
        needingAnalysis++;
      } else if (hasEnhancedMetadata(entry)) {
        withEnhanced++;
        if (!options.skipEnhanced) {
          needingAnalysis++;
        }
      } else {
        needingAnalysis++;
      }
    }

    if (needingAnalysis > 0 || withEnhanced > 0) {
      result.push({
        slug: character.slug,
        name: character.name,
        imagesNeedingAnalysis: needingAnalysis,
        imagesWithEnhancedMetadata: withEnhanced,
        totalImages: imageFiles.length,
      });
      totalNeedingAnalysis += needingAnalysis;
    }
  }

  return {
    characters: result,
    totalNeedingAnalysis,
  };
}
