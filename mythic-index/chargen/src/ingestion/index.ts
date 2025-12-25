/**
 * Ingestion Module - Main Orchestrator
 *
 * Provides high-level functions for ingesting content into D1 and Cloudflare Images.
 */

import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

// Config
export {
  getIngestionConfig,
  checkIngestionConfig,
  getContentDir,
  getConfigStatus,
} from './config.js';

// Parsers
export { parseCharacterProfile, parseCharacterRelationships } from './parsers/character.js';
export { parseLocationOverview } from './parsers/location.js';
export { parseChapterContent } from './parsers/chapter.js';
export type {
  ParsedCharacter,
  ParsedLocation,
  ParsedChapter,
  SceneMarker,
} from './parsers/types.js';

// Services
export {
  initD1,
  resetD1,
  testConnection as testD1Connection,
  getTableCounts,
  clearAllTables,
} from './services/d1-rest.js';
export {
  initCloudflareImages,
  resetCloudflareImages,
  testConnection as testImagesConnection,
  isCloudflareImagesAvailable,
} from './services/cloudflare-images.js';
export {
  initVectorize,
  resetVectorize,
  getVectorize,
  isVectorizeAvailable,
  testConnection as testVectorizeConnection,
  type VectorRecord,
} from './services/vectorize.js';
export {
  initWorkersAI,
  resetWorkersAI,
  getWorkersAI,
  isWorkersAIAvailable,
  testConnection as testWorkersAIConnection,
} from './services/workers-ai.js';
export { setLogger } from './services/d1-inserts.js';
export {
  insertCharacter,
  insertLocation,
  insertChapter,
  insertRelationship,
  getCharacterIdBySlug,
  getLocationIdBySlug,
  getAllCharacterSlugs,
  getAllLocationSlugs,
  getAllChapterSlugs,
} from './services/d1-inserts.js';
export {
  ingestChapterImagery,
  ingestCharacterImagery,
  ingestLocationImagery,
  ingestAllChapterImagery,
  ingestAllCharacterImagery,
  ingestAllLocationImagery,
  type IngestImageryResult,
} from './services/imagery-ingest.js';

// Import internal functions for orchestration
import { parseCharacterProfile, parseCharacterRelationships } from './parsers/character.js';
import { parseLocationOverview } from './parsers/location.js';
import { parseChapterContent } from './parsers/chapter.js';
import {
  insertCharacter,
  insertLocation,
  insertChapter,
  insertRelationship,
  getCharacterIdBySlug,
} from './services/d1-inserts.js';
import {
  ingestCharacterImagery,
  ingestLocationImagery,
  ingestChapterImagery,
  type IngestImageryResult as _IngestImageryResult,
} from './services/imagery-ingest.js';

// ============================================================================
// Types
// ============================================================================

export interface IngestionProgress {
  phase: string;
  current: number;
  total: number;
  message: string;
}

export type ProgressCallback = (progress: IngestionProgress) => void;

export interface IngestionResult {
  success: boolean;
  stats: {
    characters: number;
    locations: number;
    chapters: number;
    relationships: number;
    imagesUploaded: number;
    imagesSkipped: number;
    imagesLinked: number;
  };
  errors: string[];
}

// ============================================================================
// Discovery Functions
// ============================================================================

/**
 * Get all character slugs from content directory
 */
export async function discoverCharacters(contentDir: string): Promise<string[]> {
  const charactersDir = join(contentDir, 'characters');
  if (!existsSync(charactersDir)) return [];

  const entries = await readdir(charactersDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .filter((e) => existsSync(join(charactersDir, e.name, 'profile.md')))
    .map((e) => e.name);
}

/**
 * Get all location slugs from content directory
 */
export async function discoverLocations(contentDir: string): Promise<string[]> {
  const locationsDir = join(contentDir, 'locations');
  if (!existsSync(locationsDir)) return [];

  const entries = await readdir(locationsDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .filter((e) => existsSync(join(locationsDir, e.name, 'overview.md')))
    .map((e) => e.name);
}

/**
 * Get all chapter slugs from content directory
 */
export async function discoverChapters(contentDir: string): Promise<string[]> {
  const chaptersDir = join(contentDir, 'chapters');
  if (!existsSync(chaptersDir)) return [];

  const entries = await readdir(chaptersDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .filter((e) => existsSync(join(chaptersDir, e.name, 'content.md')))
    .map((e) => e.name)
    .sort(); // Sort chapters by slug (e.g., ch01, ch02, etc.)
}

// ============================================================================
// Single Entity Ingestion
// ============================================================================

/**
 * Ingest a single character (content + imagery)
 */
export async function ingestSingleCharacter(
  slug: string,
  contentDir: string,
  workspaceId: string,
  onProgress?: ProgressCallback
): Promise<{ success: boolean; errors: string[]; imagesUploaded: number }> {
  const errors: string[] = [];
  let imagesUploaded = 0;

  try {
    // Read and parse character profile
    const profilePath = join(contentDir, 'characters', slug, 'profile.md');
    if (!existsSync(profilePath)) {
      return { success: false, errors: [`Profile not found: ${profilePath}`], imagesUploaded: 0 };
    }

    onProgress?.({ phase: 'character', current: 0, total: 2, message: `Parsing ${slug}` });

    const profileContent = await readFile(profilePath, 'utf-8');
    const character = parseCharacterProfile(slug, profileContent);

    // Insert character
    await insertCharacter(workspaceId, character);

    // Parse and insert relationships if file exists
    const relationshipsPath = join(contentDir, 'characters', slug, 'relationships.md');
    if (existsSync(relationshipsPath)) {
      const relContent = await readFile(relationshipsPath, 'utf-8');
      const relationships = parseCharacterRelationships(relContent);

      const sourceCharId = await getCharacterIdBySlug(slug);
      if (sourceCharId) {
        for (const rel of relationships) {
          const targetCharId = await getCharacterIdBySlug(rel.targetSlug);
          if (targetCharId) {
            await insertRelationship(sourceCharId, targetCharId, rel);
          }
        }
      }
    }

    // Ingest imagery
    onProgress?.({
      phase: 'character',
      current: 1,
      total: 2,
      message: `Uploading imagery for ${slug}`,
    });

    const imgResult = await ingestCharacterImagery(slug, contentDir);
    imagesUploaded = imgResult.uploaded;
    errors.push(...imgResult.errors);

    onProgress?.({ phase: 'character', current: 2, total: 2, message: `Completed ${slug}` });

    return { success: true, errors, imagesUploaded };
  } catch (err) {
    errors.push(`Failed to ingest character ${slug}: ${err}`);
    return { success: false, errors, imagesUploaded };
  }
}

/**
 * Ingest a single location (content + imagery)
 */
export async function ingestSingleLocation(
  slug: string,
  contentDir: string,
  workspaceId: string,
  onProgress?: ProgressCallback
): Promise<{ success: boolean; errors: string[]; imagesUploaded: number }> {
  const errors: string[] = [];
  let imagesUploaded = 0;

  try {
    // Read and parse location overview
    const overviewPath = join(contentDir, 'locations', slug, 'overview.md');
    if (!existsSync(overviewPath)) {
      return { success: false, errors: [`Overview not found: ${overviewPath}`], imagesUploaded: 0 };
    }

    onProgress?.({ phase: 'location', current: 0, total: 2, message: `Parsing ${slug}` });

    const overviewContent = await readFile(overviewPath, 'utf-8');
    const location = parseLocationOverview(slug, overviewContent);

    // Insert location
    await insertLocation(workspaceId, location);

    // Ingest imagery
    onProgress?.({
      phase: 'location',
      current: 1,
      total: 2,
      message: `Uploading imagery for ${slug}`,
    });

    const imgResult = await ingestLocationImagery(slug, contentDir);
    imagesUploaded = imgResult.uploaded;
    errors.push(...imgResult.errors);

    onProgress?.({ phase: 'location', current: 2, total: 2, message: `Completed ${slug}` });

    return { success: true, errors, imagesUploaded };
  } catch (err) {
    errors.push(`Failed to ingest location ${slug}: ${err}`);
    return { success: false, errors, imagesUploaded };
  }
}

/**
 * Ingest a single chapter (content + imagery)
 */
export async function ingestSingleChapter(
  slug: string,
  contentDir: string,
  workspaceId: string,
  onProgress?: ProgressCallback
): Promise<{ success: boolean; errors: string[]; imagesUploaded: number }> {
  const errors: string[] = [];
  let imagesUploaded = 0;

  try {
    // Read and parse chapter content
    const contentPath = join(contentDir, 'chapters', slug, 'content.md');
    if (!existsSync(contentPath)) {
      return { success: false, errors: [`Content not found: ${contentPath}`], imagesUploaded: 0 };
    }

    onProgress?.({ phase: 'chapter', current: 0, total: 2, message: `Parsing ${slug}` });

    const chapterContent = await readFile(contentPath, 'utf-8');
    const chapter = parseChapterContent(slug, chapterContent);

    // Insert chapter
    await insertChapter(workspaceId, chapter);

    // Ingest imagery
    onProgress?.({
      phase: 'chapter',
      current: 1,
      total: 2,
      message: `Uploading imagery for ${slug}`,
    });

    const imgResult = await ingestChapterImagery(slug, contentDir);
    imagesUploaded = imgResult.uploaded;
    errors.push(...imgResult.errors);

    onProgress?.({ phase: 'chapter', current: 2, total: 2, message: `Completed ${slug}` });

    return { success: true, errors, imagesUploaded };
  } catch (err) {
    errors.push(`Failed to ingest chapter ${slug}: ${err}`);
    return { success: false, errors, imagesUploaded };
  }
}

// ============================================================================
// Batch Ingestion
// ============================================================================

/**
 * Ingest multiple characters
 */
export async function ingestCharacters(
  slugs: string[],
  contentDir: string,
  workspaceId: string,
  onProgress?: ProgressCallback
): Promise<IngestionResult> {
  const result: IngestionResult = {
    success: true,
    stats: {
      characters: 0,
      locations: 0,
      chapters: 0,
      relationships: 0,
      imagesUploaded: 0,
      imagesSkipped: 0,
      imagesLinked: 0,
    },
    errors: [],
  };

  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    onProgress?.({
      phase: 'characters',
      current: i + 1,
      total: slugs.length,
      message: `Processing ${slug}`,
    });

    const charResult = await ingestSingleCharacter(slug, contentDir, workspaceId);
    if (charResult.success) {
      result.stats.characters++;
      result.stats.imagesUploaded += charResult.imagesUploaded;
    } else {
      result.success = false;
    }
    result.errors.push(...charResult.errors);
  }

  return result;
}

/**
 * Ingest multiple locations
 */
export async function ingestLocations(
  slugs: string[],
  contentDir: string,
  workspaceId: string,
  onProgress?: ProgressCallback
): Promise<IngestionResult> {
  const result: IngestionResult = {
    success: true,
    stats: {
      characters: 0,
      locations: 0,
      chapters: 0,
      relationships: 0,
      imagesUploaded: 0,
      imagesSkipped: 0,
      imagesLinked: 0,
    },
    errors: [],
  };

  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    onProgress?.({
      phase: 'locations',
      current: i + 1,
      total: slugs.length,
      message: `Processing ${slug}`,
    });

    const locResult = await ingestSingleLocation(slug, contentDir, workspaceId);
    if (locResult.success) {
      result.stats.locations++;
      result.stats.imagesUploaded += locResult.imagesUploaded;
    } else {
      result.success = false;
    }
    result.errors.push(...locResult.errors);
  }

  return result;
}

/**
 * Ingest multiple chapters
 */
export async function ingestChapters(
  slugs: string[],
  contentDir: string,
  workspaceId: string,
  onProgress?: ProgressCallback
): Promise<IngestionResult> {
  const result: IngestionResult = {
    success: true,
    stats: {
      characters: 0,
      locations: 0,
      chapters: 0,
      relationships: 0,
      imagesUploaded: 0,
      imagesSkipped: 0,
      imagesLinked: 0,
    },
    errors: [],
  };

  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    onProgress?.({
      phase: 'chapters',
      current: i + 1,
      total: slugs.length,
      message: `Processing ${slug}`,
    });

    const chapResult = await ingestSingleChapter(slug, contentDir, workspaceId);
    if (chapResult.success) {
      result.stats.chapters++;
      result.stats.imagesUploaded += chapResult.imagesUploaded;
    } else {
      result.success = false;
    }
    result.errors.push(...chapResult.errors);
  }

  return result;
}

// ============================================================================
// Full Ingestion Pipeline
// ============================================================================

/**
 * Ingest all content (characters, locations, chapters) with imagery
 */
export async function ingestAllContent(
  contentDir: string,
  workspaceId: string,
  onProgress?: ProgressCallback
): Promise<IngestionResult> {
  const result: IngestionResult = {
    success: true,
    stats: {
      characters: 0,
      locations: 0,
      chapters: 0,
      relationships: 0,
      imagesUploaded: 0,
      imagesSkipped: 0,
      imagesLinked: 0,
    },
    errors: [],
  };

  // Discover all content
  onProgress?.({ phase: 'discovery', current: 0, total: 3, message: 'Discovering content...' });

  const characterSlugs = await discoverCharacters(contentDir);
  const locationSlugs = await discoverLocations(contentDir);
  const chapterSlugs = await discoverChapters(contentDir);

  const totalItems = characterSlugs.length + locationSlugs.length + chapterSlugs.length;
  let processedItems = 0;

  // Phase 1: Characters
  onProgress?.({
    phase: 'characters',
    current: 0,
    total: characterSlugs.length,
    message: 'Ingesting characters...',
  });

  for (const slug of characterSlugs) {
    processedItems++;
    onProgress?.({
      phase: 'characters',
      current: processedItems,
      total: totalItems,
      message: `Character: ${slug}`,
    });

    const charResult = await ingestSingleCharacter(slug, contentDir, workspaceId);
    if (charResult.success) {
      result.stats.characters++;
      result.stats.imagesUploaded += charResult.imagesUploaded;
    }
    result.errors.push(...charResult.errors);
  }

  // Phase 2: Locations
  onProgress?.({
    phase: 'locations',
    current: 0,
    total: locationSlugs.length,
    message: 'Ingesting locations...',
  });

  for (const slug of locationSlugs) {
    processedItems++;
    onProgress?.({
      phase: 'locations',
      current: processedItems,
      total: totalItems,
      message: `Location: ${slug}`,
    });

    const locResult = await ingestSingleLocation(slug, contentDir, workspaceId);
    if (locResult.success) {
      result.stats.locations++;
      result.stats.imagesUploaded += locResult.imagesUploaded;
    }
    result.errors.push(...locResult.errors);
  }

  // Phase 3: Chapters
  onProgress?.({
    phase: 'chapters',
    current: 0,
    total: chapterSlugs.length,
    message: 'Ingesting chapters...',
  });

  for (const slug of chapterSlugs) {
    processedItems++;
    onProgress?.({
      phase: 'chapters',
      current: processedItems,
      total: totalItems,
      message: `Chapter: ${slug}`,
    });

    const chapResult = await ingestSingleChapter(slug, contentDir, workspaceId);
    if (chapResult.success) {
      result.stats.chapters++;
      result.stats.imagesUploaded += chapResult.imagesUploaded;
    }
    result.errors.push(...chapResult.errors);
  }

  result.success = result.errors.length === 0;

  onProgress?.({
    phase: 'complete',
    current: totalItems,
    total: totalItems,
    message: `Ingestion complete: ${result.stats.characters} characters, ${result.stats.locations} locations, ${result.stats.chapters} chapters`,
  });

  return result;
}
