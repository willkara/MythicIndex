/**
 * Character Imagery Types
 *
 * Types for character imagery.yaml files including image inventory,
 * reference portraits, and generation metadata.
 */

import type { LightingSpec, PaletteSpec } from './prompt-ir.js';

// ============================================================================
// Character Image Types
// ============================================================================

/** Image type categories for character images */
export type CharacterImageType =
  | 'portrait' // Face/bust reference shot
  | 'full-body' // Full figure reference
  | 'action' // Dynamic pose or movement
  | 'scene' // Character in environmental context
  | 'mood' // Emotional state or atmosphere
  | 'collaborative'; // Multi-character scene

/** Image subtype for additional categorization */
export type CharacterImageSubtype =
  | 'dramatic' // High contrast, theatrical
  | 'combat' // Battle or fighting
  | 'atmospheric' // Moody, environmental
  | 'exterior' // Outdoor setting
  | 'interior' // Indoor setting
  | 'oil-painting' // Artistic style reference
  | 'reference'; // Clean reference shot

// ============================================================================
// Image Inventory Entry
// ============================================================================

/**
 * Content metadata for an image
 */
export interface ImageContent {
  title: string;
  description: string;
  alt_text: string;
  tags: string[];
  suggested_filename?: string;
  composition_notes?: string;
  narrative_significance?: string;
  symbolic_elements?: string;
}

/**
 * Provenance tracking for an image
 */
export interface ImageProvenance {
  source: 'manual' | 'imported' | 'generated';
  created_at: string;
  original_filename?: string;
  analysis_model?: string;
  analysis_timestamp?: string;
}

/**
 * Canon analysis for verifying image accuracy
 */
export interface CanonAnalysis {
  matches_description: boolean;
  verified_features?: string[];
  notes?: string;
}

/**
 * Generation metadata for AI-generated images
 */
export interface GenerationMetadata {
  target_id?: string;
  ir_hash?: string;
  prompt_used?: string;
  model?: string;
  provider?: string;
  constraints?: {
    aspect_ratio?: string;
    size?: string;
    orientation?: 'landscape' | 'portrait' | 'square';
    quality?: string;
  };
  provider_metadata?: Record<string, unknown>;
}

/**
 * A single image in the character's image inventory
 */
export interface CharacterImageInventoryEntry {
  id: string;
  path: string;
  type: 'imported' | 'generated' | 'edited' | 'placeholder';
  status: 'approved' | 'draft' | 'archived' | 'rejected';

  /** True for canonical reference portrait */
  is_reference_portrait?: boolean;

  /** Image categorization */
  image_type?: CharacterImageType;
  image_subtype?: CharacterImageSubtype;

  /** Content metadata */
  content: ImageContent;

  /** Lighting specification */
  lighting?: LightingSpec;

  /** Color palette */
  palette?: PaletteSpec;

  /** Canon verification */
  canon_analysis?: CanonAnalysis;

  /** Source tracking */
  provenance: ImageProvenance;

  /** Generation details (for AI-generated images) */
  generation?: GenerationMetadata;
}

// ============================================================================
// Character Imagery Specification
// ============================================================================

/**
 * Main character imagery specification (imagery.yaml root structure)
 */
export interface CharacterImagerySpec {
  /** Entity type identifier */
  entity_type: 'character';

  /** Character slug (matches directory name) */
  slug: string;

  /** Full prose description of character appearance */
  appearance: string;

  /** Base prompts for generation (often empty, legacy field) */
  prompts: string[];

  /** Collection of all images for this character */
  image_inventory: CharacterImageInventoryEntry[];
}

// ============================================================================
// Resolved Character Types (for compilation)
// ============================================================================

/**
 * Reference portrait information for prompt compilation
 */
export interface ResolvedPortrait {
  id: string;
  path: string;
  is_reference: boolean;
}

/**
 * Resolved character data after loading from imagery.yaml
 */
export interface ResolvedCharacterImagery {
  slug: string;
  appearance: string;
  portraits: ResolvedPortrait[];
  /** First reference portrait or first approved portrait */
  primary_portrait?: ResolvedPortrait;
}

// ============================================================================
// Validation Helpers
// ============================================================================

/** Valid character image types */
export const CHARACTER_IMAGE_TYPES: CharacterImageType[] = [
  'portrait',
  'full-body',
  'action',
  'scene',
  'mood',
  'collaborative',
];

/** Valid character image subtypes */
export const CHARACTER_IMAGE_SUBTYPES: CharacterImageSubtype[] = [
  'dramatic',
  'combat',
  'atmospheric',
  'exterior',
  'interior',
  'oil-painting',
  'reference',
];

/**
 * Check if a string is a valid CharacterImageType
 */
export function isCharacterImageType(value: string): value is CharacterImageType {
  return CHARACTER_IMAGE_TYPES.includes(value as CharacterImageType);
}

/**
 * Check if a string is a valid CharacterImageSubtype
 */
export function isCharacterImageSubtype(value: string): value is CharacterImageSubtype {
  return CHARACTER_IMAGE_SUBTYPES.includes(value as CharacterImageSubtype);
}
