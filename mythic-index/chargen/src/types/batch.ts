/**
 * Batch Processing Types for Google Batch API Integration
 *
 * These types define the data structures for batch image generation,
 * including task definitions, run state management, and configuration.
 *
 * Architecture based on chargen/qqq/imagery-batch specifications.
 */

import type { ReferenceRole, GenerationConstraints as _GenerationConstraints } from './prompt-ir.js';

// ============================================================================
// Task Types
// ============================================================================

/** The kind of batch task */
export type BatchTaskKind = 'generate' | 'analyze';

/** Entity types supported for batch processing */
export type BatchEntityType = 'character' | 'location' | 'chapter';

/** Reference image for batch tasks */
export interface BatchReferenceImage {
  /** Local file path */
  path: string;
  /** MIME type */
  mime: string;
  /** SHA256 hash of file contents */
  sha256: string;
  /** Role of this reference */
  role: ReferenceRole;
  /** Uploaded URI (populated after staging) */
  uploadedUri?: string;
}

/** Task configuration for generation */
export interface BatchTaskConfig {
  /** Aspect ratio (e.g., "16:9", "1:1") */
  aspectRatio?: string;
  /** Image size (e.g., "1024x1024", "1536x1024") */
  size?: string;
  /** Orientation derived from aspect ratio */
  orientation?: 'landscape' | 'portrait';
  /** Generation quality */
  quality?: 'standard' | 'high';
  /** Model temperature */
  temperature?: number;
  /** Response MIME type */
  responseMimeType?: string;
}

/**
 * A single batch task - normalized representation of work to be done.
 *
 * Task keys are deterministic and computed from:
 * {entityType}/{slug}/{targetId}@{contentHash}
 */
export interface BatchTask {
  /** Deterministic task key for idempotency */
  key: string;
  /** Type of task */
  kind: BatchTaskKind;
  /** Entity type being processed */
  entityType: BatchEntityType;
  /** Entity slug (e.g., "shepherds-rest-inn") */
  entitySlug: string;
  /** Target ID within the entity (e.g., "overview", "exterior") */
  targetId: string;
  /** The prompt to use */
  prompt: string;
  /** Negative prompt (things to avoid) */
  negativePrompt?: string;
  /** Reference images for multi-shot generation */
  referenceImages: BatchReferenceImage[];
  /** Output directory (absolute path) */
  outputDir: string;
  /** Output file name (without extension) */
  outputFileName: string;
  /** Model to use */
  model: string;
  /** Generation configuration */
  config: BatchTaskConfig;
  /** IR hash for regeneration detection */
  irHash: string;
  /** Metadata to preserve in runs file */
  targetMetadata: Record<string, unknown>;
}

// ============================================================================
// Run State Types
// ============================================================================

/** Phases of a batch run */
export type BatchRunPhase =
  | 'planned' // Tasks identified, plan.json created
  | 'staging' // Uploading files to Google Files API
  | 'staged' // All files uploaded, ready for submission
  | 'submitted' // Batch job submitted to Google
  | 'running' // Job is processing
  | 'downloading' // Downloading results
  | 'applying' // Writing images and updating YAML
  | 'completed' // Run finished successfully
  | 'failed'; // Run failed (terminal state)

/** Job tracking for submitted batch jobs */
export interface BatchJobInfo {
  /** Google Batch API job ID */
  jobId: string;
  /** Submission timestamp */
  submittedAt: string;
  /** Chunk index (for large batches split into multiple jobs) */
  chunkIndex: number;
  /** Number of tasks in this job */
  taskCount: number;
  /** Current job state from API */
  state?:
    | 'JOB_STATE_PENDING'
    | 'JOB_STATE_RUNNING'
    | 'JOB_STATE_SUCCEEDED'
    | 'JOB_STATE_FAILED'
    | 'JOB_STATE_CANCELLED';
}

/** Persistent run state for resumability */
export interface BatchRunState {
  /** Unique run identifier (ISO timestamp-based) */
  runId: string;
  /** Current phase */
  phase: BatchRunPhase;
  /** Scope of this run */
  scope: {
    entityTypes: BatchEntityType[];
    entityFilter?: string[]; // Specific slugs to include
    kinds: BatchTaskKind[];
  };
  /** Timestamps for each phase transition */
  timestamps: {
    created: string;
    planned?: string;
    stagingStarted?: string;
    staged?: string;
    submitted?: string;
    running?: string;
    downloadingStarted?: string;
    applyingStarted?: string;
    completed?: string;
    failed?: string;
  };
  /** Submitted jobs (may be multiple for chunked batches) */
  jobs: BatchJobInfo[];
  /** Error message if failed */
  error?: string;
  /** Configuration snapshot at time of planning */
  configSnapshot: BatchConfig;
}

// ============================================================================
// Configuration Types
// ============================================================================

/** Batch processing configuration */
export interface BatchConfig {
  /** Model to use for generation */
  model: string;
  /** Polling interval in milliseconds */
  pollIntervalMs: number;
  /** Maximum tasks per batch job */
  maxTasksPerJob: number;
  /** Upload concurrency */
  uploadConcurrency: number;
  /** Maximum retry attempts for transient errors */
  maxRetries: number;
  /** Auto-delete Files API uploads after success */
  cleanupAfterSuccess: boolean;
  /** Directory for batch artifacts */
  artifactDir: string;
}

/** Default batch configuration */
export const DEFAULT_BATCH_CONFIG: BatchConfig = {
  model: 'gemini-3-pro-image-preview',
  pollIntervalMs: 30000, // 30 seconds
  maxTasksPerJob: 500,
  uploadConcurrency: 5,
  maxRetries: 5,
  cleanupAfterSuccess: true,
  artifactDir: '.chargen/batch',
};

// ============================================================================
// Files Cache Types
// ============================================================================

/** Cached file entry from Files API upload */
export interface FilesCacheEntry {
  /** Local file path */
  localPath: string;
  /** Google Files API URI */
  uri: string;
  /** SHA256 hash of file contents */
  sha256: string;
  /** MIME type */
  mime: string;
  /** Expiration timestamp (48hr from upload) */
  expiresAt: string;
}

/** The files cache structure */
export interface FilesCache {
  /** Map of local path to cache entry */
  entries: Record<string, FilesCacheEntry>;
  /** Last updated timestamp */
  updatedAt: string;
}

// ============================================================================
// Result Types
// ============================================================================

/** Status of a completed task */
export type BatchTaskStatus = 'success' | 'failed' | 'skipped';

/** Result from a single task in the batch */
export interface BatchTaskResult {
  /** Task key (matches BatchTask.key) */
  taskKey: string;
  /** Result status */
  status: BatchTaskStatus;
  /** Output file path (if success) */
  outputPath?: string;
  /** Base64 encoded image data (from API response) */
  imageData?: string;
  /** Error details (if failed) */
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  /** Provider response metadata */
  providerMetadata?: Record<string, unknown>;
}

/** Summary report for a batch run */
export interface BatchRunReport {
  /** Run ID */
  runId: string;
  /** Run phase when report was generated */
  phase: BatchRunPhase;
  /** Total tasks in the run */
  totalTasks: number;
  /** Successfully completed tasks */
  successCount: number;
  /** Failed tasks */
  failCount: number;
  /** Skipped tasks (already generated) */
  skipCount: number;
  /** Timing information */
  timing: {
    planningDurationMs?: number;
    stagingDurationMs?: number;
    executionDurationMs?: number;
    applyingDurationMs?: number;
    totalDurationMs: number;
  };
  /** Failed task details */
  failures: Array<{
    taskKey: string;
    error: string;
  }>;
  /** Jobs in this run */
  jobs: BatchJobInfo[];
  /** Report generation timestamp */
  generatedAt: string;
}

// ============================================================================
// Plan Types
// ============================================================================

/** The plan.json structure created during planning phase */
export interface BatchPlan {
  /** Run ID for this plan */
  runId: string;
  /** Plan creation timestamp */
  createdAt: string;
  /** Scope of the plan */
  scope: {
    entityTypes: BatchEntityType[];
    entityFilter?: string[];
    kinds: BatchTaskKind[];
  };
  /** Configuration used for planning */
  config: BatchConfig;
  /** Summary statistics */
  summary: {
    totalTasks: number;
    byEntityType: Record<BatchEntityType, number>;
    byKind: Record<BatchTaskKind, number>;
    skippedAlreadyGenerated: number;
  };
  /** All tasks in the plan */
  tasks: BatchTask[];
}

// ============================================================================
// Dead Letter Queue Types
// ============================================================================

/** Entry in the dead letter queue for failed tasks */
export interface DLQEntry {
  /** Task that failed */
  task: BatchTask;
  /** Error information */
  error: {
    code: string;
    message: string;
    timestamp: string;
    attempts: number;
    lastAttemptAt: string;
  };
  /** Job context */
  jobId?: string;
  /** Raw response from provider */
  rawResponse?: string;
}

// ============================================================================
// JSONL Request/Response Types
// ============================================================================

/** A single request line in the batch JSONL input */
export interface BatchJSONLRequest {
  /** Custom ID matching task key */
  custom_id: string;
  /** The GenerateContentRequest for Gemini */
  request: {
    contents: Array<{
      role: 'user';
      parts: Array<{ text: string } | { fileData: { fileUri: string; mimeType: string } }>;
    }>;
    generationConfig?: {
      responseMimeType?: string;
      temperature?: number;
      topP?: number;
      topK?: number;
    };
    safetySettings?: Array<{
      category: string;
      threshold: string;
    }>;
  };
}

/** A single response line in the batch JSONL output */
export interface BatchJSONLResponse {
  /** Custom ID matching task key */
  custom_id: string;
  /** Response from the model */
  response?: {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
          inlineData?: {
            mimeType: string;
            data: string; // Base64 encoded
          };
        }>;
      };
      finishReason?: string;
    }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
  };
  /** Error if request failed */
  error?: {
    code: number;
    message: string;
    status: string;
  };
}
