/**
 * Image generation constants and style configuration
 *
 * These values are now loaded from config/styles.yaml.
 * This file provides backwards-compatible exports.
 */

import type { ImageScenario, ScenarioDefaults, MasterStyleConfig } from './types.js';
import {
  getMasterStyle,
  getExteriorKeywords,
  getInteriorKeywords,
  getRateLimitDelay,
  getScenarioDefaults,
  getPromptTemplate,
} from '../../config/index.js';

/** Rate limiting delay between API calls (ms) - loaded from config */
export function getRateLimitDelayConstant(): number {
  return getRateLimitDelay();
}

/**
 * Scenario-specific defaults for aspect ratio and image size.
 * Tuned for natural composition per content type.
 * Values loaded from config/styles.yaml
 */
export function getScenarioDefaultsExport(): Record<ImageScenario, ScenarioDefaults> {
  const charDefaults = getScenarioDefaults('character');
  const locDefaults = getScenarioDefaults('location');
  const extDefaults = getScenarioDefaults('exterior');
  const sceneDefaults = getScenarioDefaults('scene');
  const genericDefaults = getScenarioDefaults('generic');

  return {
    character: {
      aspectRatio: charDefaults?.aspect_ratio ?? '4:5',
      imageSize: charDefaults?.image_size ?? '1K',
    },
    location: {
      aspectRatio: locDefaults?.aspect_ratio ?? '4:3',
      imageSize: locDefaults?.image_size ?? '1K',
    },
    exterior: {
      aspectRatio: extDefaults?.aspect_ratio ?? '16:9',
      imageSize: extDefaults?.image_size ?? '1K',
    },
    scene: {
      aspectRatio: sceneDefaults?.aspect_ratio ?? '16:9',
      imageSize: sceneDefaults?.image_size ?? '1K',
    },
    generic: {
      aspectRatio: genericDefaults?.aspect_ratio ?? '1:1',
      imageSize: genericDefaults?.image_size ?? '1K',
    },
  };
}

// For backwards compatibility, export a getter-based constant
// Note: This is evaluated when the module loads, so config must be initialized first
export const SCENARIO_DEFAULTS: Record<ImageScenario, ScenarioDefaults> = {
  character: { aspectRatio: '4:5', imageSize: '1K' },
  location: { aspectRatio: '4:3', imageSize: '1K' },
  exterior: { aspectRatio: '16:9', imageSize: '1K' },
  scene: { aspectRatio: '16:9', imageSize: '1K' },
  generic: { aspectRatio: '1:1', imageSize: '1K' },
};

/**
 * Master Style Configuration
 * Bridges classical 19th-century oil painting with modern fantasy concept art.
 * Values loaded from config/styles.yaml
 */
export function getMasterStyleExport(): MasterStyleConfig {
  const style = getMasterStyle();
  return {
    universalSuffix: style?.universal_suffix ?? '',
    scenarios: {
      character: style?.scenarios?.character ?? '',
      location: style?.scenarios?.location ?? '',
      exterior: style?.scenarios?.exterior ?? '',
      scene: style?.scenarios?.scene ?? '',
    },
    artistReferences: style?.artist_references ?? [],
    useArtistReferences: style?.use_artist_references ?? false,
  };
}

// For backwards compatibility, export MASTER_STYLE as a getter
// Consumers should use getMasterStyleExport() for dynamic access
export const MASTER_STYLE: MasterStyleConfig = {
  universalSuffix: `high fantasy illustration (Dungeons & Dragons / Faerûn vibe), painterly realism with classical oil texture, slight impasto, matte finish, rich naturalistic detail, cinematic lighting, atmospheric depth, crisp material textures, subtle magical ambience, not photorealistic`,

  scenarios: {
    character: `heroic fantasy portrait, expressive face, distinct facial features, ornate fantasy attire, cinematic lighting, medium shot, warm golden tones, detailed texture on metal, leather, and cloth`,

    location: `high-fantasy interior architecture, wide establishing composition, enchanted lanternlight and arcane glow, subtle runes and warding motifs, intricate craftsmanship, detailed stone/wood/metal textures, storytelling composition`,

    exterior: `epic high-fantasy exterior, fantastical silhouettes and skyline, arcane lanterns and ward-lights, subtle magical phenomena integrated into the environment, dynamic skies, cinematic composition, atmospheric depth`,

    scene: `storytelling moment, high-fantasy adventuring tone, emotional lighting, atmospheric depth, subtle spell effects, focus on character expressions, dramatic composition`,
  },

  artistReferences: ['Greg Rutkowski', 'John Singer Sargent', 'Rembrandt'],
  useArtistReferences: true,
};

/** Keywords for detecting exterior locations - loaded from config */
export function getExteriorKeywordsExport(): string[] {
  return getExteriorKeywords();
}

// Backwards compatible export
export const EXTERIOR_KEYWORDS = [
  'forest',
  'mountain',
  'river',
  'lake',
  'ocean',
  'sea',
  'beach',
  'cliff',
  'valley',
  'plains',
  'desert',
  'swamp',
  'marsh',
  'wilderness',
  'woods',
  'street',
  'square',
  'plaza',
  'market',
  'harbor',
  'port',
  'dock',
  'pier',
  'bridge',
  'gate',
  'wall',
  'road',
  'path',
  'garden',
  'courtyard',
  'ruins',
  'outdoor',
  'outside',
  'open-air',
  'exterior',
];

/** Keywords for detecting interior locations - loaded from config */
export function getInteriorKeywordsExport(): string[] {
  return getInteriorKeywords();
}

// Backwards compatible export
export const INTERIOR_KEYWORDS = [
  'room',
  'hall',
  'chamber',
  'quarters',
  'study',
  'library',
  'kitchen',
  'bedroom',
  'throne room',
  'cellar',
  'basement',
  'attic',
  'dungeon',
  'tavern',
  'inn',
  'shop',
  'temple',
  'church',
  'shrine',
  'guild',
  'warehouse',
  'prison',
  'tower interior',
  'keep',
  'vault',
  'indoor',
  'inside',
  'interior',
];

/** MIME type lookup for common image formats */
export const MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

/**
 * Character consistency system prompt for many-shot generation
 * Now loaded from config/prompts.yaml
 */
export function getCharacterConsistencyPrompt(scenario: string): string {
  return getPromptTemplate('character_consistency').replace('{{scenario}}', scenario);
}

/**
 * Location continuity system prompt for many-shot generation (multi-reference)
 * Loaded from config/prompts.yaml
 */
export function getLocationConsistencyPrompt(scenario: string): string {
  return getPromptTemplate('location_consistency').replace('{{scenario}}', scenario);
}

/**
 * Scene continuity system prompt for many-shot generation (multi-reference)
 * Loaded from config/prompts.yaml
 */
export function getSceneConsistencyPrompt(scenario: string): string {
  return getPromptTemplate('scene_consistency').replace('{{scenario}}', scenario);
}

// Backwards compatible export
export const CHARACTER_CONSISTENCY_PROMPT = `SYSTEM INSTRUCTION: CHARACTER CONSISTENCY MODE

The images above are REFERENCE SHEETS for a specific character.
Generate a NEW image of this EXACT character in the described scenario.

CRITICAL REQUIREMENTS:
1. IDENTITY LOCK: Maintain exact facial features, eye shape, nose structure, hair style
2. CONSISTENCY: Do not alter race, age, or key physical identifiers
3. LIGHTING: Adapt lighting to new scene while preserving character appearance
4. STYLE: Match the artistic style of the reference images
5. PRIORITY: If the scenario text conflicts with the reference images, follow the reference images for identity/appearance

SCENARIO: `;
