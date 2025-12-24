/**
 * Batch Planner Orchestrator
 *
 * Coordinates planning across all entity types and generates
 * a unified BatchPlan for execution.
 */

import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import type {
  BatchTask,
  BatchPlan,
  BatchConfig,
  BatchEntityType,
  BatchTaskKind,
  DEFAULT_BATCH_CONFIG as _DEFAULT_BATCH_CONFIG,
} from '../../../types/batch.js';
import { generateRunId, getArtifactDir, createRunState, saveRunState } from '../state.js';
import { planLocationTasks, type LocationPlannerOptions } from './location-planner.js';
import { planChapterTasks, type ChapterPlannerOptions } from './chapter-planner.js';
import { planCharacterTasks, type CharacterPlannerOptions } from './character-planner.js';

// Re-export individual planners
export * from './location-planner.js';
export * from './chapter-planner.js';
export * from './character-planner.js';
export * from './analysis-planner.js';
export * from './character-analysis-planner.js';

/** Options for batch planning */
export interface BatchPlanOptions {
  /** Entity types to include */
  entityTypes: BatchEntityType[];
  /** Task kinds to include */
  kinds: BatchTaskKind[];
  /** Filter to specific entity slugs */
  slugFilter?: string[];
  /** Skip already generated targets (global or per-entity) */
  skipGenerated?: boolean | Partial<Record<BatchEntityType, boolean>>;
  /** Batch configuration */
  config: BatchConfig;
  /** Run ID (generated if not provided) */
  runId?: string;
  /** Dry run - don't write plan files */
  dryRun?: boolean;
}

/** Result from batch planning */
export interface BatchPlanResult {
  plan: BatchPlan;
  artifactDir: string;
  errors: string[];
}

function resolveSkipGenerated(
  options: BatchPlanOptions,
  entityType: BatchEntityType
): boolean | undefined {
  if (typeof options.skipGenerated === 'boolean' || options.skipGenerated === undefined) {
    return options.skipGenerated;
  }

  return options.skipGenerated[entityType];
}

/**
 * Create a batch plan for image generation
 */
export async function createBatchPlan(options: BatchPlanOptions): Promise<BatchPlanResult> {
  const runId = options.runId || generateRunId();
  const artifactDir = getArtifactDir(options.config.artifactDir, runId);
  const allTasks: BatchTask[] = [];
  const allErrors: string[] = [];
  let skippedTotal = 0;

  const byEntityType: Record<BatchEntityType, number> = {
    character: 0,
    location: 0,
    chapter: 0,
  };

  const byKind: Record<BatchTaskKind, number> = {
    generate: 0,
    analyze: 0,
  };

  // Plan for each entity type
  if (options.entityTypes.includes('location') && options.kinds.includes('generate')) {
    const locationOptions: LocationPlannerOptions = {
      slugFilter: options.slugFilter,
      skipGenerated: resolveSkipGenerated(options, 'location'),
      model: options.config.model,
    };

    const result = await planLocationTasks(locationOptions);
    allTasks.push(...result.tasks);
    allErrors.push(...result.summary.errors);
    skippedTotal += result.summary.skipped;
    byEntityType.location = result.tasks.length;
    byKind.generate += result.tasks.length;
  }

  if (options.entityTypes.includes('chapter') && options.kinds.includes('generate')) {
    const chapterOptions: ChapterPlannerOptions = {
      slugFilter: options.slugFilter,
      skipGenerated: resolveSkipGenerated(options, 'chapter'),
      model: options.config.model,
    };

    const result = await planChapterTasks(chapterOptions);
    allTasks.push(...result.tasks);
    allErrors.push(...result.summary.errors);
    skippedTotal += result.summary.skipped;
    byEntityType.chapter = result.tasks.length;
    byKind.generate += result.tasks.length;
  }

  if (options.entityTypes.includes('character') && options.kinds.includes('generate')) {
    const characterOptions: CharacterPlannerOptions = {
      slugFilter: options.slugFilter,
      skipGenerated: resolveSkipGenerated(options, 'character'),
      model: options.config.model,
    };

    const result = await planCharacterTasks(characterOptions);
    allTasks.push(...result.tasks);
    allErrors.push(...result.summary.errors);
    skippedTotal += result.summary.skipped;
    byEntityType.character = result.tasks.length;
    byKind.generate += result.tasks.length;
  }

  // Create the plan
  const plan: BatchPlan = {
    runId,
    createdAt: new Date().toISOString(),
    scope: {
      entityTypes: options.entityTypes,
      entityFilter: options.slugFilter,
      kinds: options.kinds,
    },
    config: options.config,
    summary: {
      totalTasks: allTasks.length,
      byEntityType,
      byKind,
      skippedAlreadyGenerated: skippedTotal,
    },
    tasks: allTasks,
  };

  // Write plan and state unless dry run
  if (!options.dryRun) {
    await mkdir(artifactDir, { recursive: true });

    // Write plan.json
    const planPath = join(artifactDir, 'plan.json');
    await writeFile(planPath, JSON.stringify(plan, null, 2), 'utf-8');

    // Create and save run state
    const state = createRunState(
      runId,
      {
        entityTypes: options.entityTypes,
        entityFilter: options.slugFilter,
        kinds: options.kinds,
      },
      options.config
    );
    await saveRunState(artifactDir, state);
  }

  return {
    plan,
    artifactDir,
    errors: allErrors,
  };
}

/**
 * Load an existing plan from disk
 */
export async function loadBatchPlan(artifactDir: string): Promise<BatchPlan | null> {
  const { readFile, access } = await import('fs/promises');
  const planPath = join(artifactDir, 'plan.json');

  try {
    await access(planPath);
    const content = await readFile(planPath, 'utf-8');
    return JSON.parse(content) as BatchPlan;
  } catch {
    return null;
  }
}

/**
 * Get a summary of a batch plan for display
 */
export function summarizePlan(plan: BatchPlan): {
  runId: string;
  totalTasks: number;
  byEntityType: string;
  byKind: string;
  skipped: number;
  estimatedCost: string;
} {
  const byEntityType = Object.entries(plan.summary.byEntityType)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `${type}: ${count}`)
    .join(', ');

  const byKind = Object.entries(plan.summary.byKind)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${kind}: ${count}`)
    .join(', ');

  // Rough cost estimate (Google Batch API pricing)
  // ~$0.02 per image generation
  const estimatedCost = `~$${(plan.summary.totalTasks * 0.02).toFixed(2)}`;

  return {
    runId: plan.runId,
    totalTasks: plan.summary.totalTasks,
    byEntityType: byEntityType || 'none',
    byKind: byKind || 'none',
    skipped: plan.summary.skippedAlreadyGenerated,
    estimatedCost,
  };
}

/**
 * Validate a batch plan
 */
export function validatePlan(plan: BatchPlan): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for required fields
  if (!plan.runId) errors.push('Missing runId');
  if (!plan.tasks) errors.push('Missing tasks array');
  if (!plan.config) errors.push('Missing config');

  // Check task count
  if (plan.tasks.length === 0) {
    warnings.push('No tasks in plan');
  }

  // Check for duplicate task keys
  const taskKeys = new Set<string>();
  for (const task of plan.tasks) {
    if (taskKeys.has(task.key)) {
      errors.push(`Duplicate task key: ${task.key}`);
    }
    taskKeys.add(task.key);
  }

  // Check task validity
  for (const task of plan.tasks) {
    if (!task.prompt) {
      errors.push(`Task ${task.key}: missing prompt`);
    }
    if (!task.outputDir) {
      errors.push(`Task ${task.key}: missing outputDir`);
    }
    if (!task.model) {
      errors.push(`Task ${task.key}: missing model`);
    }
  }

  // Check for very large batches
  if (plan.tasks.length > 500) {
    warnings.push(`Large batch (${plan.tasks.length} tasks) will be chunked into multiple jobs`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
