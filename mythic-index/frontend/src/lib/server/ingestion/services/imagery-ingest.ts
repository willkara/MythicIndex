/**
 * Imagery Ingestion Service
 *
 * Parses imagery.yaml files, uploads images to Cloudflare Images, and creates database records.
 * Supports chapter, character, and location imagery with role-based classification.
 */

import { readFile } from 'fs/promises';
import { parse as parseYaml } from 'yaml';
import { join } from 'path';
import { existsSync } from 'fs';
import { query } from './d1-rest';
import { uploadImage, computeFileHash, getFileInfo, extractBaseUrl } from './cloudflare-images';
import {
  insertImageAsset,
  insertImageLink,
  getImageAssetByHash,
  type ImageAssetData,
  type ImageLinkData,
} from './d1-inserts';
import { normalizeImagery, type ImageryKind, type NormalizedImage } from './imagery-normalize';

// ============================================================================
// Types
// ============================================================================

/**
 * Raw imagery YAML data (processed by normalizer)
 */
export type ImageryYaml = any; // parsed by normalizer

/**
 * Result of imagery ingestion operation
 */
export interface IngestImageryResult {
  uploaded: number;
  skipped: number;
  linked: number;
  errors: string[];
}

// ============================================================================
// Logging
// ============================================================================

export type LogFn = (
  level: 'info' | 'debug' | 'warn',
  message: string,
  data?: Record<string, unknown>
) => void;

let logger: LogFn | null = null;

export function setImageryLogger(fn: LogFn | null): void {
  logger = fn;
}

function log(
  level: 'info' | 'debug' | 'warn',
  message: string,
  data?: Record<string, unknown>
): void {
  if (logger) logger(level, message, data);
}

function filterUsableImages(
  images: NormalizedImage[],
  kind: ImageryKind,
  slug: string
): NormalizedImage[] {
  const usable = images.filter(img => !!img.filePath);
  if (usable.length !== images.length) {
    log('debug', 'Skipping imagery entries without file paths', {
      kind,
      slug,
      skipped: images.length - usable.length,
    });
  }
  return usable;
}

// ============================================================================
// ID Generation
// ============================================================================

function generateId(): string {
  return crypto.randomUUID();
}

// ============================================================================
// Role Mapping
// ============================================================================

function mapRole(
  kind: ImageryKind,
  image: NormalizedImage,
  defaultRole?: 'portrait' | 'scene' | 'header' | 'gallery'
): 'portrait' | 'scene' | 'header' | 'gallery' {
  const hint = (image.roleHint || image.imageType || '').toLowerCase();
  const tags = image.tags?.map(t => t.toLowerCase()) ?? [];
  const name = image.fileName.toLowerCase();

  const isOverviewReference = image.group?.startsWith('overview') || hint === 'overview';
  const isReference = image.group?.includes('reference') && !isOverviewReference;

  if (kind === 'character') {
    if (
      hint === 'portrait' ||
      tags.includes('primary-portrait') ||
      name === 'portrait.png' ||
      image.isPrimary
    ) {
      return 'portrait';
    }
    return 'gallery';
  }

  if (kind === 'chapter') {
    if (hint === 'hero') return 'header';
    if (['pivot', 'action', 'moment', 'scene'].includes(hint)) return 'scene';
    if (hint === 'symbol' || hint === 'emotion') return 'gallery';
    return defaultRole ?? 'scene';
  }

  // location or fallback
  if (isOverviewReference || hint === 'hero' || hint === 'establishing') return 'header';
  if (isReference) return 'gallery';
  return defaultRole ?? 'scene';
}

// ============================================================================
// Chapter Imagery Ingestion
// ============================================================================

/**
 * Ingest imagery.yaml for a chapter
 *
 * Parses chapter imagery.yaml, uploads images to Cloudflare, and creates
 * database records linking images to scenes and content.
 *
 * @param chapterSlug - Chapter slug identifier
 * @param contentDir - Base content directory path
 * @returns Result with upload/skip/link counts and errors
 */
export async function ingestChapterImagery(
  chapterSlug: string,
  contentDir: string
): Promise<IngestImageryResult> {
  const result: IngestImageryResult = { uploaded: 0, skipped: 0, linked: 0, errors: [] };

  const imageryPath = join(contentDir, 'chapters', chapterSlug, 'imagery.yaml');
  if (!existsSync(imageryPath)) {
    log('debug', 'No imagery.yaml found', { chapter: chapterSlug });
    return result; // No imagery.yaml, nothing to do
  }

  log('info', 'Processing chapter imagery', { chapter: chapterSlug });

  // Parse imagery.yaml
  let imagery: ImageryYaml;
  try {
    const yamlContent = await readFile(imageryPath, 'utf-8');
    imagery = parseYaml(yamlContent) as ImageryYaml;
  } catch (err) {
    result.errors.push(`Failed to parse imagery.yaml: ${err}`);
    return result;
  }

  // Normalize images (new schema)
  const images = normalizeImagery('chapter', imagery);
  const usableImages = filterUsableImages(images, 'chapter', chapterSlug);

  log('debug', 'Found generated images', { total: images.length, usable: usableImages.length });

  if (usableImages.length === 0) {
    return result;
  }

  // Get content_item ID for this chapter
  const contentItems = await query<{ id: string }>(
    "SELECT id FROM content_item WHERE kind = 'chapter' AND slug = ?",
    [chapterSlug]
  );

  if (contentItems.length === 0) {
    result.errors.push(`Chapter not found in DB: ${chapterSlug}`);
    return result;
  }

  const contentId = contentItems[0].id;
  const chapterDir = join(contentDir, 'chapters', chapterSlug);

  // Preload scene slug -> scene id for this chapter
  const scenes = await query<{ id: string; slug: string }>(
    'SELECT id, slug FROM scene WHERE content_id = ?',
    [contentId]
  );
  const sceneIdBySlug = new Map<string, string>();
  for (const scene of scenes) {
    sceneIdBySlug.set(scene.slug, scene.id);
  }

  // Process each image
  for (const img of usableImages) {
    const sceneId = img.sceneSlug ? sceneIdBySlug.get(img.sceneSlug) : undefined;
    if (img.sceneSlug && !sceneId) {
      result.errors.push(`Scene not found for slug: ${img.sceneSlug}`);
    }
    const imgResult = await processImage('chapter', img, chapterDir, contentId, 'scene', sceneId);
    result.uploaded += imgResult.uploaded;
    result.skipped += imgResult.skipped;
    result.linked += imgResult.linked;
    result.errors.push(...imgResult.errors);
  }

  log('info', 'Chapter imagery complete', {
    chapter: chapterSlug,
    uploaded: result.uploaded,
    Skipped: result.skipped,
    linked: result.linked,
  });

  return result;
}

// ============================================================================
// Character Imagery Ingestion
// ============================================================================

/**
 * Ingest imagery.yaml for a character
 *
 * Parses character imagery.yaml, uploads images to Cloudflare, and creates
 * database records. Links portrait images to character records.
 *
 * @param characterSlug - Character slug identifier
 * @param contentDir - Base content directory path
 * @returns Result with upload/skip/link counts and errors
 */
export async function ingestCharacterImagery(
  characterSlug: string,
  contentDir: string
): Promise<IngestImageryResult> {
  const result: IngestImageryResult = { uploaded: 0, skipped: 0, linked: 0, errors: [] };

  const imageryPath = join(contentDir, 'characters', characterSlug, 'imagery.yaml');
  if (!existsSync(imageryPath)) {
    log('debug', 'No imagery.yaml found', { character: characterSlug });
    return result;
  }

  log('info', 'Processing character imagery', { character: characterSlug });

  // Parse imagery.yaml
  let imagery: ImageryYaml;
  try {
    const yamlContent = await readFile(imageryPath, 'utf-8');
    imagery = parseYaml(yamlContent) as ImageryYaml;
  } catch (err) {
    result.errors.push(`Failed to parse imagery.yaml: ${err}`);
    return result;
  }

  // Collect all generated images (normalized)
  const images = normalizeImagery('character', imagery);
  const usableImages = filterUsableImages(images, 'character', characterSlug);
  log('debug', 'Found generated images', { total: images.length, usable: usableImages.length });

  if (usableImages.length === 0) {
    return result;
  }

  // Get character's content_item ID (if they have one)
  const characters = await query<{ id: string; content_item_id: string | null }>(
    'SELECT id, content_item_id FROM character WHERE slug = ?',
    [characterSlug]
  );

  if (characters.length === 0) {
    result.errors.push(`Character not found in DB: ${characterSlug}`);
    return result;
  }

  const characterDir = join(contentDir, 'characters', characterSlug);

  // For characters, we might not have a content_item_id
  // If we do, link images there; otherwise, just upload and track in image_asset
  const contentId = characters[0].content_item_id;

  for (const img of usableImages) {
    const imgResult = await processImage('character', img, characterDir, contentId, 'portrait');
    result.uploaded += imgResult.uploaded;
    result.skipped += imgResult.skipped;
    result.linked += imgResult.linked;
    result.errors.push(...imgResult.errors);
  }

  log('info', 'Character imagery complete', {
    character: characterSlug,
    uploaded: result.uploaded,
    skipped: result.skipped,
    linked: result.linked,
  });

  return result;
}

// ============================================================================
// Location Imagery Ingestion
// ============================================================================

/**
 * Ingest imagery.yaml for a location
 *
 * Parses location imagery.yaml, uploads images to Cloudflare, and creates
 * database records with appropriate roles (header, scene, gallery).
 * Links images to zones when zone information is available.
 *
 * @param locationSlug - Location slug identifier
 * @param contentDir - Base content directory path
 * @returns Result with upload/skip/link counts and errors
 */
export async function ingestLocationImagery(
  locationSlug: string,
  contentDir: string
): Promise<IngestImageryResult> {
  const result: IngestImageryResult = { uploaded: 0, skipped: 0, linked: 0, errors: [] };

  const imageryPath = join(contentDir, 'locations', locationSlug, 'imagery.yaml');
  if (!existsSync(imageryPath)) {
    log('debug', 'No imagery.yaml found', { location: locationSlug });
    return result;
  }

  log('info', 'Processing location imagery', { location: locationSlug });

  // Parse imagery.yaml
  let imagery: ImageryYaml;
  try {
    const yamlContent = await readFile(imageryPath, 'utf-8');
    imagery = parseYaml(yamlContent) as ImageryYaml;
  } catch (err) {
    result.errors.push(`Failed to parse imagery.yaml: ${err}`);
    return result;
  }

  // Collect all generated images (normalized)
  const images = normalizeImagery('location', imagery);
  const usableImages = filterUsableImages(images, 'location', locationSlug);
  log('debug', 'Found generated images', { total: images.length, usable: usableImages.length });

  if (usableImages.length === 0) {
    return result;
  }

  // Get location's content_item ID (if they have one)
  const locations = await query<{ id: string; content_item_id: string | null }>(
    'SELECT id, content_item_id FROM location WHERE slug = ?',
    [locationSlug]
  );

  if (locations.length === 0) {
    result.errors.push(`Location not found in DB: ${locationSlug}`);
    return result;
  }

  const locationId = locations[0].id;
  const contentId = locations[0].content_item_id;

  // Preload zone slug -> zone id for this location
  const zones = await query<{ id: string; slug: string }>(
    'SELECT id, slug FROM location_zone WHERE location_id = ?',
    [locationId]
  );
  const zoneIdBySlug = new Map<string, string>();
  for (const zone of zones) {
    zoneIdBySlug.set(zone.slug, zone.id);
  }

  const locationDir = join(contentDir, 'locations', locationSlug);

  for (const img of usableImages) {
    const zoneId = img.zoneSlug ? zoneIdBySlug.get(img.zoneSlug) : undefined;
    if (img.zoneSlug && !zoneId) {
      log('warn', 'Zone not found for image', { image: img.fileName, zoneSlug: img.zoneSlug });
    }
    const imgResult = await processImage('location', img, locationDir, contentId, 'scene', undefined, zoneId);
    result.uploaded += imgResult.uploaded;
    result.skipped += imgResult.skipped;
    result.linked += imgResult.linked;
    result.errors.push(...imgResult.errors);
  }

  log('info', 'Location imagery complete', {
    location: locationSlug,
    uploaded: result.uploaded,
    skipped: result.skipped,
    linked: result.linked,
  });

  return result;
}

// ============================================================================
// Core Image Processing
// ============================================================================

interface ProcessImageResult {
  uploaded: number;
  skipped: number;
  linked: number;
  errors: string[];
}

/**
 * Process a single image: upload if needed, create DB records
 */
async function processImage(
  kind: ImageryKind,
  img: NormalizedImage,
  baseDir: string,
  contentId: string | null,
  defaultRole?: 'portrait' | 'scene' | 'header' | 'gallery',
  sceneId?: string,
  zoneId?: string
): Promise<ProcessImageResult> {
  const result: ProcessImageResult = { uploaded: 0, skipped: 0, linked: 0, errors: [] };

  try {
    // Resolve full path
    const imagePath = img.filePath.startsWith('/') ? img.filePath : join(baseDir, img.filePath);

    if (!existsSync(imagePath)) {
      result.errors.push(`Image not found: ${imagePath}`);
      return result;
    }

    log('debug', 'Processing image', { file: img.fileName, path: imagePath });

    // Compute hash to check for duplicates
    const fileHash = await computeFileHash(imagePath);

    // Check if already uploaded
    const existing = await getImageAssetByHash(fileHash);

    let assetId: string;

    if (existing) {
      assetId = existing.id;
      result.skipped = 1;
      log('debug', 'Image already exists', { hash: fileHash.slice(0, 8), id: assetId });
    } else {
      // Upload to Cloudflare
      log('info', 'Uploading image', { file: img.fileName });

      const cfResult = await uploadImage(imagePath, {
        custom_id: img.customId || '',
        provider: img.provider,
        model: img.model || '',
      });

      // Get file info
      const fileInfo = await getFileInfo(imagePath);

      // Insert image_asset
      assetId = generateId();
      const assetData: ImageAssetData = {
        id: assetId,
        sourcePath: imagePath,
        storagePath: `cloudflare:${cfResult.id}`,
        fileHash,
        fileSizeBytes: fileInfo.sizeBytes,
        mimeType: fileInfo.mimeType,
        generatedByProvider: img.provider,
        generatedPrompt: img.prompt,
        cloudflareImageId: cfResult.id,
        cloudflareBaseUrl: extractBaseUrl(cfResult.variants[0] || ''),
        cloudflareVariantNames: JSON.stringify(['public', 'thumbnail']),
      };

      await insertImageAsset(assetData);
      result.uploaded = 1;
      log('info', 'Uploaded and inserted asset', { id: assetId, cfId: cfResult.id });
    }

    // Create image_link if we have a content ID
    if (contentId) {
      const linkId = generateId();
      const role = mapRole(kind, img, defaultRole);

      const linkData: ImageLinkData = {
        id: linkId,
        assetId,
        contentId,
        sceneId,
        zoneId, // NEW: Add zone_id for location zones
        role,
        sortOrder: img.sortOrder ?? 0,
        caption: img.caption,
        altText: img.alt || img.customId || img.fileName,
      };

      await insertImageLink(linkData);
      result.linked = 1;
    }
  } catch (err) {
    result.errors.push(`Failed to process ${img.fileName}: ${err}`);
  }

  return result;
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Ingest all imagery for all chapters with imagery.yaml files
 *
 * @param contentDir - Base content directory path
 * @returns Aggregated result for all chapters
 */
export async function ingestAllChapterImagery(contentDir: string): Promise<IngestImageryResult> {
  const { readdir } = await import('fs/promises');
  const result: IngestImageryResult = { uploaded: 0, skipped: 0, linked: 0, errors: [] };

  const chaptersDir = join(contentDir, 'chapters');
  if (!existsSync(chaptersDir)) {
    result.errors.push(`Chapters directory not found: ${chaptersDir}`);
    return result;
  }

  const chapters = await readdir(chaptersDir);

  for (const chapter of chapters) {
    const imageryPath = join(chaptersDir, chapter, 'imagery.yaml');
    if (!existsSync(imageryPath)) continue;

    const chapterResult = await ingestChapterImagery(chapter, contentDir);
    result.uploaded += chapterResult.uploaded;
    result.skipped += chapterResult.skipped;
    result.linked += chapterResult.linked;
    result.errors.push(...chapterResult.errors);
  }

  return result;
}

/**
 * Ingest all imagery for all characters with imagery.yaml files
 *
 * @param contentDir - Base content directory path
 * @returns Aggregated result for all characters
 */
export async function ingestAllCharacterImagery(contentDir: string): Promise<IngestImageryResult> {
  const { readdir } = await import('fs/promises');
  const result: IngestImageryResult = { uploaded: 0, skipped: 0, linked: 0, errors: [] };

  const charactersDir = join(contentDir, 'characters');
  if (!existsSync(charactersDir)) {
    result.errors.push(`Characters directory not found: ${charactersDir}`);
    return result;
  }

  const characters = await readdir(charactersDir);

  for (const character of characters) {
    const imageryPath = join(charactersDir, character, 'imagery.yaml');
    if (!existsSync(imageryPath)) continue;

    const characterResult = await ingestCharacterImagery(character, contentDir);
    result.uploaded += characterResult.uploaded;
    result.skipped += characterResult.skipped;
    result.linked += characterResult.linked;
    result.errors.push(...characterResult.errors);
  }

  return result;
}

/**
 * Ingest all imagery for all locations with imagery.yaml files
 *
 * @param contentDir - Base content directory path
 * @returns Aggregated result for all locations
 */
export async function ingestAllLocationImagery(contentDir: string): Promise<IngestImageryResult> {
  const { readdir } = await import('fs/promises');
  const result: IngestImageryResult = { uploaded: 0, skipped: 0, linked: 0, errors: [] };

  const locationsDir = join(contentDir, 'locations');
  if (!existsSync(locationsDir)) {
    result.errors.push(`Locations directory not found: ${locationsDir}`);
    return result;
  }

  const locations = await readdir(locationsDir);

  for (const location of locations) {
    const imageryPath = join(locationsDir, location, 'imagery.yaml');
    if (!existsSync(imageryPath)) continue;

    const locationResult = await ingestLocationImagery(location, contentDir);
    result.uploaded += locationResult.uploaded;
    result.skipped += locationResult.skipped;
    result.linked += locationResult.linked;
    result.errors.push(...locationResult.errors);
  }

  return result;
}
