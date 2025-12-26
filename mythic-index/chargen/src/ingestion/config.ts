/**
 * Ingestion Configuration
 *
 * Loads and validates environment variables for Cloudflare services.
 */

import { config as loadEnv } from 'dotenv';
import { join } from 'path';
import { existsSync } from 'fs';

// Try to load .env from various locations
const envPaths = [
  join(process.cwd(), '.env'),
  join(process.cwd(), '..', '.env'),
  join(process.cwd(), '..', 'frontend', '.env'),
  join(process.cwd(), '..', '..', '.env'),
];

for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    loadEnv({ path: envPath });
    break;
  }
}

export interface IngestionConfig {
  cloudflareAccountId: string;
  cloudflareD1DatabaseId: string;
  cloudflareApiToken: string;
  cloudflareAccountHash?: string;
  cloudflareVectorizeIndexId?: string;
  contentDir: string;
  workspaceId: string;
}

/**
 * Get the content directory path (story-content)
 */
export function getContentDir(): string {
  // Check env var first (highest priority)
  if (process.env.CONTENT_DIR) {
    const envPath = process.env.CONTENT_DIR;
    if (existsSync(envPath)) {
      return envPath;
    }
  }

  // Get the chargen project root (this file is in src/ingestion/)
  const chargenRoot = join(import.meta.dirname, '..', '..');

  // Try to find content directory relative to various locations
  const possiblePaths = [
    // Relative to chargen install location (works when running globally)
    join(chargenRoot, '..', 'MemoryQuill', 'story-content'),
    // Relative to cwd (works when running from project)
    join(process.cwd(), '..', 'MemoryQuill', 'story-content'),
    join(process.cwd(), 'MemoryQuill', 'story-content'),
    join(process.cwd(), '..', '..', 'MemoryQuill', 'story-content'),
  ];

  for (const p of possiblePaths) {
    if (p && existsSync(p)) {
      return p;
    }
  }

  // Default path relative to chargen
  return join(chargenRoot, '..', 'MemoryQuill', 'story-content');
}

/**
 * Check if all required environment variables are set
 */
export function checkIngestionConfig(): { valid: boolean; missing: string[] } {
  const required = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_D1_DATABASE_ID', 'CLOUDFLARE_API_TOKEN'];

  const missing: string[] = [];
  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Get the full ingestion configuration
 */
export function getIngestionConfig(): IngestionConfig {
  const { valid, missing } = checkIngestionConfig();

  if (!valid) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
        'Please set these in your .env file or environment.'
    );
  }

  return {
    cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    cloudflareD1DatabaseId: process.env.CLOUDFLARE_D1_DATABASE_ID!,
    cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN!,
    cloudflareAccountHash: process.env.CLOUDFLARE_ACCOUNT_HASH,
    cloudflareVectorizeIndexId: process.env.CLOUDFLARE_VECTORIZE_INDEX_ID,
    contentDir: getContentDir(),
    workspaceId: process.env.WORKSPACE_ID || 'default',
  };
}

/**
 * Get a summary of configuration status for display
 */
export function getConfigStatus(): {
  d1Configured: boolean;
  imagesConfigured: boolean;
  vectorizeConfigured: boolean;
  contentDirExists: boolean;
  contentDir: string;
} {
  const d1Configured = !!(
    process.env.CLOUDFLARE_ACCOUNT_ID &&
    process.env.CLOUDFLARE_D1_DATABASE_ID &&
    process.env.CLOUDFLARE_API_TOKEN
  );

  const imagesConfigured = !!(
    process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN
  );

  const vectorizeConfigured = !!(
    process.env.CLOUDFLARE_ACCOUNT_ID &&
    process.env.CLOUDFLARE_API_TOKEN &&
    process.env.CLOUDFLARE_VECTORIZE_INDEX_ID
  );

  const contentDir = getContentDir();
  const contentDirExists = existsSync(contentDir);

  return {
    d1Configured,
    imagesConfigured,
    vectorizeConfigured,
    contentDirExists,
    contentDir,
  };
}
