/**
 * Entity cache service for chargen CLI
 * Scans and caches information about characters, locations, and chapters on startup
 */

import { readFile, readdir, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import {
  listCharacterDirs,
  readImageIdeasYaml,
  getImagesDir,
  getImageryPath,
  getEntityDir,
} from './imagery-yaml.js';
import { getContentDir } from '../ingestion/config.js';
import type {
  CharacterCacheEntry,
  LocationCacheEntry,
  ChapterCacheEntry,
  EntityCache,
} from '../types/entity-cache.js';

// Use centralized content directory from config
const getStoryContentBase = () => getContentDir();

// Singleton instance
let cacheInstance: EntityCache | null = null;

/**
 * Initialize the entity cache by scanning all entity types in parallel
 */
export async function initEntityCache(): Promise<EntityCache> {
  const [characters, locations, chapters] = await Promise.all([
    scanCharacters(),
    scanLocations(),
    scanChapters(),
  ]);

  cacheInstance = {
    characters,
    locations,
    chapters,
    scannedAt: new Date(),
  };

  return cacheInstance;
}

/**
 * Get the entity cache (must call initEntityCache first)
 */
export function getEntityCache(): EntityCache {
  if (!cacheInstance) {
    throw new Error('Entity cache not initialized. Call initEntityCache() first.');
  }
  return cacheInstance;
}

/**
 * Get cached characters
 */
export function getCachedCharacters(): CharacterCacheEntry[] {
  return getEntityCache().characters;
}

/**
 * Get cached locations
 */
export function getCachedLocations(): LocationCacheEntry[] {
  return getEntityCache().locations;
}

/**
 * Get cached chapters
 */
export function getCachedChapters(): ChapterCacheEntry[] {
  return getEntityCache().chapters;
}

/**
 * Scan all characters and extract metadata
 */
async function scanCharacters(): Promise<CharacterCacheEntry[]> {
  const slugs = await listCharacterDirs();

  // Filter out non-directories
  const validSlugs: string[] = [];
  for (const slug of slugs) {
    const entityDir = getEntityDir('character', slug);
    try {
      const stats = await stat(entityDir);
      if (stats.isDirectory()) {
        validSlugs.push(slug);
      }
    } catch {
      // Skip entries that can't be accessed
    }
  }

  return Promise.all(
    validSlugs.map(async (slug) => {
      // Check for image_ideas.yaml
      const imageIdeas = await readImageIdeasYaml(slug);
      const name = imageIdeas?.character?.name || formatSlugAsName(slug);
      const summary = imageIdeas?.character?.summary;

      // Count images
      const imagesDir = getImagesDir('character', slug);
      const imageCount = await countImages(imagesDir);
      const hasPortrait = existsSync(join(imagesDir, 'portrait.png'));

      return {
        slug,
        name,
        hasImageIdeas: imageIdeas !== null,
        imageCount,
        hasPortrait,
        summary,
      };
    })
  );
}

/**
 * Scan all locations and extract metadata
 */
async function scanLocations(): Promise<LocationCacheEntry[]> {
  const basePath = join(getStoryContentBase(), 'locations');
  const slugs = await scanEntityDirectory(basePath);

  return Promise.all(
    slugs.map(async (slug) => {
      const entityDir = getEntityDir('location', slug);
      const imagesDir = getImagesDir('location', slug);

      // Try to read overview.md for name
      let name = formatSlugAsName(slug);
      const overviewPath = join(entityDir, 'overview.md');
      if (existsSync(overviewPath)) {
        try {
          const content = await readFile(overviewPath, 'utf-8');
          const firstLine = content.split('\n')[0];
          if (firstLine.startsWith('# ')) {
            name = firstLine.replace(/^#\s+/, '');
          }
        } catch {
          // Skip read errors
        }
      }

      // Check for imagery.yaml
      const imageryPath = getImageryPath('location', slug);
      const hasImagery = existsSync(imageryPath);

      // Count images
      const imageCount = await countImages(imagesDir);

      return { slug, name, hasImagery, imageCount };
    })
  );
}

/**
 * Scan all chapters and extract metadata
 */
async function scanChapters(): Promise<ChapterCacheEntry[]> {
  const basePath = join(getStoryContentBase(), 'chapters');
  const slugs = await scanEntityDirectory(basePath);

  return Promise.all(
    slugs.map(async (slug) => {
      const entityDir = getEntityDir('chapter', slug);
      const imagesDir = getImagesDir('chapter', slug);

      // Try to read chapter-imagery.yaml for title and number
      let title = formatSlugAsName(slug);
      let chapterNumber: number | undefined;

      const chapterImageryPath = join(entityDir, 'chapter-imagery.yaml');
      if (existsSync(chapterImageryPath)) {
        try {
          const content = await readFile(chapterImageryPath, 'utf-8');
          const data = parseYaml(content);
          if (data?.chapter_title) title = data.chapter_title;
          if (data?.chapter_number) chapterNumber = data.chapter_number;
        } catch {
          // Skip parse errors
        }
      }

      // Check for imagery.yaml (for future use)
      const imageryPath = getImageryPath('chapter', slug);
      const hasImagery = existsSync(imageryPath);

      // Count images
      const imageCount = await countImages(imagesDir);

      return { slug, title, chapterNumber, hasImagery, imageCount };
    })
  );
}

// ============================================================================
// Helper Utilities
// ============================================================================

/**
 * Count image files in a directory
 */
async function countImages(dir: string): Promise<number> {
  if (!existsSync(dir)) return 0;
  try {
    const files = await readdir(dir);
    return files.filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f)).length;
  } catch {
    return 0;
  }
}

/**
 * Format a slug as a readable name
 */
function formatSlugAsName(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Scan a directory for entity slugs (directories only)
 */
async function scanEntityDirectory(basePath: string): Promise<string[]> {
  if (!existsSync(basePath)) return [];
  try {
    const entries = await readdir(basePath);
    const dirs: string[] = [];

    for (const entry of entries) {
      if (entry.startsWith('.')) continue;

      const fullPath = join(basePath, entry);
      try {
        const stats = await stat(fullPath);
        if (stats.isDirectory()) {
          dirs.push(entry);
        }
      } catch {
        // Skip entries that can't be accessed
      }
    }

    return dirs.sort();
  } catch {
    return [];
  }
}
