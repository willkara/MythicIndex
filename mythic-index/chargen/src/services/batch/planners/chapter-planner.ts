/**
 * Chapter Batch Planner
 *
 * Discovers chapter imagery targets and generates batch tasks.
 * Integrates with the existing prompt compiler and runs tracking.
 */

import { existsSync } from 'fs';
import { join } from 'path';
import type { BatchTask, BatchReferenceImage, BatchTaskConfig } from '../../../types/batch.js';
import type { CompiledPromptIR, RenderedPrompt as _RenderedPrompt } from '../../../types/prompt-ir.js';
import { getCachedChapters } from '../../entity-cache.js';
import { readRunsFile, getImagesDir, getEntityDir } from '../../imagery-yaml.js';
import { compileChapterImages, listChapterTargets as _listChapterTargets } from '../../prompt-compiler/index.js';
import { prepareIRPrompt } from '../../images/index.js';
import { buildFinalPrompt } from '../../images/style.js';
import { getSceneConsistencyPrompt } from '../../images/constants.js';
import { generateTaskKey, computeFileHash, type TaskKeyComponents } from '../task-key.js';
import { filterEntitiesBySlug } from '../slug-filter.js';

/** Options for chapter planning */
export interface ChapterPlannerOptions {
  /** Filter to specific chapter slugs */
  slugFilter?: string[];
  /** Skip already generated targets */
  skipGenerated?: boolean;
  /** Filter by image types */
  imageTypes?: string[];
  /** Model to use */
  model: string;
}

/** Planning result for a chapter */
export interface ChapterPlanResult {
  slug: string;
  title: string;
  chapterNumber?: number;
  tasks: BatchTask[];
  skipped: number;
  errors: string[];
}

/**
 * Plan batch tasks for all chapters
 */
export async function planChapterTasks(options: ChapterPlannerOptions): Promise<{
  tasks: BatchTask[];
  summary: {
    chaptersScanned: number;
    totalTasks: number;
    skipped: number;
    errors: string[];
  };
}> {
  const chapters = getCachedChapters();
  const allTasks: BatchTask[] = [];
  let totalSkipped = 0;
  const allErrors: string[] = [];

  // Filter chapters if specified
  const filteredChapters = filterEntitiesBySlug(chapters, options.slugFilter);

  // Only process chapters with imagery.yaml
  const chaptersWithImagery = filteredChapters.filter((ch) => ch.hasImagery);

  // Sort by chapter number for consistent processing
  chaptersWithImagery.sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0));

  for (const chapter of chaptersWithImagery) {
    try {
      const result = await planSingleChapter(
        chapter.slug,
        chapter.title,
        chapter.chapterNumber,
        options
      );
      allTasks.push(...result.tasks);
      totalSkipped += result.skipped;
      allErrors.push(...result.errors.map((e) => `[${chapter.slug}] ${e}`));
    } catch (error) {
      allErrors.push(`[${chapter.slug}] Failed to plan: ${error}`);
    }
  }

  return {
    tasks: allTasks,
    summary: {
      chaptersScanned: chaptersWithImagery.length,
      totalTasks: allTasks.length,
      skipped: totalSkipped,
      errors: allErrors,
    },
  };
}

/**
 * Plan batch tasks for a single chapter
 */
async function planSingleChapter(
  slug: string,
  title: string,
  chapterNumber: number | undefined,
  options: ChapterPlannerOptions
): Promise<ChapterPlanResult> {
  const tasks: BatchTask[] = [];
  const errors: string[] = [];
  let skipped = 0;

  // Compile all targets for this chapter
  const compiledTargets = await compileChapterImages(slug);

  if (compiledTargets.length === 0) {
    return { slug, title, chapterNumber, tasks, skipped, errors: ['No compilation targets found'] };
  }

  // Filter by image type if specified
  const filteredTargets = options.imageTypes
    ? compiledTargets.filter((ir) => options.imageTypes!.includes(ir.image_type || ''))
    : compiledTargets;

  // Load existing runs to check for already-generated images
  const runsFile = await readRunsFile('chapter', slug);
  const existingRuns = new Map<string, string>(); // target_id -> ir_hash

  if (runsFile?.runs) {
    for (const run of runsFile.runs) {
      existingRuns.set(run.target_id, run.ir_hash);
    }
  }

  // Get paths
  const outputDir = getImagesDir('chapter', slug);
  const entityDir = getEntityDir('chapter', slug);

  for (const ir of filteredTargets) {
    try {
      const prepared = prepareIRPrompt('chapter', ir);
      const rendered = prepared.rendered;

      // Check if already generated with same hash
      const existingHash = existingRuns.get(ir.target_id);
      if (options.skipGenerated && existingHash === rendered.ir_hash) {
        skipped++;
        continue;
      }

      // Build reference images
      const referenceImages = await buildReferenceImages(ir, entityDir);

      // Build final prompt (batch path bypasses ImageService, so inject style here)
      const prompt =
        referenceImages.length > 0
          ? buildFinalPrompt(getSceneConsistencyPrompt(rendered.prompt), prepared.scenario)
          : buildFinalPrompt(rendered.prompt, prepared.scenario);

      // Build task config
      const config = buildTaskConfig(ir, rendered);

      // Generate task key
      const keyComponents: TaskKeyComponents = {
        entityType: 'chapter',
        entitySlug: slug,
        targetId: ir.target_id,
        prompt,
        negativePrompt: rendered.negative_prompt,
        referenceHashes: referenceImages.map((r) => r.sha256),
        model: options.model,
        config,
      };

      const taskKey = generateTaskKey(keyComponents);

      // Generate output filename
      const timestamp = Date.now();
      const dateStr = new Date().toISOString().split('T')[0];
      const outputFileName = `${ir.target_id}-${timestamp}-${dateStr}`;

      // Create task
      const task: BatchTask = {
        key: taskKey,
        kind: 'generate',
        entityType: 'chapter',
        entitySlug: slug,
        targetId: ir.target_id,
        prompt,
        negativePrompt: rendered.negative_prompt,
        referenceImages,
        outputDir,
        outputFileName,
        model: options.model,
        config,
        irHash: rendered.ir_hash,
        targetMetadata: {
          entity_type: 'chapter',
          entity_slug: slug,
          chapter_number: chapterNumber,
          chapter_title: title,
          custom_id: ir.target_id,
          image_type: ir.image_type,
          scene_mood: ir.scene_mood,
        },
      };

      tasks.push(task);
    } catch (error) {
      errors.push(`Target ${ir.target_id}: ${error}`);
    }
  }

  return { slug, title, chapterNumber, tasks, skipped, errors };
}

/**
 * Build reference images from IR
 */
async function buildReferenceImages(
  ir: CompiledPromptIR,
  entityDir: string
): Promise<BatchReferenceImage[]> {
  const references: BatchReferenceImage[] = [];

  for (const ref of ir.references) {
    if (!ref.exists) continue;

    // Resolve relative path to absolute
    const absolutePath = ref.path.startsWith('/') ? ref.path : join(entityDir, ref.path);

    if (!existsSync(absolutePath)) continue;

    try {
      const sha256 = await computeFileHash(absolutePath);
      const mime = getMimeType(absolutePath);

      references.push({
        path: absolutePath,
        mime,
        sha256,
        role: ref.role,
      });
    } catch {
      // Skip files that can't be read
    }
  }

  return references;
}

/**
 * Build task config from IR and rendered prompt
 */
function buildTaskConfig(_ir: CompiledPromptIR, rendered: _RenderedPrompt): BatchTaskConfig {
  return {
    aspectRatio: rendered.constraints.aspect_ratio,
    size: rendered.constraints.size,
    orientation: rendered.constraints.orientation,
    quality: rendered.constraints.quality || 'high',
  };
}

/**
 * Get MIME type from file path
 */
function getMimeType(path: string): string {
  const ext = path.toLowerCase().split('.').pop();
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
      return 'application/octet-stream';
  }
}
