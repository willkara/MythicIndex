import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { zoneUpdateSchema } from '$lib/server/writer/validation';
import { getZoneBySlug, updateZone, deleteZone } from '$lib/server/writer/crud';
import { EntityEmbeddingService } from '$lib/server/writer/embedding-entity';

const WORKSPACE_ID = 'default'; // TODO: Get from user session or env

export const load: PageServerLoad = async ({ params, url, platform }) => {
	if (!platform?.env?.DB) {
		throw error(500, 'Database not available');
	}

	// Zone slug alone is not unique - need locationId too
	const locationId = url.searchParams.get('locationId');
	if (!locationId) {
		throw error(400, 'locationId query parameter required');
	}

	const zone = await getZoneBySlug(platform.env.DB, locationId, params.slug, WORKSPACE_ID);

	if (!zone) {
		throw error(404, `Zone not found: ${params.slug} in location ${locationId}`);
	}

	return {
		zone,
		locationId
	};
};

export const actions = {
	update: async ({ params, url, request, platform }) => {
		if (!platform?.env?.DB) {
			return fail(500, { error: 'Database not available' });
		}

		const locationId = url.searchParams.get('locationId');
		if (!locationId) {
			return fail(400, { error: 'locationId query parameter required' });
		}

		try {
			const formData = await request.formData();
			const data = Object.fromEntries(formData);

			// Parse array fields from JSON strings
			const parsedData = {
				...data,
				signatureDetails: data.signatureDetails
					? JSON.parse(data.signatureDetails as string)
					: [],
				moodAffinity: data.moodAffinity ? JSON.parse(data.moodAffinity as string) : [],
				characterAssociations: data.characterAssociations
					? JSON.parse(data.characterAssociations as string)
					: []
			};

			// Validate data
			const validated = zoneUpdateSchema.parse({
				...parsedData,
				workspaceId: WORKSPACE_ID,
				locationId // Include locationId for validation
			});

			// Update zone in database
			await updateZone(platform.env.DB, locationId, params.slug, validated, WORKSPACE_ID);

			// Regenerate embedding for zone (entity-level)
			if (platform.env.AI && platform.env.VECTORIZE_INDEX) {
				const zone = await getZoneBySlug(platform.env.DB, locationId, params.slug, WORKSPACE_ID);
				if (zone) {
					const embeddingService = new EntityEmbeddingService(
						platform.env.AI,
						platform.env.VECTORIZE_INDEX
					);
					const result = await embeddingService.embedZone(zone.id, platform.env.DB);

					if (!result.success) {
						console.warn('Failed to regenerate embedding for zone:', result.error);
						// Don't fail the request, just log the warning
					}
				}
			}

			return {
				success: true,
				message: 'Zone updated successfully'
			};
		} catch (error) {
			console.error('Error updating zone:', error);

			if (error instanceof Error) {
				return fail(400, {
					error: error.message,
					fields: Object.fromEntries(await request.formData())
				});
			}

			return fail(500, { error: 'Failed to update zone' });
		}
	},

	delete: async ({ params, url, platform }) => {
		if (!platform?.env?.DB) {
			return fail(500, { error: 'Database not available' });
		}

		const locationId = url.searchParams.get('locationId');
		if (!locationId) {
			return fail(400, { error: 'locationId query parameter required' });
		}

		try {
			// Get zone to find ID for embedding deletion
			const zone = await getZoneBySlug(platform.env.DB, locationId, params.slug, WORKSPACE_ID);

			if (!zone) {
				return fail(404, { error: 'Zone not found' });
			}

			// Delete embedding from Vectorize first
			if (platform.env.AI && platform.env.VECTORIZE_INDEX) {
				const embeddingService = new EntityEmbeddingService(
					platform.env.AI,
					platform.env.VECTORIZE_INDEX
				);
				const result = await embeddingService.deleteEmbedding(zone.id);

				if (!result.success) {
					console.warn('Failed to delete embedding for zone:', result.error);
					// Continue with deletion anyway
				}
			}

			// Delete zone from database
			await deleteZone(platform.env.DB, locationId, params.slug, WORKSPACE_ID);

			// Redirect to writer home
			throw redirect(303, '/writer');
		} catch (error) {
			console.error('Error deleting zone:', error);

			if (error instanceof Error) {
				return fail(400, { error: error.message });
			}

			return fail(500, { error: 'Failed to delete zone' });
		}
	}
} satisfies Actions;
