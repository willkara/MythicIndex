/**
 * Batch image generation workflow
 *
 * Handles the main batch generation pipeline including planning,
 * staging, submission, execution, and result application.
 */

import { select, confirm, input } from '@inquirer/prompts';
import chalk from 'chalk';
import {
  showSection,
  showInfo,
  showSuccess,
  showError,
  showWarning,
  newLine,
  showSectionBox,
  createProgressBar,
  showCostEstimate,
  showStat,
} from '../../ui/display.js';
import type { BatchEntityType, BatchConfig, BatchPlan } from '../../types/batch.js';
import { createBatchPlan, type BatchPlanOptions } from '../../services/batch/planners/index.js';
import {
  createRunState,
  saveRunState,
  updatePhase,
  getArtifactDir,
} from '../../services/batch/state.js';
import { acquireLock, releaseLock } from '../../services/batch/lock.js';
import { uploadTaskReferences } from '../../services/batch/uploader.js';
import { submitBatch } from '../../services/batch/submit.js';
import { executeBatch } from '../../services/batch/executor.js';
import { applyResults } from '../../services/batch/apply.js';
import { generateReport, formatReportForConsole, saveReport } from '../../services/batch/report.js';
import { getDefaultConfig, getApiKey } from './helpers.js';

type EntityScope = 'all' | 'characters' | 'locations' | 'chapters';

/**
 * Main batch generation workflow
 */
export async function runBatchGenerationWorkflow(): Promise<void> {
  showSection('Batch Image Generation');

  // Check API key
  const apiKey = getApiKey();
  if (!apiKey) {
    showError('Google API key not configured. Please set it in settings first.');
    newLine();
    return;
  }

  // Step 1: Select entity scope
  const scopeChoice = await select<EntityScope>({
    message: 'What would you like to generate?',
    choices: [
      {
        name: 'All Entities',
        value: 'all',
        description: 'Characters, locations, and chapters',
      },
      {
        name: 'Characters Only',
        value: 'characters',
        description: 'Character portraits and scenes',
      },
      {
        name: 'Locations Only',
        value: 'locations',
        description: 'Location establishing shots and zones',
      },
      {
        name: 'Chapters Only',
        value: 'chapters',
        description: 'Chapter illustration images',
      },
    ],
  });

  const entityTypes: BatchEntityType[] =
    scopeChoice === 'all'
      ? ['character', 'location', 'chapter']
      : [scopeChoice.slice(0, -1) as BatchEntityType]; // Remove 's' suffix

  // Step 2: Optional slug filter
  const filterBySlug = await confirm({
    message: 'Filter by specific entity slug?',
    default: false,
  });

  let slugFilter: string[] | undefined;
  if (filterBySlug) {
    const slugInput = await input({
      message: 'Enter entity slug(s) (comma-separated):',
    });
    slugFilter = slugInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // Step 3: Dry run first?
  const dryRun = await confirm({
    message: 'Preview plan without executing (dry run)?',
    default: true,
  });

  // Step 4: Force regeneration for locations/chapters?
  let forceLocations = false;
  let forceChapters = false;

  if (entityTypes.includes('location')) {
    forceLocations = await confirm({
      message: 'Force regenerate ALL location images (ignore existing inventory)?',
      default: false,
    });
  }

  if (entityTypes.includes('chapter')) {
    forceChapters = await confirm({
      message: 'Force regenerate ALL chapter images (ignore existing runs)?',
      default: false,
    });
  }

  const config = getDefaultConfig();

  // Build planner options
  const plannerOptions: BatchPlanOptions = {
    entityTypes,
    kinds: ['generate'],
    slugFilter,
    skipGenerated: {
      character: true,
      location: !forceLocations,
      chapter: !forceChapters,
    },
    config,
    dryRun,
  };

  // Phase: Planning
  showSection('Planning');
  showInfo('Scanning entities and compiling prompts...');
  newLine();

  let planResult;
  try {
    planResult = await createBatchPlan(plannerOptions);
  } catch (error) {
    showError(`Planning failed: ${(error as Error).message}`);
    newLine();
    return;
  }

  const plan = planResult.plan;

  if (plan.tasks.length === 0) {
    showWarning('No tasks to execute. All targets may already be generated.');

    // Display planning errors if any
    if (planResult.errors.length > 0) {
      newLine();
      showWarning('Planning encountered the following issues:');
      for (const error of planResult.errors) {
        console.log(`  • ${error}`);
      }
    }

    newLine();
    return;
  }

  // Show enhanced plan summary with costs and estimates
  showSectionBox('BATCH GENERATION PLAN');

  console.log('Scope:');
  // Count unique entities by type
  const entitiesByType: Record<string, Set<string>> = {};
  for (const task of plan.tasks) {
    if (!entitiesByType[task.entityType]) {
      entitiesByType[task.entityType] = new Set();
    }
    entitiesByType[task.entityType].add(task.entitySlug);
  }

  for (const [type, count] of Object.entries(plan.summary.byEntityType)) {
    if (count > 0) {
      const entityNames = Array.from(entitiesByType[type] || []).slice(0, 3).join(', ');
      const entityDisplay = Array.from(entitiesByType[type] || []).length > 3 ? `${entityNames}...` : entityNames;
      showStat(`${type}s`, `${entitiesByType[type]?.size || 0} (${entityDisplay})`);
    }
  }
  showStat('Total scenes', plan.summary.totalTasks);
  showStat('Already generated', plan.summary.skippedAlreadyGenerated);
  showStat('New to generate', plan.summary.totalTasks - plan.summary.skippedAlreadyGenerated);

  newLine();
  console.log('Cost Estimate:');
  // Standard pricing: ~$0.134 per image
  // Batch pricing: ~$0.067 per image (50% discount)
  const imageCount = plan.summary.totalTasks;
  const standardCost = imageCount * 0.134;
  const batchCost = imageCount * 0.067;
  showStat('Model', plan.config.model);
  showCostEstimate(standardCost, batchCost);

  newLine();
  console.log('Time Estimate:');
  // Rough estimate: 1-2 minutes per image
  const minTime = imageCount * 1;
  const maxTime = imageCount * 2;
  showStat('Per image', '~1-2 min');
  showStat('Total duration', `~${minTime}-${maxTime} min`);
  showStat('Jobs', `1 (${imageCount} tasks per job)`);

  newLine();
  console.log('Storage:');
  // Rough estimate: 8 MB per image
  const estStorage = imageCount * 8;
  showStat('Est. output', `~${estStorage} MB (${imageCount} images × ~8 MB avg)`);

  newLine();

  if (dryRun) {
    showInfo('Dry run complete. No changes made.');

    const proceed = await confirm({
      message: 'Execute this plan now?',
      default: false,
    });

    if (!proceed) {
      newLine();
      return;
    }
  }

  // Execute the batch pipeline
  await executeBatchPipeline(plan, config, apiKey);
}

/**
 * Execute the full batch pipeline
 */
export async function executeBatchPipeline(
  plan: BatchPlan,
  config: BatchConfig,
  apiKey: string
): Promise<void> {
  const artifactDir = getArtifactDir(config.artifactDir, plan.runId);

  // Acquire lock
  const lockResult = await acquireLock(artifactDir, plan.runId);
  if (!lockResult.acquired) {
    if (lockResult.existingLock) {
      showError(
        `Another batch run is already in progress:\n` +
          `  Run ID: ${lockResult.existingLock.runId}\n` +
          `  PID: ${lockResult.existingLock.pid}\n` +
          `  Started: ${lockResult.existingLock.acquiredAt}\n` +
          `  Host: ${lockResult.existingLock.hostname}`
      );
    } else {
      showError('Failed to acquire lock (check console for details)');
    }
    newLine();
    return;
  }

  // Create initial state
  let state = createRunState(plan.runId, plan.scope, config);

  try {
    state = updatePhase(state, 'planned');
    await saveRunState(artifactDir, state);

    showSection('Execution');
    console.log(chalk.dim(`Run ID: ${plan.runId}`));
    console.log(chalk.dim(`Artifacts: ${artifactDir}`));
    newLine();

    // Phase: Staging (upload reference images)
    newLine();
    showSectionBox('PHASE 1/4: STAGING REFERENCE IMAGES');
    state = updatePhase(state, 'staging');
    await saveRunState(artifactDir, state);

    console.log('Upload Progress:');
    let lastProgress: { completed: number; skipped: number; total: number } | null = null;

    const uploadResult = await uploadTaskReferences(plan.tasks, apiKey, artifactDir, {
      concurrency: config.uploadConcurrency,
    }, (progress) => {
      lastProgress = progress;
      const progressStr = createProgressBar(progress.completed + progress.skipped, progress.total, 20);
      process.stdout.write(`\r  ${progressStr}`);
    });

    if (lastProgress) {
      process.stdout.write('\n');
    }
    newLine();

    // Show upload summary
    console.log('Status:');
    if (uploadResult.stats.uploaded > 0) {
      const uploadedMB = (uploadResult.stats.totalBytes / (1024 * 1024)).toFixed(1);
      showStat('Uploaded', `${uploadResult.stats.uploaded} files (${uploadedMB} MB)`);
    }
    if (uploadResult.stats.cached > 0) {
      showStat('Cached', uploadResult.stats.cached + ' files');
    }
    if (uploadResult.stats.failed > 0) {
      showStat('Failed', uploadResult.stats.failed + ' files');
    }
    newLine();

    showSuccess(`Staging complete: ${uploadResult.stats.uploaded + uploadResult.stats.cached} files ready`);
    state = updatePhase(state, 'staged');
    await saveRunState(artifactDir, state);

    // Phase: Submission
    newLine();
    showSectionBox('PHASE 2/4: SUBMITTING BATCH JOBS');

    const submitResult = await submitBatch(uploadResult.tasks, state, {
      artifactDir,
      apiKey,
      config,
    });

    state = submitResult.state;
    await saveRunState(artifactDir, state);

    // Check for submission errors
    if (submitResult.errors.length > 0) {
      showError('Batch submission failed:');
      for (const error of submitResult.errors) {
        console.error(`  ${error}`);
      }
      newLine();
      await releaseLock(artifactDir, state.runId);
      return;
    }

    // Check if any jobs were submitted
    if (state.jobs.length === 0) {
      showError('No jobs were submitted. Check console for errors.');
      newLine();
      await releaseLock(artifactDir, state.runId);
      return;
    }

    console.log('Job Submission:');
    for (const job of state.jobs) {
      showStat(`Job ${job.jobId?.substring(0, 8)}...`, `${job.taskCount || 0} tasks`);
    }
    newLine();
    showSuccess(`Submitted ${state.jobs.length} job(s)`);

    // Phase: Execution (polling)
    newLine();
    showSectionBox('PHASE 3/4: EXECUTING BATCH JOBS');
    state = updatePhase(state, 'running');
    await saveRunState(artifactDir, state);

    console.log('Job Progress:');
    const startTime = Date.now();
    let lastUpdate = startTime;

    const executeResult = await executeBatch(
      state,
      {
        artifactDir,
        apiKey,
        config,
      },
      (progress) => {
        const now = Date.now();
        const completed = progress.jobs.filter(
          (j) => j.state?.includes('SUCCEEDED') || j.state?.includes('FAILED')
        ).length;

        if (now - lastUpdate > 1000) { // Only update every 1 second
          const progressStr = createProgressBar(completed, progress.jobs.length, 20);
          process.stdout.write(`\r  ${progressStr}`);
          lastUpdate = now;
        }
      }
    );
    process.stdout.write('\n');
    newLine();

    state = executeResult.state;
    const executionTime = (Date.now() - startTime) / 1000 / 60; // minutes

    // Show execution stats
    console.log('Execution Stats:');
    const totalTasks = state.jobs.reduce((sum, j) => sum + (j.taskCount || 0), 0);

    showStat('Total tasks', totalTasks);
    showStat('Result files', executeResult.resultFiles.length);
    showStat('Throughput', `${(totalTasks / executionTime).toFixed(2)} tasks/min`);
    showStat('Total time', `${executionTime.toFixed(1)}m`);
    newLine();

    // Check for execution errors
    if (executeResult.errors.length > 0) {
      showWarning('Execution encountered some errors:');
      for (const error of executeResult.errors.slice(0, 3)) {
        console.log(chalk.dim(`  • ${error}`));
      }
      if (executeResult.errors.length > 3) {
        console.log(chalk.dim(`  ... and ${executeResult.errors.length - 3} more`));
      }
      newLine();
    }

    // Check if results were downloaded
    if (executeResult.resultFiles.length === 0) {
      showError('No results were downloaded. Check errors above.');
      newLine();
      state = updatePhase(state, 'failed');
      await saveRunState(artifactDir, state);
      await releaseLock(artifactDir, state.runId);
      return;
    }

    // Phase: Downloading results
    newLine();
    showSectionBox('PHASE 4/4: APPLYING BATCH RESULTS');
    state = updatePhase(state, 'downloading');
    await saveRunState(artifactDir, state);

    console.log('Downloading Results:');
    const downloadProgress = createProgressBar(executeResult.resultFiles.length, executeResult.resultFiles.length, 20);
    console.log(`  ${downloadProgress}`);
    newLine();

    // Apply results
    state = updatePhase(state, 'applying');
    await saveRunState(artifactDir, state);

    console.log('Writing Generated Images:');
    const applyResult = await applyResults(plan, executeResult.resultFiles, state, {
      artifactDir,
      createBackups: true,
    });

    // Show apply summary
    const successCount = applyResult.results.filter(r => r.status === 'success').length;
    const writeProgress = createProgressBar(
      successCount,
      applyResult.results.length,
      20
    );
    console.log(`  ${writeProgress}`);
    newLine();

    console.log('Updating Metadata:');
    showStat('Created backup', applyResult.results.length > 0 ? 'yes' : 'no');
    showStat('Updated entries', successCount);
    newLine();

    // Generate report
    const report = generateReport(plan, state, applyResult.results, applyResult.dlq);
    await saveReport(report, artifactDir);

    // Update final state
    state = updatePhase(state, applyResult.failed > 0 ? 'failed' : 'completed');
    await saveRunState(artifactDir, state);

    // Show results
    newLine();
    console.log(formatReportForConsole(report));
    newLine();

    if (applyResult.failed > 0) {
      showWarning(`${applyResult.failed} tasks failed. Check DLQ for details.`);
    } else {
      showSuccess('Batch generation completed successfully!');
    }
  } catch (error) {
    state = updatePhase(state, 'failed');
    state.error = (error as Error).message;
    await saveRunState(artifactDir, state);

    showError(`Batch failed: ${(error as Error).message}`);
  } finally {
    await releaseLock(artifactDir, plan.runId);
  }

  newLine();
}
