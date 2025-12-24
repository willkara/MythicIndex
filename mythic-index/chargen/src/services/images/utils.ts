/**
 * Image generation utility functions
 */

import type { SafetySetting } from '@google/genai';
import { MIME_TYPES } from './constants.js';

/**
 * Sleep utility for rate limiting
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get MIME type from file path
 */
export function getMimeType(filePath: string): string {
  const ext = filePath.toLowerCase().split('.').pop() || '';
  return MIME_TYPES[ext] || 'image/png';
}

/**
 * Normalize safety settings coming from config (string enums) or direct SafetySetting[]
 */
export function normalizeSafetySettings(
  settings?: Array<SafetySetting | { category: string; threshold: string; method?: string }>
): SafetySetting[] | undefined {
  if (!settings || settings.length === 0) return undefined;
  return settings.map((s) => {
    const base = s as Record<string, unknown>;
    const normalized: SafetySetting = {
      category: base.category as SafetySetting['category'],
      threshold: base.threshold as SafetySetting['threshold'],
    };
    if (base.method) normalized.method = base.method as SafetySetting['method'];
    return normalized;
  });
}

/**
 * Sanitize a string for use as a filename
 */
export function sanitizeFilename(name: string, maxLength = 80): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '')
      .slice(0, maxLength) || 'image'
  );
}

/**
 * Generate a timestamp string for filenames
 */
export function getTimestamp(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Generate a full timestamp for more unique filenames
 */
export function getFullTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}
