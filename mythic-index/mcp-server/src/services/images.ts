/**
 * Image generation service
 * Supports multiple providers: OpenAI DALL-E, Stability AI, Local SD
 */

import OpenAI from 'openai';
import { GoogleGenAI, type SafetySetting } from '@google/genai';
import { writeFile, readFile } from 'fs/promises';
import { createReadStream } from 'fs';
import { join } from 'path';
import { getConfig } from './config.js';
import { getStorage } from './storage.js';
import type { Character, Location } from '../types/index.js';

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

/**
 * Options for image editing operations
 */
export interface ImageEditOptions extends ImageGenerationOptions {
  /** Keep original image composition where possible */
  preserveComposition?: boolean;
  /** Provider to use for edits (google | openai). Default: google */
  provider?: ImageProvider;
  /** Optional mask file path (OpenAI edits) */
  maskPath?: string;
  /** Output filename prefix (without extension). */
  outputFilename?: string;
}

/**
 * Result from an image editing operation
 */
export interface ImageEditResult extends GeneratedImage {
  sourceImage: string;  // Path to original
  editInstruction: string;
}

/**
 * Options for character consistency generation (many-shot)
 */
export interface CharacterConsistencyOptions extends ImageGenerationOptions {
  /** Maximum number of reference images to use (1-14) */
  maxReferences?: number;
  /** Custom instructions for character identity lock */
  identityInstructions?: string;
}

// Rate limiting delay between API calls (ms)
const RATE_LIMIT_DELAY = 2000;

/**
 * Image generation scenario for style selection
 */
export type ImageScenario = 'character' | 'location' | 'exterior' | 'scene' | 'generic';

/**
 * Scenario-specific defaults for aspect ratio and image size.
 * These are tuned for natural composition per content type.
 */
const SCENARIO_DEFAULTS: Record<ImageScenario, { aspectRatio: string; imageSize: string }> = {
  character: { aspectRatio: '4:5', imageSize: '1K' },   // portrait framing
  location: { aspectRatio: '4:3', imageSize: '1K' },    // architectural balance
  exterior: { aspectRatio: '16:9', imageSize: '1K' },   // cinematic landscapes
  scene: { aspectRatio: '16:9', imageSize: '1K' },      // storytelling frames
  generic: { aspectRatio: '1:1', imageSize: '1K' },     // safe square default
};

/**
 * Hardcoded Master Style Configuration
 * Bridges classical 19th-century oil painting with modern fantasy concept art.
 * Emphasizes: matte finish, chiaroscuro lighting, earth tones, painterly texture.
 */
const MASTER_STYLE = {
  universalSuffix: `in the style of a classical oil painting, slight impasto texture, digital fantasy concept art, highly detailed, matte painting, heavy shadows, chiaroscuro lighting, Rembrandt lighting, volumetric atmosphere, muted earth tones, gritty realism, 19th-century portraiture style, sharp focus on subject, painterly background`,

  scenarios: {
    character: `expressive face, distinct facial features, cinematic lighting, medium shot, thick brushwork, matte finish, dramatic side lighting, deep shadows, warm golden tones, detailed texture on metal and cloth`,

    location: `interior view, volumetric lighting, god rays through dusty windows, atmospheric perspective, in the style of Dutch Golden Age painting, intricate architectural details, stone and wood textures, muted color palette, sepia undertone, storytelling composition`,

    exterior: `looming architecture, stone masonry, ambient occlusion, overcast sky, soft diffuse light, fog and mist, historical matte painting style, desaturated colors, gritty texture, epic scale, cinematic composition`,

    scene: `storytelling moment, emotional lighting, atmospheric depth, painterly motion blur on action, focus on character expressions, dramatic composition`,
  },

  artistReferences: ['Greg Rutkowski', 'John Singer Sargent', 'Rembrandt'],
  useArtistReferences: true, // ON by default
};

/**
 * Keywords for detecting interior vs exterior locations
 */
const EXTERIOR_KEYWORDS = [
  // Natural features
  'forest', 'mountain', 'river', 'lake', 'ocean', 'sea', 'beach', 'cliff',
  'valley', 'plains', 'desert', 'swamp', 'marsh', 'wilderness', 'woods',
  // Urban exteriors
  'street', 'square', 'plaza', 'market', 'harbor', 'port', 'dock', 'pier',
  'bridge', 'gate', 'wall', 'road', 'path', 'garden', 'courtyard', 'ruins',
  // Descriptors
  'outdoor', 'outside', 'open-air', 'exterior'
];

const INTERIOR_KEYWORDS = [
  // Rooms
  'room', 'hall', 'chamber', 'quarters', 'study', 'library', 'kitchen',
  'bedroom', 'throne room', 'cellar', 'basement', 'attic', 'dungeon',
  // Buildings (interior context)
  'tavern', 'inn', 'shop', 'temple', 'church', 'shrine', 'guild',
  'warehouse', 'prison', 'tower interior', 'keep', 'vault',
  // Descriptors
  'indoor', 'inside', 'interior'
];

/**
 * MIME type lookup for common image formats
 */
const MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

/**
 * Get MIME type from file path
 */
function getMimeType(filePath: string): string {
  const ext = filePath.toLowerCase().split('.').pop() || '';
  return MIME_TYPES[ext] || 'image/png';
}

/**
 * Character consistency system prompt for many-shot generation
 */
const CHARACTER_CONSISTENCY_PROMPT = `SYSTEM INSTRUCTION: CHARACTER CONSISTENCY MODE

The images above are REFERENCE SHEETS for a specific character.
Generate a NEW image of this EXACT character in the described scenario.

CRITICAL REQUIREMENTS:
1. IDENTITY LOCK: Maintain exact facial features, eye shape, nose structure, hair style
2. CONSISTENCY: Do not alter race, age, or key physical identifiers
3. LIGHTING: Adapt lighting to new scene while preserving character appearance
4. STYLE: Match the artistic style of the reference images
5. PRIORITY: If the scenario text conflicts with the reference images, follow the reference images for identity/appearance

SCENARIO: `;

const REFERENCE_CONSISTENCY_PROMPT = `SYSTEM INSTRUCTION: REFERENCE CONSISTENCY MODE

The images above are REFERENCE SHEETS for the primary subject or environment.
Generate a NEW image that preserves the defining visual anchors from the references.

CRITICAL REQUIREMENTS:
1. PRESERVE: Keep the core shapes, materials, motifs, and lighting cues from the references
2. CONSISTENCY: Do not introduce conflicting architectural or costume details
3. STYLE: Match the artistic style and palette of the references
4. PRIORITY: If the scenario text conflicts with the references, follow the references

SCENARIO: `;

/**
 * Sleep utility for rate limiting
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Normalize safety settings coming from config (string enums) or direct SafetySetting[]
 */
function normalizeSafetySettings(
  settings?: Array<SafetySetting | { category: string; threshold: string; method?: string }>
): SafetySetting[] | undefined {
  if (!settings || settings.length === 0) return undefined;
  return settings.map(s => {
    const base = s as any;
    const normalized: SafetySetting = {
      category: base.category,
      threshold: base.threshold,
    };
    if (base.method) normalized.method = base.method;
    return normalized;
  });
}

export class ImageService {
  private openai: OpenAI | null = null;
  private google: GoogleGenAI | null = null;
  private lastGenerationTime = 0;

  constructor() {
    const config = getConfig();
    const openaiConfig = config.imageGeneration.providers.openai;
    const googleConfig = config.imageGeneration.providers.google;

    if (openaiConfig?.apiKey) {
      this.openai = new OpenAI({ apiKey: openaiConfig.apiKey });
    }

    if (googleConfig?.apiKey) {
      this.google = new GoogleGenAI({ apiKey: googleConfig.apiKey });
    }
  }

  /**
   * Generate a character portrait based on their canon description
   */
  async generateCharacterPortrait(
    characterNameOrSlug: string,
    options?: ImageGenerationOptions
  ): Promise<GeneratedImage> {
    const config = getConfig();
    const storage = getStorage();
    const character = storage.getCharacter(config.workspace.id, characterNameOrSlug);

    if (!character) {
      throw new Error(`Character not found: ${characterNameOrSlug}`);
    }

    const prompt = this.buildCharacterPrompt(character, options);
    return this.generate(prompt, `${character.slug}-portrait`, options, 'character');
  }

  /**
   * Generate location artwork
   */
  async generateLocationArt(
    locationNameOrSlug: string,
    options?: ImageGenerationOptions & { timeOfDay?: string; mood?: string }
  ): Promise<GeneratedImage> {
    const config = getConfig();
    const storage = getStorage();
    const location = storage.getLocation(config.workspace.id, locationNameOrSlug);

    if (!location) {
      throw new Error(`Location not found: ${locationNameOrSlug}`);
    }

    const prompt = this.buildLocationPrompt(location, options);
    const scenario = this.detectLocationScenario(location);
    return this.generate(prompt, `${location.slug}-art`, options, scenario);
  }

  /**
   * Generate a scene illustration from description
   */
  async generateSceneArt(
    description: string,
    options?: ImageGenerationOptions
  ): Promise<GeneratedImage> {
    // Scene art uses the description as-is; master style is applied in generate()
    const timestamp = Date.now();
    return this.generate(description, `scene-${timestamp}`, options, 'scene');
  }

  /**
   * Generate from a raw prompt (for custom use)
   */
  async generateFromPrompt(
    prompt: string,
    filename: string,
    options?: ImageGenerationOptions,
    scenario: ImageScenario = 'generic'
  ): Promise<GeneratedImage> {
    return this.generate(prompt, filename, options, scenario);
  }

  /**
   * Generate from a raw prompt with explicit provider selection
   * Used for bulk regeneration operations
   */
  async generateFromPromptWithProvider(
    prompt: string,
    filename: string,
    provider: ImageProvider,
    options?: Omit<ImageGenerationOptions, 'provider'>,
    scenario: ImageScenario = 'generic'
  ): Promise<GeneratedImage> {
    return this.generate(prompt, filename, { ...options, provider }, scenario);
  }

  /**
   * Check if a provider is available
   */
  isProviderAvailable(provider: ImageProvider): boolean {
    if (provider === 'openai') {
      return this.openai !== null;
    } else if (provider === 'google') {
      return this.google !== null;
    }
    return false;
  }

  /**
   * Get list of available providers
   */
  getAvailableProviders(): ImageProvider[] {
    const providers: ImageProvider[] = [];
    if (this.openai) providers.push('openai');
    if (this.google) providers.push('google');
    return providers;
  }

  /**
   * Edit an existing image using natural language instructions
   * Uses Gemini's multimodal capabilities to modify images
   *
   * @param sourceImagePath - Path to the image to edit
   * @param editInstruction - Natural language description of the edit (e.g., "remove the hat", "add a sunset")
   * @param options - Generation options (model, etc.)
   * @returns The edited image result
   */
  async editImage(
    sourceImagePath: string,
    editInstruction: string,
    options?: ImageEditOptions
  ): Promise<ImageEditResult> {
    const provider: ImageProvider = options?.provider || 'google';

    const config = getConfig();
    // Build the edit instruction with optional composition preservation
    let instruction = editInstruction;
    if (options?.preserveComposition) {
      instruction = `${editInstruction}. Preserve the original composition and layout as much as possible.`;
    }

    // Add negative prompts if present
    const negativePrompts = [
      ...config.artStyle.negativePrompts,
      ...(options?.negativePrompt ? [options.negativePrompt] : []),
    ];
    if (negativePrompts.length > 0) {
      instruction = `${instruction}\n\nAvoid: ${negativePrompts.join(', ')}`;
    }

    // Rate limiting
    const now = Date.now();
    const timeSinceLastGeneration = now - this.lastGenerationTime;
    if (timeSinceLastGeneration < RATE_LIMIT_DELAY && this.lastGenerationTime > 0) {
      await sleep(RATE_LIMIT_DELAY - timeSinceLastGeneration);
    }

    if (provider === 'google') {
      if (!this.google) {
        throw new Error('Image editing requires Google GenAI. Add API key to config.');
      }
      const googleConfig = config.imageGeneration.providers.google!;

      // Use specified model or default to the current image-capable preview model
      const modelName = options?.model || googleConfig.model || 'gemini-3-pro-image-preview';

      // Read source image and convert to base64
      const imageBuffer = await readFile(sourceImagePath);
      const base64Image = imageBuffer.toString('base64');
      const mimeType = getMimeType(sourceImagePath);

      // Build multimodal content: image first, then text instruction
      const response = await this.google.models.generateContent({
        model: modelName,
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: base64Image,
                },
              },
              { text: instruction },
            ],
          },
        ],
        config: {
          responseModalities: ['IMAGE'],
        },
      });

      const part = response.candidates?.[0]?.content?.parts?.[0];

      if (!part || !part.inlineData || !part.inlineData.data) {
        throw new Error('No image data returned from Google Gemini edit');
      }

      // Save the edited image
      const buffer = Buffer.from(part.inlineData.data, 'base64');
      const timestamp = new Date().toISOString().split('T')[0];
      const sourceFilename = sourceImagePath.split('/').pop()?.replace(/\.[^.]+$/, '') || 'edited';
      const requestedBase = options?.outputFilename || `${sourceFilename}-edited`;
      const safeBase =
        requestedBase
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+/, '')
          .replace(/-+$/, '')
          .slice(0, 80) || 'edited';
      const imagePath = join(config.paths.imagesDir, `${safeBase}-${timestamp}.png`);

      await writeFile(imagePath, buffer);

      // Update rate limiting
      this.lastGenerationTime = Date.now();

      return {
        path: imagePath,
        prompt: instruction,
        provider: 'google',
        model: modelName,
        createdAt: new Date().toISOString(),
        sourceImage: sourceImagePath,
        editInstruction,
      };
    }

    // OpenAI branch
    if (!this.openai) {
      throw new Error('OpenAI not configured. Add API key to config.');
    }

    const openaiConfig = config.imageGeneration.providers.openai!;
    const modelName = options?.model || openaiConfig.model || 'gpt-image-1.5';
    const size = (options?.size || openaiConfig.defaultSize || '1024x1024') as any;

    const editPayload: any = {
      model: modelName,
      prompt: instruction,
      image: createReadStream(sourceImagePath),
      size,
      response_format: 'b64_json',
    };

    if (options?.maskPath) {
      editPayload.mask = createReadStream(options.maskPath);
    }

    const response = await this.openai.images.edit(editPayload);

    const imagePayload = response.data?.[0];
    const imageData = imagePayload?.b64_json || (imagePayload as any)?.image_base64;
    if (!imageData) {
      throw new Error('No image data returned from OpenAI image edit');
    }

    const buffer = Buffer.from(imageData, 'base64');
    const timestamp = new Date().toISOString().split('T')[0];
    const sourceFilename = sourceImagePath.split('/').pop()?.replace(/\.[^.]+$/, '') || 'edited';
    const requestedBase = options?.outputFilename || `${sourceFilename}-edited`;
    const safeBase =
      requestedBase
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '')
        .slice(0, 80) || 'edited';
    const imagePath = join(config.paths.imagesDir, `${safeBase}-${timestamp}.png`);

    await writeFile(imagePath, buffer);

    // Update rate limiting
    this.lastGenerationTime = Date.now();

    return {
      path: imagePath,
      prompt: instruction,
      provider: 'openai',
      model: modelName,
      createdAt: new Date().toISOString(),
      sourceImage: sourceImagePath,
      editInstruction,
    };
  }

  /**
   * Generate an image with reference images (many-shot)
   * Uses multiple reference images to maintain subject or environment consistency
   *
   * @param referenceImagePaths - Array of paths to reference images (1-14 images)
   * @param scenarioPrompt - Description of the new scenario
   * @param options - Generation options including identity instructions
   * @param outputBaseName - Optional output filename prefix
   * @param scenario - Scenario type for style defaults (character/location/scene)
   * @returns The generated image with reference consistency
   */
  async generateWithReferences(
    referenceImagePaths: string[],
    scenarioPrompt: string,
    options?: CharacterConsistencyOptions,
    outputBaseName?: string,
    scenario: ImageScenario = 'character'
  ): Promise<GeneratedImage> {
    if (!this.google) {
      throw new Error('Character consistency generation requires Google GenAI. Add API key to config.');
    }

    if (referenceImagePaths.length === 0) {
      throw new Error('At least one reference image is required for character consistency');
    }

    const config = getConfig();
    const googleConfig = config.imageGeneration.providers.google!;

    const resolvedOptions = this.resolveScenarioOptions(options, scenario, 'google');

    // Limit references to max (default 14 for Gemini 3 Pro)
    const maxRefs = options?.maxReferences || 14;
    const limitedPaths = referenceImagePaths.slice(0, maxRefs);

    // Prefer the latest image-capable Gemini model; fall back to config or explicit override
    let modelName = options?.model || googleConfig.model || 'gemini-3-pro-image-preview';
    // Backward-compatibility: upgrade deprecated preview model name to image-preview
    if (modelName === 'gemini-3-pro-preview') {
      modelName = 'gemini-3-pro-image-preview';
    }

    // Build reference image parts
    const imageParts = await Promise.all(
      limitedPaths.map(async (imagePath) => {
        const imageBuffer = await readFile(imagePath);
        return {
          inlineData: {
            mimeType: getMimeType(imagePath),
            data: imageBuffer.toString('base64'),
          },
        };
      })
    );

    // Build the final instruction
    const baseInstruction = options?.identityInstructions ||
      (scenario === 'character' ? CHARACTER_CONSISTENCY_PROMPT : REFERENCE_CONSISTENCY_PROMPT);
    let finalInstruction = baseInstruction + scenarioPrompt;

    // Add master style for consistent art direction
    const styledPrompt = this.buildFinalPrompt(finalInstruction, scenario, resolvedOptions);

    // Add negative prompts
    const negativePrompts = [
      ...config.artStyle.negativePrompts,
      ...(options?.negativePrompt ? [options.negativePrompt] : []),
    ];
    if (negativePrompts.length > 0) {
      finalInstruction = `${styledPrompt}\n\nAvoid: ${negativePrompts.join(', ')}`;
    } else {
      finalInstruction = styledPrompt;
    }

    const candidateCount = Math.max(1, resolvedOptions.candidateCount ?? googleConfig.defaultCandidateCount ?? 1);
    const generationConfig: Record<string, any> = { candidateCount: Math.min(candidateCount, 1) };
    const allowedResponseMimeTypes = new Set([
      'text/plain',
      'application/json',
      'application/xml',
      'application/yaml',
      'text/x.enum',
    ]);
    const responseMimeType = resolvedOptions.responseMimeType || googleConfig.defaultResponseMimeType;
    if (responseMimeType && allowedResponseMimeTypes.has(responseMimeType)) {
      generationConfig.responseMimeType = responseMimeType;
    }

    if (resolvedOptions.temperature !== undefined) generationConfig.temperature = resolvedOptions.temperature;
    if (resolvedOptions.topP !== undefined) generationConfig.topP = resolvedOptions.topP;
    if (resolvedOptions.topK !== undefined) generationConfig.topK = resolvedOptions.topK;
    if (resolvedOptions.seed !== undefined) generationConfig.seed = resolvedOptions.seed;

    const imageConfig: Record<string, any> = {};
    if (resolvedOptions.aspectRatio) imageConfig.aspectRatio = resolvedOptions.aspectRatio;
    if (resolvedOptions.imageSize) imageConfig.imageSize = resolvedOptions.imageSize;

    const safetySettings = normalizeSafetySettings(resolvedOptions.safetySettings || googleConfig.safetySettings);

    // Rate limiting
    const now = Date.now();
    const timeSinceLastGeneration = now - this.lastGenerationTime;
    if (timeSinceLastGeneration < RATE_LIMIT_DELAY && this.lastGenerationTime > 0) {
      await sleep(RATE_LIMIT_DELAY - timeSinceLastGeneration);
    }

    // Build multimodal content: reference images first, then text instruction
    const response = await this.google.models.generateContent({
      model: modelName,
      contents: [
        {
          role: 'user',
          parts: [
            ...imageParts,
            { text: finalInstruction },
          ],
        },
      ],
      config: {
        ...generationConfig,
        ...(Object.keys(imageConfig).length > 0 ? { imageConfig } : {}),
        ...(safetySettings?.length ? { safetySettings } : {}),
        responseModalities: ['IMAGE'],
      },
    });

    const part = response.candidates?.[0]?.content?.parts?.[0];

    if (!part || !part.inlineData || !part.inlineData.data) {
      throw new Error('No image data returned from Google Gemini reference generation');
    }

    // Save the generated image
    const buffer = Buffer.from(part.inlineData.data, 'base64');
    const safeBase =
      (outputBaseName || 'character-variation')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '')
        .slice(0, 80) || 'character-variation';
    const imagePath = join(config.paths.imagesDir, `${safeBase}-${Date.now()}.png`);

    await writeFile(imagePath, buffer);

    // Update rate limiting
    this.lastGenerationTime = Date.now();

    return {
      path: imagePath,
      prompt: finalInstruction,
      provider: 'google',
      model: modelName,
      createdAt: new Date().toISOString(),
    };
  }

  private buildCharacterPrompt(character: Character, options?: ImageGenerationOptions): string {
    const config = getConfig();
    const parts: string[] = [];

    // Base description
    parts.push(`Portrait of ${character.name}`);

    // Physical appearance
    if (character.appearance) {
      const { age, height, build, hair, eyes, distinguishingFeatures, clothing } = character.appearance;
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
      // Extract mood from personality
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
    parts.push(options?.style || config.artStyle.description);

    return parts.join(', ');
  }

  private buildLocationPrompt(
    location: Location,
    options?: ImageGenerationOptions & { timeOfDay?: string; mood?: string }
  ): string {
    const config = getConfig();
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

    // Note: Art style is now handled by buildFinalPrompt via master style
    // Legacy: only add description if explicitly requested via options.style
    if (options?.style) {
      parts.push(options.style);
    }

    return parts.join(', ');
  }

  /**
   * Detect whether a location should use interior or exterior style
   * based on keyword analysis of its name, type, description, and atmosphere
   */
  private detectLocationScenario(location: Location): 'location' | 'exterior' {
    const searchText = [
      location.name,
      location.type,
      location.description,
      location.atmosphere
    ].filter(Boolean).join(' ').toLowerCase();

    // Count keyword matches
    const exteriorScore = EXTERIOR_KEYWORDS.filter(k => searchText.includes(k)).length;
    const interiorScore = INTERIOR_KEYWORDS.filter(k => searchText.includes(k)).length;

    // Exterior if more exterior keywords, otherwise default to location (interior)
    return exteriorScore > interiorScore ? 'exterior' : 'location';
  }

  /**
   * Apply scenario-aware defaults and provider defaults for generation options
   */
  private resolveScenarioOptions(
    options: ImageGenerationOptions | undefined,
    scenario: ImageScenario,
    provider: ImageProvider
  ): ImageGenerationOptions {
    const merged: ImageGenerationOptions = { ...(options || {}) };

    if (provider === 'google') {
      const config = getConfig();
      const googleConfig = config.imageGeneration.providers.google;
      const baseScenarioDefaults = SCENARIO_DEFAULTS[scenario] || SCENARIO_DEFAULTS.generic;
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
   */
  private buildFinalPrompt(
    basePrompt: string,
    scenario: ImageScenario,
    options?: ImageGenerationOptions
  ): string {
    // If explicit style override, use legacy behavior
    if (options?.style) {
      return `${basePrompt}, ${options.style}`;
    }

    const parts: string[] = [basePrompt];

    // Add scenario-specific style
    const scenarioStyle = MASTER_STYLE.scenarios[scenario as keyof typeof MASTER_STYLE.scenarios];
    if (scenarioStyle) {
      parts.push(scenarioStyle);
    }

    // Add universal suffix
    parts.push(MASTER_STYLE.universalSuffix);

    // Add artist references if enabled
    if (MASTER_STYLE.useArtistReferences && MASTER_STYLE.artistReferences.length > 0) {
      parts.push(`Art by ${MASTER_STYLE.artistReferences.join(', ')}`);
    }

    return parts.join(', ');
  }

  private async generate(
    prompt: string,
    filename: string,
    options?: ImageGenerationOptions,
    scenario: ImageScenario = 'generic'
  ): Promise<GeneratedImage> {
    const config = getConfig();
    // Use provider from options if specified, otherwise use default
    const provider = options?.provider || config.imageGeneration.defaultProvider;
    const resolvedOptions = this.resolveScenarioOptions(options, scenario, provider);

    // Apply master style to create final prompt
    const finalPrompt = this.buildFinalPrompt(prompt, scenario, resolvedOptions);

    // Rate limiting: wait if we generated too recently
    const now = Date.now();
    const timeSinceLastGeneration = now - this.lastGenerationTime;
    if (timeSinceLastGeneration < RATE_LIMIT_DELAY && this.lastGenerationTime > 0) {
      await sleep(RATE_LIMIT_DELAY - timeSinceLastGeneration);
    }

    // Add negative prompts
    const negativePrompts = [
      ...config.artStyle.negativePrompts,
      ...(options?.negativePrompt ? [options.negativePrompt] : []),
    ];

    let imagePath: string;
    let model: string;

    switch (provider) {
      case 'openai':
        ({ path: imagePath, model } = await this.generateWithOpenAI(finalPrompt, filename, negativePrompts, resolvedOptions));
        break;

      case 'google':
        ({ path: imagePath, model } = await this.generateWithGoogle(finalPrompt, filename, negativePrompts, resolvedOptions));
        break;

      default:
        throw new Error(`Unknown image provider: ${provider}`);
    }

    // Update last generation time for rate limiting
    this.lastGenerationTime = Date.now();

    return {
      path: imagePath,
      prompt: finalPrompt,
      provider,
      model,
      createdAt: new Date().toISOString(),
    };
  }

  private async generateWithGoogle(
    prompt: string,
    filename: string,
    negativePrompts: string[],
    options?: ImageGenerationOptions
  ): Promise<{ path: string; model: string }> {
    if (!this.google) {
      throw new Error('Google GenAI not configured. Add API key to config.');
    }

    const config = getConfig();
    const googleConfig = config.imageGeneration.providers.google!;
    // Prefer the latest image-capable Gemini model; fall back to config or explicit override
    let modelName = options?.model || googleConfig.model || 'gemini-3-pro-image-preview';
    // Backward-compatibility: upgrade deprecated preview model name to image-preview
    if (modelName === 'gemini-3-pro-preview') {
      modelName = 'gemini-3-pro-image-preview';
    }

    const candidateCount = Math.max(1, options?.candidateCount ?? googleConfig.defaultCandidateCount ?? 1);
    const generationConfig: Record<string, any> = { candidateCount };
    const allowedResponseMimeTypes = new Set([
      'text/plain',
      'application/json',
      'application/xml',
      'application/yaml',
      'text/x.enum',
    ]);
    const responseMimeType = options?.responseMimeType || googleConfig.defaultResponseMimeType;
    if (responseMimeType && allowedResponseMimeTypes.has(responseMimeType)) {
      generationConfig.responseMimeType = responseMimeType;
    }

    if (options?.temperature !== undefined) generationConfig.temperature = options.temperature;
    if (options?.topP !== undefined) generationConfig.topP = options.topP;
    if (options?.topK !== undefined) generationConfig.topK = options.topK;
    if (options?.seed !== undefined) generationConfig.seed = options.seed;

    const imageConfig: Record<string, any> = {};
    if (options?.aspectRatio) imageConfig.aspectRatio = options.aspectRatio;
    if (options?.imageSize) imageConfig.imageSize = options.imageSize;

    const safetySettings = normalizeSafetySettings(options?.safetySettings || googleConfig.safetySettings);

    // Embed negative prompts in the prompt (Gemini doesn't have native negative prompt support)
    const enhancedPrompt = negativePrompts.length > 0
      ? `${prompt}\n\nAvoid: ${negativePrompts.join(', ')}`
      : prompt;

    // Gemini image-preview models generate via generateContent with IMAGE response
    const response = await this.google.models.generateContent({
      model: modelName,
      contents: [
        {
          role: 'user',
          parts: [{ text: enhancedPrompt }],
        },
      ],
      config: {
        ...generationConfig,
        ...(Object.keys(imageConfig).length > 0 ? { imageConfig } : {}),
        ...(safetySettings?.length ? { safetySettings } : {}),
        responseModalities: ['IMAGE'],
      },
    });

    const part = response.candidates?.[0]?.content?.parts?.[0];
    
    if (!part || !part.inlineData || !part.inlineData.data) {
      throw new Error('No image data returned from Google Gemini');
    }

    const buffer = Buffer.from(part.inlineData.data, 'base64');
    const timestamp = new Date().toISOString().split('T')[0];
    const imagePath = join(config.paths.imagesDir, `${filename}-${timestamp}.png`);

    await writeFile(imagePath, buffer);

    return { path: imagePath, model: modelName };
  }

  private async generateWithOpenAI(
    prompt: string,
    filename: string,
    negativePrompts: string[],
    options?: ImageGenerationOptions
  ): Promise<{ path: string; model: string }> {
    if (!this.openai) {
      throw new Error('OpenAI not configured. Add API key to config.');
    }

    const config = getConfig();
    const openaiConfig = config.imageGeneration.providers.openai!;

    // Embed negative prompts in the prompt (OpenAI gpt-image/DALL-E don't have native support)
    const enhancedPrompt = negativePrompts.length > 0
      ? `${prompt}\n\nAvoid: ${negativePrompts.join(', ')}`
      : prompt;

    // Use model from options if specified, otherwise fall back to config default
    const modelName = options?.model || openaiConfig.model || 'chatgpt-image-latest';

    const response = await this.openai.images.generate({
      model: modelName,
      prompt: enhancedPrompt,
      n: 1,
      size: (options?.size || openaiConfig.defaultSize || '1024x1024') as any,
      quality: options?.quality || openaiConfig.defaultQuality || 'standard',
      ...(modelName.startsWith('gpt-image') ? {} : { response_format: 'b64_json' }),
    });

    const imagePayload = response.data?.[0];
    const imageData = imagePayload?.b64_json || (imagePayload as any)?.image_base64;
    if (!imageData) {
      throw new Error('No image data returned from OpenAI');
    }

    const buffer = Buffer.from(imageData, 'base64');
    const timestamp = new Date().toISOString().split('T')[0];
    const imagePath = join(config.paths.imagesDir, `${filename}-${timestamp}.png`);

    await writeFile(imagePath, buffer);

    return { path: imagePath, model: modelName };
  }


}

// Singleton
let imageServiceInstance: ImageService | null = null;

export function initImageService(): ImageService {
  imageServiceInstance = new ImageService();
  return imageServiceInstance;
}

export function getImageService(): ImageService {
  if (!imageServiceInstance) {
    throw new Error('ImageService not initialized. Call initImageService() first.');
  }
  return imageServiceInstance;
}
