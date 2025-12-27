/**
 * Batch Results Applier
 *
 * Applies batch results by:
 * 1. Decoding and writing image files
 * 2. Updating imagery.yaml inventory (locations) or imagery.runs.yaml (chapters/characters)
 * 3. Creating atomic backups before modifications
 */

import { writeFile, mkdir, copyFile, rename } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname as _dirname, basename, extname } from 'path';
import { parse as parseYaml } from 'yaml';
import {
  safeValidateImageInventoryEntry,
  formatValidationErrors,
} from './schemas/image-inventory.js';
import type {
  BatchTask,
  BatchPlan,
  BatchRunState,
  BatchTaskResult,
  BatchTaskStatus,
  DLQEntry,
} from '../../types/batch.js';
import type { GenerationRun } from '../../types/prompt-ir.js';
import {
  appendLocationImageInventory,
  appendChapterImageInventory,
  createGeneratedImageInventoryEntry,
  readRunsFile,
  writeRunsFile,
  readImageryYaml,
  writeImageryYaml,
  type EntityType,
  type CharacterImagery,
  type ImageInventoryEntry,
} from '../imagery-yaml.js';
import { getCharacterReferencePortrait } from '../asset-registry.js';
import { streamParseResultsJSONL, getSuccessfulResponses } from './downloader.js';
import { parseTaskKey } from './task-key.js';
import { saveRunState as _saveRunState, updatePhase as _updatePhase } from './state.js';

/** Apply options */
export interface ApplyOptions {
  /** Artifact directory */
  artifactDir: string;
  /** Create backups before modifying YAML */
  createBackups: boolean;
}

/** Apply result */
export interface ApplyResult {
  /** Images written */
  imagesWritten: number;
  /** YAML files updated */
  yamlUpdated: number;
  /** Failed to process */
  failed: number;
  /** Task results */
  results: BatchTaskResult[];
  /** Dead letter queue entries */
  dlq: DLQEntry[];
  /** Errors */
  errors: string[];
}

/** Individual analysis task apply result */
interface AnalysisApplyResult {
  status: 'success' | 'error';
  entityType?: string;
  entitySlug?: string;
  targetId?: string;
  message?: string;
  reason?: string;
}

/**
 * Apply batch results to the filesystem
 */
export async function applyResults(
  plan: BatchPlan,
  resultFiles: string[],
  state: BatchRunState,
  options: ApplyOptions
): Promise<ApplyResult> {
  const results: BatchTaskResult[] = [];
  const dlq: DLQEntry[] = [];
  const errors: string[] = [];
  let imagesWritten = 0;
  let yamlUpdated = 0;
  let failed = 0;

  // Build task lookup by key
  const tasksByKey = new Map<string, BatchTask>();
  for (const task of plan.tasks) {
    tasksByKey.set(task.key, task);
  }

  // Process each result file
  for (const resultFile of resultFiles) {
    for await (const response of streamParseResultsJSONL(resultFile)) {
      const task = tasksByKey.get(response.custom_id);
      if (!task) {
        errors.push(`Unknown task key in results: ${response.custom_id}`);
        continue;
      }

      try {
        // Check for error
        if (response.error) {
          const result: BatchTaskResult = {
            taskKey: task.key,
            status: 'failed',
            error: {
              code: String(response.error.code),
              message: response.error.message,
              retryable: isRetryableError(response.error.code),
            },
          };
          results.push(result);

          // Add to DLQ
          dlq.push({
            task,
            error: {
              code: String(response.error.code),
              message: response.error.message,
              timestamp: new Date().toISOString(),
              attempts: 1,
              lastAttemptAt: new Date().toISOString(),
            },
            rawResponse: JSON.stringify(response),
          });

          failed++;
          continue;
        }

        // Check for text response (analysis tasks)
        const textPart = response.response?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textPart && task.kind === 'analyze') {
          const analysisResult = await applyAnalysisResult(task, textPart, options);

          if (analysisResult.status === 'success') {
            const result: BatchTaskResult = {
              taskKey: task.key,
              status: 'success',
              providerMetadata: {
                finishReason: response.response?.candidates?.[0]?.finishReason,
                usageMetadata: response.response?.usageMetadata,
              },
            };
            results.push(result);
            yamlUpdated++;
          } else {
            const result: BatchTaskResult = {
              taskKey: task.key,
              status: 'failed',
              error: {
                code: 'ANALYSIS_FAILED',
                message: analysisResult.reason || 'Failed to apply analysis result',
                retryable: false,
              },
            };
            results.push(result);
            failed++;
          }
          continue;
        }

        // Extract image data
        const inlineData = response.response?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
        if (!inlineData?.data) {
          const result: BatchTaskResult = {
            taskKey: task.key,
            status: 'failed',
            error: {
              code: 'NO_IMAGE_DATA',
              message: 'Response did not contain image data',
              retryable: false,
            },
          };
          results.push(result);
          failed++;
          continue;
        }

        // Write image file
        const outputPath = await writeImageFile(
          task.outputDir,
          task.outputFileName,
          inlineData.data,
          inlineData.mimeType || 'image/png'
        );

        // Update YAML
        const parsedKey = parseTaskKey(task.key);
        if (parsedKey) {
        if (parsedKey.entityType === 'location') {
          await updateLocationInventory(
            task,
            outputPath,
            state.runId,
            options.createBackups
          );
        } else if (parsedKey.entityType === 'chapter') {
          await updateChapterInventory(
            task,
            outputPath,
            state.runId,
            options.createBackups
          );
          await updateRunsFile(
            parsedKey.entityType as EntityType,
            task.entitySlug,
            task,
            outputPath,
            state.runId,
            options.createBackups
          );
        } else {
          await updateRunsFile(
            parsedKey.entityType as EntityType,
            task.entitySlug,
            task,
            outputPath,
            state.runId,
            options.createBackups
          );
        }
        yamlUpdated++;
      }

        // Record success
        const result: BatchTaskResult = {
          taskKey: task.key,
          status: 'success',
          outputPath,
          providerMetadata: {
            finishReason: response.response?.candidates?.[0]?.finishReason,
            usageMetadata: response.response?.usageMetadata,
          },
        };
        results.push(result);
        imagesWritten++;
      } catch (error) {
        errors.push(`Failed to apply result for ${task.key}: ${error}`);
        failed++;
      }
    }
  }

  // Write DLQ if there are entries
  if (dlq.length > 0) {
    const dlqPath = join(options.artifactDir, 'failed');
    await mkdir(dlqPath, { recursive: true });
    await writeFile(join(dlqPath, 'dlq.json'), JSON.stringify(dlq, null, 2), 'utf-8');
  }

  return {
    imagesWritten,
    yamlUpdated,
    failed,
    results,
    dlq,
    errors,
  };
}

/**
 * Write image file from base64 data
 */
async function writeImageFile(
  outputDir: string,
  baseName: string,
  base64Data: string,
  mimeType: string
): Promise<string> {
  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }

  // Determine extension from MIME type
  const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png';
  const fileName = `${baseName}.${ext}`;
  const outputPath = join(outputDir, fileName);

  // Decode and write
  const buffer = Buffer.from(base64Data, 'base64');
  await writeFile(outputPath, buffer);

  return outputPath;
}

/**
 * Update a location's imagery.yaml inventory with a generated image entry
 */
async function updateLocationInventory(
  task: BatchTask,
  outputPath: string,
  batchRunId: string,
  createBackup: boolean
): Promise<void> {
  const targetMetadata = task.targetMetadata || {};
  const imageType =
    typeof targetMetadata.image_type === 'string' ? targetMetadata.image_type : undefined;
  const title =
    typeof targetMetadata.title === 'string'
      ? targetMetadata.title
      : typeof targetMetadata.name === 'string'
        ? targetMetadata.name
        : undefined;
  const promptSpecSlug =
    typeof targetMetadata.prompt_spec_slug === 'string'
      ? targetMetadata.prompt_spec_slug
      : undefined;

  const entry = createGeneratedImageInventoryEntry({
    entityType: 'location',
    entitySlug: task.entitySlug,
    targetId: task.targetId,
    promptSpecSlug,
    outputPath,
    model: task.model,
    provider: 'google',
    promptUsed: task.prompt,
    negativePromptUsed: task.negativePrompt,
    irHash: task.irHash,
    constraints: {
      aspect_ratio: task.config.aspectRatio,
      size: task.config.size,
      orientation: task.config.orientation,
      quality: task.config.quality,
    },
    providerMetadata: {
      batch_run_id: batchRunId,
      task_key: task.key,
    },
    targetMetadata: targetMetadata as Record<string, unknown>,
    title,
    imageType,
  });

  await appendLocationImageInventory({
    slug: task.entitySlug,
    targetId: task.targetId,
    entry,
    createBackup,
  });
}

/**
 * Update a chapter's imagery.yaml inventory with a generated image entry
 */
async function updateChapterInventory(
  task: BatchTask,
  outputPath: string,
  batchRunId: string,
  createBackup: boolean
): Promise<void> {
  const targetMetadata = task.targetMetadata || {};
  const imageType =
    typeof targetMetadata.image_type === 'string' ? targetMetadata.image_type : undefined;
  const title =
    typeof targetMetadata.title === 'string'
      ? targetMetadata.title
      : typeof targetMetadata.name === 'string'
        ? targetMetadata.name
        : undefined;
  const promptSpecSlug =
    typeof targetMetadata.custom_id === 'string'
      ? targetMetadata.custom_id
      : typeof targetMetadata.prompt_spec_slug === 'string'
        ? targetMetadata.prompt_spec_slug
        : undefined;

  const entry = createGeneratedImageInventoryEntry({
    entityType: 'chapter',
    entitySlug: task.entitySlug,
    targetId: task.targetId,
    promptSpecSlug,
    outputPath,
    model: task.model,
    provider: 'google',
    promptUsed: task.prompt,
    negativePromptUsed: task.negativePrompt,
    irHash: task.irHash,
    constraints: {
      aspect_ratio: task.config.aspectRatio,
      size: task.config.size,
      orientation: task.config.orientation,
      quality: task.config.quality,
    },
    providerMetadata: {
      batch_run_id: batchRunId,
      task_key: task.key,
    },
    targetMetadata: targetMetadata as Record<string, unknown>,
    title,
    imageType,
  });

  await appendChapterImageInventory({
    slug: task.entitySlug,
    targetId: task.targetId,
    entry,
    createBackup,
  });
}

/**
 * Update the imagery.runs.yaml file with a new generation record (non-location entities)
 */
async function updateRunsFile(
  entityType: EntityType,
  entitySlug: string,
  task: BatchTask,
  outputPath: string,
  batchRunId: string,
  createBackup: boolean
): Promise<void> {
  // Load existing runs file
  let runsFile = await readRunsFile(entityType, entitySlug);

  // Create new file if doesn't exist
  if (!runsFile) {
    runsFile = {
      entity_type: entityType === 'character' ? 'chapter' : entityType, // Adjust type
      entity_slug: entitySlug,
      runs: [],
    };
  }

  // Create backup if requested
  if (createBackup) {
    const { getRunsPath } = await import('../imagery-yaml.js');
    const runsPath = getRunsPath(entityType, entitySlug);
    if (existsSync(runsPath)) {
      const backupPath = `${runsPath}.bak`;
      await copyFile(runsPath, backupPath);
    }
  }

  // Create generation run record
  const run: GenerationRun = {
    run_id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    target_id: task.targetId,
    timestamp: new Date().toISOString(),
    file_name: outputPath.split('/').pop() || '',
    file_path: outputPath,
    provider: 'google',
    model: task.model,
    ir_hash: task.irHash,
    prompt_used: task.prompt,
    negative_prompt_used: task.negativePrompt || '',
    reference_images: task.referenceImages.map((ref) => ({
      asset_id: ref.path.split('/').pop() || '',
      path: ref.path,
      role: ref.role,
    })),
    constraints: {
      aspect_ratio: task.config.aspectRatio || '1:1',
      size: task.config.size || '1024x1024',
      orientation: task.config.orientation || 'landscape',
      quality: task.config.quality,
    },
    provider_metadata: {
      batch_run_id: batchRunId,
      task_key: task.key,
    },
    target_metadata: task.targetMetadata as any,
  };

  // Append run
  runsFile.runs.push(run);

  // Write file atomically
  await writeRunsFile(entityType, entitySlug, runsFile);
}

/**
 * Check if an error code is retryable
 */
function isRetryableError(code: number): boolean {
  // Rate limiting, server errors
  return code === 429 || code >= 500;
}

/**
 * Get results summary for reporting
 */
export function summarizeResults(results: BatchTaskResult[]): {
  total: number;
  success: number;
  failed: number;
  skipped: number;
  byStatus: Record<BatchTaskStatus, number>;
} {
  const byStatus: Record<BatchTaskStatus, number> = {
    success: 0,
    failed: 0,
    skipped: 0,
  };

  for (const result of results) {
    byStatus[result.status]++;
  }

  return {
    total: results.length,
    success: byStatus.success,
    failed: byStatus.failed,
    skipped: byStatus.skipped,
    byStatus,
  };
}

/**
 * Apply an analysis result (text response) to the appropriate YAML file
 */
async function applyAnalysisResult(
  task: BatchTask,
  textResult: string,
  options: ApplyOptions
): Promise<AnalysisApplyResult> {
  const analysisType = task.targetMetadata?.analysis_type as string;

  if (analysisType === 'appearance') {
    // Update character imagery.yaml with appearance text
    return await applyAppearanceResult(task, textResult);
  } else if (analysisType === 'image_analysis') {
    // Parse JSON and update image_inventory entry
    return await applyImageAnalysisResult(task, textResult);
  }

  return { status: 'error', reason: `Unknown analysis type: ${analysisType}` };
}

/**
 * Apply appearance extraction result to character imagery.yaml
 */
async function applyAppearanceResult(
  task: BatchTask,
  appearanceText: string
): Promise<AnalysisApplyResult> {
  try {
    let charImagery = (await readImageryYaml('character', task.entitySlug)) as CharacterImagery | null;

    if (!charImagery) {
      // Create new imagery.yaml if doesn't exist
      charImagery = {
        entity_type: 'character',
        slug: task.entitySlug,
        appearance: appearanceText,
        prompts: [],
        image_inventory: [],
      };
    } else {
      charImagery.appearance = appearanceText;
    }

    await writeImageryYaml('character', task.entitySlug, charImagery);

    // IMPORTANT: Ensure portrait.png is marked as reference
    await ensureReferencePortraitEntry(task.entitySlug);

    return {
      status: 'success',
      entityType: 'character',
      entitySlug: task.entitySlug,
      targetId: task.targetId,
      message: 'Appearance extracted',
    };
  } catch (error) {
    return {
      status: 'error',
      reason: `Failed to write appearance: ${error}`,
    };
  }
}

/**
 * Apply image analysis result (YAML) to character imagery.yaml image_inventory
 */
async function applyImageAnalysisResult(
  task: BatchTask,
  analysisYaml: string
): Promise<AnalysisApplyResult> {
  try {
    // Parse YAML from Gemini response
    const parsed = parseYaml(analysisYaml);

    // Validate against schema to ensure required fields are present
    const validationResult = safeValidateImageInventoryEntry(parsed);
    if (!validationResult.success) {
      const errors = formatValidationErrors(validationResult.error);
      return {
        status: 'error',
        reason: `Invalid analysis response: ${errors}`,
      };
    }

    // Cast to ImageInventoryEntry - safe since Zod schema matches the TypeScript type
    const entry = validationResult.data as ImageInventoryEntry;

    // Rename analyzed file to short name format if suggested
    const originalFilename = task.targetMetadata?.filename as string | undefined;
    const referencePath = task.referenceImages?.[0]?.path;
    const firstNameSource =
      typeof task.targetMetadata?.name === 'string' ? task.targetMetadata?.name : task.entitySlug;
    const firstNameSlug = getFirstNameSlug(firstNameSource);
    const suggested = entry.content?.suggested_filename;
    let effectiveFilename = originalFilename;

    if (referencePath && suggested && firstNameSlug) {
      const suggestedSlug = slugifyToken(suggested);
      if (suggestedSlug) {
        const imagesDir = _dirname(referencePath);
        const ext = extname(referencePath) || (originalFilename ? extname(originalFilename) : '.png');
        const newFileName = buildShortNameFilename(
          firstNameSlug,
          suggestedSlug,
          ext || '.png',
          imagesDir,
          referencePath
        );

        if (newFileName) {
          const currentName = basename(referencePath);
          if (newFileName.toLowerCase() !== currentName.toLowerCase()) {
            await rename(referencePath, join(imagesDir, newFileName));
          }
          entry.path = `images/${newFileName}`;
          entry.provenance = entry.provenance || {};
          entry.provenance.original_filename = newFileName;
          effectiveFilename = newFileName;
        }
      }
    }

    // Load existing imagery.yaml
    const charImagery = (await readImageryYaml('character', task.entitySlug)) as CharacterImagery | null;
    if (!charImagery) {
      return {
        status: 'error',
        reason: 'No imagery.yaml found - run appearance extraction first',
      };
    }

    const inventory = charImagery.image_inventory || [];

    // Find existing entry by filename
    const filename = effectiveFilename || (task.targetMetadata?.filename as string);
    const existingIndex = inventory.findIndex(
      (e) => e.path === `images/${filename}` || e.path.endsWith(`/${filename}`)
    );

    if (existingIndex >= 0) {
      // Update existing entry, preserve id
      const existingId = inventory[existingIndex].id;
      inventory[existingIndex] = { ...entry, id: existingId };
    } else {
      // Add new entry
      inventory.push(entry);
    }

    charImagery.image_inventory = inventory;
    await writeImageryYaml('character', task.entitySlug, charImagery);

    return {
      status: 'success',
      entityType: 'character',
      entitySlug: task.entitySlug,
      targetId: task.targetId,
      message: `Analyzed ${filename}`,
    };
  } catch (error) {
    return {
      status: 'error',
      reason: `Failed to apply analysis: ${error}`,
    };
  }
}

function getFirstNameSlug(nameOrSlug: string): string {
  const firstToken = nameOrSlug.trim().split(/\s+/)[0];
  const fallback = nameOrSlug.split('-')[0];
  return slugifyToken(firstToken || fallback);
}

function slugifyToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildShortNameFilename(
  firstNameSlug: string,
  suggestedSlug: string,
  ext: string,
  imagesDir: string,
  currentPath: string
): string | null {
  if (!firstNameSlug || !suggestedSlug) {
    return null;
  }

  let index = 1;
  while (index < 100) {
    const suffix = String(index).padStart(2, '0');
    const candidate = `${firstNameSlug}-${suggestedSlug}-${suffix}${ext}`;
    const candidatePath = join(imagesDir, candidate);
    if (!existsSync(candidatePath) || candidatePath === currentPath) {
      return candidate;
    }
    index += 1;
  }

  return null;
}

/**
 * Ensure portrait.png is marked as is_reference_portrait in imagery.yaml
 */
async function ensureReferencePortraitEntry(slug: string): Promise<void> {
  const portraitPath = getCharacterReferencePortrait(slug);
  if (!portraitPath) return;

  const charImagery = (await readImageryYaml('character', slug)) as CharacterImagery | null;
  if (!charImagery) return;

  const inventory = charImagery.image_inventory || [];
  const filename = 'portrait.png';
  const relativePath = `images/${filename}`;

  // Check if portrait entry exists
  const existingEntry = inventory.find(
    (e) => e.path === relativePath || e.path.endsWith(`/${filename}`)
  );

  if (existingEntry) {
    // Update existing entry
    existingEntry.is_reference_portrait = true;
  } else {
    // Create new entry for portrait.png
    const newEntry: ImageInventoryEntry = {
      id: `${slug}-portrait`,
      path: relativePath,
      type: 'imported',
      is_reference_portrait: true,
      content: {
        title: 'Reference Portrait',
        description: 'Canonical reference portrait for character consistency',
        alt_text: 'Reference portrait for character visual consistency',
        tags: ['portrait', 'reference'],
      },
      status: 'approved',
      provenance: {
        source: 'manual',
        created_at: new Date().toISOString(),
        original_filename: filename,
      },
    };
    inventory.push(newEntry);
  }

  charImagery.image_inventory = inventory;
  await writeImageryYaml('character', slug, charImagery);
}
