/**
 * Single Image Generation API Endpoint
 *
 * POST /api/images/generate
 *
 * Generates a single image for a character, location, or chapter scene.
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '$lib/server/db/schema';
import { ImageGenerationService } from '$lib/server/ai/image-generation-service';
import type { ImageGenerationRequest } from '$lib/server/ai/image-generation-service';

export const POST: RequestHandler = async ({ request, platform }) => {
	try {
		// Parse request body
		const body = await request.json() as ImageGenerationRequest;

		// Validate platform bindings
		if (!platform?.env?.DB) {
			return json({ error: 'Database not available' }, { status: 500 });
		}

		if (!platform?.env?.AI) {
			return json({ error: 'AI binding not available' }, { status: 500 });
		}

		// Get Cloudflare configuration from environment
		const cloudflareConfig = {
			accountId: platform.env.CLOUDFLARE_ACCOUNT_ID || '',
			apiToken: platform.env.CLOUDFLARE_API_TOKEN || '',
			accountHash: platform.env.CLOUDFLARE_ACCOUNT_HASH || '',
		};

		if (!cloudflareConfig.accountId || !cloudflareConfig.apiToken || !cloudflareConfig.accountHash) {
			return json({ error: 'Cloudflare configuration incomplete' }, { status: 500 });
		}

		// Initialize service
		const db = drizzle(platform.env.DB, { schema });
		const service = new ImageGenerationService(
			db,
			platform.env.AI,
			cloudflareConfig
		);

		// Validate request
		const validation = service.validateRequest(body);
		if (!validation.valid) {
			return json(
				{
					error: 'Invalid request',
					details: validation.errors,
				},
				{ status: 400 }
			);
		}

		// Generate image
		const result = await service.generateImage(body);

		if (!result.success) {
			return json(
				{
					error: result.error,
					warnings: result.warnings,
				},
				{ status: 500 }
			);
		}

		// Return success response
		return json({
			success: true,
			assetId: result.assetId,
			cloudflareId: result.cloudflareId,
			uploadUrl: result.uploadUrl,
			generationRun: result.generationRun,
		});
	} catch (error) {
		console.error('Image generation error:', error);
		return json(
			{
				error: 'Internal server error',
				details: error instanceof Error ? error.message : String(error),
			},
			{ status: 500 }
		);
	}
};
