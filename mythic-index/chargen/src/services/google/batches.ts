/**
 * Google Batch API Integration
 *
 * Handles batch job submission, status polling, and result retrieval
 * via Google's Batch API for Gemini models.
 */

import { GoogleGenAI } from '@google/genai';
import { readFile as _readFile } from 'fs/promises';

/**
 * Extract file name from Files API URI
 * Converts: https://generativelanguage.googleapis.com/v1beta/files/abc123
 * To: files/abc123
 */
function extractFileNameFromUri(uri: string): string {
  const match = uri.match(/files\/([^/?]+)/);
  if (!match) {
    throw new Error(`Invalid file URI format: ${uri}`);
  }
  return `files/${match[1]}`;
}

/** Batch job status */
export type BatchJobState =
  | 'JOB_STATE_PENDING'
  | 'JOB_STATE_RUNNING'
  | 'JOB_STATE_SUCCEEDED'
  | 'JOB_STATE_FAILED'
  | 'JOB_STATE_CANCELLED';

/** Batch job information */
export interface BatchJobInfo {
  /** Job name/ID */
  name: string;
  /** Display name */
  displayName?: string;
  /** Current state */
  state: BatchJobState;
  /** Model used */
  model: string;
  /** Input file URI */
  inputUri: string;
  /** Output file URI (populated when complete) */
  outputUri?: string;
  /** Inline responses (returned by batch API) */
  responses?: Array<{
    custom_id: string;
    response: any;
    error?: {
      code: number;
      message: string;
    };
  }>;
  /** Creation time */
  createTime: string;
  /** Update time */
  updateTime: string;
  /** Error details if failed */
  error?: {
    code: number;
    message: string;
  };
  /** Request counts */
  requestCounts?: {
    total: number;
    succeeded: number;
    failed: number;
  };
}

/** Options for creating a batch job */
export interface CreateBatchJobOptions {
  /** Display name for the job */
  displayName?: string;
  /** Model to use */
  model: string;
  /** Input JSONL file URI (from Files API) */
  inputUri: string;
}

/**
 * Google Batch API service
 */
export class GoogleBatchesService {
  private client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  /**
   * Create a new batch job
   */
  async createJob(options: CreateBatchJobOptions): Promise<BatchJobInfo> {
    // The Batch API is accessed through the models endpoint
    // Note: As of the SDK version, batch API may need direct REST calls
    // This is a placeholder for when the SDK fully supports batch operations

    const response = await this.client.batches.create({
      model: options.model,
      src: {
        fileName: extractFileNameFromUri(options.inputUri),
      },
      config: {
        displayName: options.displayName,
      },
    });

    return {
      name: response.name || '',
      displayName: options.displayName,
      state: 'JOB_STATE_PENDING',
      model: options.model,
      inputUri: options.inputUri,
      createTime: new Date().toISOString(),
      updateTime: new Date().toISOString(),
    };
  }

  /**
   * Get the status of a batch job
   */
  async getJob(jobName: string): Promise<BatchJobInfo> {
    const response = await this.client.batches.get({ name: jobName });

    // DEBUG: Dump the entire raw response
    console.log('[DEBUG] ===== RAW BATCH RESPONSE =====');
    console.log(JSON.stringify(response, null, 2));
    console.log('[DEBUG] ================================');

    // DEBUG: Log the response structure
    console.log('[DEBUG] Batch API Response for', jobName);
    console.log('[DEBUG] State:', response.state);
    console.log('[DEBUG] response.dest type:', typeof response.dest);
    console.log('[DEBUG] response.dest:', JSON.stringify(response.dest, null, 2));
    console.log('[DEBUG] response keys:', Object.keys(response));

    // Extract output URI from dest object
    let outputUri: string | undefined;
    if (response.dest) {
      console.log('[DEBUG] dest exists, checking fields...');
      console.log('[DEBUG] dest keys:', Object.keys(response.dest));

      // For file-based batches, extract fileName
      if (typeof response.dest === 'object' && 'fileName' in response.dest) {
        outputUri = response.dest.fileName;
        console.log('[DEBUG] Extracted fileName:', outputUri);
      }
      // Fallback for gcsUri or bigqueryUri if present
      else if (typeof response.dest === 'object' && 'gcsUri' in response.dest) {
        outputUri = response.dest.gcsUri;
        console.log('[DEBUG] Extracted gcsUri:', outputUri);
      }
      // Legacy: if dest is already a string (shouldn't happen with new SDK)
      else if (typeof response.dest === 'string') {
        outputUri = response.dest;
        console.log('[DEBUG] dest is string:', outputUri);
      } else {
        console.log('[DEBUG] No recognized URI field in dest');
      }
    } else {
      console.log('[DEBUG] response.dest is undefined/null');
    }

    // Extract inline responses if available
    // Type matches BatchJobInfo.responses
    type BatchResponse = { custom_id: string; response: unknown; error?: { code: number; message: string } };
    let responses: BatchResponse[] | undefined;
    if (
      response.dest &&
      typeof response.dest === 'object' &&
      'inlined_responses' in response.dest
    ) {
      const rawResponses = (response.dest as { inlined_responses?: unknown[] }).inlined_responses;
      responses = rawResponses as BatchResponse[] | undefined;
      console.log('[DEBUG] Found inlined_responses, count:', responses?.length || 0);
    } else {
      console.log('[DEBUG] No inlined_responses found');
    }

    console.log('[DEBUG] Final outputUri:', outputUri);
    console.log('[DEBUG] Final responses count:', responses?.length || 0);

    // DEBUG: Log completion stats (SDK renamed requestCounts to completionStats)
    console.log('[DEBUG] Completion stats:', response.completionStats);
    if (response.completionStats) {
      const stats = response.completionStats;
      const successful = Number(stats.successfulCount) || 0;
      const failed = Number(stats.failedCount) || 0;
      console.log('[DEBUG] - Total:', successful + failed);
      console.log('[DEBUG] - Succeeded:', successful);
      console.log('[DEBUG] - Failed:', failed);
    }

    // Extract input URI from BatchJobSource object
    let inputUri = '';
    if (response.src) {
      if (typeof response.src === 'string') {
        inputUri = response.src;
      } else if (response.src.gcsUri && response.src.gcsUri.length > 0) {
        inputUri = response.src.gcsUri[0];
      }
    }

    // Build requestCounts from completionStats
    let requestCounts: { total: number; succeeded: number; failed: number } | undefined;
    if (response.completionStats) {
      const succeeded = Number(response.completionStats.successfulCount) || 0;
      const failed = Number(response.completionStats.failedCount) || 0;
      requestCounts = {
        total: succeeded + failed,
        succeeded,
        failed,
      };
    }

    return {
      name: response.name || jobName,
      displayName: response.displayName,
      state: (response.state as BatchJobState) || 'JOB_STATE_PENDING',
      model: response.model || '',
      inputUri,
      outputUri,
      responses,
      createTime: response.createTime || '',
      updateTime: response.updateTime || '',
      error: response.error
        ? {
            code: response.error.code || 0,
            message: response.error.message || 'Unknown error',
          }
        : undefined,
      requestCounts,
    };
  }

  /**
   * List all batch jobs
   */
  async listJobs(): Promise<BatchJobInfo[]> {
    const pager = await this.client.batches.list();
    const jobs: BatchJobInfo[] = [];

    // SDK Pager is AsyncIterable - iterate directly over it
    for await (const batch of pager) {
      // Extract output URI from dest object
      let outputUri: string | undefined;
      if (batch.dest) {
        if (typeof batch.dest === 'object' && 'fileName' in batch.dest) {
          outputUri = batch.dest.fileName;
        } else if (typeof batch.dest === 'object' && 'gcsUri' in batch.dest) {
          outputUri = batch.dest.gcsUri;
        } else if (typeof batch.dest === 'string') {
          outputUri = batch.dest;
        }
      }

      // Extract input URI from BatchJobSource object
      let inputUri = '';
      if (batch.src) {
        if (typeof batch.src === 'string') {
          inputUri = batch.src;
        } else if (batch.src.gcsUri && batch.src.gcsUri.length > 0) {
          inputUri = batch.src.gcsUri[0];
        }
      }

      jobs.push({
        name: batch.name || '',
        displayName: batch.displayName,
        state: (batch.state as BatchJobState) || 'JOB_STATE_PENDING',
        model: batch.model || '',
        inputUri,
        outputUri,
        createTime: batch.createTime || '',
        updateTime: batch.updateTime || '',
      });
    }

    return jobs;
  }

  /**
   * Cancel a batch job
   */
  async cancelJob(jobName: string): Promise<boolean> {
    try {
      await this.client.batches.cancel({ name: jobName });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a batch job
   */
  async deleteJob(jobName: string): Promise<boolean> {
    try {
      await this.client.batches.delete({ name: jobName });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a job is in a terminal state
   */
  isTerminalState(state: BatchJobState): boolean {
    return ['JOB_STATE_SUCCEEDED', 'JOB_STATE_FAILED', 'JOB_STATE_CANCELLED'].includes(state);
  }

  /**
   * Check if a job succeeded
   */
  isSuccess(state: BatchJobState): boolean {
    return state === 'JOB_STATE_SUCCEEDED';
  }

  /**
   * Poll for job completion
   */
  async waitForCompletion(
    jobName: string,
    pollIntervalMs: number = 30000,
    maxWaitMs: number = 3600000, // 1 hour default
    onPoll?: (job: BatchJobInfo) => void
  ): Promise<BatchJobInfo> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const job = await this.getJob(jobName);

      onPoll?.(job);

      if (this.isTerminalState(job.state)) {
        return job;
      }

      await this.sleep(pollIntervalMs);
    }

    throw new Error(`Job ${jobName} did not complete within ${maxWaitMs}ms`);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
