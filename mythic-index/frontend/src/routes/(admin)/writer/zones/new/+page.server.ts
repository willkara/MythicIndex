import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { zoneCreateSchema } from '$lib/server/writer/validation';
import { createZone } from '$lib/server/writer/crud';
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
				signatureDetails: data.signatureDetails
					? JSON.parse(data.signatureDetails as string)
					: [],
				moodAffinity: data.moodAffinity ? JSON.parse(data.moodAffinity as string) : [],
				characterAssociations: data.characterAssociations
					? JSON.parse(data.characterAssociations as string)
					: []
			};

			// Validate data
			const validated = zoneCreateSchema.parse({
				...parsedData,
				workspaceId: WORKSPACE_ID
			});

			// Create zone in database
			const { id } = await createZone(platform.env.DB, validated, WORKSPACE_ID);

			// Generate embedding for zone (entity-level)
			if (platform.env.AI && platform.env.VECTORIZE_INDEX) {
				const embeddingService = new EntityEmbeddingService(
					platform.env.AI,
					platform.env.VECTORIZE_INDEX
				);
				const result = await embeddingService.embedZone(id, platform.env.DB);

				if (!result.success) {
					console.warn('Failed to generate embedding for zone:', result.error);
					// Don't fail the request, just log the warning
				}
			}

			// Redirect to writer home (or could redirect to location view)
			throw redirect(303, '/writer');
		} catch (error) {
			console.error('Error creating zone:', error);

			if (error instanceof Error) {
				return fail(400, {
					error: error.message,
					fields: Object.fromEntries(await request.formData())
				});
			}

			return fail(500, { error: 'Failed to create zone' });
		}
	}
} satisfies Actions;
