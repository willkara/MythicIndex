/**
 * Files Cache Service
 *
 * Manages a cache of uploaded files to avoid redundant uploads.
 * Uses SHA256 hashes to detect when files need re-uploading.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname as _dirname } from 'path';
import type { FilesCache, FilesCacheEntry } from '../../types/batch.js';

/** Default cache expiration margin (1 hour before actual expiration) */
const EXPIRATION_MARGIN_MS = 60 * 60 * 1000;

/**
 * Load the files cache from disk
 */
export async function loadFilesCache(artifactDir: string): Promise<FilesCache> {
  const cachePath = join(artifactDir, 'files-cache.json');

  if (!existsSync(cachePath)) {
    return {
      entries: {},
      updatedAt: new Date().toISOString(),
    };
  }

  try {
    const content = await readFile(cachePath, 'utf-8');
    return JSON.parse(content) as FilesCache;
  } catch {
    return {
      entries: {},
      updatedAt: new Date().toISOString(),
    };
  }
}

/**
 * Save the files cache to disk
 */
export async function saveFilesCache(artifactDir: string, cache: FilesCache): Promise<void> {
  if (!existsSync(artifactDir)) {
    await mkdir(artifactDir, { recursive: true });
  }

  const cachePath = join(artifactDir, 'files-cache.json');
  cache.updatedAt = new Date().toISOString();
  await writeFile(cachePath, JSON.stringify(cache, null, 2), 'utf-8');
}

/**
 * Check if a cached entry is still valid
 */
export function isCacheEntryValid(entry: FilesCacheEntry): boolean {
  const expiresAt = new Date(entry.expiresAt);
  const now = new Date();

  // Consider expired if within margin of actual expiration
  return expiresAt.getTime() - now.getTime() > EXPIRATION_MARGIN_MS;
}

/**
 * Get a cached entry if it exists and is valid
 */
export function getCachedEntry(
  cache: FilesCache,
  localPath: string,
  sha256: string
): FilesCacheEntry | null {
  const entry = cache.entries[localPath];

  if (!entry) {
    return null;
  }

  // Check if SHA256 matches (file content unchanged)
  if (entry.sha256 !== sha256) {
    return null;
  }

  // Check if not expired
  if (!isCacheEntryValid(entry)) {
    return null;
  }

  return entry;
}

/**
 * Add or update a cache entry
 */
export function setCacheEntry(cache: FilesCache, entry: FilesCacheEntry): FilesCache {
  return {
    ...cache,
    entries: {
      ...cache.entries,
      [entry.localPath]: entry,
    },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Remove a cache entry
 */
export function removeCacheEntry(cache: FilesCache, localPath: string): FilesCache {
  const { [localPath]: _removed, ...remaining } = cache.entries;
  return {
    ...cache,
    entries: remaining,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Clean up expired entries from the cache
 */
export function cleanExpiredEntries(cache: FilesCache): FilesCache {
  const validEntries: Record<string, FilesCacheEntry> = {};

  for (const [path, entry] of Object.entries(cache.entries)) {
    if (isCacheEntryValid(entry)) {
      validEntries[path] = entry;
    }
  }

  return {
    entries: validEntries,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Get cache statistics
 */
export function getCacheStats(cache: FilesCache): {
  totalEntries: number;
  validEntries: number;
  expiredEntries: number;
  totalSizeBytes: number;
} {
  let validCount = 0;
  let expiredCount = 0;
  let totalSize = 0;

  for (const entry of Object.values(cache.entries)) {
    if (isCacheEntryValid(entry)) {
      validCount++;
    } else {
      expiredCount++;
    }
    // Estimate size from URI length (rough approximation)
    totalSize += entry.uri.length * 2;
  }

  return {
    totalEntries: Object.keys(cache.entries).length,
    validEntries: validCount,
    expiredEntries: expiredCount,
    totalSizeBytes: totalSize,
  };
}
