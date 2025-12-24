/**
 * Chapter Prompt Compiler
 *
 * Compiles chapter imagery.yaml into CompiledPromptIR structures.
 * Resolves character appearances from canonical sources and
 * location visuals from master location files.
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import type {
  CompiledPromptIR,
  ResolvedReference,
  LightingSpec,
  PaletteSpec,
  GenerationConstraints,
  ImageType,
  CompilerOptions,
} from '../../types/prompt-ir.js';
import type {
  ChapterImagerySpec,
  ChapterImageSpec,
  CharacterReference,
  LocationReference,
  ResolvedCharacter,
  ResolvedLocation,
  ChapterCompilationContext,
} from '../../types/chapter-imagery.js';
import {
  getCharacterReferencePaths,
  getLocationReferencePaths,
  findZoneReferencePath,
  readLocationImagery,
} from '../asset-registry.js';
import { getImageryPath } from '../imagery-yaml.js';
import { logPhase, logCharacterResolution, logLocationResolution } from '../../ui/log.js';
import { showSuccess } from '../../ui/display.js';

// Base path for story content (not used currently but kept for context if needed)
// const STORY_CONTENT_BASE = join(...);

// ============================================================================
// Main Compilation Functions
// ============================================================================

/**
 * Load and compile all images from a chapter
 */
export async function compileChapterImages(
  chapterSlug: string,
  options: CompilerOptions = {}
): Promise<CompiledPromptIR[]> {
  const context = await loadChapterContext(chapterSlug);
  if (!context) {
    return [];
  }

  const results: CompiledPromptIR[] = [];

  // Use context.imagery instead of re-reading
  if (!context.imagery?.images) {
    return results;
  }

  for (const imageSpec of context.imagery.images) {
    const compiled = await compileChapterImage(context, context.imagery, imageSpec, options);
    if (compiled) {
      results.push(compiled);
    }
  }

  return results;
}

/**
 * Compile a single chapter image
 */
export async function compileChapterImage(
  context: ChapterCompilationContext,
  imagery: ChapterImagerySpec,
  imageSpec: ChapterImageSpec,
  options: CompilerOptions = {}
): Promise<CompiledPromptIR> {
  // Extract zone from source_moment if not already set
  // This enables zone-aware location reference selection
  if (!imageSpec.zone && imageSpec.source_moment && imagery.moments) {
    const moment = imagery.moments.find((m) => m.id === imageSpec.source_moment);
    if (moment?.location_zone) {
      // Parse "location-slug/zone-id" → extract zone-id
      const zoneParts = moment.location_zone.split('/');
      if (zoneParts.length === 2) {
        // Set zone on imageSpec - the location is derived from the first part
        imageSpec.zone = zoneParts[1]; // e.g., "rim", "overview"

        // Also set location if not already set
        if (!imageSpec.location) {
          imageSpec.location = zoneParts[0]; // e.g., "undershade-canyon"
        }
      }
    }
  }

  // Resolve constraints
  const constraints = resolveChapterConstraints(imagery, imageSpec, options);

  // Resolve lighting
  const lighting = imageSpec.lighting;

  // Resolve palette
  const palette = resolveChapterPalette(imagery, imageSpec);

  // Build positive prompt sections
  const positive = await buildChapterPositiveSections(
    context,
    imagery,
    imageSpec,
    lighting,
    palette
  );

  // Build negative prompt
  const negative = buildChapterNegative(imageSpec);

  // Resolve references (character portraits + location references)
  const references = await resolveChapterReferences(context, imagery, imageSpec);

  return {
    target_id: imageSpec.custom_id,
    entity_type: 'chapter',
    entity_slug: context.chapter_slug,
    image_type: mapChapterImageType(imageSpec.image_type),
    title: imageSpec.custom_id,
    scene_mood: imageSpec.scene_mood,
    mood_rationale: imageSpec.mood_rationale,
    positive,
    negative,
    references,
    constraints,
    lighting,
    palette,
    sources: {
      entity_defaults: {
        chapter_slug: context.chapter_slug,
        visual_thesis: context.visual_thesis,
        color_palette: context.color_palette,
      },
      image_overrides: { imageSpec },
      global_defaults: {},
    },
    compiled_at: new Date().toISOString(),
  };
}

/**
 * List available chapter image targets
 */
export async function listChapterTargets(chapterSlug: string): Promise<{
  slug: string;
  title: string;
  images: { custom_id: string; image_type: string; scene_mood?: string }[];
}> {
  const imagery = await readChapterImagery(chapterSlug);
  if (!imagery) {
    return { slug: chapterSlug, title: '', images: [] };
  }

  return {
    slug: chapterSlug,
    title: imagery.metadata.chapter_title,
    images: (imagery.images || []).map((img) => ({
      custom_id: img.custom_id,
      image_type: img.image_type,
      scene_mood: img.scene_mood,
    })),
  };
}

// ============================================================================
// Context Loading
// ============================================================================

/**
 * Load the compilation context for a chapter
 */
export async function loadChapterContext(
  chapterSlug: string,
  options: { verbose?: boolean } = {}
): Promise<ChapterCompilationContext | null> {
  const imagery = await readChapterImagery(chapterSlug);
  if (!imagery) {
    return null;
  }

  const verbose = options.verbose ?? true;

  if (verbose) {
    logPhase('Loading chapter context...');
  }

  // Resolve all characters
  const characters = new Map<string, ResolvedCharacter>();
  if (imagery.characters) {
    for (const charRef of imagery.characters) {
      const resolved = await resolveCharacter(charRef, { verbose });
      if (resolved) {
        characters.set(charRef.ref, resolved);
      }
    }
  }

  // Resolve all locations
  const locations = new Map<string, ResolvedLocation>();
  if (imagery.locations) {
    for (const locRef of imagery.locations) {
      const resolved = await resolveLocation(locRef, { verbose });
      if (resolved) {
        locations.set(locRef.ref, resolved);
      }
    }
  }

  if (verbose) {
    showSuccess(`Context loaded: ${characters.size} character(s), ${locations.size} location(s)`);
  }

  return {
    chapter_slug: chapterSlug,
    chapter_title: imagery.metadata.chapter_title,
    visual_thesis: imagery.metadata.visual_thesis,
    color_palette: imagery.metadata.color_palette,
    characters,
    locations,
    imagery,
  };
}

// ============================================================================
// Character Resolution
// ============================================================================

/**
 * Resolve a character reference to full character data
 */
async function resolveCharacter(
  charRef: CharacterReference,
  options: { verbose?: boolean } = {}
): Promise<ResolvedCharacter | null> {
  const imageryPath = getImageryPath('character', charRef.ref);
  const verbose = options.verbose ?? true;

  try {
    const content = await readFile(imageryPath, 'utf-8');
    const data = parseYaml(content);

    // Get portrait paths
    const portraitPaths = getCharacterReferencePaths(charRef.ref, charRef.reference_images);

    // Extract reference image IDs
    const referenceImages: string[] = [];
    if (data.image_inventory && Array.isArray(data.image_inventory)) {
      for (const item of data.image_inventory) {
        if (item.id && item.status === 'approved') {
          referenceImages.push(item.id);
        }
      }
    }

    // Count scene variation states
    let variationCount = 0;
    if (charRef.scene_variations) {
      variationCount = charRef.scene_variations.split('\n').filter((l) => l.includes(':')).length;
    }

    // Log character resolution
    if (verbose) {
      const { existsSync } = await import('fs');
      logCharacterResolution(charRef.ref, {
        name: charRef.name || data.name,
        appearanceLength: (data.appearance || '').length,
        variationCount,
        portraitPath: portraitPaths[0],
        portraitExists: portraitPaths[0] ? existsSync(portraitPaths[0]) : false,
      });
    }

    return {
      slug: charRef.ref,
      name: charRef.name || data.name || charRef.ref,
      canonical_appearance: data.appearance || '',
      scene_variations: charRef.scene_variations,
      reference_images: charRef.reference_images || referenceImages.slice(0, 3),
      portrait_paths: portraitPaths,
    };
  } catch {
    return null;
  }
}

/**
 * Get the appearance for a character, potentially with state override
 */
function getCharacterAppearance(resolved: ResolvedCharacter, state?: string): string {
  // If a specific state is requested, return just that state
  if (state && resolved.scene_variations) {
    // Try to find matching state in scene_variations
    const lines = resolved.scene_variations.split('\n');
    for (const line of lines) {
      const match = line.match(/^[-\s]*([^:]+):\s*(.+)$/);
      if (match && match[1].toLowerCase().includes(state.toLowerCase())) {
        return match[2].trim();
      }
    }
  }

  // Return canonical appearance
  return resolved.canonical_appearance;
}

// ============================================================================
// Location Resolution
// ============================================================================

/**
 * Resolve a location reference to full location data
 */
async function resolveLocation(
  locRef: LocationReference,
  options: { verbose?: boolean } = {}
): Promise<ResolvedLocation | null> {
  const imagery = await readLocationImagery(locRef.ref);
  if (!imagery) {
    return null;
  }

  const verbose = options.verbose ?? true;

  // Build zones map
  const zones: ResolvedLocation['zones'] = {};
  const locationZones = imagery.zones ?? [];
  if (locationZones.length > 0) {
    for (const zone of locationZones) {
      zones[zone.slug] = {
        name: zone.name,
        visual_description: zone.visual_description,
        zone_type: zone.zone_type,
      };
    }
  }

  // Get reference paths
  const referencePaths = getLocationReferencePaths(locRef.ref);

  // Log location resolution
  if (verbose) {
    const anchor = imagery.location_visual_anchor;
    logLocationResolution(locRef.ref, {
      name: imagery.metadata?.name,
      signatureElements: anchor?.signature_elements?.length || 0,
      materials: anchor?.materials ? Object.keys(anchor.materials) : [],
      zoneCount: Object.keys(zones).length,
    });
  }

  return {
    slug: locRef.ref,
    name: imagery.metadata?.name || locRef.ref,
    visual_anchor: {
      signature_elements: imagery.location_visual_anchor?.signature_elements,
      materials: imagery.location_visual_anchor?.materials,
      color_anchors: imagery.location_visual_anchor?.color_anchors,
      characteristic_light: imagery.location_visual_anchor?.characteristic_light,
    },
    overview_description: imagery.overview?.visual_description,
    zones,
    reference_paths: referencePaths,
  };
}

/**
 * Get location description for a specific zone
 * Incorporates full visual anchor data including materials, colors, and lighting
 */
function getLocationDescription(
  resolved: ResolvedLocation,
  zone?: string,
  chapterContext?: string
): string {
  const parts: string[] = [];
  const anchor = resolved.visual_anchor;

  // Add all visual anchor elements
  if (anchor.signature_elements?.length) {
    parts.push(anchor.signature_elements.join(', '));
  }
  if (anchor.materials && Object.keys(anchor.materials).length > 0) {
    // Materials is Record<string, string>, format as "key: value" pairs
    const materialList = Object.entries(anchor.materials)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    parts.push(`Materials: ${materialList}`);
  }
  if (anchor.color_anchors && Object.keys(anchor.color_anchors).length > 0) {
    // Color anchors is Record<string, string>, format as "key: value" pairs
    const colorList = Object.entries(anchor.color_anchors)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    parts.push(`Colors: ${colorList}`);
  }
  if (anchor.characteristic_light && Object.keys(anchor.characteristic_light).length > 0) {
    // Characteristic light is Record<string, string>, format as "key: value" pairs
    const lightList = Object.entries(anchor.characteristic_light)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    parts.push(`Light: ${lightList}`);
  }

  // Add zone-specific description
  if (zone && resolved.zones[zone]) {
    const zonePart = resolved.zones[zone];
    if (zonePart.visual_description) {
      parts.push(zonePart.visual_description);
    }
  } else if (resolved.overview_description) {
    parts.push(resolved.overview_description);
  }

  // Add chapter context overlay
  if (chapterContext) {
    parts.push(chapterContext);
  }

  return parts.join('. ').replace(/\.\./g, '.');
}

// ============================================================================
// Prompt Building
// ============================================================================

/**
 * Build positive prompt sections for a chapter image
 *
 * Uses smart mode selection:
 * - When prompt_used exists: Use author's complete prompt as primary content
 * - When prompt_used is absent: Compile from components (characters, location, visual_description)
 */
async function buildChapterPositiveSections(
  context: ChapterCompilationContext,
  imagery: ChapterImagerySpec,
  imageSpec: ChapterImageSpec,
  lighting: LightingSpec | undefined,
  palette: PaletteSpec
): Promise<CompiledPromptIR['positive']> {
  const sections: CompiledPromptIR['positive'] = {
    constraints: [],
    subject: [],
    composition: [],
    lighting: [],
    palette: [],
    style: [],
  };

  // Check if we have an author-crafted prompt
  const hasAuthorPrompt = !!imageSpec.prompt_used;

  // Weight 1: Required characters (always include for reference)
  if (imageSpec.depicts_characters?.length) {
    const charNames = imageSpec.depicts_characters
      .map((slug) => context.characters.get(slug)?.name || slug)
      .join(', ');
    sections.constraints.push({
      weight: 1,
      content: `Characters: ${charNames}`,
      source: 'depicts_characters',
    });
  }

  if (hasAuthorPrompt) {
    // ========================================================================
    // AUTHOR PROMPT MODE: Use prompt_used as the primary content
    // The author's prompt contains their complete creative vision including
    // composition, style, and character descriptions. We still attach
    // character reference images for visual consistency.
    // ========================================================================

    sections.subject.push({
      weight: 2,
      content: cleanMultilineText(imageSpec.prompt_used!),
      source: 'prompt_used',
    });
  } else {
    // ========================================================================
    // COMPILED MODE: Build prompt from structured components
    // ========================================================================

    // Weight 2: Character states (scene-specific only)
    // Reference images define character appearance; text prompt only specifies scene variations
    if (imageSpec.depicts_characters?.length) {
      for (const charSlug of imageSpec.depicts_characters) {
        const resolved = context.characters.get(charSlug);
        if (resolved) {
          // Only include character_states, not canonical appearance
          // The reference image defines how the character looks;
          // character_states specify scene-specific variations (emotion, pose, temporary changes)
          const state = imageSpec.character_states?.[charSlug];
          if (state) {
            sections.subject.push({
              weight: 2,
              content: `${resolved.name}: ${cleanMultilineText(state)}`,
              source: `character_state:${charSlug}`,
            });
          }
          // If no state, let the reference image speak for itself
        }
      }
    }

    // Weight 2: Location context (scene-specific only)
    // Reference images define location appearance; text prompt only specifies scene variations
    if (imageSpec.location) {
      const locSlug = imageSpec.location;
      const resolved = context.locations.get(locSlug);

      if (resolved) {
        // Only include chapter_context if specified - this describes scene-specific variations
        // The reference image defines how the location looks
        const locRef = imagery.locations?.find((l) => l.ref === locSlug);
        let chapterContext: string | undefined;
        if (locRef?.zones && imageSpec.zone) {
          const zoneCtx = locRef.zones.find((z) => z.id === imageSpec.zone);
          chapterContext = zoneCtx?.chapter_context;
        }

        if (chapterContext) {
          sections.subject.push({
            weight: 2,
            content: `Setting context: ${cleanMultilineText(chapterContext)}`,
            source: `location_context:${locSlug}`,
          });
        }
        // If no chapter_context, let the reference image speak for itself
      }
    }

    // Weight 2: Visual description (scene core)
    if (imageSpec.visual_description) {
      sections.subject.push({
        weight: 2,
        content: cleanMultilineText(imageSpec.visual_description),
        source: 'visual_description',
      });
    }

    // Weight 3: Composition notes
    if (imageSpec.composition_notes) {
      sections.composition.push({
        weight: 3,
        content: cleanMultilineText(imageSpec.composition_notes),
        source: 'composition_notes',
      });
    }

    // Weight 3: Visual hook
    if (imageSpec.visual_hook) {
      sections.composition.push({
        weight: 3,
        content: `Key visual element: ${cleanMultilineText(imageSpec.visual_hook)}`,
        source: 'visual_hook',
      });
    }
  }

  // ========================================================================
  // SHARED SECTIONS (apply to both modes)
  // ========================================================================

  // Weight 4: Lighting
  if (lighting) {
    const lightingParts: string[] = [];
    if (lighting.primary_source) lightingParts.push(`light from ${lighting.primary_source}`);
    if (lighting.quality) lightingParts.push(lighting.quality);
    if (lighting.direction) lightingParts.push(lighting.direction);
    if (lighting.color_temperature) lightingParts.push(`${lighting.color_temperature} tones`);
    if (lighting.shadow_depth) lightingParts.push(`${lighting.shadow_depth} shadows`);
    if (lighting.atmospheric) lightingParts.push(lighting.atmospheric);

    if (lightingParts.length > 0) {
      sections.lighting.push({
        weight: 4,
        content: lightingParts.join(', '),
        source: 'lighting',
      });
    }
  }

  // Weight 4: Palette
  const paletteParts: string[] = [];
  if (palette.dominant?.length) {
    paletteParts.push(`dominant colors: ${palette.dominant.join(', ')}`);
  }
  if (palette.accent?.length) {
    paletteParts.push(`accent colors: ${palette.accent.join(', ')}`);
  }
  if (paletteParts.length > 0) {
    sections.palette.push({
      weight: 4,
      content: paletteParts.join('; '),
      source: 'palette',
    });
  }

  // Weight 5: Style + mood intent
  // Keep this focused on narrative intent. Global art direction is injected later.
  const styleParts: string[] = ['high fantasy'];

  // Add scene mood as style element
  if (imageSpec.scene_mood) {
    styleParts.push(`${imageSpec.scene_mood} atmosphere`);
  }

  sections.style.push({
    weight: 5,
    content: styleParts.join(', '),
    source: 'style_defaults',
  });

  // Weight 5: Mood rationale (explains WHY this mood)
  if (imageSpec.mood_rationale) {
    sections.style.push({
      weight: 5,
      content: `Mood intent: ${cleanMultilineText(imageSpec.mood_rationale)}`,
      source: 'mood_rationale',
    });
  }

  // Weight 5: Visual thesis (chapter's overarching theme)
  if (context.visual_thesis) {
    sections.style.push({
      weight: 5,
      content: `Chapter theme: ${cleanMultilineText(context.visual_thesis)}`,
      source: 'visual_thesis',
    });
  }

  return sections;
}

/**
 * Resolve constraints for a chapter image
 */
function resolveChapterConstraints(
  imagery: ChapterImagerySpec,
  imageSpec: ChapterImageSpec,
  options: CompilerOptions
): GenerationConstraints {
  return {
    aspect_ratio:
      options.aspectRatio ||
      imageSpec.aspect_ratio ||
      imagery.metadata.generation_defaults?.quality ||
      '16:9',
    size: options.size || imageSpec.size || '1792x1024',
    orientation: (imageSpec.orientation || 'landscape') as 'landscape' | 'portrait',
    quality: 'high',
  };
}

/**
 * Resolve palette for a chapter image
 */
function resolveChapterPalette(
  imagery: ChapterImagerySpec,
  imageSpec: ChapterImageSpec
): PaletteSpec {
  return {
    dominant: imageSpec.palette?.dominant || imagery.metadata.color_palette?.primary,
    accent: imageSpec.palette?.accent || imagery.metadata.color_palette?.accent,
    avoid: imageSpec.palette?.avoid || [],
  };
}

/**
 * Build negative prompt for a chapter image
 */
function buildChapterNegative(imageSpec: ChapterImageSpec): string[] {
  const defaults = [
    'text',
    'watermark',
    'signature',
    'blurry',
    'low quality',
    'distorted',
    'deformed',
    'disfigured',
    'bad anatomy',
    'extra limbs',
    'bad hands',
    'bad proportions',
  ];

  if (imageSpec.negative_prompt) {
    const custom = imageSpec.negative_prompt
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return [...new Set([...defaults, ...custom])];
  }

  return defaults;
}

/**
 * Resolve reference images for a chapter image
 *
 * Implements zone-aware location reference selection:
 * 1. If imageSpec.zone is set, try to find zone-specific image first
 * 2. Fall back to location overview if no zone image exists
 */
async function resolveChapterReferences(
  context: ChapterCompilationContext,
  _imagery: ChapterImagerySpec,
  imageSpec: ChapterImageSpec
): Promise<ResolvedReference[]> {
  const references: ResolvedReference[] = [];

  // Add character portrait references
  if (imageSpec.depicts_characters) {
    for (const charSlug of imageSpec.depicts_characters) {
      const resolved = context.characters.get(charSlug);
      if (resolved && resolved.portrait_paths.length > 0) {
        // Use first portrait
        const portraitPath = resolved.portrait_paths[0];
        references.push({
          asset_id: resolved.reference_images[0] || `${charSlug}-portrait`,
          role: 'portrait',
          path: portraitPath,
          exists: existsSync(portraitPath),
        });
      }
    }
  }

  // Add location reference with zone-aware selection
  if (imageSpec.location) {
    const resolved = context.locations.get(imageSpec.location);
    if (resolved) {
      let refPath: string | null = null;
      let role: 'location_overview' | 'zone' = 'location_overview';

      // Try zone-specific image first
      if (imageSpec.zone) {
        refPath = findZoneReferencePath(imageSpec.location, imageSpec.zone);
        if (refPath) {
          role = 'zone';
        }
      }

      // Fall back to overview if no zone image found
      if (!refPath && resolved.reference_paths.length > 0) {
        refPath = resolved.reference_paths[0];
        role = 'location_overview';
      }

      if (refPath && existsSync(refPath)) {
        references.push({
          asset_id: `${imageSpec.location}-${imageSpec.zone || 'overview'}`,
          role,
          path: refPath,
          exists: true,
        });
      }
    }
  }

  return references;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Read chapter imagery.yaml
 */
export async function readChapterImagery(chapterSlug: string): Promise<ChapterImagerySpec | null> {
  const imageryPath = getImageryPath('chapter', chapterSlug);

  try {
    const content = await readFile(imageryPath, 'utf-8');
    return parseYaml(content) as ChapterImagerySpec;
  } catch (error) {
    console.error(`Failed to read/parse imagery for chapter ${chapterSlug}:`, error);
    return null;
  }
}

/**
 * Map chapter image type to IR ImageType
 */
function mapChapterImageType(type: string): ImageType {
  const mapping: Record<string, ImageType> = {
    hero: 'hero',
    anchor: 'anchor',
    mood: 'beat',
    detail: 'detail',
    symbol: 'symbol',
    pivot: 'beat',
    character: 'beat',
  };
  return mapping[type] || 'beat';
}

/**
 * Clean multiline text for prompt inclusion
 */
function cleanMultilineText(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
