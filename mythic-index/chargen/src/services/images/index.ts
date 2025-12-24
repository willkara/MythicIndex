/**
 * Image generation service - main entry point
 * Orchestrates Google and OpenAI providers with consistent style
 */

import { getConfig } from '../config.js';
import type { Character, Location } from '../../types/canon.js';
import type {
  GeneratedImage,
  ImageProvider,
  ImageGenerationOptions,
  ImageEditOptions,
  ImageEditResult,
  CharacterConsistencyOptions,
  ImageScenario,
} from './types.js';
import type { CompiledPromptIR, RenderedPrompt } from '../../types/prompt-ir.js';
import type { EntityType } from '../imagery-yaml.js';
import {
  getRateLimitDelayConstant,
  getCharacterConsistencyPrompt,
  getLocationConsistencyPrompt,
  getSceneConsistencyPrompt,
} from './constants.js';
import { sleep } from './utils.js';
import {
  resolveScenarioOptions,
  buildFinalPrompt,
  detectLocationScenario,
  detectScenarioFromText,
  getMasterStyleSuffix,
} from './style.js';
import { buildCharacterPrompt, buildLocationPrompt } from './prompts.js';
import { GoogleProvider } from './providers/google.js';
import { OpenAIProvider } from './providers/openai.js';
import { getImagesDir } from '../imagery-yaml.js';
import { renderPrompt } from '../prompt-renderer.js';
import { mkdir } from 'fs/promises';
import {
  logPhase,
  logStep,
  logReference,
  logProviderInfo,
  logConstraints,
  logPromptPreview,
  logTiming,
} from '../../ui/log.js';
import { showSuccess, showError } from '../../ui/display.js';

// Re-export types for convenience
export * from './types.js';
export { MASTER_STYLE, SCENARIO_DEFAULTS } from './constants.js';

export class ImageService {
  private google: GoogleProvider | null = null;
  private openai: OpenAIProvider | null = null;
  private lastGenerationTime = 0;

  constructor() {
    const config = getConfig();
    const openaiConfig = config.imageGeneration.providers.openai;
    const googleConfig = config.imageGeneration.providers.google;

    if (openaiConfig?.apiKey) {
      this.openai = new OpenAIProvider(openaiConfig.apiKey, config);
    }

    if (googleConfig?.apiKey) {
      this.google = new GoogleProvider(googleConfig.apiKey, config);
    }
  }

  /**
   * Check if a provider is available
   */
  isProviderAvailable(provider: ImageProvider): boolean {
    if (provider === 'openai') return this.openai !== null;
    if (provider === 'google') return this.google !== null;
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
   * Generate a character portrait based on their canon description
   */
  async generateCharacterPortrait(
    character: Character,
    options?: ImageGenerationOptions
  ): Promise<GeneratedImage> {
    const config = getConfig();
    const prompt = buildCharacterPrompt(character, options, config);
    return this.generate(prompt, `${character.slug}-portrait`, options, 'character');
  }

  /**
   * Generate location artwork
   */
  async generateLocationArt(
    location: Location,
    options?: ImageGenerationOptions & { timeOfDay?: string; mood?: string }
  ): Promise<GeneratedImage> {
    const config = getConfig();
    const prompt = buildLocationPrompt(location, options, config);
    const scenario = detectLocationScenario(location);
    return this.generate(prompt, `${location.slug}-art`, options, scenario);
  }

  /**
   * Generate a scene illustration from description
   */
  async generateSceneArt(
    description: string,
    options?: ImageGenerationOptions
  ): Promise<GeneratedImage> {
    const timestamp = Date.now();
    return this.generate(description, `scene-${timestamp}`, options, 'scene');
  }

  /**
   * Generate from a raw prompt
   */
  async generateFromPrompt(
    prompt: string,
    filename: string,
    options?: ImageGenerationOptions,
    scenario: ImageScenario = 'generic',
    outputDir?: string
  ): Promise<GeneratedImage> {
    return this.generate(prompt, filename, options, scenario, outputDir);
  }

  /**
   * Generate from a raw prompt with explicit provider selection
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
   * Edit an existing image using natural language instructions
   */
  async editImage(
    sourceImagePath: string,
    editInstruction: string,
    options?: ImageEditOptions
  ): Promise<ImageEditResult> {
    const provider: ImageProvider = options?.provider || 'google';

    await this.enforceRateLimit();

    let result: ImageEditResult;

    if (provider === 'google') {
      if (!this.google) {
        throw new Error('Image editing requires Google GenAI. Add API key to config.');
      }
      result = await this.google.edit(sourceImagePath, editInstruction, options);
    } else {
      if (!this.openai) {
        throw new Error('OpenAI not configured. Add API key to config.');
      }
      result = await this.openai.edit(sourceImagePath, editInstruction, options);
    }

    this.lastGenerationTime = Date.now();
    return result;
  }

  /**
   * Generate an image with reference images (multi-reference).
   */
  async generateWithReferences(
    referenceImagePaths: string[],
    scenarioPrompt: string,
    options?: CharacterConsistencyOptions,
    outputBaseName?: string,
    outputDir?: string
  ): Promise<GeneratedImage> {
    if (!this.google) {
      throw new Error('Multi-reference generation requires Google GenAI. Add API key to config.');
    }

    if (referenceImagePaths.length === 0) {
      throw new Error('At least one reference image is required for multi-reference generation');
    }

    const config = getConfig();
    const referenceMode = options?.referenceMode ?? 'character';
    const styleScenario =
      options?.styleScenario ??
      (referenceMode === 'character'
        ? 'character'
        : referenceMode === 'location'
          ? 'location'
          : 'scene');

    const resolvedOptions = resolveScenarioOptions(options, styleScenario, 'google', config);

    // Build the final instruction
    let instruction: string;
    if (options?.identityInstructions) {
      // Back-compat: treat identityInstructions as either a full template with {{scenario}}
      // or a prefix that expects scenario text appended.
      instruction = options.identityInstructions.includes('{{scenario}}')
        ? options.identityInstructions.replace('{{scenario}}', scenarioPrompt)
        : `${options.identityInstructions}${options.identityInstructions.trimEnd().endsWith(':') ? ' ' : '\n\n'}${scenarioPrompt}`;
    } else {
      instruction =
        referenceMode === 'location'
          ? getLocationConsistencyPrompt(scenarioPrompt)
          : referenceMode === 'scene'
            ? getSceneConsistencyPrompt(scenarioPrompt)
            : getCharacterConsistencyPrompt(scenarioPrompt);
    }

    // Add master style for consistent art direction
    const styledPrompt = buildFinalPrompt(instruction, styleScenario, resolvedOptions);

    // Add negative prompts
    const negativePrompts = [
      ...config.artStyle.negativePrompts,
      ...(options?.negativePrompt ? [options.negativePrompt] : []),
    ];
    const finalInstruction =
      negativePrompts.length > 0
        ? `${styledPrompt}\n\nAvoid: ${negativePrompts.join(', ')}`
        : styledPrompt;

    await this.enforceRateLimit();

    const result = await this.google.generateWithReferences(
      referenceImagePaths,
      scenarioPrompt,
      finalInstruction,
      resolvedOptions,
      outputBaseName,
      outputDir
    );

    this.lastGenerationTime = Date.now();
    return result;
  }

  /**
   * Core generation method
   */
  private async generate(
    prompt: string,
    filename: string,
    options?: ImageGenerationOptions,
    scenario: ImageScenario = 'generic',
    outputDir?: string
  ): Promise<GeneratedImage> {
    const config = getConfig();
    const provider = options?.provider || config.imageGeneration.defaultProvider;
    const resolvedOptions = resolveScenarioOptions(options, scenario, provider, config);

    // Apply master style to create final prompt
    const finalPrompt = buildFinalPrompt(prompt, scenario, resolvedOptions);

    await this.enforceRateLimit();

    // Collect negative prompts
    const negativePrompts = [
      ...config.artStyle.negativePrompts,
      ...(options?.negativePrompt ? [options.negativePrompt] : []),
    ];

    let imagePath: string;
    let model: string;

    switch (provider) {
      case 'openai':
        if (!this.openai) {
          throw new Error('OpenAI not configured. Add API key to config.');
        }
        ({ path: imagePath, model } = await this.openai.generate(
          finalPrompt,
          filename,
          negativePrompts,
          resolvedOptions,
          outputDir
        ));
        break;

      case 'google':
        if (!this.google) {
          throw new Error('Google GenAI not configured. Add API key to config.');
        }
        ({ path: imagePath, model } = await this.google.generate(
          finalPrompt,
          filename,
          negativePrompts,
          resolvedOptions,
          outputDir
        ));
        break;

      default:
        throw new Error(`Unknown image provider: ${provider}`);
    }

    this.lastGenerationTime = Date.now();

    return {
      path: imagePath,
      prompt: finalPrompt,
      provider,
      model,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Enforce rate limiting between generations
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastGeneration = now - this.lastGenerationTime;
    const rateLimitDelay = getRateLimitDelayConstant();
    if (timeSinceLastGeneration < rateLimitDelay && this.lastGenerationTime > 0) {
      const waitTime = rateLimitDelay - timeSinceLastGeneration;
      logStep(`Rate limit pause (${(waitTime / 1000).toFixed(1)}s)...`);
      await sleep(waitTime);
    }
  }
}

// ============================================================================
// IR-Based Generation
// ============================================================================

export interface IRGenerationResult {
  success: boolean;
  fileName?: string;
  filePath?: string;
  model?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export type IRReferenceMode = 'location' | 'scene';

export interface PreparedIRPrompt {
  rendered: RenderedPrompt;
  scenario: ImageScenario;
  referenceMode: IRReferenceMode;
}

function buildIRSearchText(ir: CompiledPromptIR): string {
  const parts: string[] = [];
  if (ir.title) parts.push(ir.title);
  if (ir.scene_mood) parts.push(ir.scene_mood);

  for (const sections of Object.values(ir.positive)) {
    for (const section of sections) parts.push(section.content);
  }

  return parts.join(' ');
}

export function prepareIRPrompt(entityType: EntityType, ir: CompiledPromptIR): PreparedIRPrompt {
  const hasPortraitRefs = ir.references.some((r) => r.role === 'portrait' && r.exists);
  const hasStyleRefs = ir.references.some((r) => r.role === 'style_ref' && r.exists);

  const isSceneLike =
    entityType === 'chapter' ||
    hasPortraitRefs ||
    ir.image_type === 'inhabited' ||
    ir.image_type === 'beat' ||
    ir.image_type === 'anchor' ||
    ir.image_type === 'hero' ||
    ir.image_type === 'perspective';

  const scenario: ImageScenario =
    entityType === 'chapter'
      ? 'scene'
      : isSceneLike
        ? 'scene'
        : detectScenarioFromText(buildIRSearchText(ir));

  // If style refs are present (e.g., global theme references), use scene-style instructions
  // so the model treats the references as art direction instead of strict location identity.
  const referenceMode: IRReferenceMode =
    scenario === 'scene' || hasStyleRefs ? 'scene' : 'location';

  // Reserve prompt space for the style suffix that will be injected later.
  // renderPrompt() measures length before generation; generation appends style.
  const separator = ', ';
  const styleSuffix = getMasterStyleSuffix(scenario);
  const reservedLength = styleSuffix ? styleSuffix.length + separator.length : 0;
  const maxLength = Math.max(500, 4000 - reservedLength);

  const rendered = renderPrompt(ir, {
    includeMasterStyle: false,
    maxLength,
    sectionSeparator: separator,
  });

  return { rendered, scenario, referenceMode };
}

/**
 * Generate an image from a compiled IR and rendered prompt
 * Uses Google Gemini with multi-reference support
 */
export async function generateFromIR(
  entityType: EntityType,
  entitySlug: string,
  ir: CompiledPromptIR,
  prepared?: PreparedIRPrompt
): Promise<IRGenerationResult> {
  const service = getImageService();

  if (!service.isProviderAvailable('google')) {
    showError('Google GenAI provider not configured');
    return {
      success: false,
      error: 'Google GenAI provider not configured',
    };
  }

  const { rendered, scenario, referenceMode } = prepared ?? prepareIRPrompt(entityType, ir);

  // Log generation start
  logPhase('Generating with Google Gemini...');
  logProviderInfo('google', 'gemini-3-pro-image-preview');
  logConstraints({
    aspect_ratio: ir.constraints.aspect_ratio,
    size: ir.constraints.size,
    orientation: ir.constraints.orientation,
  });

  // Ensure output directory exists
  const outputDir = getImagesDir(entityType, entitySlug);
  await mkdir(outputDir, { recursive: true });

  // Generate filename based on target
  const timestamp = Date.now();
  const fileName = `${ir.target_id}-${timestamp}.png`;

  try {
    // Get reference image paths that exist
    const referenceImages = rendered.references.filter((r) => r.path).map((r) => r.path);

    // Log references
    if (referenceImages.length > 0) {
      logStep(`References: ${referenceImages.length} image(s)`);
      for (const ref of rendered.references) {
        if (ref.path) {
          logReference(ref.role, ref.path, true);
        }
      }
    } else {
      logStep('References: none');
    }

    // Log prompt preview
    logPromptPreview(rendered.prompt);

    // Log API call start
    logStep('Calling API...');
    const apiStartTime = Date.now();

    let result: GeneratedImage;

    if (referenceImages.length > 0) {
      // Use multi-reference generation for consistency
      result = await service.generateWithReferences(
        referenceImages,
        rendered.prompt,
        {
          aspectRatio: ir.constraints.aspect_ratio,
          size: ir.constraints.size,
          negativePrompt: rendered.negative_prompt,
          referenceMode,
          styleScenario: scenario,
        },
        `${ir.target_id}-${timestamp}`,
        outputDir
      );
    } else {
      // Fall back to standard generation without references
      result = await service.generateFromPrompt(
        rendered.prompt,
        `${ir.target_id}-${timestamp}`,
        {
          provider: 'google',
          aspectRatio: ir.constraints.aspect_ratio,
          size: ir.constraints.size,
          negativePrompt: rendered.negative_prompt,
        },
        scenario,
        outputDir
      );
    }

    // Log timing and save
    const apiEndTime = Date.now();
    logTiming('Response received', apiEndTime - apiStartTime);

    const savedFileName = result.path.split('/').pop() || fileName;
    logStep(`Saving: ${savedFileName}`);
    showSuccess('Generated successfully');

    return {
      success: true,
      fileName: savedFileName,
      filePath: result.path,
      model: result.model,
      metadata: {
        prompt: result.prompt,
        provider: result.provider,
        createdAt: result.createdAt,
        referenceCount: referenceImages.length,
        scenario,
        referenceMode,
      },
    };
  } catch (error) {
    showError(`Generation failed: ${(error as Error).message}`);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

// Singleton management
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
