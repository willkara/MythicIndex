import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { locationCreateSchema } from '$lib/server/writer/validation';
import { createLocation } from '$lib/server/writer/crud';
import { EntityEmbeddingService } from '$lib/server/writer/embedding-entity';

const WORKSPACE_ID = 'default'; // TODO: Get from user session or env

export const actions = {
	create: async ({ request, platform }) => {
		if (!platform?.env?.DB) {
			return fail(500, { error: 'Database not available' });
		}

		try {
			const formData = await request.formData();
			const data = Object.fromEntries(formData);

			// Parse array fields from JSON strings
			const parsedData = {
				...data,
				notableLandmarks: data.notableLandmarks
					? JSON.parse(data.notableLandmarks as string)
					: [],
				keyPersonnel: data.keyPersonnel ? JSON.parse(data.keyPersonnel as string) : [],
				hazardsDangers: data.hazardsDangers ? JSON.parse(data.hazardsDangers as string) : [],
				connections: data.connections ? JSON.parse(data.connections as string) : []
			};

			// Validate data
			const validated = locationCreateSchema.parse({
				...parsedData,
				workspaceId: WORKSPACE_ID
			});

			// Create location in database
			const { id, slug } = await createLocation(platform.env.DB, validated, WORKSPACE_ID);

			// Generate embedding for location (entity-level)
			if (platform.env.AI && platform.env.VECTORIZE_INDEX) {
				const embeddingService = new EntityEmbeddingService(
					platform.env.AI,
					platform.env.VECTORIZE_INDEX
				);
				const result = await embeddingService.embedLocation(id, platform.env.DB);

				if (!result.success) {
					console.warn('Failed to generate embedding for location:', result.error);
					// Don't fail the request, just log the warning
				}
			}

			// Redirect to location view page
			throw redirect(303, `/locations/${slug}`);
		} catch (error) {
			console.error('Error creating location:', error);

			if (error instanceof Error) {
				return fail(400, {
					error: error.message,
					fields: Object.fromEntries(await request.formData())
				});
			}

			return fail(500, { error: 'Failed to create location' });
		}
	}
} satisfies Actions;
