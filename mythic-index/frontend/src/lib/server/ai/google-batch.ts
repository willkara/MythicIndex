/**
 * Google Batch API Service - Large-scale image generation
 *
 * Uses Google Cloud Batch API for generating 100+ images efficiently.
 * Benefits over Cloudflare Workflows for large batches:
 * - Better parallelization (up to 1000 concurrent jobs)
 * - Lower cost per image at scale
 * - Built-in retry and error handling
 * - Longer execution times supported
 */

import type { ImageGenerationRequest } from './image-generation-service';
import type { RenderedPrompt } from './types';

/**
 * Google Batch job configuration
 */
export interface GoogleBatchJobConfig {
	projectId: string;
	region: string;
	jobName: string;
	requests: ImageGenerationRequest[];
	concurrency?: number;
	timeoutSeconds?: number;
}

/**
 * Google Batch job status
 */
export interface GoogleBatchJobStatus {
	jobName: string;
	state: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'DELETION_IN_PROGRESS';
	createTime: string;
	startTime?: string;
	endTime?: string;
	taskGroups: Array<{
		taskCount: number;
		taskCountPerNode: number;
		parallelism: number;
		taskSpec: any;
	}>;
	status: {
		state: string;
		statusEvents?: Array<{
			type: string;
			description: string;
			eventTime: string;
		}>;
		taskGroups?: Record<
			string,
			{
				counts: Record<string, number>;
			}
		>;
	};
}

/**
 * Batch generation result from Google
 */
export interface GoogleBatchResult {
	jobName: string;
	results: Array<{
		entitySlug: string;
		success: boolean;
		imageUrl?: string;
		error?: string;
	}>;
}

/**
 * Google Batch API Service
 */
export class GoogleBatchService {
	private projectId: string;
	private apiToken: string;
	private defaultRegion: string;

	constructor(projectId: string, apiToken: string, defaultRegion: string = 'us-central1') {
		this.projectId = projectId;
		this.apiToken = apiToken;
		this.defaultRegion = defaultRegion;
	}

	/**
	 * Create a batch job for image generation
	 */
	async createBatchJob(config: GoogleBatchJobConfig): Promise<{ jobName: string }> {
		const region = config.region || this.defaultRegion;
		const jobName = config.jobName || `image-batch-${Date.now()}`;

		// Build task spec for each image generation request
		const taskSpec = {
			runnables: [
				{
					container: {
						imageUri: 'us-docker.pkg.dev/cloudrun/container/job',
						entrypoint: '/bin/bash',
						commands: [
							'-c',
							`
# This would be replaced with actual image generation script
# For now, placeholder that calls our API endpoint
echo "Generating images..."
curl -X POST $API_ENDPOINT/api/images/generate-internal \\
  -H "Authorization: Bearer $API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d "$REQUEST_PAYLOAD"
`,
						],
						volumes: ['/mnt/disks/share'],
					},
					environment: {
						variables: {
							API_ENDPOINT: '${API_ENDPOINT}',
							API_TOKEN: '${API_TOKEN}',
							REQUEST_PAYLOAD: JSON.stringify(config.requests),
						},
					},
				},
			],
			computeResource: {
				cpuMilli: 2000, // 2 vCPU
				memoryMib: 4096, // 4 GB RAM
			},
			maxRunDuration: `${config.timeoutSeconds || 3600}s`,
			maxRetryCount: 2,
		};

		// Build job request
		const jobRequest = {
			taskGroups: [
				{
					taskCount: config.requests.length,
					taskCountPerNode: 1,
					parallelism: config.concurrency || 10,
					taskSpec,
				},
			],
			allocationPolicy: {
				instances: [
					{
						policy: {
							machineType: 'e2-standard-2',
						},
					},
				],
				location: {
					allowedLocations: [`zones/${region}-a`, `zones/${region}-b`],
				},
			},
			logsPolicy: {
				destination: 'CLOUD_LOGGING',
			},
		};

		// Create the job
		const response = await fetch(
			`https://batch.googleapis.com/v1/projects/${this.projectId}/locations/${region}/jobs?job_id=${jobName}`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${this.apiToken}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(jobRequest),
			}
		);

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Failed to create batch job: ${error}`);
		}

		const result = await response.json();
		// @ts-expect-error - Dynamic response structure
		return { jobName: result.name };
	}

	/**
	 * Get batch job status
	 */
	async getJobStatus(jobName: string): Promise<GoogleBatchJobStatus> {
		const response = await fetch(`https://batch.googleapis.com/v1/${jobName}`, {
			headers: {
				Authorization: `Bearer ${this.apiToken}`,
			},
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Failed to get job status: ${error}`);
		}

		return (await response.json()) as GoogleBatchJobStatus;
	}

	/**
	 * List all batch jobs
	 */
	async listJobs(region?: string): Promise<GoogleBatchJobStatus[]> {
		const targetRegion = region || this.defaultRegion;
		const response = await fetch(
			`https://batch.googleapis.com/v1/projects/${this.projectId}/locations/${targetRegion}/jobs`,
			{
				headers: {
					Authorization: `Bearer ${this.apiToken}`,
				},
			}
		);

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Failed to list jobs: ${error}`);
		}

		const result = await response.json();
		// @ts-expect-error - Dynamic response structure
		return result.jobs || [];
	}

	/**
	 * Cancel a batch job
	 */
	async cancelJob(jobName: string): Promise<boolean> {
		const response = await fetch(`https://batch.googleapis.com/v1/${jobName}`, {
			method: 'DELETE',
			headers: {
				Authorization: `Bearer ${this.apiToken}`,
			},
		});

		return response.ok;
	}

	/**
	 * Get job results from Cloud Storage
	 *
	 * Assumes job writes results to GCS bucket
	 */
	async getJobResults(jobName: string, bucketName: string): Promise<GoogleBatchResult> {
		// Extract job ID from job name
		const jobId = jobName.split('/').pop();

		// Fetch results file from GCS
		const response = await fetch(
			`https://storage.googleapis.com/storage/v1/b/${bucketName}/o/${jobId}-results.json?alt=media`,
			{
				headers: {
					Authorization: `Bearer ${this.apiToken}`,
				},
			}
		);

		if (!response.ok) {
			throw new Error('Results not yet available or job failed');
		}

		return (await response.json()) as GoogleBatchResult;
	}

	/**
	 * Wait for job completion with polling
	 */
	async waitForCompletion(
		jobName: string,
		options: {
			pollIntervalMs?: number;
			timeoutMs?: number;
		} = {}
	): Promise<GoogleBatchJobStatus> {
		const pollInterval = options.pollIntervalMs || 10000; // 10 seconds
		const timeout = options.timeoutMs || 3600000; // 1 hour
		const startTime = Date.now();

		while (true) {
			const status = await this.getJobStatus(jobName);

			if (status.state === 'SUCCEEDED' || status.state === 'FAILED') {
				return status;
			}

			if (Date.now() - startTime > timeout) {
				throw new Error('Job polling timeout exceeded');
			}

			// Wait before next poll
			await new Promise((resolve) => setTimeout(resolve, pollInterval));
		}
	}

	/**
	 * Estimate cost for batch job
	 *
	 * Based on Google Cloud Batch pricing:
	 * - Compute: ~$0.05/hour for e2-standard-2
	 * - Storage: Minimal for short jobs
	 * - Imagen API: ~$0.02-0.04 per image depending on settings
	 */
	estimateCost(imageCount: number, estimatedHours: number = 1): {
		computeCost: number;
		imagenCost: number;
		totalCost: number;
	} {
		const computeCostPerHour = 0.05;
		const imagenCostPerImage = 0.03; // Average

		const computeCost = computeCostPerHour * estimatedHours;
		const imagenCost = imagenCostPerImage * imageCount;
		const totalCost = computeCost + imagenCost;

		return {
			computeCost,
			imagenCost,
			totalCost,
		};
	}
}

/**
 * Helper: Create batch job for image generation requests
 */
export async function createImageBatchJob(
	service: GoogleBatchService,
	requests: ImageGenerationRequest[],
	userId: string,
	options: {
		concurrency?: number;
		timeoutSeconds?: number;
	} = {}
): Promise<{ jobName: string; estimatedCost: number }> {
	const config: GoogleBatchJobConfig = {
		projectId: '',
		region: 'us-central1',
		jobName: `image-gen-${userId}-${Date.now()}`,
		requests,
		concurrency: options.concurrency || 20,
		timeoutSeconds: options.timeoutSeconds || 7200, // 2 hours default
	};

	const { jobName } = await service.createBatchJob(config);

	// Estimate cost
	const estimatedHours = Math.ceil(requests.length / (config.concurrency || 20) / 60);
	const cost = service.estimateCost(requests.length, estimatedHours);

	return {
		jobName,
		estimatedCost: cost.totalCost,
	};
}
