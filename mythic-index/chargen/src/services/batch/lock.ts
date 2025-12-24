/**
 * Batch Run Lock Mechanism
 *
 * Prevents concurrent batch runs by maintaining a lock file.
 * Uses atomic file operations to ensure thread safety.
 */

import { writeFile, readFile, unlink, stat as _stat, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { hostname } from 'os';

/** Lock file information */
export interface LockInfo {
  /** Run ID holding the lock */
  runId: string;
  /** Process ID */
  pid: number;
  /** Lock acquisition timestamp */
  acquiredAt: string;
  /** Hostname for distributed scenarios */
  hostname: string;
}

/** Lock acquisition result */
export interface LockResult {
  acquired: boolean;
  existingLock?: LockInfo;
}

/** Maximum age of a lock before it's considered stale (5 minutes) */
const STALE_LOCK_MS = 5 * 60 * 1000;

/** Get the lock file path */
export function getLockFilePath(artifactBaseDir: string): string {
  return join(artifactBaseDir, '.lock');
}

/** Check if a lock is stale (holder may have crashed) */
function isLockStale(lock: LockInfo): boolean {
  const acquiredAt = new Date(lock.acquiredAt);
  const now = new Date();
  return now.getTime() - acquiredAt.getTime() > STALE_LOCK_MS;
}

/** Check if the process holding the lock is still running */
function isProcessRunning(pid: number): boolean {
  try {
    // Sending signal 0 checks if process exists without actually sending a signal
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Read existing lock file */
async function readLock(lockPath: string): Promise<LockInfo | null> {
  if (!existsSync(lockPath)) {
    return null;
  }

  try {
    const content = await readFile(lockPath, 'utf-8');
    return JSON.parse(content) as LockInfo;
  } catch {
    return null;
  }
}

/** Acquire a lock for a batch run */
export async function acquireLock(artifactBaseDir: string, runId: string): Promise<LockResult> {
  const lockPath = getLockFilePath(artifactBaseDir);

  // Check for existing lock
  const existingLock = await readLock(lockPath);

  if (existingLock) {
    // Check if it's our own lock (resuming)
    if (existingLock.runId === runId) {
      // Update the lock timestamp
      const lockInfo: LockInfo = {
        runId,
        pid: process.pid,
        acquiredAt: new Date().toISOString(),
        hostname: hostname(),
      };

      try {
        // Ensure parent directory exists
        const lockDir = dirname(lockPath);
        if (!existsSync(lockDir)) {
          await mkdir(lockDir, { recursive: true });
        }

        await writeFile(lockPath, JSON.stringify(lockInfo, null, 2), {
          flag: 'w',
        });
        return { acquired: true };
      } catch (error) {
        console.error('Failed to update lock timestamp:', error);
        return { acquired: false, existingLock };
      }
    }

    // Check if the lock is stale
    if (isLockStale(existingLock)) {
      // Try to take over the stale lock
      console.warn(`Found stale lock from run ${existingLock.runId}, attempting to acquire...`);
    } else if (isProcessRunning(existingLock.pid)) {
      // Lock is held by an active process
      return { acquired: false, existingLock };
    } else {
      // Process is dead but lock is recent - still try to acquire
      console.warn(
        `Lock holder process ${existingLock.pid} is not running, attempting to acquire...`
      );
    }
  }

  // Create lock info
  const lockInfo: LockInfo = {
    runId,
    pid: process.pid,
    acquiredAt: new Date().toISOString(),
    hostname: hostname(),
  };

  // Try to acquire the lock atomically
  try {
    // Ensure parent directory exists
    const lockDir = dirname(lockPath);
    if (!existsSync(lockDir)) {
      await mkdir(lockDir, { recursive: true });
    }

    // Use 'wx' flag for exclusive creation - fails if file exists
    // But we already checked above, so use 'w' to overwrite stale locks
    await writeFile(lockPath, JSON.stringify(lockInfo, null, 2), { flag: 'w' });
    return { acquired: true };
  } catch (error) {
    // Log the actual error for debugging
    console.error('Failed to acquire lock:', error);

    // Check if lock file exists - if not, this wasn't a race condition
    const currentLock = await readLock(lockPath);

    if (!currentLock) {
      // Lock doesn't exist, so this was a filesystem error, not a race
      throw new Error(
        `Failed to create lock file: ${error instanceof Error ? error.message : error}`
      );
    }

    // Lock exists, so another process did acquire it
    return { acquired: false, existingLock: currentLock };
  }
}

/** Release the lock */
export async function releaseLock(artifactBaseDir: string, runId: string): Promise<boolean> {
  const lockPath = getLockFilePath(artifactBaseDir);

  // Verify we own the lock before releasing
  const existingLock = await readLock(lockPath);

  if (!existingLock) {
    // No lock to release
    return true;
  }

  if (existingLock.runId !== runId) {
    // We don't own this lock
    console.warn(`Cannot release lock: owned by run ${existingLock.runId}, not ${runId}`);
    return false;
  }

  try {
    await unlink(lockPath);
    return true;
  } catch {
    return false;
  }
}

/** Check if a lock exists and is valid */
export async function checkLock(
  artifactBaseDir: string
): Promise<{ locked: boolean; lockInfo?: LockInfo; isStale?: boolean }> {
  const lockPath = getLockFilePath(artifactBaseDir);
  const lock = await readLock(lockPath);

  if (!lock) {
    return { locked: false };
  }

  const stale = isLockStale(lock);
  const processRunning = isProcessRunning(lock.pid);

  return {
    locked: !stale && processRunning,
    lockInfo: lock,
    isStale: stale || !processRunning,
  };
}

/** Force release a stale lock */
export async function forceReleaseLock(artifactBaseDir: string): Promise<boolean> {
  const lockPath = getLockFilePath(artifactBaseDir);

  try {
    if (existsSync(lockPath)) {
      await unlink(lockPath);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Execute a function while holding the lock.
 * Automatically releases the lock when done (or on error).
 */
export async function withLock<T>(
  artifactBaseDir: string,
  runId: string,
  fn: () => Promise<T>
): Promise<T> {
  const result = await acquireLock(artifactBaseDir, runId);

  if (!result.acquired) {
    throw new Error(
      `Cannot acquire lock: already held by run ${result.existingLock?.runId} ` +
        `(pid: ${result.existingLock?.pid}, acquired: ${result.existingLock?.acquiredAt})`
    );
  }

  try {
    return await fn();
  } finally {
    await releaseLock(artifactBaseDir, runId);
  }
}
