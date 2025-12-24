/**
 * Enhanced Character Image Analysis Types
 *
 * These types support richer metadata extraction for character images,
 * matching the quality and structure of location imagery.yaml files.
 */

// ============================================================================
// Image Classification Types
// ============================================================================

/** Primary image type classification for character images */
export type CharacterImageType =
  | 'portrait' // Face/upper body focus - primary character identification
  | 'full-body' // Complete figure - costume/equipment showcase
  | 'action' // Character in motion/activity - combat, spellcasting, crafting
  | 'scene' // Character in environment - workshop, tavern, battlefield
  | 'mood' // Emotional expression focus - joy, sorrow, determination
  | 'collaborative'; // Multiple characters - interactions, group shots

/** Portrait subtypes for more granular classification */
export type PortraitSubtype =
  | 'formal' // Posed, deliberate
  | 'candid' // Natural, unposed
  | 'dramatic' // High contrast, intense
  | 'close-up' // Face detail only
  | 'profile'; // Side view

/** Action subtypes */
export type ActionSubtype =
  | 'combat' // Fighting, weapon use
  | 'magic' // Spellcasting, arcane effects
  | 'crafting' // Working on something
  | 'movement'; // Running, jumping, climbing

/** Scene subtypes */
export type SceneSubtype =
  | 'interior' // Indoor setting
  | 'exterior' // Outdoor setting
  | 'atmospheric'; // Focus on mood/environment

/** Combined subtype union */
export type ImageSubtype = PortraitSubtype | ActionSubtype | SceneSubtype | string;

// ============================================================================
// Lighting Analysis Types
// ============================================================================

/** Detailed lighting analysis for an image */
export interface LightingAnalysis {
  /** Main light source (e.g., "warm workshop lamplight", "natural daylight") */
  primary_source: string;
  /** Quality of light (e.g., "soft ambient", "harsh direct", "diffused") */
  quality: string;
  /** Direction of main light (e.g., "three-quarter from left", "backlighting") */
  direction: string;
  /** Color temperature (e.g., "warm amber", "cool blue", "neutral") */
  color_temperature: string;
  /** Shadow characteristics (e.g., "deep dramatic", "soft gradients", "minimal") */
  shadow_depth: string;
  /** Atmospheric effects (e.g., "slight haze", "dust motes", "none") */
  atmospheric?: string;
}

// ============================================================================
// Color Palette Analysis Types
// ============================================================================

/** Color palette analysis for an image */
export interface PaletteAnalysis {
  /** Primary/dominant colors (3-5 colors) */
  dominant: string[];
  /** Accent/highlight colors (1-3 colors) */
  accent: string[];
  /** Colors that should be avoided (typically empty for analysis) */
  avoid?: string[];
}

// ============================================================================
// Canon Verification Types
// ============================================================================

/** Canon verification analysis - how well the image matches character description */
export interface CanonAnalysis {
  /** Does the image match the canonical character description? */
  matches_description: boolean;
  /** Specific canonical features verified in the image */
  verified_features: string[];
  /** Features from description that are missing or incorrect */
  missing_features?: string[];
  /** Additional notes about canon compliance */
  notes?: string;
}

// ============================================================================
// Enhanced Content Types
// ============================================================================

/** Enhanced content section with composition and narrative analysis */
export interface EnhancedImageContent {
  /** Short descriptive title (3-6 words) */
  title: string;
  /** Detailed visual description (2-3 sentences) */
  description: string;
  /** Accessibility text for screen readers */
  alt_text: string;
  /** Categorization tags */
  tags: string[];

  // Enhanced fields
  /** Composition analysis - framing, positioning, visual flow */
  composition_notes?: string;
  /** Narrative significance - what story does this image tell? */
  narrative_significance?: string;
  /** Symbolic interpretation - deeper meaning of visual elements */
  symbolic_elements?: string;
}

// ============================================================================
// Full Enhanced Entry Type
// ============================================================================

/** Enhanced image inventory entry with full metadata */
export interface EnhancedImageInventoryEntry {
  /** Unique identifier for the image */
  id: string;
  /** Relative path to image file */
  path: string;
  /** Image source type */
  type: 'generated' | 'imported' | 'placeholder';
  /** Approval status */
  status: 'approved' | 'draft';

  // Image classification (NEW)
  /** Primary image type classification */
  image_type?: CharacterImageType;
  /** More specific subtype */
  image_subtype?: ImageSubtype;

  /** Content metadata */
  content: EnhancedImageContent;

  // Technical analysis (NEW)
  /** Detailed lighting analysis */
  lighting?: LightingAnalysis;
  /** Color palette analysis */
  palette?: PaletteAnalysis;

  // Canon verification (NEW)
  /** Canon compliance analysis */
  canon_analysis?: CanonAnalysis;

  /** Provenance tracking */
  provenance: {
    source: string;
    created_at: string;
    original_filename?: string;
    analysis_model?: string;
    analysis_timestamp?: string;
  };
}

// ============================================================================
// Analysis Response Type (from Gemini)
// ============================================================================

/** Raw analysis response structure from Gemini Vision API */
export interface CharacterImageAnalysisResponse {
  // Required fields
  id: string;
  path: string;
  type: 'generated' | 'imported' | 'placeholder';
  status: 'approved' | 'draft';

  // Classification
  image_type: CharacterImageType;
  image_subtype?: ImageSubtype;

  // Content
  content: {
    title: string;
    description: string;
    alt_text: string;
    tags: string[];
    composition_notes?: string;
    narrative_significance?: string;
    symbolic_elements?: string;
  };

  // Technical analysis
  lighting?: LightingAnalysis;
  palette?: PaletteAnalysis;

  // Canon
  canon_analysis?: CanonAnalysis;

  // Provenance (partially filled by API, rest by caller)
  provenance: {
    source: string;
    created_at: string;
    original_filename?: string;
  };
}

// ============================================================================
// Analysis Task Types
// ============================================================================

/** Options for analyzing a single character image */
export interface CharacterImageAnalysisOptions {
  /** Path to the image file */
  imagePath: string;
  /** Character's display name */
  characterName: string;
  /** Character's slug identifier */
  slug: string;
  /** Canonical appearance description */
  appearance: string;
  /** Image filename */
  filename: string;
  /** Whether to generate enhanced metadata (default: true) */
  enhanced?: boolean;
}

/** Result of analyzing a character image */
export interface CharacterImageAnalysisResult {
  /** Whether analysis succeeded */
  success: boolean;
  /** The analyzed metadata (if successful) */
  entry?: EnhancedImageInventoryEntry;
  /** Error message (if failed) */
  error?: string;
  /** Raw API response (for debugging) */
  rawResponse?: string;
}

// ============================================================================
// Batch Analysis Types
// ============================================================================

/** Detection result for images needing analysis */
export interface ImageAnalysisNeeded {
  /** Character slug */
  slug: string;
  /** Image path */
  imagePath: string;
  /** Image filename */
  filename: string;
  /** Reason analysis is needed */
  reason: 'no_metadata' | 'basic_metadata' | 're_analyze';
  /** Existing entry if present */
  existingEntry?: EnhancedImageInventoryEntry;
}

/** Summary of batch analysis results */
export interface BatchAnalysisSummary {
  /** Total images processed */
  total: number;
  /** Successfully analyzed */
  success: number;
  /** Failed to analyze */
  failed: number;
  /** Skipped (already has rich metadata) */
  skipped: number;
  /** Detailed results by character */
  byCharacter: Record<
    string,
    {
      analyzed: number;
      failed: number;
      skipped: number;
    }
  >;
}
