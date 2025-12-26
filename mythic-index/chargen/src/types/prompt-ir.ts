/**
 * Prompt Intermediate Representation (IR) Types
 *
 * These types define the structured representation of image generation prompts
 * before they are rendered into final text prompts. The IR enables:
 * - Deterministic prompt compilation with precedence rules
 * - Weighted section rendering with trimming
 * - Reference image resolution and tracking
 * - Execution record separation from specs
 */

import type { ImageInventoryEntry } from '../services/imagery-yaml.js';

/** Priority weights for prompt sections (1 = highest priority, kept during trimming) */
export type SectionWeight = 1 | 2 | 3 | 4 | 5;

/** Roles for reference images */
export type ReferenceRole =
  | 'portrait' // Character primary portrait
  | 'location_overview' // Location establishing shot
  | 'zone' // Specific area within location
  | 'beat' // Story moment reference
  | 'mood' // Atmospheric/tonal reference
  | 'prop' // Object/item reference
  | 'style_ref'; // Art style reference

/** Timeline phases for character state tracking */
export type TimelinePhase = 'pre_catastrophe' | 'during' | 'post_catastrophe';

/** Image types for categorization */
export type ImageType =
  | 'establishing' // Location overview
  | 'zone' // Specific area
  | 'beat' // Story moment
  | 'inhabited' // Scene with characters
  | 'temporal' // Time/weather variant
  | 'perspective' // Character POV
  | 'essence' // Soul of a place
  | 'hero' // Chapter hero image
  | 'anchor' // Key emotional moment
  | 'detail' // Close-up focus
  | 'mood'; // Atmospheric/tonal image

/** A weighted section of the prompt */
export interface PromptSection {
  weight: SectionWeight;
  content: string;
  source: string; // Where this came from (e.g., "overview.visual_description")
}

/** Resolved reference image */
export interface ResolvedReference {
  asset_id: string;
  role: ReferenceRole;
  path: string;
  exists: boolean;
}

/** Lighting specification from imagery.yaml */
export interface LightingSpec {
  primary_source?: string;
  secondary_source?: string; // v2.0
  quality?: string;
  direction?: string;
  color_temperature?: string;
  shadow_depth?: string;
  atmospheric?: string;
}

/** Palette specification from imagery.yaml */
export interface PaletteSpec {
  dominant?: string[];
  accent?: string[];
  avoid?: string[];
}

/** Generation constraints */
export interface GenerationConstraints {
  aspect_ratio: string;
  size: string;
  orientation: 'landscape' | 'portrait';
  quality?: 'standard' | 'high';
  timeline_phase?: TimelinePhase;
}

/**
 * The compiled Prompt IR - intermediate representation before rendering
 *
 * This structure contains all the information needed to generate an image,
 * organized into weighted sections for priority-based rendering.
 */
export interface CompiledPromptIR {
  // Metadata
  target_id: string; // e.g., "undershade-canyon-overview"
  entity_type: 'location' | 'chapter';
  entity_slug: string;
  image_type?: ImageType;
  title?: string;

  // Mood and atmosphere
  scene_mood?: string;
  mood_rationale?: string;

  // Positive prompt sections (ordered by weight)
  positive: {
    constraints: PromptSection[]; // Weight 1: Must-not-break (state, required)
    subject: PromptSection[]; // Weight 2: Scene core (what/who/where)
    composition: PromptSection[]; // Weight 3: Camera/framing/focal
    lighting: PromptSection[]; // Weight 4: Light source/quality/atmosphere
    palette: PromptSection[]; // Weight 4: Colors
    style: PromptSection[]; // Weight 5: Art direction
  };

  // Negative prompt (merged, deduplicated)
  negative: string[];

  // Resolved references
  references: ResolvedReference[];

  // Generation constraints
  constraints: GenerationConstraints;

  // Raw lighting and palette for potential use
  lighting?: LightingSpec;
  palette?: PaletteSpec;

  // Source tracking for debugging and precedence visibility
  sources: {
    entity_defaults: Record<string, unknown>;
    image_overrides: Record<string, unknown>;
    global_defaults: Record<string, unknown>;
  };

  // Compilation metadata
  compiled_at: string;
}

/** Rendered prompt ready for generation */
export interface RenderedPrompt {
  prompt: string;
  negative_prompt: string;
  references: { path: string; role: ReferenceRole }[];
  constraints: GenerationConstraints;
  ir_hash: string; // For caching and regeneration detection
  char_count: number;
  trimmed: boolean; // Whether sections were trimmed due to length
}

// ============================================================================
// Execution Record Types (for imagery.runs.yaml)
// ============================================================================

/** Target metadata for linking runs back to source specs */
export interface TargetMetadata {
  // Entity context (always present)
  entity_type: 'chapter' | 'location' | 'character';
  entity_slug: string; // e.g., "chapter-5-the-workshop" or "cids-workshop"

  // For chapters - use exact field names from ChapterImageSpec
  chapter_number?: number; // from ChapterMetadata.chapter_number
  chapter_title?: string; // from ChapterMetadata.chapter_title
  custom_id?: string; // from ChapterImageSpec.custom_id (target ID)
  scene_id?: string; // from ChapterImageSpec.scene_id
  source_moment?: string; // from ChapterImageSpec.source_moment
  image_type: string; // from ChapterImageSpec.image_type or ExtendedLocationZone.image_type
  scene_mood?: string; // from ChapterImageSpec.scene_mood
  category?: string[]; // from ChapterImageSpec.category
  depicts_characters?: string[]; // character slugs from ChapterImageSpec
  location?: string; // location slug from ChapterImageSpec.location
  zone?: string; // from ChapterImageSpec.zone
  prompt_spec_slug?: string; // from zones[].images[].image_slug or chapter image custom_id

  // For locations - use exact field names from ExtendedLocationZone
  zone_type?: string; // from ExtendedLocationZone.zone_type
  name?: string; // from ExtendedLocationZone.name
  title?: string; // from ExtendedLocationZone.title
}

/** A single image generation run */
export interface GenerationRun {
  run_id: string;
  target_id: string; // Which image target this was for
  timestamp: string; // ISO date

  // What was generated
  file_name: string;
  file_path: string;

  // How it was generated
  provider: 'google'; // Exclusively Google Gemini
  model: string; // e.g., "gemini-3-pro-image-preview"

  // The compiled and rendered prompts
  ir_hash: string; // Hash of CompiledPromptIR for cache detection
  prompt_used: string;
  negative_prompt_used: string;

  // References used
  reference_images: {
    asset_id: string;
    path: string;
    role: ReferenceRole;
  }[];

  // Generation parameters
  constraints: GenerationConstraints;

  // Provider response metadata
  provider_metadata: Record<string, unknown>;

  // Full target metadata for linking back to source specs
  target_metadata?: TargetMetadata;
}

/** The imagery.runs.yaml file structure */
export interface ImageryRunsFile {
  entity_type: 'location' | 'chapter';
  entity_slug: string;
  runs: GenerationRun[];
}

// ============================================================================
// Asset Registry Types
// ============================================================================

/** Entry in the unified asset registry */
export interface AssetRegistryEntry {
  asset_id: string;
  entity_type: 'character' | 'location' | 'chapter';
  entity_slug: string;
  path: string; // Absolute path to the image file
  role?: ReferenceRole;
  tags?: string[];
  status?: 'approved' | 'draft' | 'archived';
}

/** The asset registry - maps asset_id to full metadata */
export type AssetRegistry = Map<string, AssetRegistryEntry>;

// ============================================================================
// Location Imagery Types (extended from existing)
// ============================================================================

/** Scene mood options (shared with chapter-imagery) */
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
 * Zone image specification (v2.0 prompt spec format)
 * Represents a single entry in zones[].images[] array
 */
export interface ZoneImageSpec {
  image_type?: ImageType;
  image_slug: string; // Unique identifier for this prompt spec
  description: string;
  scene_mood?: SceneMood | string; // Allow string for backwards compat
  time_of_day?: string;
  weather?: string;

  composition?: {
    foreground?: string;
    midground?: string;
    background?: string;
    focal_point?: string;
    depth_cues?: string;
  };

  lighting?: LightingSpec;
  palette?: PaletteSpec;

  key_elements?: string[];
  style_notes?: string;
  prompt?: string; // Pre-compiled prompt text (optional)

  // File inventory (runtime-populated)
  image_inventory?: ImageInventoryEntry[];
}

/** Extended location visual anchor from imagery.yaml */
export interface LocationVisualAnchor {
  signature_elements?: string[];
  materials?: Record<string, string>;
  color_anchors?: Record<string, string>;
  characteristic_light?: Record<string, string>;
}

/** Extended location overview from imagery.yaml */
export interface ExtendedLocationOverview {
  slug: string;
  title?: string;
  name?: string; // v2.0 uses 'name' in some contexts
  image_type?: ImageType;
  category?: string | string[];
  scene_mood?: string;
  mood?: string; // v2.0 alias for scene_mood
  mood_rationale?: string;

  // Description fields
  visual_description?: string;
  narrative_context?: string; // v2.0 alternative
  composition_notes?: string;
  narrative_significance?: string;
  symbolic_elements?: string;
  description?: string; // v2.0 uses 'description' sometimes

  // Environmental context
  time_of_day?: string;
  weather?: string;
  season?: string;

  // Required elements
  required_elements?: string[];
  key_elements?: string[]; // v2.0 equivalent
  visible_beyond?: string[];
  approach_from?: string;

  // Visual specs
  lighting?: LightingSpec;
  palette?: PaletteSpec;

  // Generation constraints
  aspect_ratio?: string;
  orientation?: 'landscape' | 'portrait';
  size?: string;

  // Prompts
  prompt_used?: string;
  prompt_template?: string; // v2.0
  negative_prompt?: string;

  // v2.0: Prompt specifications (YAML-defined)
  images?: ZoneImageSpec[]; // NEW: Array of prompt specs

  // File inventory (runtime-populated)
  image_inventory?: ImageInventoryEntry[];

  // References
  references?:
    | { placeholder: string; file: string; section: string }[] // v1.0
    | { type?: string; slug?: string; reason?: string; scene?: string }[]; // v2.0
}

/** Extended location zone from imagery.yaml */
export interface ExtendedLocationZone extends ExtendedLocationOverview {
  name: string;
  zone_name?: string;
  zone_type?: string;
  zone_slug?: string; // v2.0 uses zone_slug instead of slug sometimes
  location_within?: string;

  // v2.0: Rich narrative context
  narrative_role?: string;

  // v2.0: Zone visual anchor
  zone_visual_anchor?: {
    defining_features?: string[];
    materials?: string;
    color_signature?: string;
    light_character?: string;
  };

  // v2.0: Default prompt elements
  default_prompt_elements?: {
    atmosphere?: string;
    must_include?: string[];
    must_avoid?: string[];
  };

  // v2.0: Character interaction
  character_interaction?: {
    positions?: string[];
    activities?: string[];
  };

  // v2.0: Atmospheric details
  atmospheric?: {
    weather?: string;
    environmental_effects?: string | string[];
    time_pressure?: string;
  };

  // Beat/temporal/perspective fields (legacy, may still exist in some zones)
  featured_in_chapters?: string[];
  source_chapter?: string;
  source_scene?: string;
  what_happens?: string;
  zone?: string;
  depicts_characters?: string[];
  character_states?: Record<string, string>;
  key_visual_hook?: string;
  base_zone?: string;
  temporal_state?: string;
  mood_shift_from_base?: string;
  activity_at_this_time?: string[];
  character?: string;
  perspective_description?: string;
  character_signature_element?: string;
}

/** Extended location imagery structure */
export interface ExtendedLocationImagery {
  metadata?: {
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
  };

  // v2.0: Top-level generation defaults (alternative to metadata.generation_defaults)
  generation_defaults?: {
    provider?: string;
    model?: string;
    quality?: string;
  };

  location_visual_anchor?: LocationVisualAnchor;
  overview?: ExtendedLocationOverview;
  zones?: ExtendedLocationZone[];

  // Legacy fields
  reference_defaults?: Record<string, string>;
  image_inventory?: ImageInventoryEntry[];
}

// ============================================================================
// Compiler Options
// ============================================================================

/** Options for the prompt compiler */
export interface CompilerOptions {
  /** Maximum prompt length before trimming (default: 4000) */
  maxPromptLength?: number;
  /** Include debug info in sources */
  debug?: boolean;
  /** Override aspect ratio */
  aspectRatio?: string;
  /** Override size */
  size?: string;
}

/** Options for the prompt renderer */
export interface RenderOptions {
  /** Maximum prompt length (default: 4000) */
  maxLength?: number;
  /** Include master style suffix (default: true) */
  includeMasterStyle?: boolean;
  /** Section separator (default: ", ") */
  sectionSeparator?: string;
}
