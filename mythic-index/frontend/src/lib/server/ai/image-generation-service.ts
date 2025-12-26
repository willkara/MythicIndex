/**
 * Image Generation Service - Main orchestrator
 *
 * Orchestrates the complete image generation workflow:
 * 1. Compile prompt from entity data
 * 2. Render prompt to text
 * 3. Generate image with AI provider
 * 4. Upload to Cloudflare Images
 * 5. Record generation run in database
 *
 * Supports both single and batch generation.
 */

import { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '$lib/server/db/schema';
import { PromptCompiler } from './prompt-compiler';
import { renderPrompt } from './prompt-renderer';
import { ImageGenerator, type GenerationOptions } from './image-generator';
import { CloudflareImagesService } from './cloudflare-images';
import type { CompilerOptions, GenerationRun } from './types';

/**
 * Single image generation request
 */
export interface ImageGenerationRequest {
	entityType: 'character' | 'location' | 'chapter';
	entitySlug: string;
	sceneId?: string; // For chapter scenes
	templateSlug?: string;
	provider?: 'workers-ai' | 'google' | 'openai';
	quality?: 'standard' | 'high';
	aspectRatio?: string;
	size?: string;
}

/**
 * Image generation result
 */
export interface ImageGenerationResult {
	success: boolean;
	assetId?: string;
	cloudflareId?: string;
	uploadUrl?: string;
	generationRun?: GenerationRun;
	error?: string;
	warnings?: string[];
}

/**
 * Image Generation Service
 */
export class ImageGenerationService {
	private db: DrizzleD1Database<typeof schema>;
	private compiler: PromptCompiler;
	private generator: ImageGenerator;
	private imagesService: CloudflareImagesService;

	constructor(
		db: DrizzleD1Database<typeof schema>,
		aiBinding?: Ai,
		cloudflareConfig?: {
			accountId: string;
			apiToken: string;
			accountHash: string;
		}
	) {
		this.db = db;
		this.compiler = new PromptCompiler(db);
		this.generator = new ImageGenerator(
			aiBinding,
			cloudflareConfig?.accountId,
			cloudflareConfig?.apiToken
		);
		if (cloudflareConfig) {
			this.imagesService = new CloudflareImagesService(
				cloudflareConfig.accountId,
				cloudflareConfig.apiToken,
				cloudflareConfig.accountHash,
				db
			);
		} else {
			throw new Error('Cloudflare configuration required for ImageGenerationService');
		}
	}

	/**
	 * Generate a single image
	 */
	async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
		try {
			// Step 1: Compile prompt from entity data
			const compilerOptions: CompilerOptions = {
				templateSlug: request.templateSlug,
				aspectRatio: request.aspectRatio,
				size: request.size,
				quality: request.quality,
			};

			let ir;
			if (request.entityType === 'character') {
				ir = await this.compiler.compileCharacterPortrait(request.entitySlug, compilerOptions);
			} else if (request.entityType === 'location') {
				ir = await this.compiler.compileLocationOverview(request.entitySlug, compilerOptions);
			} else if (request.entityType === 'chapter' && request.sceneId) {
				ir = await this.compiler.compileChapterScene(
					request.entitySlug,
					request.sceneId,
					compilerOptions
				);
			} else {
				return {
					success: false,
					error: 'Invalid entity type or missing scene ID for chapter',
				};
			}

			// Step 2: Render prompt to text
			const rendered = renderPrompt(ir);

			// Step 3: Generate image with AI provider
			const generationOptions: GenerationOptions = {
				provider: request.provider || 'workers-ai',
				quality: request.quality || 'standard',
			};

			const generationResult = await this.generator.generate(rendered, generationOptions);

			if (!generationResult.success || !generationResult.imageData) {
				return {
					success: false,
					error: generationResult.error,
				};
			}

			// Step 4: Upload to Cloudflare Images
			const targetId = ir.target_id;
			const fileName = `${targetId}.png`;
			const filePath = `generated/${request.entityType}/${request.entitySlug}/${fileName}`;

			const uploadResult = await this.imagesService.uploadAndLinkImage(
				generationResult.imageData,
				{
					entityType: request.entityType,
					entitySlug: request.entitySlug,
					targetId,
					role: this.getRoleForEntityType(request.entityType),
					prompt: rendered.prompt,
					referenceMetadata: {
						isCanonical: false,
						referenceQuality: request.quality === 'high' ? 'high' : 'medium',
						faceReference: request.entityType === 'character',
						bodyReference: request.entityType === 'character',
						environmentReference: request.entityType === 'location',
					},
				}
			);

			if (!uploadResult.success) {
				return {
					success: false,
					error: uploadResult.error,
				};
			}

			// Step 5: Record generation run
			const generationRun = this.generator.createGenerationRun(
				targetId,
				rendered,
				generationResult,
				generationOptions,
				fileName,
				filePath
			);

			// Add target metadata
			const fullRun: GenerationRun = {
				...generationRun,
				target_metadata: {
					entity_type: request.entityType,
					entity_slug: request.entitySlug,
					image_type: ir.image_type || 'establishing',
					scene_mood: ir.scene_mood,
				},
			};

			// Store generation run in database
			await this.recordGenerationRun(fullRun);

			return {
				success: true,
				assetId: uploadResult.assetId,
				cloudflareId: uploadResult.cloudflareId,
				uploadUrl: uploadResult.uploadUrl,
				generationRun: fullRun,
			};
		} catch (error) {
			return {
				success: false,
				error: `Image generation failed: ${error}`,
			};
		}
	}

	/**
	 * Record generation run in database
	 */
	private async recordGenerationRun(run: GenerationRun): Promise<void> {
		await this.db.insert(schema.promptHistory).values({
			id: run.run_id,
			targetId: run.target_id,
			entityType: run.target_metadata?.entity_type || 'character',
			entitySlug: run.target_metadata?.entity_slug || '',
			prompt: run.prompt_used,
			negativePrompt: run.negative_prompt_used,
			irHash: run.ir_hash,
			provider: run.provider,
			model: run.model,
			status: 'completed',
			resultAssetId: null, // Could be linked if we track it
			createdAt: Date.now(),
			completedAt: Date.now(),
		});
	}

	/**
	 * Get reference role for entity type
	 */
	private getRoleForEntityType(entityType: string): string {
		switch (entityType) {
			case 'character':
				return 'portrait';
			case 'location':
				return 'location_overview';
			case 'chapter':
				return 'beat';
			default:
				return 'portrait';
		}
	}

	/**
	 * Validate generation request
	 */
	validateRequest(request: ImageGenerationRequest): {
		valid: boolean;
		errors: string[];
	} {
		const errors: string[] = [];

		if (!request.entityType) {
			errors.push('Entity type is required');
		}

		if (!request.entitySlug) {
			errors.push('Entity slug is required');
		}

		if (request.entityType === 'chapter' && !request.sceneId) {
			errors.push('Scene ID is required for chapter images');
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	}
}
