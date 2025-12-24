/**
 * Reference image resolution helpers
 * Maps stable imagery.yaml IDs to concrete image file paths.
 */

import { access, readdir } from 'fs/promises';
import { join } from 'path';
import {
  readImageryYaml,
  getImagesDir,
  type ChapterImagery,
  type CharacterImagery,
  type LocationImagery,
  type ImageInventoryEntry,
  type ChapterCharacterPresent,
} from './imagery-yaml.js';

export interface ReferenceResolverCache {
  characters: Map<string, CharacterImagery | null>;
  locations: Map<string, LocationImagery | null>;
}

export interface ReferencePromptContext {
  reference_images?: string[];
  characters_present?: ChapterCharacterPresent[];
  location?: string;
}

export function createReferenceResolverCache(): ReferenceResolverCache {
  return {
    characters: new Map(),
    locations: new Map(),
  };
}

function resolveInventoryPath(entry: ImageInventoryEntry, imagesDir: string): string {
  if (entry.path.startsWith('/')) {
    return entry.path;
  }
  return join(imagesDir, entry.path.replace(/^images\//, ''));
}

async function getCharacterImagery(
  slug: string,
  cache: ReferenceResolverCache
): Promise<CharacterImagery | null> {
  if (cache.characters.has(slug)) {
    return cache.characters.get(slug) || null;
  }
  const data = (await readImageryYaml('character', slug)) as CharacterImagery | null;
  cache.characters.set(slug, data);
  return data;
}

async function getLocationImagery(
  slug: string,
  cache: ReferenceResolverCache
): Promise<LocationImagery | null> {
  if (cache.locations.has(slug)) {
    return cache.locations.get(slug) || null;
  }
  const data = (await readImageryYaml('location', slug)) as LocationImagery | null;
  cache.locations.set(slug, data);
  return data;
}

function findInventoryEntryById(
  inventory: ImageInventoryEntry[] | undefined,
  id: string
): ImageInventoryEntry | undefined {
  return inventory?.find(entry => entry.id === id);
}

function findInventoryEntryByTag(
  inventory: ImageInventoryEntry[] | undefined,
  tag: string
): ImageInventoryEntry | undefined {
  return inventory?.find(entry => entry.content?.tags?.includes(tag));
}

function findInventoryEntryByPathMatch(
  inventory: ImageInventoryEntry[] | undefined,
  match: RegExp
): ImageInventoryEntry | undefined {
  return inventory?.find(entry => match.test(entry.path) || match.test(entry.id));
}

export async function resolveCharacterReferencePaths(
  slug: string,
  referenceIds: string[] | undefined,
  cache: ReferenceResolverCache
): Promise<string[]> {
  const imagery = await getCharacterImagery(slug, cache);
  const imagesDir = getImagesDir('character', slug);
  const inventory = imagery?.image_inventory || [];

  const resolved: string[] = [];
  if (referenceIds && referenceIds.length > 0) {
    for (const id of referenceIds) {
      const entry = findInventoryEntryById(inventory, id);
      if (entry) {
        resolved.push(resolveInventoryPath(entry, imagesDir));
      }
    }
    if (resolved.length > 0) {
      return resolved;
    }
  }

  // Default portrait selection
  const defaultId = imagery?.reference_defaults?.portrait;
  if (defaultId) {
    const entry = findInventoryEntryById(inventory, defaultId);
    if (entry) {
      return [resolveInventoryPath(entry, imagesDir)];
    }
  }

  const portraitEntry =
    findInventoryEntryByPathMatch(inventory, /portrait/i) ||
    findInventoryEntryByTag(inventory, 'primary-portrait') ||
    findInventoryEntryByTag(inventory, 'portrait');

  if (portraitEntry) {
    return [resolveInventoryPath(portraitEntry, imagesDir)];
  }

  const portraitPath = join(imagesDir, 'portrait.png');
  try {
    await access(portraitPath);
    return [portraitPath];
  } catch {
    // Ignore missing portrait
  }

  if (inventory[0]) {
    return [resolveInventoryPath(inventory[0], imagesDir)];
  }

  return [];
}

export async function resolveLocationReferencePaths(
  slug: string,
  referenceIds: string[] | undefined,
  cache: ReferenceResolverCache
): Promise<string[]> {
  const imagery = await getLocationImagery(slug, cache);
  const imagesDir = getImagesDir('location', slug);
  const inventory = imagery?.image_inventory || [];

  const resolved: string[] = [];
  if (referenceIds && referenceIds.length > 0) {
    for (const id of referenceIds) {
      const entry = findInventoryEntryById(inventory, id);
      if (entry) {
        resolved.push(resolveInventoryPath(entry, imagesDir));
      }
    }
    if (resolved.length > 0) {
      return resolved;
    }
  }

  const defaultId = imagery?.reference_defaults?.overview;
  if (defaultId) {
    const entry = findInventoryEntryById(inventory, defaultId);
    if (entry) {
      return [resolveInventoryPath(entry, imagesDir)];
    }
  }

  const overviewEntry =
    findInventoryEntryByPathMatch(inventory, /overview/i) ||
    findInventoryEntryByTag(inventory, 'overview');

  if (overviewEntry) {
    return [resolveInventoryPath(overviewEntry, imagesDir)];
  }

  if (inventory[0]) {
    return [resolveInventoryPath(inventory[0], imagesDir)];
  }

  try {
    const files = await readdir(imagesDir);
    const imageFile = files.find(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
    if (imageFile) {
      return [join(imagesDir, imageFile)];
    }
  } catch {
    // Ignore missing directory
  }

  return [];
}

export async function resolveChapterPromptReferences(
  chapterData: ChapterImagery,
  prompt: ReferencePromptContext,
  cache: ReferenceResolverCache
): Promise<string[]> {
  const resolved: string[] = [];

  if (prompt.reference_images && prompt.reference_images.length > 0) {
    const characterRefMap = new Map<string, string>();
    (chapterData.character_refs || []).forEach(ref => {
      (ref.reference_images || []).forEach(id => characterRefMap.set(id, ref.slug));
    });

    const locationRefMap = new Map<string, string>();
    (chapterData.locations || []).forEach(loc => {
      (loc.reference_images || []).forEach(id => locationRefMap.set(id, loc.slug));
    });

    for (const id of prompt.reference_images) {
      const characterSlug = characterRefMap.get(id);
      if (characterSlug) {
        const refs = await resolveCharacterReferencePaths(characterSlug, [id], cache);
        resolved.push(...refs);
        continue;
      }

      const locationSlug = locationRefMap.get(id);
      if (locationSlug) {
        const refs = await resolveLocationReferencePaths(locationSlug, [id], cache);
        resolved.push(...refs);
      }
    }

    if (resolved.length > 0) {
      return dedupe(resolved);
    }
  }

  const characterSlugs = (prompt.characters_present || [])
    .map(c => c.slug)
    .filter((slug): slug is string => Boolean(slug));

  for (const slug of characterSlugs) {
    const refs = await resolveCharacterReferencePaths(slug, undefined, cache);
    resolved.push(...refs);
  }

  if (prompt.location) {
    const refs = await resolveLocationReferencePaths(prompt.location, undefined, cache);
    resolved.push(...refs);
  }

  return dedupe(resolved);
}

function dedupe(paths: string[]): string[] {
  return Array.from(new Set(paths));
}
