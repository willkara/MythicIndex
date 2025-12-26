/**
 * Imagery Schema Validation
 *
 * Zod schemas for strict validation of imagery.yaml files.
 * These schemas ensure that all YAML files conform to the expected structure
 * and will throw errors on invalid values.
 */

import { z } from 'zod';

// ============================================================================
// Custom Error Class
// ============================================================================

/**
 * Error thrown when imagery.yaml validation fails
 */
export class ImagerySchemaError extends Error {
  constructor(
    message: string,
    public readonly issues: z.ZodIssue[],
    public readonly entityType?: string,
    public readonly slug?: string
  ) {
    super(message);
    this.name = 'ImagerySchemaError';
  }

  /**
   * Format issues for display
   */
  formatIssues(): string {
    return this.issues
      .map((issue) => {
        const path = issue.path.join('.');
        return `  - ${path}: ${issue.message}`;
      })
      .join('\n');
  }
}

// ============================================================================
// Shared Enums
// ============================================================================

/** Scene mood options */
export const SceneMoodSchema = z.enum([
  'somber',
  'pastoral',
  'celebratory',
  'ethereal',
  'intimate',
  'kinetic',
  'ominous',
  'heroic',
  'clandestine',
  'tense',
  'reverent',
]);

/** Image types for locations */
export const LocationImageTypeSchema = z.enum([
  'establishing',
  'zone',
  'beat',
  'inhabited',
  'temporal',
  'perspective',
  'essence',
  'hero',
  'anchor',
  'detail',
  'mood',
]);

/** Image types for chapters */
export const ChapterImageTypeSchema = z.enum([
  'hero',
  'anchor',
  'beat',
  'detail',
  'supporting',
]);

/** Image types for characters */
export const CharacterImageTypeSchema = z.enum([
  'portrait',
  'full-body',
  'action',
  'scene',
  'mood',
  'collaborative',
]);

/** Visual weight for moments */
export const VisualWeightSchema = z.enum(['low', 'medium', 'high', 'critical']);

/** Transformation state */
export const TransformationStateSchema = z.enum(['before', 'during', 'after']);

/** Image status */
export const ImageStatusSchema = z.enum(['approved', 'draft', 'archived', 'rejected']);

/** Image source type */
export const ImageSourceTypeSchema = z.enum(['imported', 'generated', 'edited', 'placeholder']);

/** Provenance source */
export const ProvenanceSourceSchema = z.enum(['manual', 'imported', 'generated']);

// ============================================================================
// Shared Sub-Schemas
// ============================================================================

/** Lighting specification */
export const LightingSpecSchema = z
  .object({
    primary_source: z.string().optional(),
    secondary_source: z.string().optional(),
    quality: z.string().optional(),
    direction: z.string().optional(),
    color_temperature: z.string().optional(),
    shadow_depth: z.string().optional(),
    atmospheric: z.string().optional(),
  })
  .passthrough();

/** Palette specification */
export const PaletteSpecSchema = z
  .object({
    dominant: z.array(z.string()).optional(),
    accent: z.array(z.string()).optional(),
    avoid: z.array(z.string()).optional(),
  })
  .passthrough();

/** Image content */
export const ImageContentSchema = z
  .object({
    title: z.string(),
    description: z.string(),
    alt_text: z.string(),
    tags: z.array(z.string()).default([]),
    suggested_filename: z.string().optional(),
    composition_notes: z.string().optional(),
    narrative_significance: z.string().optional(),
    symbolic_elements: z.string().optional(),
  })
  .passthrough();

/** Image provenance */
export const ImageProvenanceSchema = z
  .object({
    source: ProvenanceSourceSchema,
    created_at: z.string(),
    original_filename: z.string().optional(),
    analysis_model: z.string().optional(),
    analysis_timestamp: z.string().optional(),
  })
  .passthrough();

/** Canon analysis */
export const CanonAnalysisSchema = z
  .object({
    matches_description: z.boolean(),
    verified_features: z.array(z.string()).optional(),
    notes: z.string().optional(),
  })
  .passthrough();

/** Generation metadata */
export const GenerationMetadataSchema = z
  .object({
    target_id: z.string().optional(),
    ir_hash: z.string().optional(),
    prompt_used: z.string().optional(),
    model: z.string().optional(),
    provider: z.string().optional(),
    constraints: z
      .object({
        aspect_ratio: z.string().optional(),
        size: z.string().optional(),
        orientation: z.enum(['landscape', 'portrait', 'square']).optional(),
        quality: z.string().optional(),
      })
      .optional(),
    provider_metadata: z.record(z.unknown()).optional(),
  })
  .passthrough();

// ============================================================================
// Character Imagery Schema
// ============================================================================

/** Character image inventory entry */
export const CharacterImageInventoryEntrySchema = z
  .object({
    id: z.string(),
    path: z.string(),
    type: ImageSourceTypeSchema,
    status: ImageStatusSchema,
    is_reference_portrait: z.boolean().optional(),
    image_type: CharacterImageTypeSchema.optional(),
    image_subtype: z.string().optional(),
    content: ImageContentSchema,
    lighting: LightingSpecSchema.optional(),
    palette: PaletteSpecSchema.optional(),
    canon_analysis: CanonAnalysisSchema.optional(),
    provenance: ImageProvenanceSchema,
    generation: GenerationMetadataSchema.optional(),
  })
  .passthrough();

/** Character imagery specification */
export const CharacterImagerySpecSchema = z
  .object({
    entity_type: z.literal('character'),
    slug: z.string(),
    appearance: z.string(),
    prompts: z.array(z.string()).default([]),
    image_inventory: z.array(CharacterImageInventoryEntrySchema).default([]),
  })
  .passthrough();

// ============================================================================
// Location Imagery Schema
// ============================================================================

/** Location visual anchor */
export const LocationVisualAnchorSchema = z
  .object({
    signature_elements: z.array(z.string()).optional(),
    materials: z.record(z.string()).optional(),
    color_anchors: z
      .object({
        dominant: z.array(z.string()).optional(),
        accent: z.array(z.string()).optional(),
        avoid: z.array(z.string()).optional(),
      })
      .optional(),
    characteristic_light: z.record(z.string()).optional(),
  })
  .passthrough();

/** Zone visual anchor */
export const ZoneVisualAnchorSchema = z
  .object({
    defining_features: z.array(z.string()).optional(),
    materials: z.string().optional(),
    color_signature: z.string().optional(),
    light_character: z.string().optional(),
  })
  .passthrough();

/** Default prompt elements */
export const DefaultPromptElementsSchema = z
  .object({
    atmosphere: z.string().optional(),
    must_include: z.array(z.string()).optional(),
    must_avoid: z.array(z.string()).optional(),
  })
  .passthrough();

/** Composition object */
export const CompositionSchema = z
  .object({
    foreground: z.string().optional(),
    midground: z.string().optional(),
    background: z.string().optional(),
    focal_point: z.string().optional(),
    depth_cues: z.string().optional(),
  })
  .passthrough();

/** Zone image specification */
export const ZoneImageSpecSchema = z
  .object({
    image_type: LocationImageTypeSchema.optional(),
    image_slug: z.string(),
    description: z.string(),
    scene_mood: z.union([SceneMoodSchema, z.string()]).optional(),
    time_of_day: z.string().optional(),
    weather: z.string().optional(),
    composition: CompositionSchema.optional(),
    lighting: LightingSpecSchema.optional(),
    palette: PaletteSpecSchema.optional(),
    key_elements: z.array(z.string()).optional(),
    style_notes: z.string().optional(),
    prompt: z.string().optional(),
    image_inventory: z.array(z.any()).optional(),
  })
  .passthrough();

/** Location overview */
export const LocationOverviewSchema = z
  .object({
    slug: z.string(),
    title: z.string().optional(),
    name: z.string().optional(),
    image_type: LocationImageTypeSchema.optional(),
    category: z.union([z.string(), z.array(z.string())]).optional(),
    scene_mood: z.union([SceneMoodSchema, z.string()]).optional(),
    mood: z.union([SceneMoodSchema, z.string()]).optional(),
    mood_rationale: z.string().optional(),
    visual_description: z.string().optional(),
    narrative_context: z.string().optional(),
    description: z.string().optional(),
    composition_notes: z.string().optional(),
    narrative_significance: z.string().optional(),
    symbolic_elements: z.string().optional(),
    time_of_day: z.string().optional(),
    weather: z.string().optional(),
    season: z.string().optional(),
    required_elements: z.array(z.string()).optional(),
    key_elements: z.array(z.string()).optional(),
    visible_beyond: z.array(z.string()).optional(),
    approach_from: z.string().optional(),
    lighting: LightingSpecSchema.optional(),
    palette: PaletteSpecSchema.optional(),
    aspect_ratio: z.string().optional(),
    orientation: z.enum(['landscape', 'portrait']).optional(),
    size: z.string().optional(),
    prompt_used: z.string().optional(),
    prompt_template: z.string().optional(),
    negative_prompt: z.string().optional(),
    images: z.array(ZoneImageSpecSchema).optional(),
    image_inventory: z.array(z.any()).optional(),
  })
  .passthrough();

/** Location zone */
export const LocationZoneSchema = LocationOverviewSchema.extend({
  name: z.string(),
  zone_name: z.string().optional(),
  zone_type: z.string().optional(),
  zone_slug: z.string().optional(),
  location_within: z.string().optional(),
  narrative_role: z.string().optional(),
  zone_visual_anchor: ZoneVisualAnchorSchema.optional(),
  default_prompt_elements: DefaultPromptElementsSchema.optional(),
  featured_in_chapters: z.array(z.string()).optional(),
}).passthrough();

/** Location metadata */
export const LocationMetadataSchema = z
  .object({
    entity_type: z.literal('location-imagery'),
    slug: z.string(),
    name: z.string(),
    location_type: z.string().optional(),
    narrative_soul: z.string().optional(),
    one_line_essence: z.string().optional(),
    generation_defaults: z
      .object({
        provider: z.string().optional(),
        model: z.string().optional(),
        quality: z.string().optional(),
        negative_prompts: z.array(z.string()).optional(),
      })
      .optional(),
  })
  .passthrough();

/** Location imagery specification */
export const LocationImagerySpecSchema = z
  .object({
    metadata: LocationMetadataSchema.optional(),
    generation_defaults: z
      .object({
        provider: z.string().optional(),
        model: z.string().optional(),
        quality: z.string().optional(),
      })
      .optional(),
    location_visual_anchor: LocationVisualAnchorSchema.optional(),
    overview: LocationOverviewSchema.optional(),
    zones: z.array(LocationZoneSchema).optional(),
    image_inventory: z.array(z.any()).optional(),
  })
  .passthrough();

// ============================================================================
// Chapter Imagery Schema
// ============================================================================

/** Chapter moment */
export const ChapterMomentSchema = z
  .object({
    id: z.string(),
    scene_id: z.string().optional(),
    title: z.string().optional(),
    narrative_beat: z.string().optional(),
    visual_weight: VisualWeightSchema.optional(),
    characters_present: z.array(z.string()).optional(),
    location_zone: z.string().optional(),
    transformation_state: TransformationStateSchema.optional(),
    recommended_images: z.number().optional(),
  })
  .passthrough();

/** Character reference */
export const CharacterReferenceSchema = z
  .object({
    ref: z.string(),
    name: z.string().optional(),
    scene_variations: z.string().optional(),
    reference_images: z.array(z.string()).optional(),
  })
  .passthrough();

/** Zone context */
export const ZoneContextSchema = z
  .object({
    id: z.string(),
    chapter_context: z.string().optional(),
  })
  .passthrough();

/** Location reference */
export const LocationReferenceSchema = z
  .object({
    ref: z.string(),
    zones: z.array(ZoneContextSchema).optional(),
  })
  .passthrough();

/** Chapter image specification */
export const ChapterImageSpecSchema = z
  .object({
    custom_id: z.string(),
    source_moment: z.string().optional(),
    scene_id: z.string().optional(),
    image_type: ChapterImageTypeSchema,
    category: z.array(z.string()).optional(),
    scene_mood: SceneMoodSchema.optional(),
    mood_rationale: z.string().optional(),
    visual_description: z.string().optional(),
    composition_notes: z.string().optional(),
    visual_hook: z.string().optional(),
    depicts_characters: z.array(z.string()).optional(),
    character_state: z.string().optional(),
    character_states: z.record(z.string()).optional(),
    location: z.string().optional(),
    zone: z.string().optional(),
    lighting: LightingSpecSchema.optional(),
    palette: PaletteSpecSchema.optional(),
    aspect_ratio: z.string().optional(),
    orientation: z.enum(['landscape', 'portrait', 'square']).optional(),
    size: z.string().optional(),
    prompt_used: z.string().optional(),
    negative_prompt: z.string().optional(),
    tags: z.array(z.string()).optional(),
    image_inventory: z.array(z.any()).optional(),
    generated_at: z.string().nullable().optional(),
    file_name: z.string().nullable().optional(),
    file_path: z.string().nullable().optional(),
    provider: z.string().nullable().optional(),
    model: z.string().nullable().optional(),
    provider_metadata: z.record(z.unknown()).optional(),
  })
  .passthrough();

/** Mood distribution */
export const MoodDistributionSchema = z
  .object({
    somber: z.number().optional(),
    pastoral: z.number().optional(),
    celebratory: z.number().optional(),
    ethereal: z.number().optional(),
    intimate: z.number().optional(),
    kinetic: z.number().optional(),
    ominous: z.number().optional(),
    heroic: z.number().optional(),
    clandestine: z.number().optional(),
    tense: z.number().optional(),
    reverent: z.number().optional(),
  })
  .passthrough();

/** Chapter metadata */
export const ChapterMetadataSchema = z
  .object({
    entity_type: z.literal('chapter-imagery'),
    slug: z.string(),
    chapter_number: z.number(),
    chapter_title: z.string(),
    visual_thesis: z.string().optional(),
    color_palette: z
      .object({
        primary: z.array(z.string()).optional(),
        accent: z.array(z.string()).optional(),
      })
      .optional(),
    mood_distribution: MoodDistributionSchema.optional(),
    generation_defaults: z
      .object({
        provider: z.string().optional(),
        model: z.string().optional(),
        quality: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

/** Chapter imagery specification */
export const ChapterImagerySpecSchema = z
  .object({
    metadata: ChapterMetadataSchema,
    characters: z.array(CharacterReferenceSchema).default([]),
    locations: z.array(LocationReferenceSchema).default([]),
    moments: z.array(ChapterMomentSchema).optional(),
    images: z.array(ChapterImageSpecSchema).default([]),
  })
  .passthrough();

// ============================================================================
// Validation Functions
// ============================================================================

export type EntityType = 'character' | 'location' | 'chapter';

/**
 * Get the appropriate schema for an entity type
 */
export function getSchemaForEntity(entityType: EntityType): z.ZodType {
  switch (entityType) {
    case 'character':
      return CharacterImagerySpecSchema;
    case 'location':
      return LocationImagerySpecSchema;
    case 'chapter':
      return ChapterImagerySpecSchema;
    default:
      throw new Error(`Unknown entity type: ${entityType}`);
  }
}

/**
 * Validate imagery data against its schema
 * @throws ImagerySchemaError on validation failure
 */
export function validateImageryData<T>(
  entityType: EntityType,
  data: unknown,
  slug?: string
): T {
  const schema = getSchemaForEntity(entityType);
  const result = schema.safeParse(data);

  if (!result.success) {
    throw new ImagerySchemaError(
      `Invalid imagery.yaml for ${entityType}${slug ? `/${slug}` : ''}`,
      result.error.issues,
      entityType,
      slug
    );
  }

  return result.data as T;
}

/**
 * Validate and return result without throwing
 */
export function safeValidateImageryData(
  entityType: EntityType,
  data: unknown,
  slug?: string
): { success: true; data: unknown } | { success: false; error: ImagerySchemaError } {
  try {
    const validated = validateImageryData(entityType, data, slug);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof ImagerySchemaError) {
      return { success: false, error };
    }
    throw error;
  }
}

// ============================================================================
// Type Exports
// ============================================================================

export type SceneMood = z.infer<typeof SceneMoodSchema>;
export type LocationImageType = z.infer<typeof LocationImageTypeSchema>;
export type ChapterImageType = z.infer<typeof ChapterImageTypeSchema>;
export type CharacterImageType = z.infer<typeof CharacterImageTypeSchema>;
export type VisualWeight = z.infer<typeof VisualWeightSchema>;
export type TransformationState = z.infer<typeof TransformationStateSchema>;
export type LightingSpec = z.infer<typeof LightingSpecSchema>;
export type PaletteSpec = z.infer<typeof PaletteSpecSchema>;
export type CharacterImagerySpec = z.infer<typeof CharacterImagerySpecSchema>;
export type LocationImagerySpec = z.infer<typeof LocationImagerySpecSchema>;
export type ChapterImagerySpec = z.infer<typeof ChapterImagerySpecSchema>;
