/**
 * Prompt building utilities for different entity types
 */

import type { Character, Location } from '../../types/canon.js';
import type { ImageGenerationOptions } from './types.js';
import type { Config } from '../../types/config.js';

/**
 * Build a prompt for character portrait generation
 */
export function buildCharacterPrompt(
  character: Character,
  options?: ImageGenerationOptions,
  config?: Config
): string {
  const parts: string[] = [];

  // Base description
  parts.push(`Portrait of ${character.name}`);

  // Physical appearance
  if (character.appearance) {
    const { age, height, build, hair, eyes, distinguishingFeatures, clothing } =
      character.appearance;
    if (age) parts.push(`${age} years old`);
    if (height) parts.push(height);
    if (build) parts.push(`${build} build`);
    if (hair) parts.push(`${hair} hair`);
    if (eyes) parts.push(`${eyes} eyes`);
    if (distinguishingFeatures?.length) {
      parts.push(distinguishingFeatures.join(', '));
    }
    if (clothing) parts.push(`wearing ${clothing}`);
  }

  // Optional pose guidance
  if (options?.pose) {
    parts.push(options.pose);
  }

  // Personality hints for expression
  if (character.personality) {
    const lowerPersonality = character.personality.toLowerCase();
    if (lowerPersonality.includes('stern') || lowerPersonality.includes('serious')) {
      parts.push('serious expression');
    } else if (lowerPersonality.includes('cheerful') || lowerPersonality.includes('friendly')) {
      parts.push('warm smile');
    } else if (lowerPersonality.includes('mysterious') || lowerPersonality.includes('secretive')) {
      parts.push('enigmatic expression');
    }
  }

  // Add art style
  if (options?.style) {
    parts.push(options.style);
  } else if (config?.artStyle?.description) {
    parts.push(config.artStyle.description);
  }

  return parts.join(', ');
}

/**
 * Build a prompt for location artwork generation
 */
export function buildLocationPrompt(
  location: Location,
  options?: ImageGenerationOptions & { timeOfDay?: string; mood?: string },
  _config?: Config
): string {
  const parts: string[] = [];

  // Base
  parts.push(location.name);
  if (location.type) parts.push(location.type);

  // Description
  if (location.description) {
    parts.push(location.description);
  }

  // Atmosphere
  if (location.atmosphere) {
    parts.push(location.atmosphere);
  }

  // Time of day
  if (options?.timeOfDay) {
    parts.push(`at ${options.timeOfDay}`);
  }

  // Mood
  if (options?.mood) {
    parts.push(`${options.mood} mood`);
  }

  // Features
  if (location.features?.length) {
    parts.push(`featuring ${location.features.slice(0, 3).join(', ')}`);
  }

  // Only add explicit style if requested via options
  if (options?.style) {
    parts.push(options.style);
  }

  return parts.join(', ');
}
