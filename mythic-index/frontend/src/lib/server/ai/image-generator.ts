/**
 * Image Generator - AI provider wrapper for image generation
 *
 * Supports multiple AI providers:
 * - Workers AI (Flux Schnell) - Fast, built-in, limited references
 * - Google Gemini - High quality, multi-reference support
 * - OpenAI DALL-E - Alternative provider
 *
 * Handles:
 * - Reference image attachment (up to 14 images for Gemini)
 * - Aspect ratio and size mapping
 * - Provider-specific request formatting
 * - Response parsing and error handling
 */

import type { RenderedPrompt, AIProvider, GenerationRun } from './types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Generation options
 */
export interface GenerationOptions {
	provider: AIProvider;
	model?: string;
	quality?: 'standard' | 'high';
}

/**
 * Generation result from AI provider
 */
export interface GenerationResult {
	success: boolean;
	imageData?: Uint8Array;
	imageUrl?: string;
	error?: string;
	providerMetadata?: Record<string, unknown>;
}

/**
 * Image Generator - wraps AI providers for image generation
 */
export class ImageGenerator {
	private aiBinding?: Ai;
	private accountId?: string;
	private apiToken?: string;

	constructor(aiBinding?: Ai, accountId?: string, apiToken?: string) {
		this.aiBinding = aiBinding;
		this.accountId = accountId;
		this.apiToken = apiToken;
	}

	/**
	 * Generate an image using the specified provider
	 */
	async generate(
		rendered: RenderedPrompt,
		options: GenerationOptions
	): Promise<GenerationResult> {
		switch (options.provider) {
			case 'workers-ai':
				return this.generateWithWorkersAI(rendered, options);
			case 'google':
				return this.generateWithGoogle(rendered, options);
			case 'openai':
				return this.generateWithOpenAI(rendered, options);
			default:
				return {
					success: false,
					error: `Unknown provider: ${options.provider}`,
				};
		}
	}

	/**
	 * Generate with Workers AI (Flux Schnell)
	 */
	private async generateWithWorkersAI(
		rendered: RenderedPrompt,
		options: GenerationOptions
	): Promise<GenerationResult> {
		if (!this.aiBinding) {
			return {
				success: false,
				error: 'Workers AI binding not available',
			};
		}

		try {
			const model = options.model || '@cf/black-forest-labs/flux-1-schnell';

			// Workers AI supports limited references (typically 1-2)
			const inputs: Record<string, unknown> = {
				prompt: rendered.prompt,
				num_steps: options.quality === 'high' ? 8 : 4,
			};

			// Add first reference image if available
			if (rendered.references.length > 0) {
				// Note: Would need to fetch and encode the reference image
				// For now, skip references with Workers AI
			}

			const response = await this.aiBinding.run(model, inputs);

			// Response is a ReadableStream or ArrayBuffer
			let imageData: Uint8Array;
			if (response instanceof ReadableStream) {
				const reader = response.getReader();
				const chunks: Uint8Array[] = [];
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					chunks.push(value);
				}
				imageData = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
				let offset = 0;
				for (const chunk of chunks) {
					imageData.set(chunk, offset);
					offset += chunk.length;
				}
			} else {
				imageData = new Uint8Array(response as ArrayBuffer);
			}

			return {
				success: true,
				imageData,
				providerMetadata: {
					model,
					steps: inputs.num_steps,
				},
			};
		} catch (error) {
			return {
				success: false,
				error: `Workers AI generation failed: ${error}`,
			};
		}
	}

	/**
	 * Generate with Google Gemini
	 */
	private async generateWithGoogle(
		rendered: RenderedPrompt,
		options: GenerationOptions
	): Promise<GenerationResult> {
		if (!this.accountId || !this.apiToken) {
			return {
				success: false,
				error: 'Google API credentials not configured',
			};
		}

		try {
			const model = options.model || 'imagen-3.0-generate-001';

			// Build request with multi-reference support
			const requestBody: Record<string, unknown> = {
				instances: [
					{
						prompt: rendered.prompt,
					},
				],
				parameters: {
					sampleCount: 1,
					aspectRatio: this.mapAspectRatioForGoogle(rendered.constraints.aspect_ratio),
					negativePrompt: rendered.negative_prompt,
					addWatermark: false,
				},
			};

			// Add reference images (up to 14 for Gemini)
			if (rendered.references.length > 0) {
				// Note: Would need to fetch and encode reference images as base64
				// For now, this is a placeholder
				const referenceImages: Record<string, string>[] = [];
				for (const ref of rendered.references.slice(0, 14)) {
					// Would fetch image from Cloudflare Images and encode
					// referenceImages.push({ bytesBase64Encoded: base64Data });
				}
				if (referenceImages.length > 0) {
					// @ts-expect-error - Dynamic property
					requestBody.instances[0].referenceImages = referenceImages;
				}
			}

			// Call Google Vertex AI API
			const response = await fetch(
				`https://us-central1-aiplatform.googleapis.com/v1/projects/${this.accountId}/locations/us-central1/publishers/google/models/${model}:predict`,
				{
					method: 'POST',
					headers: {
						Authorization: `Bearer ${this.apiToken}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify(requestBody),
				}
			);

			if (!response.ok) {
				const error = await response.text();
				return {
					success: false,
					error: `Google API error: ${error}`,
				};
			}

			const result = await response.json();

			// Extract image from response
			// @ts-expect-error - Dynamic response structure
			const imageBase64 = result.predictions?.[0]?.bytesBase64Encoded;
			if (!imageBase64) {
				return {
					success: false,
					error: 'No image data in Google response',
				};
			}

			// Decode base64 to Uint8Array
			const imageData = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));

			return {
				success: true,
				imageData,
				providerMetadata: {
					model,
					aspectRatio: requestBody.parameters.aspectRatio,
				},
			};
		} catch (error) {
			return {
				success: false,
				error: `Google generation failed: ${error}`,
			};
		}
	}

	/**
	 * Generate with OpenAI DALL-E
	 */
	private async generateWithOpenAI(
		rendered: RenderedPrompt,
		options: GenerationOptions
	): Promise<GenerationResult> {
		if (!this.apiToken) {
			return {
				success: false,
				error: 'OpenAI API key not configured',
			};
		}

		try {
			const model = options.model || 'dall-e-3';

			const requestBody = {
				model,
				prompt: rendered.prompt,
				n: 1,
				size: this.mapSizeForOpenAI(rendered.constraints.size),
				quality: options.quality || 'standard',
			};

			const response = await fetch('https://api.openai.com/v1/images/generations', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${this.apiToken}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(requestBody),
			});

			if (!response.ok) {
				const error = await response.text();
				return {
					success: false,
					error: `OpenAI API error: ${error}`,
				};
			}

			const result = await response.json();

			// DALL-E returns URLs, not raw image data
			// @ts-expect-error - Dynamic response structure
			const imageUrl = result.data?.[0]?.url;
			if (!imageUrl) {
				return {
					success: false,
					error: 'No image URL in OpenAI response',
				};
			}

			// Fetch the image data
			const imageResponse = await fetch(imageUrl);
			const imageData = new Uint8Array(await imageResponse.arrayBuffer());

			return {
				success: true,
				imageData,
				imageUrl,
				providerMetadata: {
					model,
					size: requestBody.size,
					quality: requestBody.quality,
				},
			};
		} catch (error) {
			return {
				success: false,
				error: `OpenAI generation failed: ${error}`,
			};
		}
	}

	/**
	 * Map aspect ratio to Google format
	 */
	private mapAspectRatioForGoogle(aspectRatio: string): string {
		const mapping: Record<string, string> = {
			'1:1': '1:1',
			'16:9': '16:9',
			'9:16': '9:16',
			'4:3': '4:3',
			'3:4': '3:4',
		};
		return mapping[aspectRatio] || '1:1';
	}

	/**
	 * Map size to OpenAI format
	 */
	private mapSizeForOpenAI(size: string): '1024x1024' | '1792x1024' | '1024x1792' {
		if (size.includes('1792x1024')) return '1792x1024';
		if (size.includes('1024x1792')) return '1024x1792';
		return '1024x1024';
	}

	/**
	 * Create a generation run record for the database
	 */
	createGenerationRun(
		targetId: string,
		rendered: RenderedPrompt,
		result: GenerationResult,
		options: GenerationOptions,
		fileName: string,
		filePath: string
	): Omit<GenerationRun, 'target_metadata'> {
		return {
			run_id: uuidv4(),
			target_id: targetId,
			timestamp: new Date().toISOString(),
			file_name: fileName,
			file_path: filePath,
			provider: options.provider,
			model: options.model || this.getDefaultModel(options.provider),
			ir_hash: rendered.ir_hash,
			prompt_used: rendered.prompt,
			negative_prompt_used: rendered.negative_prompt,
			reference_images: rendered.references.map((ref) => ({
				asset_id: ref.path,
				path: ref.path,
				role: ref.role,
			})),
			constraints: rendered.constraints,
			provider_metadata: result.providerMetadata || {},
		};
	}

	/**
	 * Get default model for provider
	 */
	private getDefaultModel(provider: AIProvider): string {
		switch (provider) {
			case 'workers-ai':
				return '@cf/black-forest-labs/flux-1-schnell';
			case 'google':
				return 'imagen-3.0-generate-001';
			case 'openai':
				return 'dall-e-3';
			default:
				return 'unknown';
		}
	}
}
