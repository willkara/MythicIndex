/**
 * OpenAI DALL-E image generation provider
 */

import OpenAI from 'openai';
import { writeFile } from 'fs/promises';
import { createReadStream } from 'fs';
import { join } from 'path';
import type { Config } from '../../../types/config.js';
import type { ImageGenerationOptions, ImageEditResult, ImageEditOptions } from '../types.js';
import { sanitizeFilename, getTimestamp } from '../utils.js';

export class OpenAIProvider {
  private client: OpenAI;
  private config: Config;

  constructor(apiKey: string, config: Config) {
    this.client = new OpenAI({ apiKey });
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
    const openaiConfig = this.config.imageGeneration.providers.openai!;

    // Embed negative prompts (OpenAI doesn't have native support)
    const enhancedPrompt =
      negativePrompts.length > 0 ? `${prompt}\n\nAvoid: ${negativePrompts.join(', ')}` : prompt;

    const modelName = options?.model || openaiConfig.model || 'chatgpt-image-latest';

    const response = await this.client.images.generate({
      model: modelName,
      prompt: enhancedPrompt,
      n: 1,
      size: (options?.size ||
        openaiConfig.defaultSize ||
        '1024x1024') as OpenAI.ImageGenerateParams['size'],
      quality: options?.quality || openaiConfig.defaultQuality || 'standard',
      ...(modelName.startsWith('gpt-image') ? {} : { response_format: 'b64_json' }),
    });

    const imagePayload = response.data?.[0];
    const imageData = imagePayload?.b64_json;
    if (!imageData) {
      throw new Error('No image data returned from OpenAI');
    }

    const buffer = Buffer.from(imageData, 'base64');
    const timestamp = getTimestamp();
    const targetDir = outputDir || this.config.paths.imagesDir;
    const imagePath = join(targetDir, `${filename}-${timestamp}.png`);

    await writeFile(imagePath, buffer);

    return { path: imagePath, model: modelName };
  }

  /**
   * Edit an existing image
   */
  async edit(
    sourceImagePath: string,
    editInstruction: string,
    options?: ImageEditOptions
  ): Promise<ImageEditResult> {
    const openaiConfig = this.config.imageGeneration.providers.openai!;
    const modelName = options?.model || openaiConfig.model || 'gpt-image-1.5';
    const size = (options?.size ||
      openaiConfig.defaultSize ||
      '1024x1024') as OpenAI.ImageEditParams['size'];

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

    const editPayload = {
      model: modelName,
      prompt: instruction,
      image: createReadStream(sourceImagePath),
      size,
      response_format: 'b64_json' as const,
      mask: options?.maskPath ? createReadStream(options.maskPath) : undefined,
    };

    const response = await this.client.images.edit(editPayload);

    const imagePayload = response.data?.[0];
    const imageData = imagePayload?.b64_json;
    if (!imageData) {
      throw new Error('No image data returned from OpenAI image edit');
    }

    const buffer = Buffer.from(imageData, 'base64');
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
      provider: 'openai',
      model: modelName,
      createdAt: new Date().toISOString(),
      sourceImage: sourceImagePath,
      editInstruction,
    };
  }
}
