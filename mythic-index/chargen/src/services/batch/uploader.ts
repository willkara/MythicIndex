/**
 * Batch File Uploader
 *
 * Handles concurrent file uploads with caching, retry logic,
 * and progress tracking.
 */

import type {
  BatchTask,
  BatchReferenceImage,
  FilesCache,
  FilesCacheEntry,
} from '../../types/batch.js';
import { GoogleFilesService, type UploadedFile } from '../google/files.js';
import {
  loadFilesCache,
  saveFilesCache,
  getCachedEntry,
  setCacheEntry,
  cleanExpiredEntries,
} from './files-cache.js';
import { computeFileHash as _computeFileHash } from './task-key.js';

/** Upload progress callback */
export type UploadProgressCallback = (progress: UploadProgress) => void;

/** Upload progress information */
export interface UploadProgress {
  /** Total files to upload */
  total: number;
  /** Files uploaded so far */
  completed: number;
  /** Files skipped (already cached) */
  skipped: number;
  /** Files that failed */
  failed: number;
  /** Current file being uploaded */
  currentFile?: string;
}

/** Upload result */
export interface UploadResult {
  /** Updated tasks with uploaded URIs */
  tasks: BatchTask[];
  /** Updated files cache */
  cache: FilesCache;
  /** Upload statistics */
  stats: {
    uploaded: number;
    cached: number;
    failed: number;
    totalBytes: number;
  };
  /** Errors encountered */
  errors: string[];
}

/** Upload options */
export interface UploaderOptions {
  /** Maximum concurrent uploads */
  concurrency: number;
  /** Maximum retry attempts */
  maxRetries: number;
  /** Base delay for exponential backoff (ms) */
  baseDelayMs: number;
  /** Maximum delay between retries (ms) */
  maxDelayMs: number;
}

const DEFAULT_OPTIONS: UploaderOptions = {
  concurrency: 5,
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 16000,
};

/**
 * Upload reference images for batch tasks
 */
export async function uploadTaskReferences(
  tasks: BatchTask[],
  apiKey: string,
  artifactDir: string,
  options: Partial<UploaderOptions> = {},
  onProgress?: UploadProgressCallback
): Promise<UploadResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const filesService = new GoogleFilesService(apiKey);
  const errors: string[] = [];

  // Load and clean cache
  let cache = await loadFilesCache(artifactDir);
  cache = cleanExpiredEntries(cache);

  // Collect all unique reference images across tasks
  const allReferences = new Map<string, BatchReferenceImage>();
  for (const task of tasks) {
    for (const ref of task.referenceImages) {
      if (!allReferences.has(ref.path)) {
        allReferences.set(ref.path, ref);
      }
    }
  }

  const referencesToUpload = Array.from(allReferences.values());
  const uploadedUris = new Map<string, string>(); // path -> uri

  let uploaded = 0;
  let cached = 0;
  let failed = 0;
  let totalBytes = 0;

  // Progress tracking
  const progress: UploadProgress = {
    total: referencesToUpload.length,
    completed: 0,
    skipped: 0,
    failed: 0,
  };

  // Process references with concurrency limit
  const uploadQueue = [...referencesToUpload];
  const activeUploads: Promise<void>[] = [];

  async function processNext(): Promise<void> {
    while (uploadQueue.length > 0) {
      const ref = uploadQueue.shift()!;
      progress.currentFile = ref.path;
      onProgress?.(progress);

      try {
        // Check cache first
        const cachedEntry = getCachedEntry(cache, ref.path, ref.sha256);
        if (cachedEntry) {
          uploadedUris.set(ref.path, cachedEntry.uri);
          cached++;
          progress.skipped++;
        } else {
          // Upload with retry
          const uploadedFile = await uploadWithRetry(filesService, ref.path, ref.mime, opts);

          // Update cache
          const cacheEntry: FilesCacheEntry = {
            localPath: ref.path,
            uri: uploadedFile.uri,
            sha256: ref.sha256,
            mime: ref.mime,
            expiresAt: uploadedFile.expirationTime,
          };
          cache = setCacheEntry(cache, cacheEntry);
          uploadedUris.set(ref.path, uploadedFile.uri);
          uploaded++;
          totalBytes += uploadedFile.sizeBytes;
        }

        progress.completed++;
      } catch (error) {
        failed++;
        progress.failed++;
        errors.push(`Failed to upload ${ref.path}: ${error}`);
      }

      onProgress?.(progress);
    }
  }

  // Start concurrent workers
  for (let i = 0; i < opts.concurrency; i++) {
    activeUploads.push(processNext());
  }

  // Wait for all uploads to complete
  await Promise.all(activeUploads);

  // Save updated cache
  await saveFilesCache(artifactDir, cache);

  // Update tasks with uploaded URIs
  const updatedTasks = tasks.map((task) => ({
    ...task,
    referenceImages: task.referenceImages.map((ref) => ({
      ...ref,
      uploadedUri: uploadedUris.get(ref.path),
    })),
  }));

  return {
    tasks: updatedTasks,
    cache,
    stats: {
      uploaded,
      cached,
      failed,
      totalBytes,
    },
    errors,
  };
}

/**
 * Upload a file with exponential backoff retry
 */
async function uploadWithRetry(
  service: GoogleFilesService,
  filePath: string,
  mimeType: string,
  options: UploaderOptions
): Promise<UploadedFile> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < options.maxRetries; attempt++) {
    try {
      const uploaded = await service.uploadFile(filePath, { mimeType });

      // Wait for processing if needed
      if (uploaded.state === 'PROCESSING') {
        return await service.waitForProcessing(uploaded.name);
      }

      return uploaded;
    } catch (error) {
      lastError = error as Error;

      // Check if error is retryable
      if (!isRetryableError(error)) {
        throw error;
      }

      // Calculate delay with exponential backoff and jitter
      const delay = Math.min(
        options.baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000,
        options.maxDelayMs
      );

      await sleep(delay);
    }
  }

  throw lastError || new Error('Upload failed after all retries');
}

/**
 * Check if an error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  // Network errors
  if (message.includes('network') || message.includes('timeout')) {
    return true;
  }

  // Rate limiting
  if (message.includes('rate') || message.includes('429') || message.includes('quota')) {
    return true;
  }

  // Server errors
  if (message.includes('500') || message.includes('502') || message.includes('503')) {
    return true;
  }

  return false;
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Delete uploaded files (for cleanup)
 */
export async function deleteUploadedFiles(
  cache: FilesCache,
  apiKey: string
): Promise<{ deleted: number; failed: number }> {
  const service = new GoogleFilesService(apiKey);
  let deleted = 0;
  let failed = 0;

  for (const entry of Object.values(cache.entries)) {
    try {
      // Extract file name from URI
      const match = entry.uri.match(/files\/([^/]+)/);
      if (match) {
        await service.deleteFile(match[1]);
        deleted++;
      }
    } catch {
      failed++;
    }
  }

  return { deleted, failed };
}
