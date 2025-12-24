/**
 * Shared utilities for batch operations
 */

import type { BatchConfig } from '../../types/batch.js';
import { getConfig } from '../../services/config.js';
import { getBatchConfig } from '../../config/index.js';

/**
 * Get the default batch configuration from YAML config
 */
export function getDefaultConfig(): BatchConfig {
  const batchConfig = getBatchConfig();
  return {
    model: batchConfig.model,
    pollIntervalMs: batchConfig.poll_interval_ms,
    maxTasksPerJob: batchConfig.max_tasks_per_job,
    uploadConcurrency: batchConfig.upload_concurrency,
    maxRetries: batchConfig.max_retries,
    cleanupAfterSuccess: batchConfig.cleanup_after_success,
    artifactDir: batchConfig.artifact_dir,
  };
}

/**
 * Get API key from configuration
 */
export function getApiKey(): string | null {
  const config = getConfig();
  return config.imageGeneration.providers.google?.apiKey || null;
}
