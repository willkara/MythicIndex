/**
 * Precedence Rules for Prompt Compilation
 *
 * Defines how values are merged from different sources:
 * 1. Zone/Image-level overrides (highest priority)
 * 2. Overview/Entity-level defaults
 * 3. Location visual anchor
 * 4. Metadata generation defaults
 * 5. Global master style (lowest priority)
 */

import type { LightingSpec, PaletteSpec, GenerationConstraints } from '../../types/prompt-ir.js';
// Default negative prompt for all images
const DEFAULT_NEGATIVE_PROMPT = `cartoon, anime, manga, cel-shaded, plastic, glossy, 3D render, CGI, video game screenshot, neon colors, airbrushed, digital art gloss, concept art polish, AI artifacts, photorealistic, stock photo, modern elements, futuristic elements, sci-fi, firearms, real-world Europe, historical reenactment, Victorian, Tudor, Renaissance, Napoleonic, 14th century, flat lighting`;

function normalizeNegativeTerm(term: string): string[] {
  const cleaned = term.trim().replace(/\s+/g, ' ');
  const key = cleaned.toLowerCase();

  // Many legacy location specs use "no magic/glow" negatives to avoid cheesy VFX.
  // For a high-fantasy baseline, translate those into "no overt spellcasting / no neon glow"
  // instead of banning all magical worldbuilding cues.
  const map: Record<string, string[]> = {
    'magic effects': ['overt spellcasting', 'big magical explosions'],
    'fantasy magic': ['overt spellcasting', 'big magical explosions'],
    'fantasy magic effects': ['overt spellcasting', 'big magical explosions'],
    'magical elements': ['overt spellcasting', 'neon rune-glow'],
    'glowing elements': ['neon rune-glow', 'excessive glow'],
    'glowing magical effects': ['neon rune-glow', 'excessive glow'],
    'fantasy glow': ['neon rune-glow', 'excessive glow'],
    'fantasy glow effects': ['neon rune-glow', 'excessive glow'],
    'magic sparkles': ['sparkle shower', 'glittery magic'],
    'magic sparkles, supernatural elements visible': ['sparkle shower', 'glittery magic'],
    'supernatural elements visible': ['overt spellcasting'],
    'magical glowing elements': ['neon rune-glow', 'excessive glow'],
    'fantasy crystals': ['giant glowing crystals everywhere', 'crystal cave aesthetic'],
    'glowing machines': ['sci-fi glow', 'tech glow'],
  };

  if (map[key]) return map[key];

  // Pattern-based rewrites (handles phrases like "no glowing magic", etc.)
  if (/\bglow(ing)?\b/.test(key) && /\bmagic\b/.test(key)) {
    return ['neon rune-glow', 'excessive glow'];
  }
  if (/\bmagic\b/.test(key) && /\beffects?\b/.test(key)) {
    return ['overt spellcasting', 'big magical explosions'];
  }

  return [cleaned];
}

// ============================================================================
// Merging Strategies
// ============================================================================

/**
 * Override strategy - higher priority value wins
 */
export function override<T>(higher: T | undefined, lower: T | undefined): T | undefined {
  return higher !== undefined ? higher : lower;
}

/**
 * Merge arrays with deduplication
 */
export function mergeArrays<T>(...sources: (T[] | undefined)[]): T[] {
  const result: T[] = [];
  for (const source of sources) {
    if (source) {
      for (const item of source) {
        if (!result.includes(item)) {
          result.push(item);
        }
      }
    }
  }
  return result;
}

/**
 * Merge string arrays with deduplication (case-insensitive)
 */
export function mergeStringArrays(...sources: (string[] | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const source of sources) {
    if (source) {
      for (const item of source) {
        const lower = item.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          result.push(item);
        }
      }
    }
  }

  return result;
}

// ============================================================================
// Location Precedence
// ============================================================================

export interface LocationPrecedenceSources {
  zone?: {
    aspect_ratio?: string;
    size?: string;
    orientation?: string;
    scene_mood?: string;
    lighting?: LightingSpec;
    palette?: PaletteSpec;
    required_elements?: string[];
    key_elements?: string[]; // v2.0
    negative_prompt?: string;
  };
  overview?: {
    aspect_ratio?: string;
    size?: string;
    orientation?: string;
    scene_mood?: string;
    lighting?: LightingSpec;
    palette?: PaletteSpec;
    required_elements?: string[];
    key_elements?: string[]; // v2.0
    negative_prompt?: string;
  };
  visual_anchor?: {
    signature_elements?: string[];
    color_anchors?: Record<string, string>;
    characteristic_light?: Record<string, string>;
  };
  metadata?: {
    provider?: string;
    model?: string;
    quality?: string;
  };
}

/**
 * Apply precedence rules to resolve aspect ratio
 * Zone → Overview → Metadata → Global default
 */
export function resolveAspectRatio(sources: LocationPrecedenceSources): string {
  return (
    sources.zone?.aspect_ratio || sources.overview?.aspect_ratio || '16:9' // Global default
  );
}

/**
 * Apply precedence rules to resolve size
 * Zone → Overview → Metadata → Global default
 */
export function resolveSize(sources: LocationPrecedenceSources): string {
  return (
    sources.zone?.size || sources.overview?.size || '1792x1024' // Global default for landscape
  );
}

/**
 * Apply precedence rules to resolve orientation
 * Zone → Overview → Inferred from aspect ratio
 */
export function resolveOrientation(
  sources: LocationPrecedenceSources,
  aspectRatio: string
): 'landscape' | 'portrait' {
  if (sources.zone?.orientation) {
    return sources.zone.orientation as 'landscape' | 'portrait';
  }
  if (sources.overview?.orientation) {
    return sources.overview.orientation as 'landscape' | 'portrait';
  }

  // Infer from aspect ratio
  const [w, h] = aspectRatio.split(':').map(Number);
  return w >= h ? 'landscape' : 'portrait';
}

/**
 * Apply precedence rules to resolve scene mood
 * Zone → Overview
 */
export function resolveSceneMood(sources: LocationPrecedenceSources): string | undefined {
  return sources.zone?.scene_mood || sources.overview?.scene_mood;
}

/**
 * Apply precedence rules to resolve lighting
 * Zone → Overview → Inferred from visual anchor characteristic light
 */
export function resolveLighting(
  sources: LocationPrecedenceSources,
  timeOfDay?: string
): LightingSpec | undefined {
  // Zone lighting wins
  if (sources.zone?.lighting) {
    return sources.zone.lighting;
  }

  // Overview lighting
  if (sources.overview?.lighting) {
    return sources.overview.lighting;
  }

  // Infer from visual anchor characteristic light
  if (sources.visual_anchor?.characteristic_light && timeOfDay) {
    const timeKey = timeOfDay.toLowerCase().replace(/\s+/g, '_');
    const lightDesc = sources.visual_anchor.characteristic_light[timeKey];
    if (lightDesc) {
      return {
        primary_source: timeOfDay,
        quality: lightDesc,
      };
    }
  }

  return undefined;
}

/**
 * Apply precedence rules to resolve palette
 * Zone → Overview → Visual anchor color anchors
 */
export function resolvePalette(sources: LocationPrecedenceSources): PaletteSpec {
  const palette: PaletteSpec = {
    dominant: [],
    accent: [],
    avoid: [],
  };

  // Start with visual anchor color anchors as base
  if (sources.visual_anchor?.color_anchors) {
    palette.dominant = Object.values(sources.visual_anchor.color_anchors);
  }

  // Override with overview palette
  if (sources.overview?.palette) {
    if (sources.overview.palette.dominant?.length) {
      palette.dominant = sources.overview.palette.dominant;
    }
    if (sources.overview.palette.accent?.length) {
      palette.accent = sources.overview.palette.accent;
    }
    if (sources.overview.palette.avoid?.length) {
      palette.avoid = sources.overview.palette.avoid;
    }
  }

  // Override with zone palette
  if (sources.zone?.palette) {
    if (sources.zone.palette.dominant?.length) {
      palette.dominant = sources.zone.palette.dominant;
    }
    if (sources.zone.palette.accent?.length) {
      palette.accent = sources.zone.palette.accent;
    }
    // Avoid lists are MERGED, not overridden
    if (sources.zone.palette.avoid?.length) {
      palette.avoid = mergeStringArrays(palette.avoid, sources.zone.palette.avoid);
    }
  }

  return palette;
}

/**
 * Apply precedence rules to resolve required elements
 * Zone (overrides) → OR → Overview + Visual anchor signature elements (merged)
 */
export function resolveRequiredElements(sources: LocationPrecedenceSources): string[] {
  // Always include the location's signature elements so every target retains location identity.
  // Zones may specify their own required elements; merge rather than fully override.
  const elements: string[] = [];

  // Collect from zone (highest precedence)
  if (sources.zone?.required_elements) {
    elements.push(...sources.zone.required_elements);
  }
  if (sources.zone?.key_elements) {
    // v2.0 field
    elements.push(...sources.zone.key_elements);
  }

  // v2.0: Check default_prompt_elements.must_include
  if ('default_prompt_elements' in (sources.zone || {}) && (sources.zone as any).default_prompt_elements?.must_include) {
    elements.push(...(sources.zone as any).default_prompt_elements.must_include);
  }

  // Fallback to overview if zone has none
  if (elements.length === 0) {
    if (sources.overview?.required_elements) {
      elements.push(...sources.overview.required_elements);
    }
    if (sources.overview?.key_elements) {
      // v2.0 field
      elements.push(...sources.overview.key_elements);
    }
  }

  // Always merge with visual anchor signature elements
  return mergeStringArrays(elements, sources.visual_anchor?.signature_elements);
}

/**
 * Apply precedence rules to resolve negative prompt
 * MERGE all sources (deduplicated):
 * - Zone negative_prompt
 * - Overview negative_prompt
 * - Zone palette.avoid (converted to "X colors")
 * - Overview palette.avoid (converted to "X colors")
 * - Zone default_prompt_elements.must_avoid
 * - Global defaults
 */
export function resolveNegativePrompt(sources: LocationPrecedenceSources): string[] {
  const terms: string[] = [];

  // Parse negative prompts from each source
  const negatives = [
    sources.zone?.negative_prompt,
    sources.overview?.negative_prompt,
    DEFAULT_NEGATIVE_PROMPT,
  ];

  for (const neg of negatives) {
    if (neg) {
      // Split on commas and newlines, trim, filter empties
      const parsed = neg
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      for (const term of parsed) {
        terms.push(...normalizeNegativeTerm(term));
      }
    }
  }

  // Add palette.avoid colors (zone and overview)
  if (sources.zone?.palette?.avoid?.length) {
    for (const color of sources.zone.palette.avoid) {
      terms.push(`${color} colors`);
    }
  }
  if (sources.overview?.palette?.avoid?.length) {
    for (const color of sources.overview.palette.avoid) {
      terms.push(`${color} colors`);
    }
  }

  // Add default_prompt_elements.must_avoid (v2.0)
  const zonePromptElements = (sources.zone as any)?.default_prompt_elements;
  if (zonePromptElements?.must_avoid?.length) {
    terms.push(...zonePromptElements.must_avoid);
  }

  // Deduplicate (case-insensitive)
  const seen = new Set<string>();
  const result: string[] = [];
  for (const term of terms) {
    const lower = term.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      result.push(term);
    }
  }

  return result;
}

/**
 * Resolve all generation constraints with precedence
 */
export function resolveConstraints(sources: LocationPrecedenceSources): GenerationConstraints {
  const aspectRatio = resolveAspectRatio(sources);
  const size = resolveSize(sources);
  const orientation = resolveOrientation(sources, aspectRatio);

  return {
    aspect_ratio: aspectRatio,
    size,
    orientation,
    quality: (sources.metadata?.quality as 'standard' | 'high') || 'high',
  };
}

// ============================================================================
// Global Defaults
// ============================================================================

export const GLOBAL_DEFAULTS = {
  aspectRatio: '16:9',
  size: '1792x1024',
  orientation: 'landscape' as const,
  quality: 'high' as const,
  maxPromptLength: 4000,
};
