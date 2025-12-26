/**
 * Batch Image Generation Workflow - Cloudflare Workflows
 *
 * NOTE: This file contains Cloudflare Workers-specific code that only runs in the
 * Cloudflare runtime. It should NOT be imported during the Vite build process.
 *
 * For types and interfaces, import from './batch-types' instead.
 * For the service class, import from './batch-service' instead.
 */

import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import type { BatchJobParams, BatchJobStatus } from './batch-types';
import type { ImageGenerationRequest } from './image-generation-service';

/**
 * Batch Image Generation Workflow
 *
 * Durable workflow for batch image generation with:
 * - Automatic retry on failure
 * - Status polling via instance.status()
 * - Free wait time during AI generation
 * - 30-day result retention
 *
 * Handles 6-100 images optimally. For 100+ images, consider Google Batch API.
 */
export class BatchImageGenerationWorkflow extends WorkflowEntrypoint<Env, BatchJobParams> {
	async run(event: WorkflowEvent<BatchJobParams>, step: WorkflowStep) {
		const { requests, userId, concurrency = 3 } = event.payload;

		// Initialize job status
		const jobStatus: BatchJobStatus = {
			jobId: event.id,
			status: 'running',
			totalImages: requests.length,
			completedImages: 0,
			failedImages: 0,
			results: [],
			startedAt: new Date().toISOString(),
		};

		// Process images in batches
		const batches = this.chunkArray(requests, concurrency);

		for (const batch of batches) {
			// Generate images in parallel (up to concurrency limit)
			const batchResults = await Promise.all(
				batch.map((request) =>
					step.do(`generate-${request.entitySlug}`, async () => {
						return await this.generateSingleImage(request);
					})
				)
			);

			// Update status with batch results
			for (const result of batchResults) {
				jobStatus.results.push(result);
				if (result.success) {
					jobStatus.completedImages++;
				} else {
					jobStatus.failedImages++;
				}
			}

			// Small delay between batches to avoid rate limiting
			if (batches.indexOf(batch) < batches.length - 1) {
				await step.sleep('batch-delay', '2 seconds');
			}
		}

		// Mark job as completed
		jobStatus.status = jobStatus.failedImages === 0 ? 'completed' : 'failed';
		jobStatus.completedAt = new Date().toISOString();

		return jobStatus;
	}

	/**
	 * Generate a single image (called by workflow steps)
	 */
	private async generateSingleImage(
		request: ImageGenerationRequest
	): Promise<{
		entitySlug: string;
		success: boolean;
		assetId?: string;
		error?: string;
	}> {
		try {
			// Note: In actual implementation, this would call the ImageGenerationService
			// For now, this is a placeholder that would be filled in by the API endpoint

			// The service would be instantiated with proper bindings:
			// const service = new ImageGenerationService(env.DB, env.AI, { ... });
			// const result = await service.generateImage(request);

			// Placeholder return
			return {
				entitySlug: request.entitySlug,
				success: false,
				error: 'Not implemented - service instantiation needed',
			};
		} catch (error) {
			return {
				entitySlug: request.entitySlug,
				success: false,
				error: `Generation failed: ${error}`,
			};
		}
	}

	/**
	 * Chunk array into batches
	 */
	private chunkArray<T>(array: T[], size: number): T[][] {
		const chunks: T[][] = [];
		for (let i = 0; i < array.length; i += size) {
			chunks.push(array.slice(i, i + size));
		}
		return chunks;
	}
}
