/**
 * Batch Job Status API Endpoint
 *
 * GET /api/images/generate/batch/[jobId]
 *
 * Returns the current status of a batch generation job.
 * DELETE /api/images/generate/batch/[jobId]
 *
 * Cancels a running batch job.
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { BatchImageGenerationService } from '$lib/server/ai/batch-service';

export const GET: RequestHandler = async ({ params, platform }) => {
	try {
		const { jobId } = params;

		// Validate platform bindings
		if (!platform?.env?.BATCH_IMAGE_WORKFLOW) {
			return json({ error: 'Workflow binding not available' }, { status: 500 });
		}

		// Initialize batch service
		const batchService = new BatchImageGenerationService(platform.env.BATCH_IMAGE_WORKFLOW);

		// Get job status
		const status = await batchService.getJobStatus(jobId);

		if (!status) {
			return json({ error: 'Job not found' }, { status: 404 });
		}

		// Return status
		return json(status);
	} catch (error) {
		console.error('Job status error:', error);
		return json(
			{
				error: 'Failed to get job status',
				details: error instanceof Error ? error.message : String(error),
			},
			{ status: 500 }
		);
	}
};

export const DELETE: RequestHandler = async ({ params, platform }) => {
	try {
		const { jobId } = params;

		// Validate platform bindings
		if (!platform?.env?.BATCH_IMAGE_WORKFLOW) {
			return json({ error: 'Workflow binding not available' }, { status: 500 });
		}

		// Initialize batch service
		const batchService = new BatchImageGenerationService(platform.env.BATCH_IMAGE_WORKFLOW);

		// Cancel job
		const success = await batchService.cancelJob(jobId);

		if (!success) {
			return json({ error: 'Failed to cancel job' }, { status: 500 });
		}

		// Return success
		return json({ success: true, message: 'Job cancelled' });
	} catch (error) {
		console.error('Job cancel error:', error);
		return json(
			{
				error: 'Failed to cancel job',
				details: error instanceof Error ? error.message : String(error),
			},
			{ status: 500 }
		);
	}
};

export const PATCH: RequestHandler = async ({ params, request, platform }) => {
	try {
		const { jobId } = params;
		const body = await request.json();

		// Validate platform bindings
		if (!platform?.env?.BATCH_IMAGE_WORKFLOW) {
			return json({ error: 'Workflow binding not available' }, { status: 500 });
		}

		// Initialize batch service
		const batchService = new BatchImageGenerationService(platform.env.BATCH_IMAGE_WORKFLOW);

		// Handle pause/resume
		if (body.action === 'pause') {
			const success = await batchService.pauseJob(jobId);
			if (!success) {
				return json({ error: 'Failed to pause job' }, { status: 500 });
			}
			return json({ success: true, message: 'Job paused' });
		} else if (body.action === 'resume') {
			const success = await batchService.resumeJob(jobId);
			if (!success) {
				return json({ error: 'Failed to resume job' }, { status: 500 });
			}
			return json({ success: true, message: 'Job resumed' });
		}

		return json({ error: 'Invalid action' }, { status: 400 });
	} catch (error) {
		console.error('Job action error:', error);
		return json(
			{
				error: 'Failed to perform action',
				details: error instanceof Error ? error.message : String(error),
			},
			{ status: 500 }
		);
	}
};
