/**
 * Batch run management workflows
 *
 * Handles resumption of interrupted runs, history browsing,
 * and dead letter queue (DLQ) management.
 */

import { select, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import {
  showSection,
  showInfo,
  showSuccess,
  showError,
  showWarning,
  newLine,
} from '../../ui/display.js';
import type { BatchConfig, BatchPlan, BatchRunState } from '../../types/batch.js';
import {
  loadRunState,
  saveRunState,
  updatePhase,
  getArtifactDir,
  canResumeFrom,
  listRuns,
} from '../../services/batch/state.js';
import { acquireLock, releaseLock } from '../../services/batch/lock.js';
import { uploadTaskReferences } from '../../services/batch/uploader.js';
import { submitBatch } from '../../services/batch/submit.js';
import { executeBatch } from '../../services/batch/executor.js';
import { applyResults } from '../../services/batch/apply.js';
import { generateReport, formatReportForConsole, saveReport } from '../../services/batch/report.js';
import { loadDLQ, formatDLQForConsole, getDLQStats } from '../../services/batch/dlq.js';
import { getDefaultConfig, getApiKey } from './helpers.js';

/**
 * Resume an interrupted batch run
 */
export async function runResumeWorkflow(): Promise<void> {
  showSection('Resume Interrupted Run');

  const config = getDefaultConfig();

  // List available runs
  const runs = await listRuns(config.artifactDir);

  if (runs.length === 0) {
    showWarning('No batch runs found to resume');
    newLine();
    return;
  }

  // Filter to resumable runs
  const resumableRuns: Array<{ runId: string; state: BatchRunState }> = [];

  for (const runId of runs) {
    const artifactDir = getArtifactDir(config.artifactDir, runId);
    const state = await loadRunState(artifactDir);
    if (state && canResumeFrom(state) !== null) {
      resumableRuns.push({ runId, state });
    }
  }

  if (resumableRuns.length === 0) {
    showInfo('No runs available for resumption');
    newLine();
    return;
  }

  const choices = resumableRuns.map(({ runId, state }) => ({
    name: `${runId} - ${state.phase} (${state.jobs.length} jobs)`,
    value: runId,
    description: `Last updated: ${state.timestamps.created}`,
  }));

  choices.push({
    name: chalk.dim('Cancel'),
    value: 'cancel',
    description: '',
  });

  const selectedRun = await select({
    message: 'Select run to resume:',
    choices,
  });

  if (selectedRun === 'cancel') {
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    showError('Google API key not configured.');
    newLine();
    return;
  }

  const artifactDir = getArtifactDir(config.artifactDir, selectedRun);
  const state = await loadRunState(artifactDir);

  if (!state) {
    showError('Could not load run state');
    newLine();
    return;
  }

  // Load the plan
  const planPath = join(artifactDir, 'plan.json');

  if (!existsSync(planPath)) {
    showError('Plan file not found');
    newLine();
    return;
  }

  const plan = JSON.parse(await readFile(planPath, 'utf-8')) as BatchPlan;

  showInfo(`Resuming from phase: ${state.phase}`);
  newLine();

  // Acquire lock
  const lockResult = await acquireLock(artifactDir, state.runId);
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

  try {
    // Resume based on current phase
    await resumeFromPhase(state, plan, config, apiKey, artifactDir);
  } finally {
    await releaseLock(artifactDir, state.runId);
  }
}

/**
 * Resume execution from a specific phase
 */
async function resumeFromPhase(
  state: BatchRunState,
  plan: BatchPlan,
  config: BatchConfig,
  apiKey: string,
  artifactDir: string
): Promise<void> {
  showSection('Resuming Execution');
  console.log(chalk.dim(`Run ID: ${state.runId}`));
  console.log(chalk.dim(`Resuming from: ${state.phase}`));
  newLine();

  let currentState = state;

  try {
    // Continue from appropriate phase
    if (currentState.phase === 'staging' || currentState.phase === 'planned') {
      showInfo('Resuming: Uploading reference images...');
      const uploadResult = await uploadTaskReferences(plan.tasks, apiKey, artifactDir, {
        concurrency: config.uploadConcurrency,
      });
      currentState = updatePhase(currentState, 'staged');
      await saveRunState(artifactDir, currentState);

      // Update tasks with uploaded URIs for submission
      plan.tasks = uploadResult.tasks;
    }

    if (currentState.phase === 'staged') {
      showInfo('Resuming: Submitting batch jobs...');
      const submitResult = await submitBatch(plan.tasks, currentState, {
        artifactDir,
        apiKey,
        config,
      });
      currentState = submitResult.state;
      await saveRunState(artifactDir, currentState);
    }

    if (currentState.phase === 'submitted' || currentState.phase === 'running') {
      showInfo('Resuming: Waiting for job completion...');
      currentState = updatePhase(currentState, 'running');
      await saveRunState(artifactDir, currentState);

      const executeResult = await executeBatch(currentState, {
        artifactDir,
        apiKey,
        config,
      });
      currentState = executeResult.state;

      // Apply results
      currentState = updatePhase(currentState, 'applying');
      await saveRunState(artifactDir, currentState);

      const applyResult = await applyResults(plan, executeResult.resultFiles, currentState, {
        artifactDir,
        createBackups: true,
      });

      const report = generateReport(plan, currentState, applyResult.results, applyResult.dlq);
      await saveReport(report, artifactDir);

      currentState = updatePhase(currentState, applyResult.failed > 0 ? 'failed' : 'completed');
      await saveRunState(artifactDir, currentState);

      newLine();
      console.log(formatReportForConsole(report));
    }

    showSuccess('Resume completed!');
  } catch (error) {
    currentState = updatePhase(currentState, 'failed');
    currentState.error = (error as Error).message;
    await saveRunState(artifactDir, currentState);
    showError(`Resume failed: ${(error as Error).message}`);
  }

  newLine();
}

/**
 * Browse batch run history
 */
export async function runHistoryBrowser(): Promise<void> {
  showSection('Batch Run History');

  const config = getDefaultConfig();
  const runs = await listRuns(config.artifactDir);

  if (runs.length === 0) {
    showInfo('No batch runs found');
    newLine();
    return;
  }

  // Load run summaries
  const runSummaries: Array<{
    runId: string;
    state?: BatchRunState | null;
    summary?: string;
  }> = [];

  for (const runId of runs.slice(0, 20)) {
    const artifactDir = getArtifactDir(config.artifactDir, runId);
    const state = await loadRunState(artifactDir);

    let summary = 'Unknown';
    if (state) {
      summary = `${state.phase} - ${state.jobs.length} jobs`;
    }

    runSummaries.push({ runId, state, summary });
  }

  const choices = runSummaries.map(({ runId, summary }) => ({
    name: `${runId} - ${summary}`,
    value: runId,
  }));

  choices.push({
    name: chalk.dim('Back'),
    value: 'back',
  });

  const selectedRun = await select({
    message: 'Select run to view:',
    choices,
  });

  if (selectedRun === 'back') {
    return;
  }

  // Show run details
  const artifactDir = getArtifactDir(config.artifactDir, selectedRun);
  const reportPath = join(artifactDir, 'report.json');

  if (existsSync(reportPath)) {
    const report = JSON.parse(await readFile(reportPath, 'utf-8'));
    console.log(formatReportForConsole(report));
  } else {
    const state = await loadRunState(artifactDir);
    if (state) {
      showSection('Run State');
      console.log(`  Run ID: ${state.runId}`);
      console.log(`  Phase: ${state.phase}`);
      console.log(`  Jobs: ${state.jobs.length}`);
      console.log(`  Created: ${state.timestamps.created}`);
      if (state.error) {
        console.log(chalk.red(`  Error: ${state.error}`));
      }
    }
  }

  newLine();
}

/**
 * Manage dead letter queue
 */
export async function runDLQManager(): Promise<void> {
  showSection('Dead Letter Queue Manager');

  const config = getDefaultConfig();
  const runs = await listRuns(config.artifactDir);

  // Find runs with DLQ entries
  const runsWithDLQ: Array<{ runId: string; entryCount: number }> = [];

  for (const runId of runs) {
    const artifactDir = getArtifactDir(config.artifactDir, runId);
    const dlq = await loadDLQ(artifactDir);
    if (dlq.entries.length > 0) {
      runsWithDLQ.push({ runId, entryCount: dlq.entries.length });
    }
  }

  if (runsWithDLQ.length === 0) {
    showSuccess('No failed tasks in any run');
    newLine();
    return;
  }

  const choices = runsWithDLQ.map(({ runId, entryCount }) => ({
    name: `${runId} - ${entryCount} failed task(s)`,
    value: runId,
  }));

  choices.push({
    name: chalk.dim('Back'),
    value: 'back',
  });

  const selectedRun = await select({
    message: 'Select run to view DLQ:',
    choices,
  });

  if (selectedRun === 'back') {
    return;
  }

  const artifactDir = getArtifactDir(config.artifactDir, selectedRun);
  const dlq = await loadDLQ(artifactDir);

  console.log(formatDLQForConsole(dlq));
  newLine();

  const stats = getDLQStats(dlq);

  if (stats.retryable > 0) {
    const retry = await confirm({
      message: `Retry ${stats.retryable} retryable task(s)?`,
      default: false,
    });

    if (retry) {
      showInfo('Retry functionality will extract tasks and create a new batch run');
      showWarning('Full retry implementation requires integration with planner');
    }
  }

  newLine();
}
