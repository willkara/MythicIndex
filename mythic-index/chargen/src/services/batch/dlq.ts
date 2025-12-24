/**
 * Dead Letter Queue (DLQ) Management
 *
 * Handles failed task storage, retrieval, and retry logic.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { DLQEntry, BatchTask } from '../../types/batch.js';

/** DLQ file structure */
export interface DLQFile {
  createdAt: string;
  updatedAt: string;
  entries: DLQEntry[];
}

/**
 * Load DLQ from disk
 */
export async function loadDLQ(artifactDir: string): Promise<DLQFile> {
  const dlqDir = join(artifactDir, 'failed');
  const dlqPath = join(dlqDir, 'dlq.json');

  if (!existsSync(dlqPath)) {
    return {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      entries: [],
    };
  }

  try {
    const content = await readFile(dlqPath, 'utf-8');
    const entries = JSON.parse(content) as DLQEntry[];
    return {
      createdAt: new Date().toISOString(), // Not stored in old format
      updatedAt: new Date().toISOString(),
      entries,
    };
  } catch {
    return {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      entries: [],
    };
  }
}

/**
 * Save DLQ to disk
 */
export async function saveDLQ(artifactDir: string, dlq: DLQFile): Promise<void> {
  const dlqDir = join(artifactDir, 'failed');

  if (!existsSync(dlqDir)) {
    await mkdir(dlqDir, { recursive: true });
  }

  const dlqPath = join(dlqDir, 'dlq.json');
  dlq.updatedAt = new Date().toISOString();
  await writeFile(dlqPath, JSON.stringify(dlq.entries, null, 2), 'utf-8');
}

/**
 * Add an entry to the DLQ
 */
export function addToDLQ(dlq: DLQFile, entry: DLQEntry): DLQFile {
  // Check if task already exists
  const existingIndex = dlq.entries.findIndex((e) => e.task.key === entry.task.key);

  if (existingIndex >= 0) {
    // Update existing entry
    const existing = dlq.entries[existingIndex];
    dlq.entries[existingIndex] = {
      ...entry,
      error: {
        ...entry.error,
        attempts: existing.error.attempts + 1,
      },
    };
  } else {
    // Add new entry
    dlq.entries.push(entry);
  }

  return dlq;
}

/**
 * Remove an entry from the DLQ
 */
export function removeFromDLQ(dlq: DLQFile, taskKey: string): DLQFile {
  return {
    ...dlq,
    entries: dlq.entries.filter((e) => e.task.key !== taskKey),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Get retryable entries from DLQ
 */
export function getRetryableEntries(dlq: DLQFile, maxAttempts: number = 3): DLQEntry[] {
  return dlq.entries.filter((entry) => {
    // Check if retryable based on error type
    const isRetryable = isRetryableError(entry.error.code);

    // Check if max attempts not exceeded
    const hasAttemptsRemaining = entry.error.attempts < maxAttempts;

    return isRetryable && hasAttemptsRemaining;
  });
}

/**
 * Get non-retryable (permanent) failures
 */
export function getPermanentFailures(dlq: DLQFile): DLQEntry[] {
  return dlq.entries.filter((entry) => !isRetryableError(entry.error.code));
}

/**
 * Check if error code is retryable
 */
function isRetryableError(code: string): boolean {
  const retryableCodes = ['429', '500', '502', '503', 'RATE_LIMIT', 'TIMEOUT'];
  return retryableCodes.some((rc) => code.includes(rc));
}

/**
 * Get DLQ statistics
 */
export function getDLQStats(dlq: DLQFile): {
  total: number;
  retryable: number;
  permanent: number;
  byErrorCode: Record<string, number>;
} {
  const byErrorCode: Record<string, number> = {};

  for (const entry of dlq.entries) {
    const code = entry.error.code;
    byErrorCode[code] = (byErrorCode[code] || 0) + 1;
  }

  const retryable = getRetryableEntries(dlq).length;

  return {
    total: dlq.entries.length,
    retryable,
    permanent: dlq.entries.length - retryable,
    byErrorCode,
  };
}

/**
 * Extract tasks from DLQ for retry
 */
export function extractTasksForRetry(dlq: DLQFile): BatchTask[] {
  return getRetryableEntries(dlq).map((entry) => entry.task);
}

/**
 * Clear the DLQ
 */
export function clearDLQ(dlq: DLQFile): DLQFile {
  return {
    ...dlq,
    entries: [],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Format DLQ for console display
 */
export function formatDLQForConsole(dlq: DLQFile): string {
  if (dlq.entries.length === 0) {
    return 'Dead Letter Queue is empty.';
  }

  const stats = getDLQStats(dlq);
  const lines: string[] = [
    '',
    `Dead Letter Queue: ${stats.total} failed tasks`,
    `  Retryable: ${stats.retryable}`,
    `  Permanent: ${stats.permanent}`,
    '',
    'Errors by code:',
  ];

  for (const [code, count] of Object.entries(stats.byErrorCode)) {
    lines.push(`  ${code}: ${count}`);
  }

  lines.push('');
  lines.push('Recent failures:');

  const maxToShow = 5;
  const showCount = Math.min(dlq.entries.length, maxToShow);

  for (let i = 0; i < showCount; i++) {
    const entry = dlq.entries[i];
    lines.push(`  • ${entry.task.key}`);
    lines.push(`    ${entry.error.code}: ${entry.error.message}`);
    lines.push(`    Attempts: ${entry.error.attempts}, Last: ${entry.error.lastAttemptAt}`);
  }

  if (dlq.entries.length > maxToShow) {
    lines.push(`  ... and ${dlq.entries.length - maxToShow} more`);
  }

  return lines.join('\n');
}
