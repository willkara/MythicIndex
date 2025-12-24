/**
 * Batch Executor
 *
 * Orchestrates batch job execution, status polling, and result downloading.
 * Handles the running -> downloading phase transition.
 */

import { writeFile } from 'fs/promises';
import { createWriteStream } from 'fs';
import { join } from 'path';
import type { BatchRunState, BatchConfig, BatchJobInfo as _BatchJobInfo } from '../../types/batch.js';
import { GoogleBatchesService, type BatchJobState } from '../google/batches.js';
import { GoogleFilesService } from '../google/files.js';
import { saveRunState, updatePhase, updateJobState } from './state.js';

/** Execution progress callback */
export type ExecutionProgressCallback = (progress: ExecutionProgress) => void;

/** Execution progress information */
export interface ExecutionProgress {
  /** Current phase */
  phase: 'polling' | 'downloading' | 'complete' | 'failed';
  /** Jobs being tracked */
  jobs: Array<{
    jobId: string;
    state: BatchJobState;
    taskCount: number;
    succeeded?: number;
    failed?: number;
  }>;
  /** Time elapsed since start (ms) */
  elapsedMs: number;
  /** Last poll time */
  lastPollAt: string;
  /** Error if failed */
  error?: string;
}

/** Execution options */
export interface ExecutionOptions {
  /** Artifact directory */
  artifactDir: string;
  /** API key */
  apiKey: string;
  /** Configuration */
  config: BatchConfig;
  /** Maximum wait time in milliseconds */
  maxWaitMs?: number;
}

/** Execution result */
export interface ExecutionResult {
  /** Updated run state */
  state: BatchRunState;
  /** Downloaded result files */
  resultFiles: string[];
  /** Errors encountered */
  errors: string[];
  /** Final progress */
  progress: ExecutionProgress;
}

/**
 * Execute batch jobs and download results
 */
export async function executeBatch(
  state: BatchRunState,
  options: ExecutionOptions,
  onProgress?: ExecutionProgressCallback
): Promise<ExecutionResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const resultFiles: string[] = [];
  let currentState = state;

  // Update to running phase
  currentState = updatePhase(currentState, 'running');
  await saveRunState(options.artifactDir, currentState);

  const batchesService = new GoogleBatchesService(options.apiKey);
  const filesService = new GoogleFilesService(options.apiKey);

  const maxWaitMs = options.maxWaitMs || 3600000; // 1 hour default
  const pollIntervalMs = options.config.pollIntervalMs;

  // Track job completion
  const completedJobs = new Set<string>();
  let allComplete = false;

  while (!allComplete && Date.now() - startTime < maxWaitMs) {
    allComplete = true;

    // Poll each job
    for (const job of currentState.jobs) {
      if (completedJobs.has(job.jobId)) {
        continue;
      }

      try {
        const jobStatus = await batchesService.getJob(job.jobId);

        // Update job state
        currentState = updateJobState(currentState, job.jobId, jobStatus.state);

        if (batchesService.isTerminalState(jobStatus.state)) {
          completedJobs.add(job.jobId);

          // Download or write results if succeeded
          if (batchesService.isSuccess(jobStatus.state)) {
            console.log('[DEBUG] Job succeeded, checking for results...');
            console.log('[DEBUG] jobStatus.responses:', jobStatus.responses?.length || 0);
            console.log('[DEBUG] jobStatus.outputUri:', jobStatus.outputUri);

            try {
              // Check for inline responses first
              if (jobStatus.responses && jobStatus.responses.length > 0) {
                console.log('[DEBUG] Using inline responses, count:', jobStatus.responses.length);
                const resultPath = await writeInlineResults(
                  jobStatus.responses,
                  job.chunkIndex,
                  options.artifactDir
                );
                resultFiles.push(resultPath);
              }
              // Fall back to outputUri if available
              else if (jobStatus.outputUri) {
                console.log('[DEBUG] Using outputUri:', jobStatus.outputUri);
                const resultPath = await downloadResults(
                  jobStatus.outputUri,
                  job.chunkIndex,
                  options.artifactDir,
                  filesService
                );
                resultFiles.push(resultPath);
              }
              // No results available - log error
              else {
                console.error('[DEBUG] No results available!');
                console.error('[DEBUG] Full jobStatus:', JSON.stringify(jobStatus, null, 2));
                errors.push(
                  `Job ${job.jobId} succeeded but no results available ` +
                    `(no inline responses and no outputUri)`
                );
              }
            } catch (error) {
              console.error('[DEBUG] Error processing results:', error);
              errors.push(`Failed to process results for job ${job.jobId}: ${error}`);
            }
          } else {
            errors.push(`Job ${job.jobId} failed: ${jobStatus.error?.message || jobStatus.state}`);
          }
        } else {
          allComplete = false;
        }
      } catch (error) {
        errors.push(`Failed to poll job ${job.jobId}: ${error}`);
        allComplete = false;
      }
    }

    // Report progress
    const progress = buildProgress(currentState, startTime, allComplete ? 'complete' : 'polling');
    onProgress?.(progress);

    // Save state
    await saveRunState(options.artifactDir, currentState);

    // Wait before next poll if not complete
    if (!allComplete) {
      await sleep(pollIntervalMs);
    }
  }

  // Check if we timed out
  if (!allComplete && Date.now() - startTime >= maxWaitMs) {
    errors.push(`Execution timed out after ${maxWaitMs}ms`);
  }

  // Update state to downloading (transitional) then check results
  if (resultFiles.length > 0) {
    currentState = updatePhase(currentState, 'downloading');
    await saveRunState(options.artifactDir, currentState);
  }

  const finalProgress = buildProgress(
    currentState,
    startTime,
    errors.length > 0 && resultFiles.length === 0 ? 'failed' : 'complete'
  );

  return {
    state: currentState,
    resultFiles,
    errors,
    progress: finalProgress,
  };
}

/**
 * Write inline results to a JSONL file
 */
async function writeInlineResults(
  responses: Array<any>,
  chunkIndex: number,
  artifactDir: string
): Promise<string> {
  const resultFileName = chunkIndex > 0 ? `results-${chunkIndex + 1}.jsonl` : 'results.jsonl';
  const resultPath = join(artifactDir, resultFileName);

  // Convert responses to JSONL format (one JSON object per line)
  const jsonlContent = responses.map((resp) => JSON.stringify(resp)).join('\n');

  await writeFile(resultPath, jsonlContent, 'utf-8');

  return resultPath;
}

/**
 * Download results from a job's output URI using streaming
 *
 * Uses streaming to handle large result files that exceed Node.js's string length limit.
 * Writes directly to disk without loading entire file into memory.
 */
async function downloadResults(
  outputUri: string,
  chunkIndex: number,
  artifactDir: string,
  filesService: GoogleFilesService
): Promise<string> {
  console.log(`[DEBUG] Downloading results from: ${outputUri}`);

  try {
    // Get the stream
    const stream = await filesService.downloadFileStream(outputUri);
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    // Prepare output file
    const resultFileName = chunkIndex > 0 ? `results-${chunkIndex + 1}.jsonl` : 'results.jsonl';
    const resultPath = join(artifactDir, resultFileName);

    // Create a write stream to disk
    const writeStream = createWriteStream(resultPath, { encoding: 'utf-8' });
    let totalBytes = 0;

    // Process stream chunks and write directly to disk
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      // Decode chunk and write directly to file
      const chunk = decoder.decode(value, { stream: true });
      writeStream.write(chunk);
      totalBytes += value.length;

      // Log progress every 10MB
      if (totalBytes % (10 * 1024 * 1024) < value.length) {
        console.log(`[DEBUG] Downloaded ${(totalBytes / (1024 * 1024)).toFixed(1)}MB...`);
      }
    }

    // Ensure all data is written and file is closed
    await new Promise<void>((resolve, reject) => {
      writeStream.end((error: NodeJS.ErrnoException | null) => {
        if (error) reject(error);
        else resolve();
      });
    });

    console.log(`[DEBUG] Successfully wrote ${(totalBytes / (1024 * 1024)).toFixed(1)}MB to ${resultPath}`);
    return resultPath;
  } catch (error) {
    throw new Error(`Failed to download results from ${outputUri}: ${(error as Error).message}`);
  }
}

/**
 * Build progress object
 */
function buildProgress(
  state: BatchRunState,
  startTime: number,
  phase: ExecutionProgress['phase']
): ExecutionProgress {
  return {
    phase,
    jobs: state.jobs.map((job) => ({
      jobId: job.jobId,
      state: job.state || 'JOB_STATE_PENDING',
      taskCount: job.taskCount,
    })),
    elapsedMs: Date.now() - startTime,
    lastPollAt: new Date().toISOString(),
  };
}

/**
 * Resume execution from a previous state
 */
export async function resumeExecution(
  state: BatchRunState,
  options: ExecutionOptions,
  onProgress?: ExecutionProgressCallback
): Promise<ExecutionResult> {
  // Check if we're in a resumable execution state
  if (state.phase !== 'submitted' && state.phase !== 'running' && state.phase !== 'downloading') {
    throw new Error(`Cannot resume execution from phase: ${state.phase}`);
  }

  // Continue execution
  return executeBatch(state, options, onProgress);
}

/**
 * Cancel all running jobs
 */
export async function cancelExecution(
  state: BatchRunState,
  apiKey: string
): Promise<{ cancelled: number; failed: number }> {
  const batchesService = new GoogleBatchesService(apiKey);
  let cancelled = 0;
  let failed = 0;

  for (const job of state.jobs) {
    if (job.state === 'JOB_STATE_PENDING' || job.state === 'JOB_STATE_RUNNING') {
      const success = await batchesService.cancelJob(job.jobId);
      if (success) {
        cancelled++;
      } else {
        failed++;
      }
    }
  }

  return { cancelled, failed };
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
