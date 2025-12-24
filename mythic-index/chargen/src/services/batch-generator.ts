/**
 * Batch image generation service
 * Generates images across multiple chapters with progress tracking
 */

import { readdir } from 'fs/promises';
import { getCachedChapters } from './entity-cache.js';
import { getImagesDir } from './imagery-yaml.js';
import {
  listChapterTargets,
  compileChapterImage,
  loadChapterContext,
} from './prompt-compiler/chapter-compiler.js';
import { generateFromIR, prepareIRPrompt } from './images/index.js';
import { appendRun, createGenerationRun, getImageryPath } from './imagery-yaml.js';
import { readFile } from 'fs/promises';
import { parse as parseYaml } from 'yaml';
import type { ChapterImagerySpec } from '../types/chapter-imagery.js';
import type { ChapterImageType } from '../types/chapter-imagery.js';
import type { TargetMetadata } from '../types/prompt-ir.js';
import {
  logBatchSection,
  logStep,
  logDetail,
  logCompilationMode,
  logBatchProgress,
} from '../ui/log.js';
import { showSuccess, showError } from '../ui/display.js';

export interface BatchGenerationOptions {
  /** Filter to specific chapters (undefined = all with imagery.yaml) */
  chapters?: string[];

  /** Skip targets that have already been generated */
  skipGenerated?: boolean;

  /** Filter by image type (hero, anchor, mood, etc.) */
  imageTypes?: ChapterImageType[];

  /** Preview only, don't generate */
  dryRun?: boolean;
}

export interface BatchProgress {
  totalChapters: number;
  completedChapters: number;
  totalTargets: number;
  completedTargets: number;
  successCount: number;
  errorCount: number;
  skippedCount: number;
  currentChapter?: string;
  currentTarget?: string;
}

export interface BatchError {
  chapter: string;
  target: string;
  error: string;
}

export interface BatchResult {
  success: boolean;
  progress: BatchProgress;
  errors: BatchError[];
  startTime: Date;
  endTime: Date;
}

export interface BatchTarget {
  chapterSlug: string;
  chapterTitle: string;
  targetId: string;
  imageType: string;
  alreadyGenerated: boolean;
}

export interface BatchDiscovery {
  chapters: {
    slug: string;
    title: string;
    targetCount: number;
    generatedCount: number;
  }[];
  totalChapters: number;
  totalTargets: number;
  totalGenerated: number;
}

/**
 * Discover all available batch targets
 */
export async function discoverBatchTargets(
  options: Pick<BatchGenerationOptions, 'chapters' | 'imageTypes' | 'skipGenerated'>
): Promise<BatchDiscovery> {
  // Get all chapters with imagery
  let chapters = getCachedChapters().filter((ch) => ch.hasImagery);

  // Filter by specific chapters if provided
  if (options.chapters?.length) {
    chapters = chapters.filter((ch) => options.chapters!.includes(ch.slug));
  }

  const result: BatchDiscovery = {
    chapters: [],
    totalChapters: 0,
    totalTargets: 0,
    totalGenerated: 0,
  };

  for (const chapter of chapters) {
    try {
      const { images } = await listChapterTargets(chapter.slug);

      // Filter by image type if provided
      let filteredImages = images;
      if (options.imageTypes?.length) {
        filteredImages = images.filter((img) =>
          options.imageTypes!.includes(img.image_type as ChapterImageType)
        );
      }

      // Get already-generated targets
      const generated = await getGeneratedTargets(chapter.slug);
      const generatedCount = filteredImages.filter((img) => generated.has(img.custom_id)).length;

      result.chapters.push({
        slug: chapter.slug,
        title: chapter.title || chapter.slug,
        targetCount: filteredImages.length,
        generatedCount,
      });

      result.totalTargets += filteredImages.length;
      result.totalGenerated += generatedCount;
    } catch {
      // Skip chapters that fail to load
    }
  }

  result.totalChapters = result.chapters.length;

  return result;
}

/**
 * Get all targets that will be processed
 */
export async function getBatchTargets(options: BatchGenerationOptions): Promise<BatchTarget[]> {
  const targets: BatchTarget[] = [];

  // Get all chapters with imagery
  let chapters = getCachedChapters().filter((ch) => ch.hasImagery);

  // Filter by specific chapters if provided
  if (options.chapters?.length) {
    chapters = chapters.filter((ch) => options.chapters!.includes(ch.slug));
  }

  for (const chapter of chapters) {
    try {
      const { images } = await listChapterTargets(chapter.slug);

      // Filter by image type if provided
      let filteredImages = images;
      if (options.imageTypes?.length) {
        filteredImages = images.filter((img) =>
          options.imageTypes!.includes(img.image_type as ChapterImageType)
        );
      }

      // Get already-generated targets
      const generated = await getGeneratedTargets(chapter.slug);

      for (const image of filteredImages) {
        const alreadyGenerated = generated.has(image.custom_id);

        // Skip if already generated and skipGenerated is true
        if (options.skipGenerated && alreadyGenerated) {
          continue;
        }

        targets.push({
          chapterSlug: chapter.slug,
          chapterTitle: chapter.title || chapter.slug,
          targetId: image.custom_id,
          imageType: image.image_type,
          alreadyGenerated,
        });
      }
    } catch {
      // Skip chapters that fail to load
    }
  }

  return targets;
}

/**
 * Get set of already-generated target IDs for a chapter
 */
async function getGeneratedTargets(chapterSlug: string): Promise<Set<string>> {
  const imagesDir = getImagesDir('chapter', chapterSlug);
  try {
    const files = await readdir(imagesDir);
    // Extract custom_id from filenames
    // Filenames are like "ch15-img-01-hero-1234567890.png"
    // custom_id is typically "ch15-img-01"
    return new Set(
      files
        .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f))
        .map((f) => {
          // Extract everything before the image type and timestamp
          const parts = f.split('-');
          // Skip the last two parts (image type and timestamp)
          if (parts.length >= 4) {
            return parts.slice(0, 3).join('-');
          }
          return f.replace(/\.(png|jpg|jpeg|webp)$/i, '');
        })
    );
  } catch {
    return new Set(); // No images directory yet
  }
}

/**
 * Generate all chapter images based on options
 */
export async function generateAllChapterImages(
  options: BatchGenerationOptions,
  onProgress?: (progress: BatchProgress) => void
): Promise<BatchResult> {
  const startTime = new Date();
  const errors: BatchError[] = [];

  // Get targets to process
  const targets = await getBatchTargets(options);

  // Initialize progress
  const progress: BatchProgress = {
    totalChapters: new Set(targets.map((t) => t.chapterSlug)).size,
    completedChapters: 0,
    totalTargets: targets.length,
    completedTargets: 0,
    successCount: 0,
    errorCount: 0,
    skippedCount: 0,
  };

  // Track completed chapters
  const chapterTargetCounts = new Map<string, { total: number; done: number }>();
  for (const target of targets) {
    const existing = chapterTargetCounts.get(target.chapterSlug) || { total: 0, done: 0 };
    existing.total++;
    chapterTargetCounts.set(target.chapterSlug, existing);
  }

  // Dry run - just return counts
  if (options.dryRun) {
    return {
      success: true,
      progress,
      errors: [],
      startTime,
      endTime: new Date(),
    };
  }

  // Track context loading per chapter (only load once per chapter)
  let lastChapter: string | null = null;
  let currentContext: Awaited<ReturnType<typeof loadChapterContext>> = null;

  // Process each target
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    progress.currentChapter = target.chapterSlug;
    progress.currentTarget = target.targetId;
    onProgress?.(progress);

    // Log batch section header
    logBatchSection(`[${i + 1}/${targets.length}] ${target.chapterSlug} / ${target.targetId}`);

    try {
      // Load chapter context (only once per chapter)
      if (target.chapterSlug !== lastChapter) {
        logStep('Loading chapter context...');
        currentContext = await loadChapterContext(target.chapterSlug, { verbose: true });
        lastChapter = target.chapterSlug;

        if (!currentContext) {
          throw new Error('Could not load chapter context');
        }
      }

      // Load imagery spec
      const imageryPath = getImageryPath('chapter', target.chapterSlug);
      const content = await readFile(imageryPath, 'utf-8');
      const imagery = parseYaml(content) as ChapterImagerySpec;

      const imageSpec = imagery.images?.find((img) => img.custom_id === target.targetId);
      if (!imageSpec) {
        throw new Error(`Image spec not found: ${target.targetId}`);
      }

      // Compile IR
      logStep('Compiling...');
      const ir = await compileChapterImage(currentContext!, imagery, imageSpec, {});
      if (!ir) {
        throw new Error('Could not compile IR');
      }

      // Log compilation mode
      const hasPromptUsed = ir.positive.subject.some((s) => s.source === 'prompt_used');
      logCompilationMode(hasPromptUsed);

      // Log characters if present
      const depictedChars = ir.positive.subject
        .filter((s) => s.source === 'character_appearance')
        .map((s) => s.content.split(',')[0])
        .slice(0, 2);
      if (depictedChars.length > 0) {
        logDetail(`Characters: ${depictedChars.join(', ')}`);
      }

      // Render prompt (generation-safe, reserves space for style suffix)
      const prepared = prepareIRPrompt('chapter', ir);
      logDetail(`Prompt: ${prepared.rendered.char_count} chars`);

      // Generate image (logging is handled inside generateFromIR)
      const result = await generateFromIR('chapter', target.chapterSlug, ir, prepared);

      if (result.success) {
        // Build target metadata from image spec
        const targetMetadata: TargetMetadata = {
          entity_type: 'chapter',
          entity_slug: target.chapterSlug,
          chapter_number: imagery.metadata.chapter_number,
          chapter_title: imagery.metadata.chapter_title,
          custom_id: target.targetId,
          scene_id: imageSpec.scene_id,
          source_moment: imageSpec.source_moment,
          image_type: imageSpec.image_type,
          scene_mood: imageSpec.scene_mood,
          category: imageSpec.category,
          depicts_characters: imageSpec.depicts_characters,
          location: imageSpec.location,
          zone: imageSpec.zone,
        };

        // Record the run
        const run = createGenerationRun({
          targetId: target.targetId,
          fileName: result.fileName!,
          filePath: result.filePath!,
          model: result.model || 'gemini-3-pro-image-preview',
          irHash: prepared.rendered.ir_hash,
          promptUsed: prepared.rendered.prompt,
          negativePromptUsed: prepared.rendered.negative_prompt,
          referenceImages: prepared.rendered.references.map((r) => ({
            asset_id: `ref-${target.targetId}`,
            path: r.path,
            role: r.role,
          })),
          constraints: {
            aspect_ratio: ir.constraints.aspect_ratio,
            size: ir.constraints.size,
            orientation: ir.constraints.orientation,
            quality: ir.constraints.quality,
          },
          providerMetadata: result.metadata,
          targetMetadata,
        });

        await appendRun('chapter', target.chapterSlug, run);
        progress.successCount++;
        showSuccess('Success');
      } else {
        throw new Error(result.error || 'Generation failed');
      }
    } catch (error) {
      progress.errorCount++;
      errors.push({
        chapter: target.chapterSlug,
        target: target.targetId,
        error: (error as Error).message,
      });
      showError(`Error: ${(error as Error).message}`);
    }

    progress.completedTargets++;

    // Update chapter completion
    const chapterStatus = chapterTargetCounts.get(target.chapterSlug)!;
    chapterStatus.done++;
    if (chapterStatus.done >= chapterStatus.total) {
      progress.completedChapters++;
    }

    // Log batch progress
    logBatchProgress(
      progress.completedTargets,
      progress.totalTargets,
      progress.successCount,
      progress.errorCount,
      progress.skippedCount
    );

    onProgress?.(progress);
  }

  return {
    success: errors.length === 0,
    progress,
    errors,
    startTime,
    endTime: new Date(),
  };
}

/**
 * Format duration in human-readable form
 */
export function formatDuration(startTime: Date, endTime: Date): string {
  const ms = endTime.getTime() - startTime.getTime();
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Estimate generation time based on target count
 * Assumes ~2 seconds per image (rate limit)
 */
export function estimateTime(targetCount: number): string {
  const seconds = targetCount * 2;
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `~${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `~${minutes}m`;
  }
  return `~${seconds}s`;
}
