/**
 * Smart Batch Image Generation API Endpoint
 *
 * Automatically routes to the optimal backend based on batch size:
 * - 1-5 images: Direct generation (synchronous)
 * - 6-100 images: Cloudflare Workflows
 * - 100+ images: Google Batch API
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '$lib/server/db/schema';
import { BatchImageGenerationService, type BatchJobParams } from '$lib/server/ai/batch-service';
import { GoogleBatchService, createImageBatchJob } from '$lib/server/ai/google-batch';
import { ImageGenerationService } from '$lib/server/ai/image-generation-service';

export const POST: RequestHandler = async ({ request, platform }) => {
	try {
		// Parse request body
		const body = (await request.json()) as BatchJobParams;

		// Validate platform bindings
		if (!platform?.env?.DB) {
			return json({ error: 'Database not available' }, { status: 500 });
		}

		// Validate request
		if (!body.requests || !Array.isArray(body.requests) || body.requests.length === 0) {
			return json({ error: 'requests array is required and must not be empty' }, { status: 400 });
		}

		if (!body.userId) {
			return json({ error: 'userId is required' }, { status: 400 });
		}

		const imageCount = body.requests.length;

		// Route 1: Direct generation (1-5 images)
		if (imageCount <= 5) {
			return await handleDirectGeneration(body, platform);
		}

		// Route 2: Cloudflare Workflows (6-100 images)
		if (imageCount <= 100) {
			return await handleWorkflowBatch(body, platform);
		}

		// Route 3: Google Batch API (100+ images)
		return await handleGoogleBatch(body, platform);
	} catch (error) {
		console.error('Smart batch error:', error);
		return json(
			{
				error: 'Failed to process batch request',
				details: error instanceof Error ? error.message : String(error),
			},
			{ status: 500 }
		);
	}
};

/**
 * Handle direct generation for small batches (1-5 images)
 */
async function handleDirectGeneration(
	body: BatchJobParams,
	platform: App.Platform
): Promise<Response> {
	const db = drizzle(platform.env.DB, { schema });

	const cloudflareConfig = {
		accountId: platform.env.CLOUDFLARE_ACCOUNT_ID || '',
		apiToken: platform.env.CLOUDFLARE_API_TOKEN || '',
		accountHash: platform.env.CLOUDFLARE_ACCOUNT_HASH || '',
	};

	const service = new ImageGenerationService(db, platform.env.AI, cloudflareConfig);

	// Generate all images directly
	const results = [];
	for (const request of body.requests) {
		const result = await service.generateImage(request);
		results.push({
			entitySlug: request.entitySlug,
			success: result.success,
			assetId: result.assetId,
			error: result.error,
		});
	}

	return json({
		success: true,
		method: 'direct',
		totalImages: body.requests.length,
		results,
		message: 'Images generated directly (small batch)',
	});
}

/**
 * Handle Cloudflare Workflows for medium batches (6-100 images)
 */
async function handleWorkflowBatch(
	body: BatchJobParams,
	platform: App.Platform
): Promise<Response> {
	if (!platform?.env?.BATCH_IMAGE_WORKFLOW) {
		return json({ error: 'Workflow binding not available' }, { status: 500 });
	}

	const batchService = new BatchImageGenerationService(platform.env.BATCH_IMAGE_WORKFLOW);
	const { jobId } = await batchService.startBatchJob(body);

	return json({
		success: true,
		method: 'workflow',
		jobId,
		totalImages: body.requests.length,
		statusUrl: `/api/images/generate/batch/${jobId}`,
		message: 'Batch job started with Cloudflare Workflows',
	});
}

/**
 * Handle Google Batch API for large batches (100+ images)
 */
async function handleGoogleBatch(
	body: BatchJobParams,
	platform: App.Platform
): Promise<Response> {
	const googleProjectId = platform.env.GOOGLE_PROJECT_ID;
	const googleApiToken = platform.env.GOOGLE_API_TOKEN;

	if (!googleProjectId || !googleApiToken) {
		return json(
			{
				error: 'Google Batch API not configured',
				suggestion:
					'For batches over 100 images, configure GOOGLE_PROJECT_ID and GOOGLE_API_TOKEN',
				fallback: 'Consider splitting into multiple smaller batches (< 100 images each)',
			},
			{ status: 400 }
		);
	}

	const googleService = new GoogleBatchService(googleProjectId, googleApiToken);

	const { jobName, estimatedCost } = await createImageBatchJob(
		googleService,
		body.requests,
		body.userId,
		{
			concurrency: body.concurrency || 20,
		}
	);

	return json({
		success: true,
		method: 'google-batch',
		jobName,
		totalImages: body.requests.length,
		estimatedCost,
		statusUrl: `/api/images/generate/google-batch/${encodeURIComponent(jobName)}`,
		message: 'Batch job created with Google Batch API',
		note: 'Job will process in Google Cloud. Check status URL for updates.',
	});
}
