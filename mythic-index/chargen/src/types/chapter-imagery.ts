/**
 * Chapter Imagery Types
 *
 * Types for the reference-based chapter imagery schema.
 * Chapters reference characters and locations instead of embedding descriptions.
 */

import type { ImageInventoryEntry, LightingSpec, PaletteSpec } from './prompt-ir.js';

// ============================================================================
// Chapter Imagery Spec (New Reference-Based Schema)
// ============================================================================

/** Main chapter imagery specification */
export interface ChapterImagerySpec {
  metadata: ChapterMetadata;
  characters: CharacterReference[];
  locations: LocationReference[];
  moments?: ChapterMoment[];
  images: ChapterImageSpec[];
}

/**
 * A narrative moment within a chapter.
 * Moments define where and when scenes happen, and images link to them
 * via source_moment to inherit location_zone context.
 */
export interface ChapterMoment {
  /** Unique moment ID */
  id: string;

  /** Scene ID for organization */
  scene_id?: string;

  /** Human-readable title */
  title?: string;

  /** Narrative beat description */
  narrative_beat?: string;

  /** Visual weight for prioritization */
  visual_weight?: 'low' | 'medium' | 'high' | 'critical';

  /** Characters present in this moment */
  characters_present?: string[];

  /**
   * Location and zone reference.
   * Format: "location-slug/zone-id" (e.g., "undershade-canyon/rim")
   */
  location_zone?: string;

  /** Transformation state relative to chapter's central event */
  transformation_state?: 'before' | 'during' | 'after';

  /** Recommended number of images for this moment */
  recommended_images?: number;
}

/** Chapter metadata */
export interface ChapterMetadata {
  entity_type: 'chapter-imagery';
  slug: string;
  chapter_number: number;
  chapter_title: string;
  visual_thesis?: string;
  color_palette?: {
    primary?: string[];
    accent?: string[];
  };
  mood_distribution?: MoodDistribution;
  generation_defaults?: {
    provider?: string;
    model?: string;
    quality?: string;
  };
}

/** Mood distribution for chapter - counts how many images use each mood */
export interface MoodDistribution {
  somber?: number;
  pastoral?: number;
  celebratory?: number;
  ethereal?: number;
  intimate?: number;
  kinetic?: number;
  ominous?: number;
  heroic?: number;
  clandestine?: number;
  tense?: number;
  reverent?: number;
}

// ============================================================================
// Character References
// ============================================================================

/**
 * Reference to a character entity.
 * Canonical appearance is resolved from characters/[ref]/imagery.yaml
 */
export interface CharacterReference {
  /** Character slug - points to characters/[ref]/imagery.yaml */
  ref: string;

  /** Optional display name override */
  name?: string;

  /**
   * Chapter-specific state variations.
   * Format: key-value pairs or freeform text describing states.
   * Example:
   *   Pre-battle: Standard appearance, eyes amber
   *   Hybrid form: Twisted amalgam, broken gait
   */
  scene_variations?: string;

  /**
   * Explicit reference image IDs to use for this chapter.
   * Falls back to character's image_inventory if not specified.
   */
  reference_images?: string[];
}

/**
 * Resolved character data (after loading from character imagery.yaml)
 */
export interface ResolvedCharacter {
  slug: string;
  name: string;
  /** Canonical appearance from character imagery.yaml */
  canonical_appearance: string;
  /** Chapter-specific variations */
  scene_variations?: string;
  /** Available reference image asset IDs */
  reference_images: string[];
  /** Resolved paths to portrait images */
  portrait_paths: string[];
}

// ============================================================================
// Location References
// ============================================================================

/**
 * Reference to a location entity.
 * Visual anchor and zones are resolved from locations/[ref]/imagery.yaml
 */
export interface LocationReference {
  /** Location slug - points to locations/[ref]/imagery.yaml */
  ref: string;

  /** Specific zones from this location used in the chapter */
  zones?: ZoneContext[];
}

/**
 * Context for a specific zone within a location.
 * The zone visual comes from location's zones, merged with chapter_context.
 */
export interface ZoneContext {
  /** Zone ID (matches location's zones[].slug suffix) */
  id: string;

  /**
   * Chapter-specific overlay for this zone.
   * Describes temporary state: damage, weather, mood changes.
   * Merged with the location zone's visual_description.
   */
  chapter_context?: string;
}

/**
 * Resolved location data (after loading from location imagery.yaml)
 */
export interface ResolvedLocation {
  slug: string;
  name: string;
  /** Visual anchor data (signature elements, materials, colors, light) */
  visual_anchor: {
    signature_elements?: string[];
    materials?: Record<string, string>;
    color_anchors?: Record<string, string>;
    characteristic_light?: Record<string, string>;
  };
  /** Overview visual description */
  overview_description?: string;
  /** Zone visual descriptions */
  zones: Record<
    string,
    {
      name: string;
      visual_description?: string;
      zone_type?: string;
    }
  >;
  /** Reference image paths for location */
  reference_paths: string[];
}

// ============================================================================
// Chapter Image Specifications
// ============================================================================

/** Image type categories for chapters */
export type ChapterImageType =
  | 'hero' // Chapter opening/establishing shot
  | 'anchor' // Pivotal moments, action climaxes
  | 'beat' // Narrative beat within scene
  | 'detail' // Close-ups, symbolic details
  | 'supporting'; // Supporting imagery for context

/** Scene mood options */
export type SceneMood =
  | 'somber' // Grief, loss, melancholy
  | 'pastoral' // Peaceful, natural, serene
  | 'celebratory' // Joy, triumph, festivity
  | 'ethereal' // Mystical, otherworldly, dreamlike
  | 'intimate' // Close, personal, tender
  | 'kinetic' // Action, energy, motion
  | 'ominous' // Foreboding, danger, tension
  | 'heroic' // Triumph, valor, courage
  | 'clandestine' // Secret, hidden, covert
  | 'tense' // Suspense, anxiety, unease
  | 'reverent'; // Sacred, respectful, solemn

/**
 * Specification for a single chapter image.
 * Uses references to characters and locations rather than embedding.
 */
export interface ChapterImageSpec {
  /** Unique image ID within chapter */
  custom_id: string;

  /** Source moment reference */
  source_moment?: string;

  /** Scene ID for organization */
  scene_id?: string;

  /** Image type */
  image_type: ChapterImageType;

  /** Categories for filtering */
  category?: string[];

  /** Scene mood */
  scene_mood?: SceneMood;

  /** Explanation for mood choice */
  mood_rationale?: string;

  // === Visual Description ===

  /** Main visual description */
  visual_description?: string;

  /** Composition and framing guidance */
  composition_notes?: string;

  /** Single memorable visual element */
  visual_hook?: string;

  // === Character References ===

  /** Characters depicted (slugs) */
  depicts_characters?: string[];

  /**
   * Which scene_variation to use for each character.
   * Maps slug to variation key (from CharacterReference.scene_variations)
   */
  character_state?: string;

  /**
   * Per-character state overrides for this specific image.
   * Takes precedence over scene_variations.
   */
  character_states?: Record<string, string>;

  // === Location References ===

  /** Location slug (from chapter's locations[].ref) */
  location?: string;

  /** Specific zone within the location */
  zone?: string;

  // === Visual Specifications ===

  /** Lighting details */
  lighting?: LightingSpec;

  /** Color palette */
  palette?: PaletteSpec;

  /** Aspect ratio */
  aspect_ratio?: string;

  /** Image orientation */
  orientation?: 'landscape' | 'portrait' | 'square';

  /** Image dimensions */
  size?: string;

  // === Pre-authored Content ===

  /**
   * Pre-authored prompt (optional).
   * If present, will be analyzed for character mentions and enhanced.
   */
  prompt_used?: string;

  /** Negative prompt */
  negative_prompt?: string;

  /** Tags for filtering/search */
  tags?: string[];

  /** Generated images attached to this image spec */
  image_inventory?: ImageInventoryEntry[];

  // === Generation Status (populated after generation) ===

  generated_at?: string;
  file_name?: string;
  file_path?: string;
  provider?: string;
  model?: string;
  provider_metadata?: Record<string, unknown>;
}

// ============================================================================
// Legacy Schema Types (for migration from old embedded format)
// ============================================================================

/**
 * Legacy chapter character reference with embedded appearance.
 * Used for migration from old format.
 */
export interface LegacyCharacterRef {
  slug: string;
  name: string;
  appearance_source?: string;
  consistency_warning?: string | null;
  appearance: string; // Embedded - will be dropped during migration
  reference_images?: string[];
  scene_variations?: string;
}

/**
 * Legacy chapter location with embedded description.
 * Used for migration from old format.
 */
export interface LegacyChapterLocation {
  slug: string;
  name: string;
  visual_description: string; // Embedded - will become chapter_context
}

/**
 * Legacy chapter imagery file structure.
 * Used for reading existing files during migration.
 */
export interface LegacyChapterImagery {
  metadata: ChapterMetadata;
  character_refs?: LegacyCharacterRef[];
  locations?: LegacyChapterLocation[];
  images?: ChapterImageSpec[];
}

// ============================================================================
// Migration Types
// ============================================================================

/** Result of migrating a chapter file */
export interface MigrationResult {
  chapter_slug: string;
  success: boolean;
  backup_path?: string;

  /** Characters found in legacy format */
  characters_migrated: {
    slug: string;
    had_embedded_appearance: boolean;
    canonical_exists: boolean;
  }[];

  /** Locations found in legacy format */
  locations_migrated: {
    original_slug: string;
    parsed_ref: string;
    parsed_zone?: string;
    master_exists: boolean;
  }[];

  /** Any warnings or issues */
  warnings: string[];

  /** Errors that prevented migration */
  errors: string[];
}

// ============================================================================
// Compiler Integration Types
// ============================================================================

/**
 * Compiled chapter image - extends CompiledPromptIR with chapter-specific data
 */
export interface ChapterCompilationContext {
  chapter_slug: string;
  chapter_title: string;
  visual_thesis?: string;
  color_palette?: { primary?: string[]; accent?: string[] };

  /** Resolved characters for this chapter */
  characters: Map<string, ResolvedCharacter>;

  /** Resolved locations for this chapter */
  locations: Map<string, ResolvedLocation>;

  /** Chapter imagery specification (full YAML data) */
  imagery: ChapterImagerySpec;
}

/**
 * Result of parsing a prompt_used field for character mentions
 */
export interface PromptCharacterMatch {
  /** Original text that matched */
  matched_text: string;

  /** Character slug identified */
  character_slug: string;

  /** Confidence score (0-1) */
  confidence: number;

  /** Start position in prompt */
  start_index: number;

  /** End position in prompt */
  end_index: number;
}
