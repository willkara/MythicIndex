/**
 * Zod schema for validating ImageInventoryEntry from Gemini analysis responses.
 * Matches the TypeScript type in imagery-yaml.ts but provides runtime validation.
 *
 * This ensures LLM-generated YAML responses meet all required field constraints
 * before being written to imagery.yaml files.
 */

import { z } from 'zod';

// =============================================================================
// Nested Object Schemas
// =============================================================================

/**
 * Content metadata for an image
 */
const ContentSchema = z.object({
  // Required fields
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  alt_text: z.string().min(1, 'Alt text is required'),
  tags: z.array(z.string()).min(1, 'At least one tag is required'),
  // Optional enhanced fields
  suggested_filename: z.string().optional(),
  composition_notes: z.string().optional(),
  narrative_significance: z.string().optional(),
  symbolic_elements: z.string().optional(),
});

/**
 * Provenance/origin information for an image
 */
const ProvenanceSchema = z.object({
  // Required fields
  source: z.string().min(1, 'Source is required'),
  created_at: z.string().min(1, 'Created date is required'),
  // Optional fields
  original_filename: z.string().optional(),
  analysis_model: z.string().optional(),
  analysis_timestamp: z.string().optional(),
});

/**
 * Lighting analysis (optional enhanced field)
 */
const LightingSchema = z
  .object({
    primary_source: z.string().optional(),
    quality: z.string().optional(),
    direction: z.string().optional(),
    color_temperature: z.string().optional(),
    shadow_depth: z.string().optional(),
    atmospheric: z.string().optional(),
  })
  .optional();

/**
 * Color palette analysis (optional enhanced field)
 */
const PaletteSchema = z
  .object({
    dominant: z.array(z.string()).optional(),
    accent: z.array(z.string()).optional(),
  })
  .optional();

/**
 * Canon compliance analysis (optional enhanced field)
 */
const CanonAnalysisSchema = z
  .object({
    matches_description: z.boolean().optional(),
    verified_features: z.array(z.string()).optional(),
    notes: z.string().optional(),
  })
  .optional();

/**
 * Generation metadata (optional, for generated images)
 */
const GenerationSchema = z
  .object({
    target_id: z.string().optional(),
    ir_hash: z.string().optional(),
    prompt_used: z.string().optional(),
    model: z.string().optional(),
    provider: z.string().optional(),
  })
  .optional();

// =============================================================================
// Main Schema
// =============================================================================

/**
 * Complete schema for an image inventory entry
 */
export const ImageInventoryEntrySchema = z.object({
  // Required core fields
  id: z.string().min(1, 'ID is required'),
  path: z.string().min(1, 'Path is required'),
  type: z.enum(['generated', 'imported', 'placeholder']),
  status: z.enum(['approved', 'draft']),

  // Required nested objects
  content: ContentSchema,
  provenance: ProvenanceSchema,

  // Optional simple fields
  is_reference_portrait: z.boolean().optional(),
  image_type: z
    .enum(['portrait', 'full-body', 'action', 'scene', 'mood', 'collaborative'])
    .optional(),
  image_subtype: z.string().optional(),

  // Optional nested objects (enhanced analysis)
  lighting: LightingSchema,
  palette: PaletteSchema,
  canon_analysis: CanonAnalysisSchema,
  generation: GenerationSchema,
});

// =============================================================================
// Types & Utilities
// =============================================================================

/**
 * TypeScript type inferred from the Zod schema
 */
export type ValidatedImageInventoryEntry = z.infer<typeof ImageInventoryEntrySchema>;

/**
 * Validate and parse an image inventory entry from YAML
 * @throws ZodError if validation fails
 */
export function validateImageInventoryEntry(data: unknown): ValidatedImageInventoryEntry {
  return ImageInventoryEntrySchema.parse(data);
}

/**
 * Safe validation that returns result object instead of throwing.
 * Use this when you want to handle validation errors gracefully.
 *
 * @example
 * const result = safeValidateImageInventoryEntry(parsed);
 * if (!result.success) {
 *   console.error('Validation failed:', result.error.errors);
 *   return;
 * }
 * const entry = result.data;
 */
export function safeValidateImageInventoryEntry(data: unknown) {
  return ImageInventoryEntrySchema.safeParse(data);
}

/**
 * Format Zod validation errors into a human-readable string
 */
export function formatValidationErrors(error: z.ZodError): string {
  return error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
}
