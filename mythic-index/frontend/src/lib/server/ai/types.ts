/**
 * Image Generation System - TypeScript Types
 *
 * Comprehensive type definitions for the image generation system including
 * prompt IR (Intermediate Representation), template system, and generation options.
 */

// ============================================================================
// PROMPT IR TYPES
// ============================================================================

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

/** Image types for categorization */
export type ImageType =
  | 'portrait' // Character portrait
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
  | 'symbol'; // Iconic representation

/** A weighted section of the prompt */
export interface PromptSection {
  weight: SectionWeight;
  content: string;
  source: string; // Where this came from (e.g., "template.character-portrait.subject")
}

/** Resolved reference image */
export interface ResolvedReference {
  asset_id: string;
  role: ReferenceRole;
  path: string;
  exists: boolean;
}

/** Lighting specification */
export interface LightingSpec {
  primary_source?: string;
  quality?: string;
  direction?: string;
  color_temperature?: string;
  shadow_depth?: string;
  atmospheric?: string;
}

/** Palette specification */
export interface PaletteSpec {
  dominant?: string[];
  accent?: string[];
  avoid?: string[];
}

/** Generation constraints */
export interface GenerationConstraints {
  aspect_ratio: string;
  size: string;
  orientation: 'landscape' | 'portrait' | 'square';
  quality?: 'standard' | 'high';
}

/**
 * The compiled Prompt IR - intermediate representation before rendering
 *
 * This structure contains all the information needed to generate an image,
 * organized into weighted sections for priority-based rendering.
 */
export interface CompiledPromptIR {
  // Metadata
  target_id: string; // e.g., "aldwin-portrait-01"
  entity_type: 'character' | 'location' | 'chapter' | 'scene';
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
// COMPILER & RENDERER OPTIONS
// ============================================================================

/** Options for the prompt compiler */
export interface CompilerOptions {
  /** Template slug to use (overrides default) */
  templateSlug?: string;
  /** Maximum prompt length before trimming (default: 4000) */
  maxPromptLength?: number;
  /** Include debug info in sources */
  debug?: boolean;
  /** Override aspect ratio */
  aspectRatio?: string;
  /** Override size */
  size?: string;
  /** Quality setting */
  quality?: 'standard' | 'high';
  /** Scene mood for mood-based styling */
  sceneMood?: string;
  /** Whether this is generating a reference image */
  isReferenceGeneration?: boolean;
  /** Emphasize canonical appearance */
  emphasizeCanonical?: boolean;
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

// ============================================================================
// IMAGE GENERATION
// ============================================================================

/** AI provider types */
export type AIProvider = 'workers-ai' | 'google' | 'openai';

/** Image generation options */
export interface ImageGenerationOptions {
  customPrompt?: string;
  negativePrompt?: string;
  references?: ReferenceImage[];
  aspectRatio?: string;
  size?: string;
  provider?: AIProvider;
  quality?: 'standard' | 'high';
  seed?: number;
  useReferences?: boolean;
  referenceImages?: string[]; // Asset IDs
}

/** Reference image for generation */
export interface ReferenceImage {
  data: Uint8Array;
  role: ReferenceRole;
  mimeType: string;
  assetId?: string;
}

/** Image generation result */
export interface ImageGenerationResult {
  success: boolean;
  imageData?: Uint8Array;
  error?: string;
  provider: string;
  model?: string;
}

// ============================================================================
// TEMPLATE SYSTEM
// ============================================================================

/** Template context for rendering */
export interface TemplateContext {
  entity: {
    type: string;
    slug: string;
    name?: string;
    [key: string]: any;
  };
  metadata?: Record<string, any>;
}

/** Compiled template result */
export interface CompiledTemplate {
  sections: PromptSection[];
  variables: Record<string, any>;
}

// ============================================================================
// REFERENCE RESOLUTION
// ============================================================================

/** Reference resolution options */
export interface ReferenceResolutionOptions {
  entityType: string;
  entitySlug: string;
  role: string;
  limit: number;
  maxReferences?: number;
  preferCanonical?: boolean;
  minQuality?: 'high' | 'medium' | 'low';
  aspectFilter?: 'face' | 'body' | 'clothing' | 'environment';
}

// ============================================================================
// BATCH PROCESSING
// ============================================================================

/** Batch generation parameters for Workflow */
export interface BatchGenerationParams {
  entities: Array<{
    type: 'character' | 'location' | 'chapter';
    slug: string;
    role: string;
  }>;
  options: {
    provider: AIProvider;
    aspectRatio: string;
    quality: 'standard' | 'high';
    useReferences: boolean;
  };
  userId: string;
}

/** Batch generation output */
export interface BatchGenerationOutput {
  totalImages: number;
  completed: number;
  failed: number;
  results: Array<{
    entitySlug: string;
    success: boolean;
    assetId?: string;
    imageUrl?: string;
    error?: string;
    prompt?: string;
  }>;
}

/** Workflow status response */
export interface WorkflowStatusResponse {
  jobId: string;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'errored' | 'terminated';
  output?: BatchGenerationOutput;
  error?: string;
}

// ============================================================================
// DATABASE ENTITY TYPES
// ============================================================================

/** Prompt template from database */
export interface PromptTemplateEntity {
  id: string;
  name: string;
  slug: string;
  category: string;
  subcategory?: string;
  description?: string;
  templateType: string;
  status: string;
  isDefault: boolean;
  version: number;
  parentTemplateId?: string;
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
}

/** Template section from database */
export interface TemplateSectionEntity {
  id: string;
  templateId: string;
  name: string;
  weight: SectionWeight;
  sortOrder: number;
  content: string;
  condition?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

/** Style preset from database */
export interface StylePresetEntity {
  id: string;
  name: string;
  slug: string;
  category: string;
  styleDescription: string;
  negativePrompts?: string; // JSON
  artistReferences?: string; // JSON
  aestheticNotes?: string;
  isMasterStyle: boolean;
  priority: number;
  status: string;
  createdAt: number;
  updatedAt: number;
}

/** Reference metadata from database */
export interface ReferenceMetadataEntity {
  id: string;
  assetId: string;
  entityType: string;
  entitySlug: string;
  isCanonical: boolean;
  referenceQuality?: string;
  useForConsistency: boolean;
  priority: number;
  faceReference: boolean;
  bodyReference: boolean;
  clothingReference: boolean;
  environmentReference: boolean;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}
