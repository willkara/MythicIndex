/**
 * Google Batch Job Status API Endpoint
 *
 * GET /api/images/generate/google-batch/[jobName]
 * Returns the current status of a Google Batch job
 *
 * DELETE /api/images/generate/google-batch/[jobName]
 * Cancels a running Google Batch job
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { GoogleBatchService } from '$lib/server/ai/google-batch';

export const GET: RequestHandler = async ({ params, platform }) => {
	try {
		const { jobName } = params;

		// Validate Google credentials
		const googleProjectId = platform?.env?.GOOGLE_PROJECT_ID;
		const googleApiToken = platform?.env?.GOOGLE_API_TOKEN;

		if (!googleProjectId || !googleApiToken) {
			return json({ error: 'Google Batch API not configured' }, { status: 500 });
		}

		// Initialize Google Batch service
		const googleService = new GoogleBatchService(googleProjectId, googleApiToken);

		// Decode job name (it's URL encoded)
		const decodedJobName = decodeURIComponent(jobName);

		// Get job status
		const status = await googleService.getJobStatus(decodedJobName);

		// Transform to unified format
		const taskCounts = status.status.taskGroups?.['group0']?.counts || {};
		const totalTasks = status.taskGroups[0]?.taskCount || 0;
		const succeededTasks = parseInt(taskCounts['SUCCEEDED'] || '0');
		const failedTasks = parseInt(taskCounts['FAILED'] || '0');
		const runningTasks = parseInt(taskCounts['RUNNING'] || '0');

		return json({
			jobName: status.jobName,
			state: status.state,
			totalImages: totalTasks,
			completedImages: succeededTasks,
			failedImages: failedTasks,
			runningImages: runningTasks,
			createTime: status.createTime,
			startTime: status.startTime,
			endTime: status.endTime,
			statusEvents: status.status.statusEvents || [],
		});
	} catch (error) {
		console.error('Google Batch status error:', error);
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
		const { jobName } = params;

		// Validate Google credentials
		const googleProjectId = platform?.env?.GOOGLE_PROJECT_ID;
		const googleApiToken = platform?.env?.GOOGLE_API_TOKEN;

		if (!googleProjectId || !googleApiToken) {
			return json({ error: 'Google Batch API not configured' }, { status: 500 });
		}

		// Initialize Google Batch service
		const googleService = new GoogleBatchService(googleProjectId, googleApiToken);

		// Decode job name
		const decodedJobName = decodeURIComponent(jobName);

		// Cancel job
		const success = await googleService.cancelJob(decodedJobName);

		if (!success) {
			return json({ error: 'Failed to cancel job' }, { status: 500 });
		}

		return json({
			success: true,
			message: 'Google Batch job cancelled',
			jobName: decodedJobName,
		});
	} catch (error) {
		console.error('Google Batch cancel error:', error);
		return json(
			{
				error: 'Failed to cancel job',
				details: error instanceof Error ? error.message : String(error),
			},
			{ status: 500 }
		);
	}
};
