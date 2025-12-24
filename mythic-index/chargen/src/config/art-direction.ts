/**
 * Art Direction Loader
 *
 * Loads the project-level art direction from story-content/core/09-project-art-direction.yaml.
 * This provides mood→style mappings, aesthetic philosophy, and other high-level art direction.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';

// Get the path to story-content/core relative to chargen
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// chargen/src/config -> chargen -> mythic-index -> MemoryQuill/story-content/core
const ART_DIRECTION_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'MemoryQuill',
  'story-content',
  'core',
  '09-project-art-direction.yaml'
);

// ============================================================================
// Types
// ============================================================================

export interface MoodStyle {
  primary: string;
  secondary: string;
  notes: string;
}

export interface MediumSimulation {
  primary: string;
  texture: string;
  finish: string;
  edges: string;
  detail_density: string;
}

export interface LightingPrinciples {
  general: string;
  color_temperature: {
    warm_sources: string;
    cool_sources: string;
    mixed: string;
  };
  shadow_philosophy: string;
  atmosphere: string;
}

export interface ColorPrinciples {
  saturation: string;
  palette_construction: string;
  signature_colors: Record<string, string>;
  always_avoid: string[];
}

export interface CompositionPrinciples {
  framing: string;
  depth: string;
  focal_hierarchy: string;
  human_scale: string;
}

interface ArtDirectionYaml {
  metadata: {
    project: string;
    story: string;
    version: string;
    last_updated: string;
    canonical_theme_reference_dir: string;
    north_star: string;
  };
  aesthetic_philosophy: string;
  medium_simulation: MediumSimulation;
  fantasy_grounding: {
    baseline: string;
    required_signifiers: string[];
    magic_vfx_rule: string;
  };
  mood_style_mapping: Record<
    string,
    {
      primary: string;
      secondary: string;
      notes: string;
    }
  >;
  lighting_principles: LightingPrinciples;
  color_principles: ColorPrinciples;
  composition_principles: CompositionPrinciples;
  character_identity_rules: Record<string, string>;
  reference_policy: Record<string, { purpose: string; priority: string; note?: string }>;
  generation_guidance: {
    max_prompt_length_chars: number;
    defaults: Record<string, string>;
  };
  aspect_ratios: Record<string, string>;
  size_mapping_openai_gpt_image: Record<string, string>;
  negative_prompt_base: string;
  prompt_template: string;
  usage_notes: string;
}

// ============================================================================
// Singleton Instance
// ============================================================================

let artDirectionInstance: ArtDirectionYaml | null = null;

/**
 * Load the art direction YAML file
 */
function loadArtDirection(): ArtDirectionYaml {
  if (artDirectionInstance) {
    return artDirectionInstance;
  }

  if (!existsSync(ART_DIRECTION_PATH)) {
    throw new Error(`Art direction file not found: ${ART_DIRECTION_PATH}`);
  }

  const content = readFileSync(ART_DIRECTION_PATH, 'utf-8');
  artDirectionInstance = parseYaml(content) as ArtDirectionYaml;
  return artDirectionInstance;
}

/**
 * Reset the art direction cache (mainly for testing)
 */
export function resetArtDirection(): void {
  artDirectionInstance = null;
}

/**
 * Check if art direction file exists
 */
export function artDirectionExists(): boolean {
  return existsSync(ART_DIRECTION_PATH);
}

// ============================================================================
// Public Accessors
// ============================================================================

/**
 * Get the mood→style mapping for a specific mood
 *
 * @param mood - The mood key (e.g., "somber", "pastoral", "kinetic")
 * @returns The style mapping with primary, secondary, and notes, or undefined if mood not found
 */
export function getMoodStyle(mood: string): MoodStyle | undefined {
  const artDirection = loadArtDirection();
  const moodData = artDirection.mood_style_mapping[mood];

  if (!moodData) {
    return undefined;
  }

  return {
    primary: moodData.primary,
    secondary: moodData.secondary,
    notes: moodData.notes,
  };
}

/**
 * Get all available mood keys
 */
export function getAvailableMoods(): string[] {
  const artDirection = loadArtDirection();
  return Object.keys(artDirection.mood_style_mapping);
}

/**
 * Get the aesthetic philosophy statement
 */
export function getAestheticPhilosophy(): string {
  const artDirection = loadArtDirection();
  return artDirection.aesthetic_philosophy;
}

/**
 * Get medium simulation guidance
 */
export function getMediumSimulation(): MediumSimulation {
  const artDirection = loadArtDirection();
  return artDirection.medium_simulation;
}

/**
 * Get the north star statement (single-sentence art direction summary)
 */
export function getNorthStar(): string {
  const artDirection = loadArtDirection();
  return artDirection.metadata.north_star;
}

/**
 * Get lighting principles
 */
export function getLightingPrinciples(): LightingPrinciples {
  const artDirection = loadArtDirection();
  return artDirection.lighting_principles;
}

/**
 * Get color principles including signature colors
 */
export function getColorPrinciples(): ColorPrinciples {
  const artDirection = loadArtDirection();
  return artDirection.color_principles;
}

/**
 * Get signature colors map
 */
export function getSignatureColors(): Record<string, string> {
  const artDirection = loadArtDirection();
  return artDirection.color_principles.signature_colors;
}

/**
 * Get composition principles
 */
export function getCompositionPrinciples(): CompositionPrinciples {
  const artDirection = loadArtDirection();
  return artDirection.composition_principles;
}

/**
 * Get the base negative prompt from art direction
 */
export function getNegativePromptBase(): string {
  const artDirection = loadArtDirection();
  return artDirection.negative_prompt_base;
}

/**
 * Get fantasy grounding rules
 */
export function getFantasyGrounding(): {
  baseline: string;
  required_signifiers: string[];
  magic_vfx_rule: string;
} {
  const artDirection = loadArtDirection();
  return artDirection.fantasy_grounding;
}

/**
 * Get the prompt template structure
 */
export function getPromptTemplateStructure(): string {
  const artDirection = loadArtDirection();
  return artDirection.prompt_template;
}

/**
 * Get aspect ratio for a given image type
 */
export function getAspectRatio(imageType: string): string | undefined {
  const artDirection = loadArtDirection();
  return artDirection.aspect_ratios[imageType];
}

/**
 * Get OpenAI size mapping for an aspect ratio
 */
export function getOpenAISizeForAspectRatio(aspectRatio: string): string | undefined {
  const artDirection = loadArtDirection();
  return artDirection.size_mapping_openai_gpt_image[aspectRatio];
}

/**
 * Build a style suffix string for a given mood
 * Combines the mood's primary style, notes, and medium simulation
 *
 * @param mood - The mood key (e.g., "somber", "pastoral")
 * @returns A comma-separated style suffix string, or empty string if mood not found
 */
export function buildMoodStyleSuffix(mood: string): string {
  const moodStyle = getMoodStyle(mood);
  if (!moodStyle) {
    return '';
  }

  const medium = getMediumSimulation();
  const parts: string[] = [];

  // Add primary style reference (e.g., "Rembrandt chiaroscuro")
  if (moodStyle.primary) {
    parts.push(moodStyle.primary);
  }

  // Add notes as style guidance (e.g., "deep shadow structure; faces emerging from darkness")
  if (moodStyle.notes) {
    // Clean up the notes - remove line breaks, trim
    const cleanNotes = moodStyle.notes.replace(/\n/g, ' ').trim();
    parts.push(cleanNotes);
  }

  // Add medium simulation base (e.g., "painterly realism with oil-paint values")
  if (medium.primary) {
    parts.push(medium.primary);
  }

  // Add finish (e.g., "matte; shine only where physically motivated")
  if (medium.finish) {
    parts.push(medium.finish);
  }

  return parts.join(', ');
}
