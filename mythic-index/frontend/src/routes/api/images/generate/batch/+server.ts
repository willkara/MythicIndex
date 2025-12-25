/**
 * Batch Image Generation API Endpoint
 *
 * POST /api/images/generate/batch
 *
 * Starts a batch image generation job using Cloudflare Workflows.
 * Returns a job ID for status polling.
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { BatchImageGenerationService, type BatchJobParams } from '$lib/server/ai/batch-workflow';

export const POST: RequestHandler = async ({ request, platform }) => {
	try {
		// Parse request body
		const body = await request.json() as BatchJobParams;

		// Validate platform bindings
		if (!platform?.env?.BATCH_IMAGE_WORKFLOW) {
			return json({ error: 'Workflow binding not available' }, { status: 500 });
		}

		// Validate request
		if (!body.requests || !Array.isArray(body.requests) || body.requests.length === 0) {
			return json({ error: 'requests array is required and must not be empty' }, { status: 400 });
		}

		if (!body.userId) {
			return json({ error: 'userId is required' }, { status: 400 });
		}

		// Check batch size limits
		if (body.requests.length > 100) {
			return json(
				{
					error: 'Batch too large',
					details: 'Maximum 100 images per batch. Consider using Google Batch API for larger batches.',
				},
				{ status: 400 }
			);
		}

		// Initialize batch service
		const batchService = new BatchImageGenerationService(platform.env.BATCH_IMAGE_WORKFLOW);

		// Start batch job
		const { jobId } = await batchService.startBatchJob(body);

		// Return job ID
		return json({
			success: true,
			jobId,
			totalImages: body.requests.length,
			statusUrl: `/api/images/generate/batch/${jobId}`,
		});
	} catch (error) {
		console.error('Batch job start error:', error);
		return json(
			{
				error: 'Failed to start batch job',
				details: error instanceof Error ? error.message : String(error),
			},
			{ status: 500 }
		);
	}
};
