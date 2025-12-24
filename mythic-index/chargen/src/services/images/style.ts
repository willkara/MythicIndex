/**
 * Style and prompt building utilities for image generation
 */

import type { SafetySetting } from '@google/genai';
import type { ImageGenerationOptions, ImageScenario } from './types.js';
import {
  MASTER_STYLE,
  SCENARIO_DEFAULTS,
  EXTERIOR_KEYWORDS,
  INTERIOR_KEYWORDS,
  getExteriorKeywordsExport,
  getInteriorKeywordsExport,
  getMasterStyleExport,
  getScenarioDefaultsExport,
} from './constants.js';
import type { Config } from '../../types/config.js';
import type { Location } from '../../types/canon.js';
import {
  buildMoodStyleSuffix,
  getAestheticPhilosophy,
  getNegativePromptBase as getArtDirectionNegativePrompt,
  artDirectionExists,
} from '../../config/index.js';

/**
 * Extended options that include scene mood for art direction integration
 */
export interface BuildPromptOptions extends ImageGenerationOptions {
  /** Scene mood from chapter imagery (e.g., "somber", "pastoral", "kinetic") */
  sceneMood?: string;
  /** Whether to use art direction mood→style mapping (defaults to true) */
  useArtDirection?: boolean;
}

function getMasterStyleSafe(): typeof MASTER_STYLE {
  try {
    return getMasterStyleExport();
  } catch {
    return MASTER_STYLE;
  }
}

function getScenarioDefaultsSafe(): typeof SCENARIO_DEFAULTS {
  try {
    return getScenarioDefaultsExport();
  } catch {
    return SCENARIO_DEFAULTS;
  }
}

function getExteriorKeywordsSafe(): string[] {
  try {
    return getExteriorKeywordsExport();
  } catch {
    return EXTERIOR_KEYWORDS;
  }
}

function getInteriorKeywordsSafe(): string[] {
  try {
    return getInteriorKeywordsExport();
  } catch {
    return INTERIOR_KEYWORDS;
  }
}

/**
 * Apply scenario-aware defaults and provider defaults for generation options
 */
export function resolveScenarioOptions(
  options: ImageGenerationOptions | undefined,
  scenario: ImageScenario,
  provider: 'openai' | 'google',
  config: Config
): ImageGenerationOptions {
  const merged: ImageGenerationOptions = { ...(options || {}) };

  if (provider === 'google') {
    const googleConfig = config.imageGeneration.providers.google;
    const scenarioDefaultsMap = getScenarioDefaultsSafe();
    const baseScenarioDefaults = scenarioDefaultsMap[scenario] || scenarioDefaultsMap.generic;
    const scenarioDefaults =
      scenario === 'generic'
        ? {
            ...baseScenarioDefaults,
            aspectRatio: googleConfig?.defaultAspectRatio || baseScenarioDefaults.aspectRatio,
          }
        : baseScenarioDefaults;

    if (!merged.aspectRatio) {
      merged.aspectRatio = scenarioDefaults.aspectRatio;
    }
    if (!merged.imageSize) {
      merged.imageSize = googleConfig?.defaultImageSize || scenarioDefaults.imageSize;
    }
    if (!merged.responseMimeType) {
      merged.responseMimeType = googleConfig?.defaultResponseMimeType || 'image/png';
    }
    if (merged.temperature === undefined && googleConfig?.defaultTemperature !== undefined) {
      merged.temperature = googleConfig.defaultTemperature;
    }
    if (merged.topP === undefined && googleConfig?.defaultTopP !== undefined) {
      merged.topP = googleConfig.defaultTopP;
    }
    if (merged.topK === undefined && googleConfig?.defaultTopK !== undefined) {
      merged.topK = googleConfig.defaultTopK;
    }
    if (merged.candidateCount === undefined && googleConfig?.defaultCandidateCount !== undefined) {
      merged.candidateCount = googleConfig.defaultCandidateCount;
    }
    if (merged.seed === undefined && googleConfig?.defaultSeed !== undefined) {
      merged.seed = googleConfig.defaultSeed;
    }
    if (!merged.safetySettings && googleConfig?.safetySettings) {
      merged.safetySettings = googleConfig.safetySettings as SafetySetting[];
    }
  }

  return merged;
}

/**
 * Build the final prompt with master style applied
 * This is the single injection point for consistent art direction
 *
 * When art direction is enabled and a sceneMood is provided (for chapter scenes),
 * the mood→style mapping from the project art direction file is used to inject
 * artist references and style notes (e.g., "Rembrandt chiaroscuro" for somber mood).
 */
export function buildFinalPrompt(
  basePrompt: string,
  scenario: ImageScenario,
  options?: BuildPromptOptions
): string {
  // If explicit style override, use legacy behavior
  if (options?.style) {
    return `${basePrompt}, ${options.style}`;
  }

  const masterStyle = getMasterStyleSafe();
  const parts: string[] = [basePrompt];

  // Check if we should use art direction mood→style mapping
  const useArtDirection = options?.useArtDirection !== false && artDirectionExists();
  const sceneMood = options?.sceneMood;

  // For chapter scenes with a mood, inject mood-specific style from art direction
  if (useArtDirection && sceneMood && scenario === 'scene') {
    const moodStyleSuffix = buildMoodStyleSuffix(sceneMood);
    if (moodStyleSuffix) {
      parts.push(moodStyleSuffix);
    }
  }

  // Add scenario-specific style (from styles.yaml)
  const scenarioStyle = masterStyle.scenarios[scenario as keyof typeof masterStyle.scenarios];
  if (scenarioStyle) {
    parts.push(scenarioStyle);
  }

  // Add universal suffix - prefer art direction's aesthetic philosophy if available
  if (useArtDirection) {
    try {
      const aestheticPhilosophy = getAestheticPhilosophy();
      if (aestheticPhilosophy) {
        parts.push(aestheticPhilosophy);
      }
    } catch {
      // Fall back to master style universal suffix
      if (masterStyle.universalSuffix) {
        parts.push(masterStyle.universalSuffix);
      }
    }
  } else if (masterStyle.universalSuffix) {
    parts.push(masterStyle.universalSuffix);
  }

  // Add legacy artist references if enabled (only when not using art direction mood styles)
  if (!useArtDirection || !sceneMood) {
    if (masterStyle.useArtistReferences && masterStyle.artistReferences?.length) {
      parts.push(`Art by ${masterStyle.artistReferences.join(', ')}`);
    }
  }

  return parts.join(', ');
}

/**
 * Get just the style suffix that would be appended by buildFinalPrompt()
 * (useful for reserving prompt length during IR rendering).
 *
 * @param scenario - The image scenario type
 * @param sceneMood - Optional mood for chapter scenes (e.g., "somber", "pastoral")
 */
export function getMasterStyleSuffix(scenario: ImageScenario, sceneMood?: string): string {
  const masterStyle = getMasterStyleSafe();
  const parts: string[] = [];
  const useArtDirection = artDirectionExists();

  // For chapter scenes with a mood, include mood-specific style
  if (useArtDirection && sceneMood && scenario === 'scene') {
    const moodStyleSuffix = buildMoodStyleSuffix(sceneMood);
    if (moodStyleSuffix) {
      parts.push(moodStyleSuffix);
    }
  }

  const scenarioStyle = masterStyle.scenarios[scenario as keyof typeof masterStyle.scenarios];
  if (scenarioStyle) parts.push(scenarioStyle);

  // Prefer art direction's aesthetic philosophy
  if (useArtDirection) {
    try {
      const aestheticPhilosophy = getAestheticPhilosophy();
      if (aestheticPhilosophy) {
        parts.push(aestheticPhilosophy);
      }
    } catch {
      if (masterStyle.universalSuffix) parts.push(masterStyle.universalSuffix);
    }
  } else if (masterStyle.universalSuffix) {
    parts.push(masterStyle.universalSuffix);
  }

  // Only add legacy artist refs when not using mood-based art direction
  if (!useArtDirection || !sceneMood) {
    if (masterStyle.useArtistReferences && masterStyle.artistReferences?.length) {
      parts.push(`Art by ${masterStyle.artistReferences.join(', ')}`);
    }
  }

  return parts.join(', ');
}

/**
 * Build the complete negative prompt, combining art direction base with scenario-specific additions
 *
 * @param _scenario - The image scenario type (reserved for future scenario-specific negatives)
 * @param additionalNegatives - Optional additional negative prompts to append
 */
export function buildNegativePrompt(_scenario: ImageScenario, additionalNegatives?: string): string {
  const parts: string[] = [];

  // Try to get base negative from art direction
  if (artDirectionExists()) {
    try {
      const artDirectionNegative = getArtDirectionNegativePrompt();
      if (artDirectionNegative) {
        parts.push(artDirectionNegative.trim());
      }
    } catch {
      // Fall through to use constants
    }
  }

  // Add any additional negatives
  if (additionalNegatives) {
    parts.push(additionalNegatives.trim());
  }

  return parts.join(', ');
}

/**
 * Detect whether a location should use interior or exterior style
 * based on keyword analysis of its name, type, description, and atmosphere
 */
export function detectLocationScenario(location: Location): 'location' | 'exterior' {
  const searchText = [location.name, location.type, location.description, location.atmosphere]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  // Count keyword matches
  const exteriorKeywords = getExteriorKeywordsSafe();
  const interiorKeywords = getInteriorKeywordsSafe();
  const exteriorScore = exteriorKeywords.filter((k) => searchText.includes(k)).length;
  const interiorScore = interiorKeywords.filter((k) => searchText.includes(k)).length;

  // Exterior if more exterior keywords, otherwise default to location (interior)
  return exteriorScore > interiorScore ? 'exterior' : 'location';
}

/**
 * Detect whether text describes an interior or exterior environment.
 * Used for IR-based generation where we don't have a full Location object.
 */
export function detectScenarioFromText(text: string): 'location' | 'exterior' {
  const searchText = text.toLowerCase();
  const exteriorKeywords = getExteriorKeywordsSafe();
  const interiorKeywords = getInteriorKeywordsSafe();

  const exteriorScore = exteriorKeywords.filter((k) => searchText.includes(k)).length;
  const interiorScore = interiorKeywords.filter((k) => searchText.includes(k)).length;

  return exteriorScore > interiorScore ? 'exterior' : 'location';
}
