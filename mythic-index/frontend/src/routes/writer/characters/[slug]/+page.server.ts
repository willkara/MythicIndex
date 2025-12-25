import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { characterUpdateSchema } from '$lib/server/writer/validation';
import { getCharacterBySlug, updateCharacter, deleteCharacter } from '$lib/server/writer/crud';
import { EntityEmbeddingService } from '$lib/server/writer/embedding-entity';

const WORKSPACE_ID = 'default'; // TODO: Get from user session or env

export const load: PageServerLoad = async ({ params, platform }) => {
	if (!platform?.env?.DB) {
		throw error(500, 'Database not available');
	}

	const character = await getCharacterBySlug(platform.env.DB, params.slug, WORKSPACE_ID);

	if (!character) {
		throw error(404, `Character not found: ${params.slug}`);
	}

	return {
		character
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
				aliases: data.aliases ? JSON.parse(data.aliases as string) : [],
				appearanceDistinguishingFeatures: data.appearanceDistinguishingFeatures
					? JSON.parse(data.appearanceDistinguishingFeatures as string)
					: [],
				personalityPositiveTraits: data.personalityPositiveTraits
					? JSON.parse(data.personalityPositiveTraits as string)
					: [],
				personalityNegativeTraits: data.personalityNegativeTraits
					? JSON.parse(data.personalityNegativeTraits as string)
					: [],
				motivations: data.motivations ? JSON.parse(data.motivations as string) : [],
				fears: data.fears ? JSON.parse(data.fears as string) : [],
				secrets: data.secrets ? JSON.parse(data.secrets as string) : [],
				signaturePhrases: data.signaturePhrases ? JSON.parse(data.signaturePhrases as string) : []
			};

			// Validate data
			const validated = characterUpdateSchema.parse({
				...parsedData,
				workspaceId: WORKSPACE_ID
			});

			// Update character in database
			await updateCharacter(platform.env.DB, params.slug, validated, WORKSPACE_ID);

			// Regenerate embedding for character (entity-level)
			if (platform.env.AI && platform.env.VECTORIZE_INDEX) {
				const char = await getCharacterBySlug(platform.env.DB, params.slug, WORKSPACE_ID);
				if (char) {
					const embeddingService = new EntityEmbeddingService(
						platform.env.AI,
						platform.env.VECTORIZE_INDEX
					);
					const result = await embeddingService.embedCharacter(char.id, platform.env.DB);

					if (!result.success) {
						console.warn('Failed to regenerate embedding for character:', result.error);
						// Don't fail the request, just log the warning
					}
				}
			}

			return {
				success: true,
				message: 'Character updated successfully'
			};
		} catch (error) {
			console.error('Error updating character:', error);

			if (error instanceof Error) {
				return fail(400, {
					error: error.message,
					fields: Object.fromEntries(await request.formData())
				});
			}

			return fail(500, { error: 'Failed to update character' });
		}
	},

	delete: async ({ params, platform }) => {
		if (!platform?.env?.DB) {
			return fail(500, { error: 'Database not available' });
		}

		try {
			// Get character to find ID for embedding deletion
			const char = await getCharacterBySlug(platform.env.DB, params.slug, WORKSPACE_ID);

			if (!char) {
				return fail(404, { error: 'Character not found' });
			}

			// Delete embedding from Vectorize first
			if (platform.env.AI && platform.env.VECTORIZE_INDEX) {
				const embeddingService = new EntityEmbeddingService(
					platform.env.AI,
					platform.env.VECTORIZE_INDEX
				);
				const result = await embeddingService.deleteEmbedding(char.id);

				if (!result.success) {
					console.warn('Failed to delete embedding for character:', result.error);
					// Continue with deletion anyway
				}
			}

			// Delete character from database
			await deleteCharacter(platform.env.DB, params.slug, WORKSPACE_ID);

			// Redirect to writer home
			throw redirect(303, '/writer');
		} catch (error) {
			console.error('Error deleting character:', error);

			if (error instanceof Error) {
				return fail(400, { error: error.message });
			}

			return fail(500, { error: 'Failed to delete character' });
		}
	}
} satisfies Actions;
