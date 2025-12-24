/**
 * Deterministic Task Key Generation
 *
 * Generates stable, unique task keys for batch processing.
 * Keys are computed from source content, enabling:
 * - Idempotent task identification (same inputs = same key)
 * - Regeneration detection (changed inputs = different key)
 * - Human-readable debugging
 *
 * Format: {entityType}/{slug}/{targetId}@{contentHash}
 */

import { createHash } from 'crypto';
import type { BatchEntityType, BatchTaskConfig, BatchReferenceImage } from '../../types/batch.js';

/** Components that make up a task's content hash */
export interface TaskKeyComponents {
  /** Entity type (character, location, chapter) */
  entityType: BatchEntityType;
  /** Entity slug */
  entitySlug: string;
  /** Target ID within the entity */
  targetId: string;
  /** The prompt text */
  prompt: string;
  /** Negative prompt (if any) */
  negativePrompt?: string;
  /** Reference image hashes (SHA256 of file contents) */
  referenceHashes: string[];
  /** Model being used */
  model: string;
  /** Generation config that affects output */
  config: BatchTaskConfig;
}

/**
 * Compute a deterministic hash from task components.
 * Uses SHA256, truncated to 16 hex characters for readability.
 */
export function computeContentHash(components: TaskKeyComponents): string {
  const hashInput = JSON.stringify({
    prompt: components.prompt,
    negativePrompt: components.negativePrompt || '',
    referenceHashes: components.referenceHashes.sort(), // Sort for determinism
    model: components.model,
    config: {
      aspectRatio: components.config.aspectRatio,
      size: components.config.size,
      quality: components.config.quality,
      // Exclude temperature and other non-deterministic settings
    },
  });

  const hash = createHash('sha256').update(hashInput).digest('hex');
  return hash.substring(0, 16); // First 16 chars for readability
}

/**
 * Generate a deterministic task key.
 *
 * @example
 * // Returns "location/shepherds-rest-inn/exterior@a1b2c3d4e5f6g7h8"
 * generateTaskKey({
 *   entityType: 'location',
 *   entitySlug: 'shepherds-rest-inn',
 *   targetId: 'exterior',
 *   prompt: '...',
 *   referenceHashes: [],
 *   model: 'gemini-3-pro-image-preview',
 *   config: { aspectRatio: '16:9' }
 * });
 */
export function generateTaskKey(components: TaskKeyComponents): string {
  const contentHash = computeContentHash(components);
  return `${components.entityType}/${components.entitySlug}/${components.targetId}@${contentHash}`;
}

/**
 * Parse a task key into its components.
 *
 * @example
 * parseTaskKey('location/shepherds-rest-inn/exterior@a1b2c3d4e5f6g7h8')
 * // Returns { entityType: 'location', entitySlug: 'shepherds-rest-inn', targetId: 'exterior', contentHash: 'a1b2c3d4e5f6g7h8' }
 */
export function parseTaskKey(key: string): {
  entityType: BatchEntityType;
  entitySlug: string;
  targetId: string;
  contentHash: string;
} | null {
  const atIndex = key.lastIndexOf('@');
  if (atIndex === -1) {
    return null;
  }

  const pathPart = key.substring(0, atIndex);
  const contentHash = key.substring(atIndex + 1);

  const parts = pathPart.split('/');
  if (parts.length < 3) {
    return null;
  }

  const entityType = parts[0] as BatchEntityType;
  if (!['character', 'location', 'chapter'].includes(entityType)) {
    return null;
  }

  const entitySlug = parts[1];
  const targetId = parts.slice(2).join('/'); // Target ID may contain slashes

  return {
    entityType,
    entitySlug,
    targetId,
    contentHash,
  };
}

/**
 * Check if two task keys refer to the same target (ignoring content hash).
 * Useful for finding tasks that need regeneration.
 */
export function isSameTarget(key1: string, key2: string): boolean {
  const parsed1 = parseTaskKey(key1);
  const parsed2 = parseTaskKey(key2);

  if (!parsed1 || !parsed2) {
    return false;
  }

  return (
    parsed1.entityType === parsed2.entityType &&
    parsed1.entitySlug === parsed2.entitySlug &&
    parsed1.targetId === parsed2.targetId
  );
}

/**
 * Check if the content hash has changed between two keys for the same target.
 * Returns true if regeneration is needed.
 */
export function needsRegeneration(oldKey: string, newKey: string): boolean {
  if (!isSameTarget(oldKey, newKey)) {
    return false; // Not the same target
  }

  const parsed1 = parseTaskKey(oldKey);
  const parsed2 = parseTaskKey(newKey);

  if (!parsed1 || !parsed2) {
    return true; // Can't parse, assume regeneration needed
  }

  return parsed1.contentHash !== parsed2.contentHash;
}

/**
 * Compute SHA256 hash of a file's contents.
 */
export async function computeFileHash(filePath: string): Promise<string> {
  const { readFile } = await import('fs/promises');
  const content = await readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Compute hashes for multiple reference images.
 */
export async function computeReferenceHashes(references: BatchReferenceImage[]): Promise<string[]> {
  const hashes: string[] = [];

  for (const ref of references) {
    if (ref.sha256) {
      hashes.push(ref.sha256);
    } else {
      const hash = await computeFileHash(ref.path);
      hashes.push(hash);
    }
  }

  return hashes;
}

/**
 * Generate a human-readable task key for display (without hash).
 */
export function getDisplayKey(key: string): string {
  const atIndex = key.lastIndexOf('@');
  if (atIndex === -1) {
    return key;
  }
  return key.substring(0, atIndex);
}

/**
 * Generate a short hash for display purposes.
 */
export function getShortHash(key: string): string {
  const atIndex = key.lastIndexOf('@');
  if (atIndex === -1) {
    return '';
  }
  const hash = key.substring(atIndex + 1);
  return hash.substring(0, 8); // First 8 chars
}
