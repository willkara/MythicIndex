/**
 * Google Gemini image generation provider
 */

import { GoogleGenAI, type SafetySetting, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import type { Config } from '../../../types/config.js';
import type {
  ImageGenerationOptions,
  GeneratedImage,
  ImageEditResult,
  ImageEditOptions,
  CharacterConsistencyOptions,
} from '../types.js';
import { getMimeType, normalizeSafetySettings, sanitizeFilename, getTimestamp } from '../utils.js';

const DEFAULT_SAFETY_SETTINGS: SafetySetting[] = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
];

export class GoogleProvider {
  private client: GoogleGenAI;
  private config: Config;

  constructor(apiKey: string, config: Config) {
    this.client = new GoogleGenAI({ apiKey });
    this.config = config;
  }

  /**
   * Generate an image from a text prompt
   */
  async generate(
    prompt: string,
    filename: string,
    negativePrompts: string[],
    options?: ImageGenerationOptions,
    outputDir?: string
  ): Promise<{ path: string; model: string }> {
    const googleConfig = this.config.imageGeneration.providers.google!;

    // Model selection with backward compatibility
    let modelName = options?.model || googleConfig.model || 'gemini-3-pro-image-preview';
    if (modelName === 'gemini-3-pro-preview') {
      modelName = 'gemini-3-pro-image-preview';
    }

    // Build generation config
    const candidateCount = Math.max(
      1,
      options?.candidateCount ?? googleConfig.defaultCandidateCount ?? 1
    );
    const generationConfig: Record<string, unknown> = { candidateCount };

    // Only set allowed response MIME types
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

    // Image-specific config
    const imageConfig: Record<string, unknown> = {};
    if (options?.aspectRatio) imageConfig.aspectRatio = options.aspectRatio;
    if (options?.imageSize) imageConfig.imageSize = options.imageSize;

    const safetySettings =
      normalizeSafetySettings(options?.safetySettings || googleConfig.safetySettings) ||
      DEFAULT_SAFETY_SETTINGS;

    // Embed negative prompts (Gemini doesn't have native support)
    const enhancedPrompt =
      negativePrompts.length > 0 ? `${prompt}\n\nAvoid: ${negativePrompts.join(', ')}` : prompt;

    const response = await this.client.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: enhancedPrompt }] }],
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
    const timestamp = getTimestamp();
    const targetDir = outputDir || this.config.paths.imagesDir;
    const imagePath = join(targetDir, `${filename}-${timestamp}.png`);

    await writeFile(imagePath, buffer);

    return { path: imagePath, model: modelName };
  }

  /**
   * Edit an existing image using natural language instructions
   */
  async edit(
    sourceImagePath: string,
    editInstruction: string,
    options?: ImageEditOptions
  ): Promise<ImageEditResult> {
    const googleConfig = this.config.imageGeneration.providers.google!;
    let modelName = options?.model || googleConfig.model || 'gemini-3-pro-image-preview';
    if (modelName === 'gemini-3-pro-preview') {
      modelName = 'gemini-3-pro-image-preview';
    }

    // Build instruction with optional composition preservation
    let instruction = editInstruction;
    if (options?.preserveComposition) {
      instruction = `${editInstruction}. Preserve the original composition and layout as much as possible.`;
    }

    // Add negative prompts
    const negativePrompts = [
      ...this.config.artStyle.negativePrompts,
      ...(options?.negativePrompt ? [options.negativePrompt] : []),
    ];
    if (negativePrompts.length > 0) {
      instruction = `${instruction}\n\nAvoid: ${negativePrompts.join(', ')}`;
    }

    // Read source image
    const imageBuffer = await readFile(sourceImagePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = getMimeType(sourceImagePath);

    const response = await this.client.models.generateContent({
      model: modelName,
      contents: [
        {
          role: 'user',
          parts: [{ inlineData: { mimeType, data: base64Image } }, { text: instruction }],
        },
      ],
      config: { responseModalities: ['IMAGE'] },
    });

    const part = response.candidates?.[0]?.content?.parts?.[0];
    if (!part || !part.inlineData || !part.inlineData.data) {
      throw new Error('No image data returned from Google Gemini edit');
    }

    const buffer = Buffer.from(part.inlineData.data, 'base64');
    const timestamp = getTimestamp();
    const sourceFilename =
      sourceImagePath
        .split('/')
        .pop()
        ?.replace(/\.[^.]+$/, '') || 'edited';
    const requestedBase = options?.outputFilename || `${sourceFilename}-edited`;
    const safeBase = sanitizeFilename(requestedBase);
    const imagePath = join(this.config.paths.imagesDir, `${safeBase}-${timestamp}.png`);

    await writeFile(imagePath, buffer);

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

  /**
   * Generate with reference images for character consistency
   */
  async generateWithReferences(
    referenceImagePaths: string[],
    _scenarioPrompt: string,
    finalInstruction: string,
    options?: CharacterConsistencyOptions,
    outputBaseName?: string,
    outputDir?: string
  ): Promise<GeneratedImage> {
    const googleConfig = this.config.imageGeneration.providers.google!;

    let modelName = options?.model || googleConfig.model || 'gemini-3-pro-image-preview';
    if (modelName === 'gemini-3-pro-preview') {
      modelName = 'gemini-3-pro-image-preview';
    }

    // Limit references (default 14 for Gemini 3 Pro)
    const maxRefs = options?.maxReferences || 14;
    const limitedPaths = referenceImagePaths.slice(0, maxRefs);

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

    // Build generation config
    const candidateCount = Math.max(
      1,
      options?.candidateCount ?? googleConfig.defaultCandidateCount ?? 1
    );
    const generationConfig: Record<string, unknown> = {
      candidateCount: Math.min(candidateCount, 1),
    };

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

    const imageConfig: Record<string, unknown> = {};
    if (options?.aspectRatio) imageConfig.aspectRatio = options.aspectRatio;
    if (options?.imageSize) imageConfig.imageSize = options.imageSize;

    const safetySettings =
      normalizeSafetySettings(options?.safetySettings || googleConfig.safetySettings) ||
      DEFAULT_SAFETY_SETTINGS;

    const response = await this.client.models.generateContent({
      model: modelName,
      contents: [
        {
          role: 'user',
          parts: [...imageParts, { text: finalInstruction }],
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

    const buffer = Buffer.from(part.inlineData.data, 'base64');
    const safeBase = sanitizeFilename(outputBaseName || 'character-variation');
    const targetDir = outputDir || this.config.paths.imagesDir;
    const imagePath = join(targetDir, `${safeBase}-${Date.now()}.png`);

    await writeFile(imagePath, buffer);

    return {
      path: imagePath,
      prompt: finalInstruction,
      provider: 'google',
      model: modelName,
      createdAt: new Date().toISOString(),
    };
  }
}
