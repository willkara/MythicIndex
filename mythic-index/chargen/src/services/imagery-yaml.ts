/**
 * Imagery YAML service for chargen CLI
 * Handles reading image_ideas.yaml and imagery.yaml files
 */

import { readFile, writeFile, mkdir, rename, readdir, stat, copyFile } from 'fs/promises';
import { join, dirname, relative, sep } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { existsSync, readFileSync } from 'fs';
import { getContentDir } from '../ingestion/config.js';
import {
  validateImageryData,
  ImagerySchemaError,
  type EntityType as SchemaEntityType,
} from './imagery-schema.js';

// Re-export for convenience
export { ImagerySchemaError } from './imagery-schema.js';

/** Local image type for character imagery (different from prompt-ir's location-focused ImageType) */
type CharacterImageType = 'portrait' | 'full-body' | 'action' | 'scene' | 'mood' | 'collaborative';

// Use centralized content directory from config
const getStoryContentBase = () => getContentDir();

export type EntityType = 'character' | 'location' | 'chapter';

export const LOCATION_ZONE_IMAGE_SEPARATOR = '__';

export function buildZoneImageTargetId(zoneSlug: string, imageSlug: string): string {
  return `${zoneSlug}${LOCATION_ZONE_IMAGE_SEPARATOR}${imageSlug}`;
}

export function parseZoneImageTargetId(
  targetId: string
): { zoneSlug: string; imageSlug: string } | null {
  const parts = targetId.split(LOCATION_ZONE_IMAGE_SEPARATOR);
  if (parts.length !== 2) return null;
  const [zoneSlug, imageSlug] = parts;
  if (!zoneSlug || !imageSlug) return null;
  return { zoneSlug, imageSlug };
}

export interface GeneratedImageEntry {
  custom_id: string;
  file_name: string;
  file_path: string;
  prompt_index?: number;
  prompt_used: string;
  provider: string;
  model: string;
  size?: string;
  aspect_ratio?: string;
  quality?: string;
  role?: string;
  generated_at: string;
  provider_metadata?: Record<string, unknown>;
  archived?: boolean;
  archived_at?: string;
  archived_path?: string;
}

export interface ChapterCharacterPresent {
  slug: string;
  variation?: string;
  role?: string;
}

export interface ImageInventoryEntry {
  id: string;
  path: string;
  type: 'generated' | 'imported' | 'edited' | 'placeholder';
  status: 'approved' | 'draft' | 'archived' | 'rejected';

  // NEW: Link back to prompt specification (v2.0)
  prompt_spec_slug?: string; // Links to zones[].images[].image_slug or chapter images[].custom_id

  /** True if this is the canonical reference portrait (portrait.png) - the "gospel truth" for character appearance */
  is_reference_portrait?: boolean;

  // Image classification (optional, enhanced analysis)
  /** Primary image type classification */
  image_type?: 'portrait' | 'full-body' | 'action' | 'scene' | 'mood' | 'collaborative';
  /** More specific subtype */
  image_subtype?: string;

  content: {
    title: string;
    /** Filename-safe slug derived from the title (max 40 chars, lowercase, hyphens only) */
    suggested_filename?: string;
    description: string;
    alt_text: string;
    tags: string[];
    // Enhanced content fields (optional)
    /** Composition analysis - framing, positioning, visual flow */
    composition_notes?: string;
    /** Narrative significance - what story does this image tell? */
    narrative_significance?: string;
    /** Symbolic interpretation - deeper meaning of visual elements */
    symbolic_elements?: string;
  };

  // Technical analysis (optional, enhanced analysis)
  /** Detailed lighting analysis */
  lighting?: {
    primary_source: string;
    quality: string;
    direction: string;
    color_temperature: string;
    shadow_depth: string;
    atmospheric?: string;
  };

  /** Color palette analysis */
  palette?: {
    dominant: string[];
    accent: string[];
    avoid?: string[];
  };

  /** Canon compliance analysis */
  canon_analysis?: {
    matches_description: boolean;
    verified_features: string[];
    missing_features?: string[];
    notes?: string;
  };

  provenance: {
    source: string;
    created_at: string;
    original_filename?: string;
    analysis_model?: string;
    analysis_timestamp?: string;
  };

  // Generation metadata (optional)
  generation?: {
    target_id?: string;
    ir_hash?: string;
    prompt_used?: string;
    negative_prompt_used?: string;
    model?: string;
    provider?: string;
    constraints?: {
      aspect_ratio?: string;
      size?: string;
      orientation?: 'landscape' | 'portrait';
      quality?: 'standard' | 'high';
    };
    provider_metadata?: Record<string, unknown>;
    target_metadata?: Record<string, unknown>;
  };
}

export interface CharacterImagery {
  entity_type: 'character';
  slug: string;
  appearance?: string;
  custom_style_override?: string;
  prompts: string[];
  image_inventory: ImageInventoryEntry[];
}

export interface LocationZone {
  name?: string;
  slug?: string;
  zone_name?: string;
  zone_slug?: string;
  title?: string;
  base_prompt?: string;
  image_inventory?: ImageInventoryEntry[];
  images?: Array<{ image_slug?: string; image_inventory?: ImageInventoryEntry[] }>;
}

export interface LocationOverview {
  slug?: string;
  name?: string;
  title?: string;
  base_prompt?: string;
  image_inventory?: ImageInventoryEntry[];
}

export interface LocationImagery {
  overview?: LocationOverview;
  zones?: LocationZone[];
}

export interface ChapterScene {
  title?: string;
  base_prompt?: string;
  image_inventory: ImageInventoryEntry[];
}

export interface ChapterStyleTokens {
  core_style?: string;
  exterior_tokens?: string;
  interior_tokens?: string;
  action_tokens?: string;
  portrait_tokens?: string;
}

export interface ChapterImagery {
  entity_type: 'chapter';
  slug?: string;
  chapter_number?: number;
  chapter_title?: string;
  visual_thesis?: string;
  style_tokens?: ChapterStyleTokens;
  negative_prompt?: string;
  scenes?: ChapterScene[];
  images?: Array<{
    custom_id?: string;
    image_inventory?: ImageInventoryEntry[];
  }>;
}

export type ImageryData = CharacterImagery | LocationImagery | ChapterImagery;

export interface NormalizedPrompt {
  index: number;
  prompt: string;
  source: 'prompts' | 'overview' | 'zone' | 'scene';
  sourceName?: string;
  sourceIndex?: number;
}

export interface ExtendedNormalizedPrompt extends NormalizedPrompt {
  custom_id?: string;
  image_type?: string;
  aspect_ratio?: string;
  visual_description?: string;
  composition_notes?: string;
  lighting?: string;
  characters_present?: ChapterCharacterPresent[];
}

/**
 * Get the path to an entity's imagery.yaml file
 */
export function getImageryPath(entityType: EntityType, slug: string): string {
  const typeDir =
    entityType === 'character'
      ? 'characters'
      : entityType === 'location'
        ? 'locations'
        : 'chapters';
  return join(getStoryContentBase(), typeDir, slug, 'imagery.yaml');
}

/**
 * Get the path to an entity's image_ideas.yaml file
 */
export function getImageIdeasPath(entityType: EntityType, slug: string): string {
  const typeDir =
    entityType === 'character'
      ? 'characters'
      : entityType === 'location'
        ? 'locations'
        : 'chapters';
  return join(getStoryContentBase(), typeDir, slug, 'image-ideas.yaml');
}

/**
 * Get the path to an entity's images directory
 */
export function getImagesDir(entityType: EntityType, slug: string): string {
  const typeDir =
    entityType === 'character'
      ? 'characters'
      : entityType === 'location'
        ? 'locations'
        : 'chapters';
  return join(getStoryContentBase(), typeDir, slug, 'images');
}

/**
 * Get the path to an entity's directory
 */
export function getEntityDir(entityType: EntityType, slug: string): string {
  const typeDir =
    entityType === 'character'
      ? 'characters'
      : entityType === 'location'
        ? 'locations'
        : 'chapters';
  return join(getStoryContentBase(), typeDir, slug);
}

/**
 * Convert an absolute path to an entity-relative path for imagery.yaml
 */
export function toEntityRelativePath(entityType: EntityType, slug: string, absolutePath: string) {
  const entityDir = getEntityDir(entityType, slug);
  const relativePath = relative(entityDir, absolutePath);
  return relativePath.split(sep).join('/');
}

/**
 * Read and parse an imagery.yaml file with strict validation
 * @throws ImagerySchemaError if the file fails validation
 */
export async function readImageryYaml(
  entityType: EntityType,
  slug: string,
  options?: { skipValidation?: boolean }
): Promise<ImageryData | null> {
  const yamlPath = getImageryPath(entityType, slug);

  try {
    const content = await readFile(yamlPath, 'utf-8');
    const data = parseYaml(content);

    // Strict validation (can be skipped for legacy compatibility during migration)
    if (!options?.skipValidation) {
      return validateImageryData<ImageryData>(entityType as SchemaEntityType, data, slug);
    }

    return data as ImageryData;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Read and parse an imagery.yaml file synchronously with strict validation
 * Used by asset-registry for reference portrait lookups
 * @throws ImagerySchemaError if the file fails validation
 */
export function readImageryYamlSync(
  entityType: EntityType,
  slug: string,
  options?: { skipValidation?: boolean }
): ImageryData | null {
  const yamlPath = getImageryPath(entityType, slug);

  try {
    const content = readFileSync(yamlPath, 'utf-8');
    const data = parseYaml(content);

    // Strict validation (can be skipped for legacy compatibility during migration)
    if (!options?.skipValidation) {
      return validateImageryData<ImageryData>(entityType as SchemaEntityType, data, slug);
    }

    return data as ImageryData;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Read and parse an image_ideas.yaml file
 */
export async function readImageIdeasYaml(slug: string): Promise<ImageIdeasData | null> {
  const yamlPath = getImageIdeasPath('character', slug);

  try {
    const content = await readFile(yamlPath, 'utf-8');
    const data = parseYaml(content);
    return data as ImageIdeasData;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Image ideas file structure
 */
export interface ImageIdeasData {
  character: {
    name: string;
    summary?: string;
  };
  visual_consistency?: string[];
  scenes: ImageIdeaScene[];
}

export interface ImageIdeaScene {
  title: string;
  scene?: string;
  pose?: string;
  setting?: string;
  mood?: string;
  tags?: string[];
  depicts_characters?: string[];  // Slugs of companion characters in multi-character scenes
}

/**
 * Write an imagery.yaml file
 */
export async function writeImageryYaml(
  entityType: EntityType,
  slug: string,
  data: ImageryData
): Promise<void> {
  const yamlPath = getImageryPath(entityType, slug);

  await mkdir(dirname(yamlPath), { recursive: true });

  const content = stringifyYaml(data, {
    lineWidth: 0,
    defaultStringType: 'QUOTE_DOUBLE',
    defaultKeyType: 'PLAIN',
  });

  await writeFile(yamlPath, content, 'utf-8');
}

/**
 * Create an image_inventory entry for a generated image
 */
export function createGeneratedImageInventoryEntry(params: {
  entityType: EntityType;
  entitySlug: string;
  targetId: string;
  promptSpecSlug?: string;
  outputPath: string;
  model: string;
  provider: string;
  promptUsed: string;
  negativePromptUsed?: string;
  irHash?: string;
  constraints?: {
    aspect_ratio?: string;
    size?: string;
    orientation?: 'landscape' | 'portrait';
    quality?: 'standard' | 'high';
  };
  providerMetadata?: Record<string, unknown>;
  targetMetadata?: Record<string, unknown>;
  title?: string;
  imageType?: string;
  tags?: string[];
}): ImageInventoryEntry {
  const fileName = params.outputPath.split('/').pop() || params.outputPath.split(sep).pop() || '';
  const id = fileName.replace(/\.[^.]+$/, '');
  const createdAt = new Date().toISOString();
  const relativePath = toEntityRelativePath(params.entityType, params.entitySlug, params.outputPath);

  const baseTags = [params.targetId, 'generated'];
  if (params.imageType) {
    baseTags.push(params.imageType);
  }

  const tags = Array.from(new Set([...(params.tags || []), ...baseTags]));
  const title = params.title || params.targetId;

  return {
    id,
    path: relativePath,
    type: 'generated',
    status: 'approved',
    prompt_spec_slug: params.promptSpecSlug,
    image_type: params.imageType as CharacterImageType | undefined,
    content: {
      title,
      description: title,
      alt_text: title,
      tags,
    },
    provenance: {
      source: params.provider,
      created_at: createdAt,
      original_filename: fileName,
    },
    generation: {
      target_id: params.targetId,
      ir_hash: params.irHash,
      prompt_used: params.promptUsed,
      negative_prompt_used: params.negativePromptUsed,
      model: params.model,
      provider: params.provider,
      constraints: params.constraints,
      provider_metadata: params.providerMetadata,
      target_metadata: params.targetMetadata,
    },
  };
}

/**
 * Append a generated image entry to a location's imagery.yaml (overview, zone, or zone image spec)
 */
export async function appendLocationImageInventory(params: {
  slug: string;
  targetId: string;
  entry: ImageInventoryEntry;
  createBackup?: boolean;
}): Promise<void> {
  const imageryPath = getImageryPath('location', params.slug);
  const imageryData = await readImageryYaml('location', params.slug);

  if (!imageryData || !('overview' in imageryData || 'zones' in imageryData)) {
    throw new Error(`No imagery.yaml found for location ${params.slug}`);
  }

  if (params.createBackup && existsSync(imageryPath)) {
    await copyFile(imageryPath, `${imageryPath}.bak`);
  }

  const locationImagery = imageryData as LocationImagery;
  const parsedTarget = parseZoneImageTargetId(params.targetId);

  if (parsedTarget) {
    const zones = (locationImagery.zones ?? []) as Array<
      LocationZone & { zone_slug?: string; images?: Array<{ image_slug?: string; image_inventory?: ImageInventoryEntry[] }> }
    >;
    const zone = zones.find(
      (z) =>
        z.slug === parsedTarget.zoneSlug ||
        z.zone_slug === parsedTarget.zoneSlug ||
        z.name === parsedTarget.zoneSlug ||
        (z as { zone_name?: string }).zone_name === parsedTarget.zoneSlug
    );
    if (!zone) {
      throw new Error(
        `Zone ${parsedTarget.zoneSlug} not found in imagery.yaml for ${params.slug}`
      );
    }

    const images = Array.isArray(zone.images) ? zone.images : [];
    const imageSpec = images.find((img) => img.image_slug === parsedTarget.imageSlug);
    if (!imageSpec) {
      throw new Error(
        `Image spec ${parsedTarget.imageSlug} not found in ${params.slug}/${parsedTarget.zoneSlug}`
      );
    }

    if (!Array.isArray(imageSpec.image_inventory)) {
      imageSpec.image_inventory = [];
    }

    const alreadyExists = imageSpec.image_inventory.some(
      (item) => item.id === params.entry.id || item.path === params.entry.path
    );

    if (!alreadyExists) {
      imageSpec.image_inventory.push(params.entry);
      await writeImageryYaml('location', params.slug, locationImagery);
    }
    return;
  }

  let target: LocationOverview | LocationZone | undefined;
  const overviewSlug = locationImagery.overview?.slug || 'overview';

  if (params.targetId === overviewSlug || params.targetId === 'overview') {
    target = locationImagery.overview;
  } else {
    const zones = locationImagery.zones ?? [];
    target = zones.find(
      (zone) =>
        zone.slug === params.targetId ||
        zone.name === params.targetId ||
        ('zone_slug' in zone && (zone as { zone_slug?: string }).zone_slug === params.targetId) ||
        ('zone_name' in zone && (zone as { zone_name?: string }).zone_name === params.targetId)
    );
  }

  if (!target) {
    throw new Error(`Target ${params.targetId} not found in imagery.yaml for ${params.slug}`);
  }

  if (!Array.isArray(target.image_inventory)) {
    target.image_inventory = [];
  }

  const alreadyExists = target.image_inventory.some(
    (item) => item.id === params.entry.id || item.path === params.entry.path
  );

  if (!alreadyExists) {
    target.image_inventory.push(params.entry);
    await writeImageryYaml('location', params.slug, locationImagery);
  }
}

/**
 * Append a generated image entry to a chapter's imagery.yaml (per-image inventory)
 */
export async function appendChapterImageInventory(params: {
  slug: string;
  targetId: string;
  entry: ImageInventoryEntry;
  createBackup?: boolean;
}): Promise<void> {
  const imageryPath = getImageryPath('chapter', params.slug);
  const imageryData = await readImageryYaml('chapter', params.slug);

  if (!imageryData) {
    throw new Error(`No imagery.yaml found for chapter ${params.slug}`);
  }

  if (params.createBackup && existsSync(imageryPath)) {
    await copyFile(imageryPath, `${imageryPath}.bak`);
  }

  const chapterImagery = imageryData as {
    images?: Array<{ custom_id?: string; image_inventory?: ImageInventoryEntry[] }>;
  };
  const images = Array.isArray(chapterImagery.images) ? chapterImagery.images : [];
  const target = images.find((img) => img.custom_id === params.targetId);

  if (!target) {
    throw new Error(`Image target ${params.targetId} not found in chapter ${params.slug}`);
  }

  if (!Array.isArray(target.image_inventory)) {
    target.image_inventory = [];
  }

  const alreadyExists = target.image_inventory.some(
    (item) => item.id === params.entry.id || item.path === params.entry.path
  );

  if (!alreadyExists) {
    target.image_inventory.push(params.entry);
    await writeImageryYaml('chapter', params.slug, chapterImagery as ImageryData);
  }
}

function isCharacterImagery(data: ImageryData): data is CharacterImagery {
  return 'entity_type' in data && data.entity_type === 'character';
}

function isChapterImagery(data: ImageryData): data is ChapterImagery {
  if ('entity_type' in data && data.entity_type === 'chapter') {
    return true;
  }
  if ('images' in data) {
    return true;
  }
  if ('scenes' in data) {
    return true;
  }
  return false;
}

function isLocationImagery(data: ImageryData): data is LocationImagery {
  return 'overview' in data || 'zones' in data;
}

/**
 * Extract all prompts from an entity's imagery.yaml
 */
export function getPromptsForEntity(data: ImageryData): ExtendedNormalizedPrompt[] {
  const prompts: ExtendedNormalizedPrompt[] = [];

  if (isCharacterImagery(data)) {
    (data.prompts || []).forEach((prompt, index) => {
      prompts.push({
        index,
        prompt,
        source: 'prompts',
      });
    });
  } else if (isLocationImagery(data)) {
    let index = 0;

    if (data.overview?.base_prompt) {
      prompts.push({
        index: index++,
        prompt: data.overview.base_prompt,
        source: 'overview',
        sourceName: data.overview.title || 'overview',
        sourceIndex: 0,
      });
    }

    (data.zones || []).forEach((zone, zoneIndex) => {
      if (zone.base_prompt) {
        prompts.push({
          index: index++,
          prompt: zone.base_prompt,
          source: 'zone',
          sourceName: zone.name || zone.title || zone.slug,
          sourceIndex: zoneIndex,
        });
      }
    });
  } else if (isChapterImagery(data)) {
    (data.scenes || []).forEach((scene, index) => {
      if (scene.base_prompt) {
        prompts.push({
          index,
          prompt: scene.base_prompt,
          source: 'scene',
          sourceName: scene.title || `Scene ${index + 1}`,
        });
      }
    });
  }

  return prompts;
}

/**
 * Archive existing images to a timestamped subfolder
 */
export async function archiveExistingImages(
  entityType: EntityType,
  slug: string
): Promise<{ archivedCount: number; archivePath: string | null }> {
  const imagesDir = getImagesDir(entityType, slug);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const archivePath = join(imagesDir, 'archive', timestamp);

  if (!existsSync(imagesDir)) {
    return { archivedCount: 0, archivePath: null };
  }

  let files: string[];
  try {
    files = await readdir(imagesDir);
  } catch {
    return { archivedCount: 0, archivePath: null };
  }

  const imageFiles = files.filter(
    (f) => /\.(png|jpg|jpeg|webp)$/i.test(f) && f !== 'archive' && f !== 'portrait.png'
  );

  if (imageFiles.length === 0) {
    return { archivedCount: 0, archivePath: null };
  }

  await mkdir(archivePath, { recursive: true });

  let archivedCount = 0;
  for (const file of imageFiles) {
    const srcPath = join(imagesDir, file);
    const destPath = join(archivePath, file);

    try {
      const fileStat = await stat(srcPath);
      if (fileStat.isFile()) {
        await rename(srcPath, destPath);
        archivedCount++;
      }
    } catch (error) {
      console.error(`Failed to archive ${file}:`, error);
    }
  }

  return { archivedCount, archivePath: archivedCount > 0 ? archivePath : null };
}

/**
 * List all entities of a given type that have image_ideas.yaml files
 */
export async function listEntitiesWithImageIdeas(entityType: EntityType): Promise<string[]> {
  const typeDir =
    entityType === 'character'
      ? 'characters'
      : entityType === 'location'
        ? 'locations'
        : 'chapters';
  const basePath = join(getStoryContentBase(), typeDir);

  try {
    const dirs = await readdir(basePath);
    const slugs: string[] = [];

    for (const dir of dirs) {
      const ideasPath = join(basePath, dir, 'image-ideas.yaml');
      if (existsSync(ideasPath)) {
        slugs.push(dir);
      }
    }

    return slugs.sort();
  } catch {
    return [];
  }
}

/**
 * List all character directories
 */
export async function listCharacterDirs(): Promise<string[]> {
  const basePath = join(getStoryContentBase(), 'characters');

  try {
    const dirs = await readdir(basePath);
    return dirs.filter((d) => !d.startsWith('.')).sort();
  } catch {
    return [];
  }
}

// ============================================================================
// Execution Records (imagery.runs.yaml)
// ============================================================================

import type {
  ImageryRunsFile,
  GenerationRun,
  ReferenceRole,
  TargetMetadata,
} from '../types/prompt-ir.js';

/**
 * Get the path to an entity's imagery.runs.yaml file
 */
export function getRunsPath(entityType: EntityType, slug: string): string {
  const typeDir =
    entityType === 'character'
      ? 'characters'
      : entityType === 'location'
        ? 'locations'
        : 'chapters';
  return join(getStoryContentBase(), typeDir, slug, 'imagery.runs.yaml');
}

/**
 * Read and parse an imagery.runs.yaml file
 */
export async function readRunsFile(
  entityType: EntityType,
  slug: string
): Promise<ImageryRunsFile | null> {
  const runsPath = getRunsPath(entityType, slug);

  try {
    const content = await readFile(runsPath, 'utf-8');
    const data = parseYaml(content);
    return data as ImageryRunsFile;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Write an imagery.runs.yaml file
 */
export async function writeRunsFile(
  entityType: EntityType,
  slug: string,
  data: ImageryRunsFile
): Promise<void> {
  const runsPath = getRunsPath(entityType, slug);

  await mkdir(dirname(runsPath), { recursive: true });

  const content = stringifyYaml(data, {
    lineWidth: 0,
    defaultStringType: 'QUOTE_DOUBLE',
    defaultKeyType: 'PLAIN',
  });

  await writeFile(runsPath, content, 'utf-8');
}

/**
 * Append a generation run to the runs file
 */
export async function appendRun(
  entityType: EntityType,
  slug: string,
  run: GenerationRun
): Promise<void> {
  // Read existing runs or create new file
  let runsFile = await readRunsFile(entityType, slug);

  if (!runsFile) {
    runsFile = {
      entity_type: entityType === 'character' ? 'location' : (entityType as 'location' | 'chapter'),
      entity_slug: slug,
      runs: [],
    };
  }

  // Append the new run
  runsFile.runs.push(run);

  // Write back
  await writeRunsFile(entityType, slug, runsFile);
}

/**
 * Create a new GenerationRun record
 */
export function createGenerationRun(params: {
  targetId: string;
  fileName: string;
  filePath: string;
  model: string;
  irHash: string;
  promptUsed: string;
  negativePromptUsed: string;
  referenceImages: { asset_id: string; path: string; role: ReferenceRole }[];
  constraints: {
    aspect_ratio: string;
    size: string;
    orientation: 'landscape' | 'portrait';
    quality?: 'standard' | 'high';
  };
  providerMetadata?: Record<string, unknown>;
  targetMetadata?: TargetMetadata;
}): GenerationRun {
  return {
    run_id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    target_id: params.targetId,
    timestamp: new Date().toISOString(),
    file_name: params.fileName,
    file_path: params.filePath,
    provider: 'google',
    model: params.model,
    ir_hash: params.irHash,
    prompt_used: params.promptUsed,
    negative_prompt_used: params.negativePromptUsed,
    reference_images: params.referenceImages,
    constraints: params.constraints,
    provider_metadata: params.providerMetadata || {},
    target_metadata: params.targetMetadata,
  };
}

/**
 * Find runs for a specific target
 */
export async function findRunsForTarget(
  entityType: EntityType,
  slug: string,
  targetId: string
): Promise<GenerationRun[]> {
  const runsFile = await readRunsFile(entityType, slug);
  if (!runsFile) return [];

  return runsFile.runs.filter((run) => run.target_id === targetId);
}

/**
 * Find the latest run for a target
 */
export async function findLatestRun(
  entityType: EntityType,
  slug: string,
  targetId: string
): Promise<GenerationRun | null> {
  const runs = await findRunsForTarget(entityType, slug, targetId);
  if (runs.length === 0) return null;

  // Sort by timestamp descending and return the latest
  runs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return runs[0];
}

/**
 * Check if a target needs regeneration based on IR hash
 */
export async function needsRegeneration(
  entityType: EntityType,
  slug: string,
  targetId: string,
  currentIrHash: string
): Promise<boolean> {
  const latestRun = await findLatestRun(entityType, slug, targetId);
  if (!latestRun) return true;

  return latestRun.ir_hash !== currentIrHash;
}

/**
 * Append a generated image to a zone's image_inventory array (v2.0)
 *
 * @param locationSlug - Location slug
 * @param zoneSlug - Zone slug (matches zones[].slug or zones[].zone_slug)
 * @param entry - ImageInventoryEntry to append
 */
export async function appendToZoneImageInventory(
  locationSlug: string,
  zoneSlug: string,
  entry: ImageInventoryEntry
): Promise<void> {
  const yamlPath = join(getStoryContentBase(), 'locations', locationSlug, 'imagery.yaml');

  if (!existsSync(yamlPath)) {
    throw new Error(`imagery.yaml not found: ${yamlPath}`);
  }

  const content = await readFile(yamlPath, 'utf-8');
  const data = parseYaml(content);

  if (!data.zones || !Array.isArray(data.zones)) {
    throw new Error('No zones array in imagery.yaml');
  }

  // Find the zone
  const zone = data.zones.find((z: any) => z.slug === zoneSlug || z.zone_slug === zoneSlug);

  if (!zone) {
    throw new Error(`Zone not found: ${zoneSlug}`);
  }

  // Initialize image_inventory if it doesn't exist
  if (!zone.image_inventory) {
    zone.image_inventory = [];
  }

  // Append entry
  zone.image_inventory.push(entry);

  // Write back
  const updatedYaml = stringifyYaml(data, {
    lineWidth: 0,
    defaultStringType: 'QUOTE_DOUBLE',
  });

  await writeFile(yamlPath, updatedYaml, 'utf-8');
}
