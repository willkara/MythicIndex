/**
 * Batch Job Submission
 *
 * Handles the submission of batch jobs to Google's Batch API,
 * including JSONL upload and job creation.
 */

import { join } from 'path';
import type { BatchTask, BatchConfig, BatchRunState, BatchJobInfo } from '../../types/batch.js';
import { GoogleFilesService } from '../google/files.js';
import { GoogleBatchesService, type BatchJobInfo as _GoogleJobInfo } from '../google/batches.js';
import { buildJSONL, type JSONLBuildResult } from './jsonl-builder.js';
import { saveRunState, updatePhase, addJob } from './state.js';

/** Options for batch submission */
export interface SubmitOptions {
  /** Artifact directory for this run */
  artifactDir: string;
  /** API key */
  apiKey: string;
  /** Configuration */
  config: BatchConfig;
  /** Display name prefix for jobs */
  displayNamePrefix?: string;
}

/** Result from batch submission */
export interface SubmitResult {
  /** Submitted jobs */
  jobs: BatchJobInfo[];
  /** Updated run state */
  state: BatchRunState;
  /** JSONL build result */
  jsonl: JSONLBuildResult;
  /** Errors encountered */
  errors: string[];
}

/**
 * Submit batch tasks to Google Batch API
 */
export async function submitBatch(
  tasks: BatchTask[],
  state: BatchRunState,
  options: SubmitOptions
): Promise<SubmitResult> {
  const errors: string[] = [];
  const jobs: BatchJobInfo[] = [];

  // Update state to staging
  let currentState = updatePhase(state, 'staging');
  await saveRunState(options.artifactDir, currentState);

  // Build JSONL files
  const jsonl = await buildJSONL(tasks, options.artifactDir, {
    maxTasksPerFile: options.config.maxTasksPerJob,
  });

  // Update state to staged
  currentState = updatePhase(currentState, 'staged');
  await saveRunState(options.artifactDir, currentState);

  // Upload JSONL files and submit jobs
  const filesService = new GoogleFilesService(options.apiKey);
  const batchesService = new GoogleBatchesService(options.apiKey);

  for (let i = 0; i < jsonl.files.length; i++) {
    const jsonlPath = jsonl.files[i];
    const taskCount = jsonl.tasksPerFile[i];

    try {
      // Upload JSONL file
      const displayName = options.displayNamePrefix
        ? `${options.displayNamePrefix}-requests-${i + 1}`
        : `batch-requests-${state.runId}-${i + 1}`;

      const uploaded = await filesService.uploadFile(jsonlPath, {
        displayName,
        mimeType: 'application/jsonl',
      });

      // Wait for processing
      await filesService.waitForProcessing(uploaded.name);

      // Submit batch job
      const job = await batchesService.createJob({
        displayName: `${displayName}-job`,
        model: options.config.model,
        inputUri: uploaded.uri,
      });

      // Create job info
      const jobInfo: BatchJobInfo = {
        jobId: job.name,
        submittedAt: new Date().toISOString(),
        chunkIndex: i,
        taskCount,
        state: 'JOB_STATE_PENDING',
      };

      jobs.push(jobInfo);

      // Update state with new job
      currentState = addJob(currentState, jobInfo);
      await saveRunState(options.artifactDir, currentState);
    } catch (error) {
      const errorMsg = `Failed to submit chunk ${i + 1}: ${error}`;
      console.error('Batch submission error:', error);
      errors.push(errorMsg);
    }
  }

  // Update state to submitted if at least one job succeeded
  if (jobs.length > 0) {
    currentState = updatePhase(currentState, 'submitted');
    await saveRunState(options.artifactDir, currentState);
  }

  return {
    jobs,
    state: currentState,
    jsonl,
    errors,
  };
}

/**
 * Resume a previously submitted batch
 */
export async function resumeSubmission(
  state: BatchRunState,
  options: SubmitOptions
): Promise<{
  state: BatchRunState;
  errors: string[];
}> {
  const errors: string[] = [];

  // Check if we're in a resumable state
  if (state.phase !== 'staged' && state.phase !== 'submitted') {
    errors.push(`Cannot resume from phase: ${state.phase}`);
    return { state, errors };
  }

  // If already submitted, just return current state
  if (state.phase === 'submitted' && state.jobs.length > 0) {
    return { state, errors };
  }

  // Check for existing JSONL files
  const { existsSync } = await import('fs');
  const jsonlPath = join(options.artifactDir, 'requests.jsonl');

  if (!existsSync(jsonlPath)) {
    errors.push('No JSONL file found for resumption');
    return { state, errors };
  }

  // Re-read JSONL to get task count
  const { parseJSONL } = await import('./jsonl-builder.js');
  const requests = await parseJSONL(jsonlPath);

  // Submit the job
  const filesService = new GoogleFilesService(options.apiKey);
  const batchesService = new GoogleBatchesService(options.apiKey);

  try {
    const displayName = `batch-requests-${state.runId}-resume`;

    const uploaded = await filesService.uploadFile(jsonlPath, {
      displayName,
      mimeType: 'application/jsonl',
    });

    await filesService.waitForProcessing(uploaded.name);

    const job = await batchesService.createJob({
      displayName: `${displayName}-job`,
      model: options.config.model,
      inputUri: uploaded.uri,
    });

    const jobInfo: BatchJobInfo = {
      jobId: job.name,
      submittedAt: new Date().toISOString(),
      chunkIndex: 0,
      taskCount: requests.length,
      state: 'JOB_STATE_PENDING',
    };

    let updatedState = addJob(state, jobInfo);
    updatedState = updatePhase(updatedState, 'submitted');
    await saveRunState(options.artifactDir, updatedState);

    return { state: updatedState, errors };
  } catch (error) {
    errors.push(`Failed to resume submission: ${error}`);
    return { state, errors };
  }
}
