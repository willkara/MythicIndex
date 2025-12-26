/**
 * Batch Image Generation Service
 *
 * Service class for managing batch image generation jobs.
 * Uses Cloudflare Workflows binding for durable execution.
 *
 * Import this file instead of batch-workflow.ts to avoid cloudflare:workers import issues.
 */

import type { BatchJobParams, BatchJobStatus, IBatchImageGenerationService } from './batch-types';

// Re-export types for convenience
export type { BatchJobParams, BatchJobStatus } from './batch-types';

/**
 * Batch Service - Manages batch jobs via Cloudflare Workflows
 */
export class BatchImageGenerationService implements IBatchImageGenerationService {
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
