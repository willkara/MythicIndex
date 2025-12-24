/**
 * Location Batch Planner
 *
 * Discovers location imagery targets and generates batch tasks.
 * Integrates with the existing prompt compiler and runs tracking.
 */

import { existsSync } from 'fs';
import { join } from 'path';
import type { BatchTask, BatchReferenceImage, BatchTaskConfig } from '../../../types/batch.js';
import type { CompiledPromptIR, RenderedPrompt } from '../../../types/prompt-ir.js';
import { getCachedLocations } from '../../entity-cache.js';
import {
  readImageryYaml,
  readRunsFile,
  getImagesDir,
  getEntityDir,
  type LocationImagery,
  type ImageInventoryEntry,
} from '../../imagery-yaml.js';
import { compileAllLocationTargets, listLocationTargets } from '../../prompt-compiler/index.js';
import { prepareIRPrompt } from '../../images/index.js';
import { buildFinalPrompt } from '../../images/style.js';
import { getLocationConsistencyPrompt, getSceneConsistencyPrompt } from '../../images/constants.js';
import { generateTaskKey, computeFileHash, type TaskKeyComponents } from '../task-key.js';
import { filterEntitiesBySlug } from '../slug-filter.js';

/** Options for location planning */
export interface LocationPlannerOptions {
  /** Filter to specific location slugs */
  slugFilter?: string[];
  /** Skip already generated targets */
  skipGenerated?: boolean;
  /** Model to use */
  model: string;
}

/** Planning result for a location */
export interface LocationPlanResult {
  slug: string;
  name: string;
  tasks: BatchTask[];
  skipped: number;
  errors: string[];
}

/**
 * Plan batch tasks for all locations
 */
export async function planLocationTasks(options: LocationPlannerOptions): Promise<{
  tasks: BatchTask[];
  summary: {
    locationsScanned: number;
    totalTasks: number;
    skipped: number;
    errors: string[];
  };
}> {
  const locations = getCachedLocations();
  const allTasks: BatchTask[] = [];
  let totalSkipped = 0;
  const allErrors: string[] = [];

  // Filter locations if specified
  const filteredLocations = filterEntitiesBySlug(locations, options.slugFilter);

  // Only process locations with imagery.yaml
  const locationsWithImagery = filteredLocations.filter((loc) => loc.hasImagery);

  for (const location of locationsWithImagery) {
    try {
      const result = await planSingleLocation(location.slug, location.name, options);
      allTasks.push(...result.tasks);
      totalSkipped += result.skipped;
      allErrors.push(...result.errors.map((e) => `[${location.slug}] ${e}`));
    } catch (error) {
      allErrors.push(`[${location.slug}] Failed to plan: ${error}`);
    }
  }

  return {
    tasks: allTasks,
    summary: {
      locationsScanned: locationsWithImagery.length,
      totalTasks: allTasks.length,
      skipped: totalSkipped,
      errors: allErrors,
    },
  };
}

/**
 * Plan batch tasks for a single location
 */
async function planSingleLocation(
  slug: string,
  name: string,
  options: LocationPlannerOptions
): Promise<LocationPlanResult> {
  const tasks: BatchTask[] = [];
  const errors: string[] = [];
  let skipped = 0;

  // Compile all targets for this location
  const compiledTargets = await compileAllLocationTargets(slug);

  if (compiledTargets.length === 0) {
    return { slug, name, tasks, skipped, errors: ['No compilation targets found'] };
  }

  // Load existing imagery inventory to check for already-generated images
  const existingRuns = new Map<string, string>(); // target_id -> ir_hash
  const imageryData = await readImageryYaml('location', slug);
  if (imageryData && isLocationImagery(imageryData)) {
    const inventoryEntries = getLocationInventoryEntries(imageryData);
    for (const entry of inventoryEntries) {
      const targetId = entry.generation?.target_id;
      const irHash = entry.generation?.ir_hash;
      if (targetId && irHash) {
        existingRuns.set(targetId, irHash);
      }
    }
  }

  // Legacy fallback to imagery.runs.yaml (for older locations)
  if (existingRuns.size === 0) {
    const runsFile = await readRunsFile('location', slug);
    if (runsFile?.runs) {
      for (const run of runsFile.runs) {
        existingRuns.set(run.target_id, run.ir_hash);
      }
    }
  }

  // Get paths
  const outputDir = getImagesDir('location', slug);
  const entityDir = getEntityDir('location', slug);

  for (const ir of compiledTargets) {
    try {
      const prepared = prepareIRPrompt('location', ir);
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
          ? buildFinalPrompt(
              prepared.referenceMode === 'scene'
                ? getSceneConsistencyPrompt(rendered.prompt)
                : getLocationConsistencyPrompt(rendered.prompt),
              prepared.scenario
            )
          : buildFinalPrompt(rendered.prompt, prepared.scenario);

      // Build task config
      const config = buildTaskConfig(ir, rendered);

      // Generate task key
      const keyComponents: TaskKeyComponents = {
        entityType: 'location',
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
        entityType: 'location',
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
          entity_type: 'location',
          entity_slug: slug,
          image_type: ir.image_type,
          title: ir.title,
          scene_mood: ir.scene_mood,
        },
      };

      tasks.push(task);
    } catch (error) {
      errors.push(`Target ${ir.target_id}: ${error}`);
    }
  }

  return { slug, name, tasks, skipped, errors };
}

function isLocationImagery(data: unknown): data is LocationImagery {
  return (
    typeof data === 'object' &&
    data !== null &&
    ('overview' in data || 'zones' in data)
  );
}

function getLocationInventoryEntries(data: LocationImagery): ImageInventoryEntry[] {
  const entries: ImageInventoryEntry[] = [];

  if (data.overview?.image_inventory) {
    entries.push(...data.overview.image_inventory);
  }

  const zones = data.zones ?? [];
  for (const zone of zones) {
    if (zone.image_inventory) {
      entries.push(...zone.image_inventory);
    }
  }

  return entries;
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
function buildTaskConfig(_ir: CompiledPromptIR, rendered: RenderedPrompt): BatchTaskConfig {
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
