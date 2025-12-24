/**
 * Image generation types and interfaces
 */

import type { SafetySetting } from '@google/genai';

export interface GeneratedImage {
  path: string;
  prompt: string;
  provider: string;
  model: string;
  createdAt: string;
}

export type ImageProvider = 'openai' | 'google';

export interface ImageGenerationOptions {
  pose?: string;
  style?: string;
  size?: string;
  quality?: 'standard' | 'hd';
  negativePrompt?: string;
  provider?: ImageProvider;
  aspectRatio?: string;
  model?: string;
  imageSize?: string;
  responseMimeType?: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  candidateCount?: number;
  seed?: number;
  safetySettings?: SafetySetting[];
}

export interface ImageEditOptions extends ImageGenerationOptions {
  preserveComposition?: boolean;
  maskPath?: string;
  outputFilename?: string;
}

export interface ImageEditResult extends GeneratedImage {
  sourceImage: string;
  editInstruction: string;
}

export interface CharacterConsistencyOptions extends ImageGenerationOptions {
  maxReferences?: number;
  identityInstructions?: string;
  /**
   * How the reference images should be interpreted.
   * - character: portraits/reference sheets (identity lock)
   * - location: location overviews/style refs (environment continuity)
   * - scene: mixed refs (characters + location) (identity + continuity)
   */
  referenceMode?: 'character' | 'location' | 'scene';
  /**
   * Which master-style scenario to apply when building the final instruction.
   * Defaults to 'character' for character mode, otherwise 'scene'.
   */
  styleScenario?: ImageScenario;
}

export type ImageScenario = 'character' | 'location' | 'exterior' | 'scene' | 'generic';

export interface ScenarioDefaults {
  aspectRatio: string;
  imageSize: string;
}

export interface MasterStyleConfig {
  universalSuffix: string;
  scenarios: {
    character: string;
    location: string;
    exterior: string;
    scene: string;
  };
  artistReferences: string[];
  useArtistReferences: boolean;
}
