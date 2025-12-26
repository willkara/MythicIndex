/**
 * Batch Image Generation Workflow - Cloudflare Workflows
 *
 * Durable workflow for batch image generation with:
 * - Automatic retry on failure
 * - Status polling via instance.status()
 * - Free wait time during AI generation
 * - 30-day result retention
 *
 * Handles 6-100 images optimally. For 100+ images, consider Google Batch API.
 */

import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import type { ImageGenerationRequest } from './image-generation-service';

/**
 * Batch job parameters
 */
export interface BatchJobParams {
	requests: ImageGenerationRequest[];
	userId: string;
	concurrency?: number; // How many images to generate in parallel
}

/**
 * Batch job status
 */
export interface BatchJobStatus {
	jobId: string;
	status: 'queued' | 'running' | 'completed' | 'failed';
	totalImages: number;
	completedImages: number;
	failedImages: number;
	results: Array<{
		entitySlug: string;
		success: boolean;
		assetId?: string;
		error?: string;
	}>;
	startedAt?: string;
	completedAt?: string;
}

/**
 * Batch Image Generation Workflow
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

/**
 * Batch Service - Manages batch jobs
 */
export class BatchImageGenerationService {
	private workflowBinding: Workflow;

	constructor(workflowBinding: Workflow) {
		this.workflowBinding = workflowBinding;
	}

	/**
	 * Start a batch generation job
	 */
	async startBatchJob(params: BatchJobParams): Promise<{ jobId: string }> {
		const instance = await this.workflowBinding.create({
			params,
		});

		return { jobId: instance.id };
	}

	/**
	 * Get batch job status
	 */
	async getJobStatus(jobId: string): Promise<BatchJobStatus | null> {
		try {
			const instance = await this.workflowBinding.get(jobId);
			const status = await instance.status();

			if (status.status === 'complete') {
				// Workflow completed - return final status
				return status.output as BatchJobStatus;
			} else if (status.status === 'running' || status.status === 'queued') {
				// Workflow still running - return partial status
				return {
					jobId,
					status: status.status === 'running' ? 'running' : 'queued',
					totalImages: 0, // Would need to be tracked in workflow state
					completedImages: 0,
					failedImages: 0,
					results: [],
				};
			} else if (status.status === 'errored' || status.status === 'terminated') {
				return {
					jobId,
					status: 'failed',
					totalImages: 0,
					completedImages: 0,
					failedImages: 0,
					results: [],
					completedAt: new Date().toISOString(),
				};
			}

			return null;
		} catch (error) {
			console.error('Failed to get job status:', error);
			return null;
		}
	}

	/**
	 * Cancel a batch job
	 */
	async cancelJob(jobId: string): Promise<boolean> {
		try {
			const instance = await this.workflowBinding.get(jobId);
			await instance.terminate();
			return true;
		} catch (error) {
			console.error('Failed to cancel job:', error);
			return false;
		}
	}

	/**
	 * Pause a batch job
	 */
	async pauseJob(jobId: string): Promise<boolean> {
		try {
			const instance = await this.workflowBinding.get(jobId);
			await instance.pause();
			return true;
		} catch (error) {
			console.error('Failed to pause job:', error);
			return false;
		}
	}

	/**
	 * Resume a paused batch job
	 */
	async resumeJob(jobId: string): Promise<boolean> {
		try {
			const instance = await this.workflowBinding.get(jobId);
			await instance.resume();
			return true;
		} catch (error) {
			console.error('Failed to resume job:', error);
			return false;
		}
	}
}
