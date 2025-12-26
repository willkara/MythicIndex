/**
 * Batch Image Generation Types
 * Separated from workflow implementation to avoid cloudflare:workers import issues during build
 */

import type { ImageGenerationRequest } from './image-generation-service';

/**
 * Batch job parameters
 */
export interface BatchJobParams {
	requests: ImageGenerationRequest[];
	userId: string;
	concurrency?: number;
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
 * Batch Service interface - implemented by BatchImageGenerationService
 */
export interface IBatchImageGenerationService {
	startBatchJob(params: BatchJobParams): Promise<{ jobId: string }>;
	getJobStatus(jobId: string): Promise<BatchJobStatus | null>;
	cancelJob(jobId: string): Promise<boolean>;
	pauseJob(jobId: string): Promise<boolean>;
	resumeJob(jobId: string): Promise<boolean>;
}
