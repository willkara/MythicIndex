/**
 * Entity cache types for chargen CLI
 * Stores pre-scanned information about characters, locations, and chapters
 */

/**
 * Cache entry for a character entity
 */
export interface CharacterCacheEntry {
  slug: string;
  name: string;
  hasImageIdeas: boolean;
  imageCount: number;
  hasPortrait: boolean;
  summary?: string;
}

/**
 * Cache entry for a location entity
 */
export interface LocationCacheEntry {
  slug: string;
  name: string;
  hasImagery: boolean;
  imageCount: number;
}

/**
 * Cache entry for a chapter entity
 */
export interface ChapterCacheEntry {
  slug: string;
  title: string;
  chapterNumber?: number;
  hasImagery: boolean;
  imageCount: number;
}

/**
 * Complete entity cache containing all cached entities
 */
export interface EntityCache {
  characters: CharacterCacheEntry[];
  locations: LocationCacheEntry[];
  chapters: ChapterCacheEntry[];
  scannedAt: Date;
}
