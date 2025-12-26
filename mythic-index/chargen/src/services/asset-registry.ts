/**
 * Asset Registry Service
 *
 * Builds a unified registry of all image assets across characters, locations,
 * and chapters. Enables ID-based reference resolution for the prompt compiler.
 */

import { readFile, readdir, stat } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import type {
  AssetRegistry,
  AssetRegistryEntry,
  ReferenceRole,
  ExtendedLocationImagery,
} from '../types/prompt-ir.js';
import {
  getEntityDir,
  getImageryPath,
  getImagesDir,
  readImageryYamlSync,
  type EntityType,
  type CharacterImagery,
} from './imagery-yaml.js';

// Base path for story content
const STORY_CONTENT_BASE = join(
  dirname(new URL(import.meta.url).pathname),
  '..',
  '..',
  '..',
  'MemoryQuill',
  'story-content'
);

const THEME_REFERENCE_DIR = join(STORY_CONTENT_BASE, 'theme-reference');

// Singleton instance
let registryInstance: AssetRegistry | null = null;

/**
 * Initialize the asset registry by scanning all entity types
 */
export async function initAssetRegistry(): Promise<AssetRegistry> {
  const registry = new Map<string, AssetRegistryEntry>();

  // Scan all entity types in parallel
  const [characterAssets, locationAssets, chapterAssets] = await Promise.all([
    scanCharacterAssets(),
    scanLocationAssets(),
    scanChapterAssets(),
  ]);

  // Merge into registry
  for (const asset of [...characterAssets, ...locationAssets, ...chapterAssets]) {
    registry.set(asset.asset_id, asset);
  }

  registryInstance = registry;
  return registry;
}

/**
 * Get the asset registry (must call initAssetRegistry first)
 */
export function getAssetRegistry(): AssetRegistry {
  if (!registryInstance) {
    throw new Error('Asset registry not initialized. Call initAssetRegistry() first.');
  }
  return registryInstance;
}

/**
 * Resolve an asset ID to its full entry
 */
export function resolveAsset(assetId: string): AssetRegistryEntry | undefined {
  return getAssetRegistry().get(assetId);
}

/**
 * Resolve multiple asset IDs
 */
export function resolveAssets(assetIds: string[]): AssetRegistryEntry[] {
  return assetIds
    .map((id) => resolveAsset(id))
    .filter((entry): entry is AssetRegistryEntry => entry !== undefined);
}

/**
 * Get the default reference for an entity and role
 */
export function getDefaultReference(
  entityType: EntityType,
  entitySlug: string,
  role: ReferenceRole
): AssetRegistryEntry | undefined {
  const registry = getAssetRegistry();

  // Look for entries matching entity and role
  for (const entry of registry.values()) {
    if (
      entry.entity_type === entityType &&
      entry.entity_slug === entitySlug &&
      entry.role === role
    ) {
      return entry;
    }
  }

  // Fallback: look for entries with matching tags
  const tagMap: Record<ReferenceRole, string[]> = {
    portrait: ['portrait', 'primary-portrait'],
    location_overview: ['overview', 'establishing'],
    zone: ['zone'],
    beat: ['beat', 'scene'],
    mood: ['mood', 'atmosphere'],
    prop: ['prop', 'object'],
    style_ref: ['style', 'reference'],
  };

  const targetTags = tagMap[role] || [];
  for (const entry of registry.values()) {
    if (
      entry.entity_type === entityType &&
      entry.entity_slug === entitySlug &&
      entry.tags?.some((tag) => targetTags.includes(tag.toLowerCase()))
    ) {
      return entry;
    }
  }

  return undefined;
}

/**
 * Get all assets for an entity
 */
export function getAssetsForEntity(
  entityType: EntityType,
  entitySlug: string
): AssetRegistryEntry[] {
  const registry = getAssetRegistry();
  const assets: AssetRegistryEntry[] = [];

  for (const entry of registry.values()) {
    if (entry.entity_type === entityType && entry.entity_slug === entitySlug) {
      assets.push(entry);
    }
  }

  return assets;
}

/**
 * Get all assets with a specific role
 */
export function getAssetsByRole(role: ReferenceRole): AssetRegistryEntry[] {
  const registry = getAssetRegistry();
  return Array.from(registry.values()).filter((entry) => entry.role === role);
}

/**
 * Get global "theme reference" image paths (used as style refs to steer art direction)
 */
export function getThemeReferencePaths(limit?: number): string[] {
  if (!existsSync(THEME_REFERENCE_DIR)) return [];
  try {
    const files = readdirSync(THEME_REFERENCE_DIR)
      .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f) && !f.startsWith('.'))
      .sort((a, b) => a.localeCompare(b));

    const paths = files.map((f) => join(THEME_REFERENCE_DIR, f));
    if (limit !== undefined && limit > 0) return paths.slice(0, limit);
    return paths;
  } catch {
    return [];
  }
}

// ============================================================================
// Scanning Functions
// ============================================================================

/**
 * Scan all character directories for image assets
 */
async function scanCharacterAssets(): Promise<AssetRegistryEntry[]> {
  const basePath = join(STORY_CONTENT_BASE, 'characters');
  const assets: AssetRegistryEntry[] = [];

  if (!existsSync(basePath)) return assets;

  const slugs = await scanEntityDirectory(basePath);

  for (const slug of slugs) {
    const entityAssets = await scanEntityImages('character', slug);
    assets.push(...entityAssets);
  }

  return assets;
}

/**
 * Scan all location directories for image assets
 */
async function scanLocationAssets(): Promise<AssetRegistryEntry[]> {
  const basePath = join(STORY_CONTENT_BASE, 'locations');
  const assets: AssetRegistryEntry[] = [];

  if (!existsSync(basePath)) return assets;

  const slugs = await scanEntityDirectory(basePath);

  for (const slug of slugs) {
    const entityAssets = await scanEntityImages('location', slug);
    assets.push(...entityAssets);
  }

  return assets;
}

/**
 * Scan all chapter directories for image assets
 */
async function scanChapterAssets(): Promise<AssetRegistryEntry[]> {
  const basePath = join(STORY_CONTENT_BASE, 'chapters');
  const assets: AssetRegistryEntry[] = [];

  if (!existsSync(basePath)) return assets;

  const slugs = await scanEntityDirectory(basePath);

  for (const slug of slugs) {
    const entityAssets = await scanEntityImages('chapter', slug);
    assets.push(...entityAssets);
  }

  return assets;
}

/**
 * Scan a single entity's images directory and imagery.yaml
 */
async function scanEntityImages(
  entityType: EntityType,
  slug: string
): Promise<AssetRegistryEntry[]> {
  const assets: AssetRegistryEntry[] = [];
  const entityDir = getEntityDir(entityType, slug);
  const imagesDir = getImagesDir(entityType, slug);
  const imageryPath = getImageryPath(entityType, slug);

  // First, try to read imagery.yaml for image_inventory
  if (existsSync(imageryPath)) {
    try {
      const content = await readFile(imageryPath, 'utf-8');
      const data = parseYaml(content);

      // Handle image_inventory from imagery.yaml (top-level + location overview/zones)
      const inventoryBuckets: any[] = [];
      if (data?.image_inventory && Array.isArray(data.image_inventory)) {
        inventoryBuckets.push(...data.image_inventory);
      }
      if (data?.overview?.image_inventory && Array.isArray(data.overview.image_inventory)) {
        inventoryBuckets.push(...data.overview.image_inventory);
      }
      const zones = Array.isArray(data?.zones) ? data.zones : [];
      for (const zone of zones) {
        if (zone?.image_inventory && Array.isArray(zone.image_inventory)) {
          inventoryBuckets.push(...zone.image_inventory);
        }
        if (zone?.images && Array.isArray(zone.images)) {
          for (const img of zone.images) {
            if (img?.image_inventory && Array.isArray(img.image_inventory)) {
              inventoryBuckets.push(...img.image_inventory);
            }
          }
        }
      }

      const images = Array.isArray(data?.images) ? data.images : [];
      for (const img of images) {
        if (img?.image_inventory && Array.isArray(img.image_inventory)) {
          inventoryBuckets.push(...img.image_inventory);
        }
      }

      for (const item of inventoryBuckets) {
        if (!item?.id || !item?.path) continue;

        const absolutePath = resolve(entityDir, item.path);
        const entry: AssetRegistryEntry = {
          asset_id: item.id,
          entity_type: entityType,
          entity_slug: slug,
          path: absolutePath,
          role: inferRoleFromPath(item.path, item.content?.tags),
          tags: item.content?.tags || [],
          status: item.status || 'approved',
        };

        assets.push(entry);
      }

      // Handle reference_defaults to ensure we have proper role assignments
      if (data?.reference_defaults) {
        for (const [role, assetId] of Object.entries(data.reference_defaults)) {
          if (typeof assetId !== 'string') continue;

          // Find the asset and update its role
          const asset = assets.find((a) => a.asset_id === assetId);
          if (asset) {
            asset.role = role as ReferenceRole;
          }
        }
      }
    } catch {
      // Skip parse errors
    }
  }

  // Also scan images directory for files not in inventory
  if (existsSync(imagesDir)) {
    try {
      const files = await readdir(imagesDir);
      const imageFiles = files.filter(
        (f) => /\.(png|jpg|jpeg|webp)$/i.test(f) && f !== 'archive' && !f.startsWith('.')
      );

      for (const file of imageFiles) {
        const absolutePath = join(imagesDir, file);

        // Check if we already have this file in assets
        const alreadyHave = assets.some(
          (a) =>
            a.path === absolutePath || a.path.endsWith(`/${file}`) || a.path.endsWith(`\\${file}`)
        );

        if (!alreadyHave) {
          // Create an entry based on filename
          const assetId = `${slug}-${file.replace(/\.[^.]+$/, '')}`;
          const entry: AssetRegistryEntry = {
            asset_id: assetId,
            entity_type: entityType,
            entity_slug: slug,
            path: absolutePath,
            role: inferRoleFromPath(file),
            tags: inferTagsFromFilename(file),
            status: 'approved',
          };

          assets.push(entry);
        }
      }
    } catch {
      // Skip read errors
    }
  }

  return assets;
}

/**
 * Infer a role from a file path or tags
 */
function inferRoleFromPath(path: string, tags?: string[]): ReferenceRole | undefined {
  const lowerPath = path.toLowerCase();
  const lowerTags = (tags || []).map((t) => t.toLowerCase());

  if (lowerPath.includes('portrait') || lowerTags.includes('portrait')) {
    return 'portrait';
  }
  if (lowerPath.includes('overview') || lowerTags.includes('overview')) {
    return 'location_overview';
  }
  if (lowerTags.includes('zone')) {
    return 'zone';
  }
  if (lowerTags.includes('beat') || lowerTags.includes('scene')) {
    return 'beat';
  }
  if (lowerTags.includes('mood') || lowerTags.includes('atmosphere')) {
    return 'mood';
  }

  return undefined;
}

/**
 * Infer tags from a filename
 */
function inferTagsFromFilename(filename: string): string[] {
  const tags: string[] = [];
  const lower = filename.toLowerCase();

  if (lower.includes('portrait')) tags.push('portrait');
  if (lower.includes('overview')) tags.push('overview');
  if (lower.includes('establishing')) tags.push('establishing');
  if (lower.includes('zone')) tags.push('zone');

  return tags;
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

// ============================================================================
// Location-specific Helpers
// ============================================================================

/**
 * Read and parse a location's extended imagery.yaml
 */
export async function readLocationImagery(slug: string): Promise<ExtendedLocationImagery | null> {
  const imageryPath = getImageryPath('location', slug);

  try {
    const content = await readFile(imageryPath, 'utf-8');
    return parseYaml(content) as ExtendedLocationImagery;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    // Log YAML parse errors but don't crash
    if ((error as Error).name === 'YAMLParseError') {
      console.error(
        `Warning: Failed to parse imagery.yaml for ${slug}: ${(error as Error).message}`
      );
      return null;
    }
    throw error;
  }
}

/**
 * Zone aliases for semantic matching.
 * Maps common zone names to their variations and related terms.
 */
const ZONE_ALIASES: Record<string, string[]> = {
  nave: ['vitrified-nave', 'temple-nave', 'main-hall', 'central-hall'],
  transept: ['memorial', 'side-chamber', 'crossing'],
  labyrinth: ['glass-labyrinth', 'crystalline-maze', 'maze'],
  courtyard: ['yard', 'plaza', 'square', 'court'],
  threshold: ['entrance', 'gate', 'pillars', 'doorway'],
  sanctuary: ['shrine', 'chapel', 'sacred'],
};

/**
 * Location aliases for complex sites with multiple "virtual" sub-locations.
 * Maps conceptual location names to their actual parent location.
 */
const LOCATION_ALIASES: Record<string, string> = {
  // Undershade Canyon virtual sub-locations
  'undershade-temple-nave': 'undershade-canyon',
  'undershade-glass-labyrinth': 'undershade-canyon',
  'undershade-transept': 'undershade-canyon',
};

/**
 * Find a reference image for a specific zone within a location.
 * Searches the location's zones for matching zone and returns its image path.
 *
 * Zone matching strategy (in order):
 * 1. If zone is "overview", use the location's overview image
 * 2. Try exact zone match, then aliases for broader semantic matching
 * 3. Match part slug, zone_type, or name containing zone variants
 *
 * @param locationSlug - Location slug (e.g., "undershade-canyon")
 * @param zone - Zone identifier (e.g., "rim", "overview", "threshold")
 * @returns Absolute path to zone image, or null if not found
 */
export function findZoneReferencePath(locationSlug: string, zone: string): string | null {
  // Handle "overview" zone specially
  if (zone === 'overview') {
    const defaultRef = getDefaultReference('location', locationSlug, 'location_overview');
    if (defaultRef && existsSync(defaultRef.path)) {
      return defaultRef.path;
    }
    return null;
  }

  // Try location alias if the direct location doesn't exist
  let effectiveLocationSlug = locationSlug;
  const imageryPath = getImageryPath('location', locationSlug);
  if (!existsSync(imageryPath)) {
    const aliasedLocation = LOCATION_ALIASES[locationSlug];
    if (aliasedLocation) {
      effectiveLocationSlug = aliasedLocation;
    } else {
      return null;
    }
  }

  const effectiveImageryPath = getImageryPath('location', effectiveLocationSlug);
  if (!existsSync(effectiveImageryPath)) return null;

  try {
    const content = readFileSync(effectiveImageryPath, 'utf-8');
    const data = parseYaml(content);

    const zones = Array.isArray(data?.zones) ? data.zones : [];
    if (zones.length === 0) {
      return null;
    }

    const entityDir = getEntityDir('location', effectiveLocationSlug);

    // Build list of zone variants to try (original + aliases)
    const zoneVariants = [zone, ...(ZONE_ALIASES[zone.toLowerCase()] || [])];

    // Try to find a matching part using all variants
    for (const part of zones) {
      for (const variant of zoneVariants) {
        const lowerVariant = variant.toLowerCase();

        const partSlug = part.slug || (part as { zone_slug?: string }).zone_slug;
        // Match by slug containing zone variant
        const slugMatch = partSlug?.toLowerCase().includes(lowerVariant);
        // Match by zone_type
        const zoneTypeMatch = part.zone_type?.toLowerCase() === lowerVariant;
        // Match by name containing zone variant
        const nameMatch = part.name?.toLowerCase().includes(lowerVariant);

        if (slugMatch || zoneTypeMatch || nameMatch) {
          // Found a matching part, look for approved images
          if (part.image_inventory && Array.isArray(part.image_inventory)) {
            for (const entry of part.image_inventory) {
              if (entry.status === 'approved' && entry.path) {
                const fullPath = join(entityDir, entry.path);
                if (existsSync(fullPath)) {
                  return fullPath;
                }
              }
            }
          }

          if (part.images && Array.isArray(part.images)) {
            for (const img of part.images) {
              if (!img?.image_inventory || !Array.isArray(img.image_inventory)) continue;
              for (const entry of img.image_inventory) {
                if (entry.status === 'approved' && entry.path) {
                  const fullPath = join(entityDir, entry.path);
                  if (existsSync(fullPath)) {
                    return fullPath;
                  }
                }
              }
            }
          }
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Get reference image paths for a location
 *
 * Tries explicit reference IDs first, then falls back to the location's
 * default overview reference.
 */
export function getLocationReferencePaths(slug: string, referenceIds?: string[]): string[] {
  const paths: string[] = [];

  if (referenceIds && referenceIds.length > 0) {
    // Try explicit reference IDs first
    for (const id of referenceIds) {
      const asset = resolveAsset(id);
      if (asset && existsSync(asset.path)) {
        paths.push(asset.path);
      }
    }
  }

  // Fallback: use default overview reference
  if (paths.length === 0) {
    const defaultRef = getDefaultReference('location', slug, 'location_overview');
    if (defaultRef && existsSync(defaultRef.path)) {
      paths.push(defaultRef.path);
    }
  }

  return paths;
}

/**
 * Get the reference portrait path for a character
 *
 * This is the canonical source for finding a character's reference portrait.
 * Checks imagery.yaml for is_reference_portrait entry first,
 * then falls back to portrait.png in the images directory.
 *
 * @param slug - Character slug
 * @returns Absolute path to the reference portrait, or null if not found
 */
export function getCharacterReferencePortrait(slug: string): string | null {
  // First check imagery.yaml for explicit reference portrait
  try {
    const imageryData = readImageryYamlSync('character', slug);
    if (imageryData && 'image_inventory' in imageryData) {
      const inventory = (imageryData as CharacterImagery).image_inventory || [];
      const refPortrait = inventory.find((e) => e.is_reference_portrait === true);
      if (refPortrait) {
        const portraitPath = join(getEntityDir('character', slug), refPortrait.path);
        if (existsSync(portraitPath)) {
          return portraitPath;
        }
      }
    }
  } catch {
    // Ignore errors reading imagery.yaml, fall through to file check
  }

  // Fall back to direct portrait.png check
  const portraitPath = join(getImagesDir('character', slug), 'portrait.png');
  if (existsSync(portraitPath)) {
    return portraitPath;
  }

  return null;
}

/**
 * Get reference image paths for a character
 *
 * Tries explicit reference IDs first, then falls back to the character's
 * canonical reference portrait (marked with is_reference_portrait: true
 * in imagery.yaml).
 */
export function getCharacterReferencePaths(slug: string, referenceIds?: string[]): string[] {
  const paths: string[] = [];

  if (referenceIds && referenceIds.length > 0) {
    // Try explicit reference IDs first
    for (const id of referenceIds) {
      const asset = resolveAsset(id);
      if (asset && existsSync(asset.path)) {
        paths.push(asset.path);
      }
    }
  }

  // Fallback: use is_reference_portrait from imagery.yaml
  if (paths.length === 0) {
    const portraitPath = getCharacterReferencePortrait(slug);
    if (portraitPath) {
      paths.push(portraitPath);
    }
  }

  return paths;
}
