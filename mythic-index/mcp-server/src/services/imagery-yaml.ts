/**
 * Imagery YAML service
 * Handles reading, writing, and managing imagery.yaml files for characters, locations, and chapters
 */

import { readFile, writeFile, mkdir, rename, readdir, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { existsSync } from 'fs';
import { getLogger } from './logger.js';

// Base path for story content
const STORY_CONTENT_BASE = join(
  dirname(new URL(import.meta.url).pathname),
  '..', '..', '..', 'MemoryQuill', 'story-content'
);

export type EntityType = 'character' | 'location' | 'chapter';

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
  role?: string;  // e.g., "establishing", "detail", "action"
  generated_at: string;
  provider_metadata?: Record<string, unknown>;
  archived?: boolean;
  archived_at?: string;
  archived_path?: string;
}

// ============ NEW FORMAT TYPES ============

/**
 * Image inventory entry (NEW CHARACTER FORMAT)
 * Rich metadata with content description and provenance tracking
 */
export interface ImageInventoryEntry {
  id: string;
  path: string;
  type: 'generated' | 'imported' | 'edited';
  status: 'approved' | 'draft' | 'archived' | 'rejected';
  content: {
    title: string;
    description: string;
    alt_text: string;
    tags: string[];
  };
  provenance: {
    source: 'generated' | 'imported' | 'edited';
    created_at: string;
    original_filename?: string;
    generation_params?: {
      prompt_used?: string;
      provider?: string;
      model?: string;
      size?: string;
      quality?: string;
    };
  };
  archived?: boolean;
  archived_at?: string;
  archived_path?: string;
}

/**
 * Chapter image entry (PRODUCTION ART DIRECTION FORMAT)
 * Extensive art direction and metadata
 */
export interface ChapterImageEntry {
  custom_id: string;
  source_moment?: string;
  scene_id?: string;
  image_type?: 'hero' | 'symbol' | 'pivot' | 'character' | string;
  category?: string[];
  scene_mood?: string;
  mood_rationale?: string;
  aspect_ratio?: string;
  orientation?: 'portrait' | 'landscape' | 'square';
  size?: string;
  visual_description?: string;
  composition_notes?: string;
  visual_hook?: string;
  depicts_characters?: string[];
  character_states?: Record<string, string>;
  location?: string;
  reference_images?: string[];
  lighting?: {
    primary_source?: string;
    quality?: string;
    direction?: string;
    color_temperature?: string;
    shadow_depth?: string;
    atmospheric?: string;
  };
  palette?: {
    dominant?: string[];
    accent?: string[];
    avoid?: string[];
  };
  prompt_used?: string;
  negative_prompt?: string;
  tags?: string[];
  generated_at?: string | null;
  file_name?: string | null;
  file_path?: string | null;
  provider?: string | null;
  model?: string | null;
  provider_metadata?: Record<string, unknown>;
}

/** Lighting specification from imagery.yaml */
export interface LightingSpec {
  primary_source?: string;
  quality?: string;
  direction?: string;
  color_temperature?: string;
  shadow_depth?: string;
  atmospheric?: string;
}

/** Color palette specification from imagery.yaml */
export interface PaletteSpec {
  dominant?: string[];
  accent?: string[];
  avoid?: string[];
}

/**
 * Unified image entry - discriminated union of all formats
 */
export type UnifiedImageEntry =
  | { format: 'inventory'; data: ImageInventoryEntry }
  | { format: 'generated'; data: GeneratedImageEntry }
  | { format: 'chapter'; data: ChapterImageEntry };

/**
 * Schema format detection result
 */
export interface SchemaFormatInfo {
  entityType: EntityType;
  slug: string;
  format: 'inventory' | 'generated' | 'chapter' | 'mixed' | 'unknown';
  arrayName: 'image_inventory' | 'generated_images' | 'images' | null;
  imageCount: number;
  hasRichMetadata: boolean;
}

export interface CharacterImagery {
  entity_type: 'character';
  slug: string;
  appearance?: string;
  custom_style_override?: string; // Override master style for this character
  reference_defaults?: {
    portrait?: string;
  };
  prompts: string[];
  // Support both formats during transition
  generated_images?: GeneratedImageEntry[]; // Legacy format
  image_inventory?: ImageInventoryEntry[];  // New format with rich metadata
}

export interface LocationZone {
  name: string;
  slug: string;
  title?: string;
  category?: string | string[];
  image_type?: string;
  scene_mood?: string;
  mood_rationale?: string;
  visual_description?: string;
  composition_notes?: string;
  narrative_significance?: string;
  symbolic_elements?: string;
  time_of_day?: string;
  weather?: string;
  season?: string;
  zone_type?: string;
  location_within?: string;
  required_elements?: string[];
  lighting?: LightingSpec;
  palette?: PaletteSpec;
  base_prompt?: string;
  negative_prompt?: string;
  references?: Array<{ placeholder?: string; file?: string; section?: string }>;
  reference_images?: string[];
  generated_images?: GeneratedImageEntry[];
  image_inventory?: ImageInventoryEntry[];
}

export interface LocationOverview {
  slug: string;
  title?: string;
  category?: string | string[];
  image_type?: string;
  scene_mood?: string;
  mood_rationale?: string;
  visual_description?: string;
  composition_notes?: string;
  narrative_significance?: string;
  symbolic_elements?: string;
  time_of_day?: string;
  weather?: string;
  season?: string;
  required_elements?: string[];
  lighting?: LightingSpec;
  palette?: PaletteSpec;
  base_prompt?: string;
  negative_prompt?: string;
  references?: Array<{ placeholder?: string; file?: string; section?: string }>;
  reference_images?: string[];
  generated_images?: GeneratedImageEntry[];
  image_inventory?: ImageInventoryEntry[];
}

export interface LocationMetadata {
  entity_type: 'location-imagery';
  slug: string;
  name: string;
  location_type?: string;
  narrative_soul?: string;
  one_line_essence?: string;
  generation_defaults?: {
    provider?: string;
    model?: string;
    quality?: string;
  };
}

export interface LocationVisualAnchor {
  signature_elements?: string[];
  materials?: Record<string, string>;
  color_anchors?: Record<string, string>;
  characteristic_light?: Record<string, string>;
}

export interface LocationImagery {
  metadata?: LocationMetadata;
  location_visual_anchor?: LocationVisualAnchor;
  overview?: LocationOverview;
  zones?: LocationZone[];
  image_inventory?: ImageInventoryEntry[];
  reference_defaults?: {
    overview?: string;
  };
}

export interface ChapterScene {
  title?: string;
  chapter?: number;
  category?: string[];
  character_focus?: string;
  visual_description?: string;
  composition_notes?: string;
  narrative_significance?: string;
  symbolic_elements?: string;
  base_prompt?: string;
  generated_images: GeneratedImageEntry[];
}

// ============ Chapter 1 Format Types ============

/**
 * Style tokens for image generation - defines the art style
 */
export interface ChapterStyleTokens {
  core_style?: string;
  exterior_tokens?: string;
  interior_tokens?: string;
  action_tokens?: string;
  portrait_tokens?: string;
}

/**
 * Color palette for production art direction
 */
export interface ChapterColorPalette {
  primary: string[];
  accent: string[];
  avoid?: string[];
}

/**
 * Mood distribution for production art direction
 * Defines how many images of each mood should be generated
 */
export interface ChapterMoodDistribution {
  somber?: number;
  pastoral?: number;
  celebratory?: number;
  tense?: number;
  mysterious?: number;
  [mood: string]: number | undefined;  // Allow custom moods
}

/**
 * Character reference with visual anchors and scene variations
 * Production art direction format
 */
export interface ChapterCharacterRef {
  slug: string;                          // Required - character identifier
  name: string;                          // Required - display name
  visual_anchors_source?: string;        // e.g., "extracted-from-profile"
  consistency_warning?: string | null;   // Optional consistency note
  visual_anchors?: string;               // Multiline string describing visual characteristics
  scene_variations?: string;             // Multiline string describing chapter progression
  reference_images?: string[];           // Optional image references
}

/**
 * Location reference within a chapter
 */
export interface ChapterLocation {
  slug: string;
  name: string;
  visual_description?: string;
  reference_images?: string[];
}

/**
 * Character present in a scene/prompt
 */
export interface ChapterCharacterPresent {
  slug: string;
  variation?: string;
  role?: string;
}

/**
 * Chapter 1 format uses a prompts[] array with detailed prompt entries
 * instead of scenes[].base_prompt
 */
export interface ChapterPromptEntry {
  custom_id?: string;
  image_type?: 'hero' | 'anchor' | 'detail' | 'mood' | 'symbol' | string;
  source_scene?: string;
  aspect_ratio?: '16:9' | '2:3' | '1:1' | '3:2' | '9:16' | string;
  visual_description?: string;
  composition_notes?: string;
  lighting?: string;
  characters_present?: ChapterCharacterPresent[];
  reference_images?: string[];
  prompt_used?: string;
}

export interface ChapterImagery {
  entity_type: 'chapter';
  slug?: string;
  chapter_number?: number;
  chapter_title?: string;
  visual_thesis?: string;

  // Production art direction format may nest metadata
  metadata?: {
    entity_type?: string;
    slug?: string;
    chapter_number?: number;
    chapter_title?: string;
    visual_thesis?: string;
    color_palette?: ChapterColorPalette;
    generation_defaults?: {
      provider?: string;
      model?: string;
      quality?: string;
      size?: string;
    };
    mood_distribution?: ChapterMoodDistribution;
  };

  // Rich metadata (Production art direction format)
  color_palette?: Record<string, string>;
  locations?: ChapterLocation[];
  character_refs?: ChapterCharacterRef[];  // Array in production format
  style_tokens?: ChapterStyleTokens;
  negative_prompt?: string;

  // Standard format: scenes with base_prompt
  scenes?: ChapterScene[];
  // Chapter 1 format: prompts array with prompt_used
  prompts?: ChapterPromptEntry[];
  // Production art direction format: images array with extensive metadata
  images?: ChapterImageEntry[];
  // Track generated images (legacy)
  generated_images?: GeneratedImageEntry[];
}

export type ImageryData = CharacterImagery | LocationImagery | ChapterImagery;

export interface NormalizedPrompt {
  index: number;
  prompt: string;
  source: 'prompts' | 'overview' | 'zone' | 'scene';
  sourceName?: string; // For zones/scenes, the name/title
  sourceIndex?: number;
}

/**
 * Extended prompt with rich metadata from Chapter 1 format
 */
export interface ExtendedNormalizedPrompt extends NormalizedPrompt {
  custom_id?: string;
  image_type?: string;
  aspect_ratio?: string;
  visual_description?: string;
  composition_notes?: string;
  lighting?: string;
  characters_present?: ChapterCharacterPresent[];
  location?: string;
  reference_images?: string[];
}

/**
 * Get the path to an entity's imagery.yaml file
 */
export function getImageryPath(entityType: EntityType, slug: string): string {
  const typeDir = entityType === 'character' ? 'characters' :
                  entityType === 'location' ? 'locations' : 'chapters';
  return join(STORY_CONTENT_BASE, typeDir, slug, 'imagery.yaml');
}

/**
 * Get the path to an entity's images directory
 */
export function getImagesDir(entityType: EntityType, slug: string): string {
  const typeDir = entityType === 'character' ? 'characters' :
                  entityType === 'location' ? 'locations' : 'chapters';
  return join(STORY_CONTENT_BASE, typeDir, slug, 'images');
}

/**
 * Read and parse an imagery.yaml file
 */
export async function readImageryYaml(entityType: EntityType, slug: string): Promise<ImageryData | null> {
  const yamlPath = getImageryPath(entityType, slug);

  try {
    const content = await readFile(yamlPath, 'utf-8');
    const data = parseYaml(content);
    return data as ImageryData;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Write an imagery.yaml file
 */
export async function writeImageryYaml(entityType: EntityType, slug: string, data: ImageryData): Promise<void> {
  const yamlPath = getImageryPath(entityType, slug);

  // Ensure directory exists
  await mkdir(dirname(yamlPath), { recursive: true });

  const content = stringifyYaml(data, {
    lineWidth: 0, // Prevent line wrapping
    defaultStringType: 'QUOTE_DOUBLE',
    defaultKeyType: 'PLAIN',
  });

  await writeFile(yamlPath, content, 'utf-8');
}

/**
 * Check if imagery data is for a character
 */
function isCharacterImagery(data: ImageryData): data is CharacterImagery {
  return 'entity_type' in data && data.entity_type === 'character';
}

/**
 * Check if imagery data is for a chapter
 * Handles both legacy format (entity_type at root) and production format (metadata.entity_type)
 */
function isChapterImagery(data: ImageryData): data is ChapterImagery {
  // Production art direction format: metadata.entity_type === 'chapter-imagery'
  if ('metadata' in data && data.metadata && typeof data.metadata === 'object') {
    const metadata = data.metadata as any;
    if (metadata.entity_type === 'chapter-imagery') {
      return true;
    }
  }
  // Legacy format: entity_type at root
  if ('entity_type' in data && data.entity_type === 'chapter') {
    return true;
  }
  // Also check for chapter-specific arrays as fallback
  if ('scenes' in data || 'images' in data || 'prompts' in data) {
    return true;
  }
  return false;
}

/**
 * Check if imagery data is for a location
 */
function isLocationImagery(data: ImageryData): data is LocationImagery {
  return 'overview' in data || 'zones' in data;
}

// ============ IMAGE FORMAT TYPE GUARDS ============

/**
 * Check if an image entry is in the ImageInventoryEntry format (new character format)
 */
export function isImageInventoryEntry(img: any): img is ImageInventoryEntry {
  return (
    img &&
    typeof img === 'object' &&
    'content' in img &&
    'provenance' in img &&
    'id' in img &&
    'path' in img
  );
}

/**
 * Check if an image entry is in the GeneratedImageEntry format (legacy format)
 */
export function isGeneratedImageEntry(img: any): img is GeneratedImageEntry {
  return (
    img &&
    typeof img === 'object' &&
    'custom_id' in img &&
    'prompt_used' in img &&
    'provider' in img &&
    'file_path' in img
  );
}

/**
 * Check if an image entry is in the ChapterImageEntry format (production art direction)
 */
export function isChapterImageEntry(img: any): img is ChapterImageEntry {
  return (
    img &&
    typeof img === 'object' &&
    'custom_id' in img &&
    ('visual_description' in img || 'composition_notes' in img || 'lighting' in img)
  );
}

// ============ SCHEMA FORMAT DETECTION ============

/**
 * Detect which schema format is being used in the imagery data
 * Returns format info including type, array name, and metadata flags
 */
export function detectSchemaFormat(data: ImageryData): SchemaFormatInfo {
  let entityType: EntityType = 'character';
  let slug = 'unknown';

  // Determine entity type and slug
  if (isCharacterImagery(data)) {
    entityType = 'character';
    slug = data.slug || 'unknown';
  } else if (isLocationImagery(data)) {
    entityType = 'location';
    slug = data.metadata?.slug || data.overview?.slug || 'unknown';
  } else if (isChapterImagery(data)) {
    entityType = 'chapter';
    slug = data.slug || (data.metadata?.slug) || 'unknown';
  }

  let format: SchemaFormatInfo['format'] = 'unknown';
  let arrayName: SchemaFormatInfo['arrayName'] = null;
  let imageCount = 0;
  let hasRichMetadata = false;

  if (isCharacterImagery(data)) {
    // Check for new image_inventory format
    if (data.image_inventory && Array.isArray(data.image_inventory)) {
      // Check if also has generated_images (mixed format)
      if (data.generated_images && data.generated_images.length > 0) {
        format = 'mixed';
        arrayName = null;
        imageCount = data.image_inventory.length + data.generated_images.length;
        hasRichMetadata = true;
      } else {
        format = 'inventory';
        arrayName = 'image_inventory';
        imageCount = data.image_inventory.length;
        hasRichMetadata = data.image_inventory.some(img =>
          img.content?.title || img.content?.description || img.provenance
        );
      }
    }
    // Check for legacy generated_images format
    else if (data.generated_images && Array.isArray(data.generated_images)) {
      format = 'generated';
      arrayName = 'generated_images';
      imageCount = data.generated_images.length;
      hasRichMetadata = false;
    }
  }
  else if (isLocationImagery(data)) {
    // Inventory can appear at top-level, overview, or zones
    const overviewInventory = Array.isArray(data.overview?.image_inventory)
      ? data.overview!.image_inventory!
      : [];
    const zoneInventory = (data.zones || []).flatMap(z => z.image_inventory || []);
    const inventoryEntries = [
      ...(Array.isArray(data.image_inventory) ? data.image_inventory : []),
      ...overviewInventory,
      ...zoneInventory,
    ];

    const overviewImages = data.overview?.generated_images || [];
    const zoneImages = (data.zones || []).flatMap(z => z.generated_images || []);
    const generatedCount = overviewImages.length + zoneImages.length;

    if (inventoryEntries.length > 0 && generatedCount > 0) {
      format = 'mixed';
      arrayName = null;
      imageCount = inventoryEntries.length + generatedCount;
      hasRichMetadata = inventoryEntries.some(img =>
        img.content?.title || img.content?.description || img.provenance
      );
    } else if (inventoryEntries.length > 0) {
      format = 'inventory';
      arrayName = 'image_inventory';
      imageCount = inventoryEntries.length;
      hasRichMetadata = inventoryEntries.some(img =>
        img.content?.title || img.content?.description || img.provenance
      );
    } else if (generatedCount > 0) {
      format = 'generated';
      arrayName = 'generated_images';
      imageCount = generatedCount;
      hasRichMetadata = false;
    }
  }
  else if (isChapterImagery(data)) {
    // Check for production art direction format (images array)
    if (data.images && Array.isArray(data.images)) {
      format = 'chapter';
      arrayName = 'images';
      imageCount = data.images.length;
      hasRichMetadata = data.images.some(img =>
        img.visual_description || img.composition_notes || img.lighting
      );
    }
    // Check for legacy scenes format
    else if (data.scenes && Array.isArray(data.scenes)) {
      const sceneImages = data.scenes.flatMap(s => s.generated_images || []);
      format = 'generated';
      arrayName = 'generated_images';
      imageCount = sceneImages.length;
      hasRichMetadata = false;
    }
    // Check for standalone generated_images array
    else if (data.generated_images && Array.isArray(data.generated_images)) {
      format = 'generated';
      arrayName = 'generated_images';
      imageCount = data.generated_images.length;
      hasRichMetadata = false;
    }
  }

  return {
    entityType,
    slug,
    format,
    arrayName,
    imageCount,
    hasRichMetadata,
  };
}

/**
 * Get all image entries from imagery data in a unified format
 * Works across all entity types and schema formats
 */
export function getUnifiedImageEntries(data: ImageryData): UnifiedImageEntry[] {
  const entries: UnifiedImageEntry[] = [];
  const formatInfo = detectSchemaFormat(data);

  if (isCharacterImagery(data)) {
    // Extract from image_inventory (new format)
    if (data.image_inventory) {
      data.image_inventory.forEach(img => {
        if (isImageInventoryEntry(img)) {
          entries.push({ format: 'inventory', data: img });
        }
      });
    }

    // Extract from generated_images (legacy format)
    if (data.generated_images) {
      data.generated_images.forEach(img => {
        if (isGeneratedImageEntry(img)) {
          entries.push({ format: 'generated', data: img });
        }
      });
    }
  }
  else if (isLocationImagery(data)) {
    const inventoryBuckets = [
      ...(data.image_inventory || []),
      ...((data.overview?.image_inventory || []) as ImageInventoryEntry[]),
      ...((data.zones || []).flatMap(z => z.image_inventory || []) as ImageInventoryEntry[]),
    ];
    inventoryBuckets.forEach(img => {
      if (isImageInventoryEntry(img)) {
        entries.push({ format: 'inventory', data: img });
      }
    });

    // Extract from overview.generated_images
    if (data.overview?.generated_images) {
      data.overview.generated_images.forEach(img => {
        if (isGeneratedImageEntry(img)) {
          entries.push({ format: 'generated', data: img });
        }
      });
    }

    // Extract from zones[].generated_images
    if (data.zones) {
      data.zones.forEach(zone => {
        if (zone.generated_images) {
          zone.generated_images.forEach(img => {
            if (isGeneratedImageEntry(img)) {
              entries.push({ format: 'generated', data: img });
            }
          });
        }
      });
    }
  }
  else if (isChapterImagery(data)) {
    // Extract from images array (production art direction format)
    if (data.images) {
      data.images.forEach(img => {
        if (isChapterImageEntry(img)) {
          entries.push({ format: 'chapter', data: img });
        }
      });
    }

    // Extract from scenes[].generated_images (legacy format)
    if (data.scenes) {
      data.scenes.forEach(scene => {
        if (scene.generated_images) {
          scene.generated_images.forEach(img => {
            if (isGeneratedImageEntry(img)) {
              entries.push({ format: 'generated', data: img });
            }
          });
        }
      });
    }

    // Extract from standalone generated_images array
    if (data.generated_images) {
      data.generated_images.forEach(img => {
        if (isGeneratedImageEntry(img)) {
          entries.push({ format: 'generated', data: img });
        }
      });
    }
  }

  return entries;
}

// ============ FORMAT CONVERSION UTILITIES ============

/**
 * Convert a GeneratedImageEntry to ImageInventoryEntry format
 * Enriches basic generation metadata with content fields
 */
export function convertToInventoryEntry(
  generated: GeneratedImageEntry,
  enrichment?: {
    title?: string;
    description?: string;
    alt_text?: string;
    tags?: string[];
    status?: ImageInventoryEntry['status'];
  }
): ImageInventoryEntry {
  return {
    id: generated.custom_id,
    path: generated.file_path || '',
    type: 'generated',
    status: enrichment?.status || 'approved',
    content: {
      title: enrichment?.title || `Image ${generated.custom_id}`,
      description: enrichment?.description || generated.prompt_used || '',
      alt_text: enrichment?.alt_text || `Generated image ${generated.custom_id}`,
      tags: enrichment?.tags || [],
    },
    provenance: {
      source: 'generated',
      created_at: generated.generated_at || new Date().toISOString(),
      original_filename: generated.file_name || undefined,
      generation_params: {
        prompt_used: generated.prompt_used,
        provider: generated.provider,
        model: generated.model,
        size: generated.size,
        quality: generated.quality,
      },
    },
    archived: generated.archived,
    archived_at: generated.archived_at,
    archived_path: generated.archived_path,
  };
}

/**
 * Convert an ImageInventoryEntry to GeneratedImageEntry format
 * Flattens rich metadata back to basic format
 */
export function convertToGeneratedEntry(inventory: ImageInventoryEntry): GeneratedImageEntry {
  const generationParams = inventory.provenance?.generation_params || {};

  return {
    custom_id: inventory.id,
    file_name: inventory.provenance?.original_filename || inventory.path.split('/').pop() || '',
    file_path: inventory.path,
    prompt_used: generationParams.prompt_used || inventory.content?.description || '',
    provider: generationParams.provider || 'unknown',
    model: generationParams.model || 'unknown',
    size: generationParams.size,
    quality: generationParams.quality,
    generated_at: inventory.provenance?.created_at || new Date().toISOString(),
    archived: inventory.archived,
    archived_at: inventory.archived_at,
    archived_path: inventory.archived_path,
  };
}

/**
 * Convert a GeneratedImageEntry to ChapterImageEntry format
 * Maps basic fields to chapter production format
 */
export function convertToChapterEntry(
  generated: GeneratedImageEntry,
  promptIndex?: number
): ChapterImageEntry {
  return {
    custom_id: generated.custom_id,
    source_moment: `Generated image ${generated.custom_id}`,
    visual_description: generated.prompt_used,
    prompt_used: generated.prompt_used,
    provider: generated.provider ?? undefined,
    model: generated.model ?? undefined,
    size: generated.size ?? undefined,
    generated_at: generated.generated_at ?? undefined,
    file_name: generated.file_name ?? undefined,
    file_path: generated.file_path ?? undefined,
    tags: [],
  };
}

/**
 * Convert a ChapterImageEntry to GeneratedImageEntry format
 * Maps production art direction fields back to basic format
 */
export function convertChapterToGeneratedEntry(chapter: ChapterImageEntry): GeneratedImageEntry {
  return {
    custom_id: chapter.custom_id,
    file_name: chapter.file_name || '',
    file_path: chapter.file_path || '',
    prompt_used: chapter.prompt_used || chapter.visual_description || '',
    provider: chapter.provider || 'unknown',
    model: chapter.model || 'unknown',
    size: chapter.size,
    quality: undefined,
    generated_at: chapter.generated_at || new Date().toISOString(),
  };
}

/**
 * Convert an ImageInventoryEntry to ChapterImageEntry format
 * Maps rich metadata to production art direction format
 */
export function convertInventoryToChapterEntry(inventory: ImageInventoryEntry): ChapterImageEntry {
  const generationParams = inventory.provenance?.generation_params || {};

  return {
    custom_id: inventory.id,
    source_moment: inventory.content?.title || inventory.id,
    visual_description: inventory.content?.description || '',
    composition_notes: inventory.content?.alt_text,
    tags: inventory.content?.tags || [],
    prompt_used: generationParams.prompt_used || inventory.content?.description || '',
    provider: generationParams.provider ?? undefined,
    model: generationParams.model ?? undefined,
    size: generationParams.size ?? undefined,
    generated_at: inventory.provenance?.created_at ?? undefined,
    file_name: inventory.provenance?.original_filename || inventory.path.split('/').pop() || undefined,
    file_path: inventory.path || undefined,
  };
}

/**
 * Extract all prompts from an entity's imagery.yaml, normalized across entity types
 * Returns ExtendedNormalizedPrompt[] with rich metadata when available (Chapter 1 format)
 */
export function getPromptsForEntity(data: ImageryData): ExtendedNormalizedPrompt[] {
  const prompts: ExtendedNormalizedPrompt[] = [];

  if (isCharacterImagery(data)) {
    // Character: prompts[] array at root level
    (data.prompts || []).forEach((prompt, index) => {
      prompts.push({
        index,
        prompt,
        source: 'prompts',
      });
    });
  } else if (isLocationImagery(data)) {
    // Location: overview.base_prompt + zones[].base_prompt
    let index = 0;

    if (data.overview?.base_prompt) {
      prompts.push({
        index: index++,
        prompt: data.overview.base_prompt,
        source: 'overview',
        sourceName: data.overview.title || 'overview',
        sourceIndex: 0,
        visual_description: data.overview.visual_description,
        composition_notes: data.overview.composition_notes,
        reference_images: data.overview.reference_images,
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
          visual_description: zone.visual_description,
          composition_notes: zone.composition_notes,
          reference_images: zone.reference_images,
        });
      }
    });
  } else if (isChapterImagery(data)) {
    // Chapter has two possible formats:
    // 1. Standard: scenes[].base_prompt
    // 2. Chapter 1 format: prompts[].prompt_used

    // First check for standard scenes format
    if (data.scenes?.length) {
      (data.scenes || []).forEach((scene, index) => {
        if (scene.base_prompt) {
          prompts.push({
            index,
            prompt: scene.base_prompt,
            source: 'scene',
            sourceName: scene.title || `Scene ${index + 1}`,
            visual_description: scene.visual_description,
            composition_notes: scene.composition_notes,
          });
        }
      });
    }

    // Then check for Chapter 1 format (prompts[] with prompt_used)
    if (data.prompts?.length && prompts.length === 0) {
      (data.prompts || []).forEach((entry, index) => {
        if (entry.prompt_used) {
          prompts.push({
            index,
            prompt: entry.prompt_used,
            source: 'scene',
            sourceName: entry.custom_id || entry.source_scene || `Prompt ${index + 1}`,
            // Rich metadata from Chapter 1 format
            custom_id: entry.custom_id,
            image_type: entry.image_type,
            aspect_ratio: entry.aspect_ratio,
            visual_description: entry.visual_description,
            composition_notes: entry.composition_notes,
            lighting: entry.lighting,
            characters_present: entry.characters_present,
            reference_images: entry.reference_images,
          });
        }
      });
    }

    // Finally check for production art direction format (images[] with prompt_used)
    if (data.images?.length && prompts.length === 0) {
      (data.images || []).forEach((entry, index) => {
        if (entry.prompt_used) {
          prompts.push({
            index,
            prompt: entry.prompt_used,
            source: 'scene',
            sourceName: entry.custom_id || entry.scene_id || `Image ${index + 1}`,
            // Rich metadata from production art direction format
            custom_id: entry.custom_id,
            image_type: entry.image_type,
            aspect_ratio: entry.aspect_ratio,
            visual_description: entry.visual_description,
            composition_notes: entry.composition_notes,
            lighting: typeof entry.lighting === 'object'
              ? `${entry.lighting.primary_source}, ${entry.lighting.quality}`
              : entry.lighting,
            characters_present: entry.depicts_characters?.map(slug => ({ slug })),
            location: entry.location,
            reference_images: entry.reference_images,
          });
        }
      });
    }
  }

  return prompts;
}

/**
 * Get chapter style tokens and negative prompt if available
 */
export function getChapterStyleInfo(data: ImageryData): {
  style_tokens?: ChapterStyleTokens;
  negative_prompt?: string;
  visual_thesis?: string;
} | null {
  if (!isChapterImagery(data)) {
    return null;
  }

  return {
    style_tokens: data.style_tokens,
    negative_prompt: data.negative_prompt,
    visual_thesis: data.visual_thesis,
  };
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

  // Check if images directory exists
  if (!existsSync(imagesDir)) {
    return { archivedCount: 0, archivePath: null };
  }

  // Preserve reference images in image_inventory (do not archive)
  const preservedFiles = new Set<string>();
  try {
    const imageryData = await readImageryYaml(entityType, slug);
    if (imageryData && 'image_inventory' in imageryData && Array.isArray(imageryData.image_inventory)) {
      imageryData.image_inventory.forEach(entry => {
        const filename = entry.path.split('/').pop();
        if (filename) {
          preservedFiles.add(filename);
        }
      });
    }
  } catch {
    // Ignore imagery read errors when archiving
  }

  // Get list of image files (exclude archive directory)
  let files: string[];
  try {
    files = await readdir(imagesDir);
  } catch {
    return { archivedCount: 0, archivePath: null };
  }

  const imageFiles = files.filter(f =>
    /\.(png|jpg|jpeg|webp)$/i.test(f) && f !== 'archive' && !preservedFiles.has(f)
  );

  if (imageFiles.length === 0) {
    return { archivedCount: 0, archivePath: null };
  }

  // Create archive directory
  await mkdir(archivePath, { recursive: true });

  // Move each image to archive
  let archivedCount = 0;
  for (const file of imageFiles) {
    const srcPath = join(imagesDir, file);
    const destPath = join(archivePath, file);

    try {
      // Check if it's actually a file (not a directory)
      const fileStat = await stat(srcPath);
      if (fileStat.isFile()) {
        await rename(srcPath, destPath);
        archivedCount++;
      }
    } catch (error) {
      const logger = getLogger();
      logger.error('Failed to archive image file', error as Error, { module: 'imagery-yaml', file });
    }
  }

  return { archivedCount, archivePath: archivedCount > 0 ? archivePath : null };
}

/**
 * Update imagery data to mark entries as archived (format-aware)
 * Handles all three formats: inventory, generated, and chapter
 */
export function markImagesAsArchived(
  data: ImageryData,
  archivePath: string,
  archivedAt: string
): ImageryData {
  const updateGeneratedImages = (images: GeneratedImageEntry[]): GeneratedImageEntry[] => {
    return images.map(img => ({
      ...img,
      archived: true,
      archived_at: archivedAt,
      archived_path: join(archivePath, img.file_name),
    }));
  };

  const updateInventoryImages = (images: ImageInventoryEntry[]): ImageInventoryEntry[] => {
    return images.map(img => ({
      ...img,
      archived: true,
      archived_at: archivedAt,
      archived_path: join(archivePath, img.provenance?.original_filename || img.path.split('/').pop() || ''),
    }));
  };

  const updateChapterImages = (images: ChapterImageEntry[]): ChapterImageEntry[] => {
    return images.map(img => ({
      ...img,
      file_path: img.file_path ? join(archivePath, img.file_name || '') : null,
    }));
  };

  if (isCharacterImagery(data)) {
    const formatInfo = detectSchemaFormat(data);

    if (formatInfo.format === 'inventory' && data.image_inventory) {
      return {
        ...data,
        image_inventory: updateInventoryImages(data.image_inventory),
      };
    } else if (data.generated_images) {
      return {
        ...data,
        generated_images: updateGeneratedImages(data.generated_images),
      };
    }
  } else if (isLocationImagery(data)) {
    return {
      ...data,
      image_inventory: data.image_inventory ? updateInventoryImages(data.image_inventory) : data.image_inventory,
      overview: data.overview ? {
        ...data.overview,
        generated_images: updateGeneratedImages(data.overview.generated_images || []),
        image_inventory: data.overview.image_inventory
          ? updateInventoryImages(data.overview.image_inventory)
          : data.overview.image_inventory,
      } : undefined,
      zones: (data.zones || []).map(zone => ({
        ...zone,
        generated_images: updateGeneratedImages(zone.generated_images || []),
        image_inventory: zone.image_inventory ? updateInventoryImages(zone.image_inventory) : zone.image_inventory,
      })),
    };
  } else if (isChapterImagery(data)) {
    const formatInfo = detectSchemaFormat(data);

    if (formatInfo.format === 'chapter' && data.images) {
      return {
        ...data,
        images: updateChapterImages(data.images),
      };
    } else if (data.scenes) {
      return {
        ...data,
        scenes: (data.scenes || []).map(scene => ({
          ...scene,
          generated_images: updateGeneratedImages(scene.generated_images || []),
        })),
      };
    }
  }

  return data;
}

/**
 * Add a new generated image entry to the appropriate location in imagery data
 */
export function addGeneratedImage(
  data: ImageryData,
  image: GeneratedImageEntry,
  promptSource: NormalizedPrompt['source'],
  sourceIndex?: number
): ImageryData {
  if (isCharacterImagery(data)) {
    // Detect format and add to appropriate array
    const formatInfo = detectSchemaFormat(data);

    if (formatInfo.format === 'inventory' && data.image_inventory) {
      // Convert to inventory format with basic enrichment
      const inventoryEntry = convertToInventoryEntry(image, {
        title: `Generated image ${image.custom_id}`,
        description: image.prompt_used,
        alt_text: `Generated image ${image.custom_id}`,
        tags: [],
        status: 'approved',
      });

      return {
        ...data,
        image_inventory: [...data.image_inventory, inventoryEntry],
      };
    } else {
      // Legacy format or no existing array - use generated_images
      return {
        ...data,
        generated_images: [...(data.generated_images || []), image],
      };
    }
  } else if (isLocationImagery(data)) {
    // Locations always use generated_images format
    if (promptSource === 'overview' && data.overview) {
      return {
        ...data,
        overview: {
          ...data.overview,
          generated_images: [...(data.overview.generated_images || []), image],
        },
      };
    } else if (promptSource === 'zone' && data.zones && sourceIndex !== undefined) {
      const newZones = [...data.zones];
      if (!newZones[sourceIndex]) {
        return data;
      }
      newZones[sourceIndex] = {
        ...newZones[sourceIndex],
        generated_images: [...(newZones[sourceIndex].generated_images || []), image],
      };
      return { ...data, zones: newZones };
    }
  } else if (isChapterImagery(data)) {
    const formatInfo = detectSchemaFormat(data);

    // Check for production art direction format (images array)
    if (formatInfo.format === 'chapter' && data.images) {
      const chapterEntry = convertToChapterEntry(image, sourceIndex);
      return {
        ...data,
        images: [...data.images, chapterEntry],
      };
    }
    // Legacy scenes format
    else if (sourceIndex !== undefined && data.scenes) {
      const newScenes = [...data.scenes];
      newScenes[sourceIndex] = {
        ...newScenes[sourceIndex],
        generated_images: [...(newScenes[sourceIndex].generated_images || []), image],
      };
      return { ...data, scenes: newScenes };
    }
  }

  return data;
}

/**
 * List all entities of a given type that have imagery.yaml files
 */
export async function listEntitiesWithImagery(entityType: EntityType): Promise<string[]> {
  const typeDir = entityType === 'character' ? 'characters' :
                  entityType === 'location' ? 'locations' : 'chapters';
  const basePath = join(STORY_CONTENT_BASE, typeDir);

  try {
    const dirs = await readdir(basePath);
    const slugs: string[] = [];

    for (const dir of dirs) {
      const imageryPath = join(basePath, dir, 'imagery.yaml');
      if (existsSync(imageryPath)) {
        slugs.push(dir);
      }
    }

    return slugs.sort();
  } catch {
    return [];
  }
}

/**
 * Get statistics about an entity's imagery
 */
export interface ImageryStats {
  slug: string;
  entityType: EntityType;
  promptCount: number;
  generatedCount: number;
  providers: Record<string, number>;
  hasUngenerated: boolean;
}

export async function getImageryStats(entityType: EntityType, slug: string): Promise<ImageryStats | null> {
  const data = await readImageryYaml(entityType, slug);
  if (!data) return null;

  const prompts = getPromptsForEntity(data);
  const providers: Record<string, number> = {};
  let generatedCount = 0;

  // Use unified entries to count across all formats
  const entries = getUnifiedImageEntries(data);

  for (const entry of entries) {
    // Check if image is archived based on format
    let isArchived = false;
    let provider = 'unknown';

    if (entry.format === 'inventory') {
      isArchived = entry.data.archived || false;
      provider = entry.data.provenance?.generation_params?.provider || 'unknown';
    } else if (entry.format === 'generated') {
      isArchived = entry.data.archived || false;
      provider = entry.data.provider || 'unknown';
    } else if (entry.format === 'chapter') {
      // Chapter images don't have archived field, consider them active if they have a file_path
      isArchived = !entry.data.file_path;
      provider = entry.data.provider || 'unknown';
    }

    if (!isArchived) {
      generatedCount++;
      providers[provider] = (providers[provider] || 0) + 1;
    }
  }

  return {
    slug,
    entityType,
    promptCount: prompts.length,
    generatedCount,
    providers,
    hasUngenerated: prompts.length > generatedCount,
  };
}
