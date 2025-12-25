import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { locationUpdateSchema } from '$lib/server/writer/validation';
import { getLocationBySlug, updateLocation, deleteLocation } from '$lib/server/writer/crud';
import { EntityEmbeddingService } from '$lib/server/writer/embedding-entity';

const WORKSPACE_ID = 'default'; // TODO: Get from user session or env

export const load: PageServerLoad = async ({ params, platform }) => {
	if (!platform?.env?.DB) {
		throw error(500, 'Database not available');
	}

	const location = await getLocationBySlug(platform.env.DB, params.slug, WORKSPACE_ID);

	if (!location) {
		throw error(404, `Location not found: ${params.slug}`);
	}

	return {
		location
	};
};

export const actions = {
	update: async ({ params, request, platform }) => {
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
			const validated = locationUpdateSchema.parse({
				...parsedData,
				workspaceId: WORKSPACE_ID
			});

			// Update location in database
			await updateLocation(platform.env.DB, params.slug, validated, WORKSPACE_ID);

			// Regenerate embedding for location (entity-level)
			if (platform.env.AI && platform.env.VECTORIZE_INDEX) {
				const loc = await getLocationBySlug(platform.env.DB, params.slug, WORKSPACE_ID);
				if (loc) {
					const embeddingService = new EntityEmbeddingService(
						platform.env.AI,
						platform.env.VECTORIZE_INDEX
					);
					const result = await embeddingService.embedLocation(loc.id, platform.env.DB);

					if (!result.success) {
						console.warn('Failed to regenerate embedding for location:', result.error);
						// Don't fail the request, just log the warning
					}
				}
			}

			return {
				success: true,
				message: 'Location updated successfully'
			};
		} catch (error) {
			console.error('Error updating location:', error);

			if (error instanceof Error) {
				return fail(400, {
					error: error.message,
					fields: Object.fromEntries(await request.formData())
				});
			}

			return fail(500, { error: 'Failed to update location' });
		}
	},

	delete: async ({ params, platform }) => {
		if (!platform?.env?.DB) {
			return fail(500, { error: 'Database not available' });
		}

		try {
			// Get location to find ID for embedding deletion
			const loc = await getLocationBySlug(platform.env.DB, params.slug, WORKSPACE_ID);

			if (!loc) {
				return fail(404, { error: 'Location not found' });
			}

			// Delete embedding from Vectorize first
			if (platform.env.AI && platform.env.VECTORIZE_INDEX) {
				const embeddingService = new EntityEmbeddingService(
					platform.env.AI,
					platform.env.VECTORIZE_INDEX
				);
				const result = await embeddingService.deleteEmbedding(loc.id);

				if (!result.success) {
					console.warn('Failed to delete embedding for location:', result.error);
					// Continue with deletion anyway
				}
			}

			// Delete location from database
			await deleteLocation(platform.env.DB, params.slug, WORKSPACE_ID);

			// Redirect to writer home
			throw redirect(303, '/writer');
		} catch (error) {
			console.error('Error deleting location:', error);

			if (error instanceof Error) {
				return fail(400, { error: error.message });
			}

			return fail(500, { error: 'Failed to delete location' });
		}
	}
} satisfies Actions;
