import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { characterCreateSchema } from '$lib/server/writer/validation';
import { createCharacter } from '$lib/server/writer/crud';

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
			const validated = characterCreateSchema.parse({
				...parsedData,
				workspaceId: WORKSPACE_ID
			});

			// Create character in database
			const { id, slug } = await createCharacter(platform.env.DB, validated, WORKSPACE_ID);

			// TODO: Generate embedding for character
			// if (platform.env.AI && platform.env.VECTORIZE_INDEX) {
			//   await embedCharacter(id, platform.env.DB, platform.env.AI, platform.env.VECTORIZE_INDEX);
			// }

			// Redirect to character view or edit page
			throw redirect(303, `/characters/${slug}`);
		} catch (error) {
			console.error('Error creating character:', error);

			if (error instanceof Error) {
				return fail(400, {
					error: error.message,
					fields: Object.fromEntries(await request.formData())
				});
			}

			return fail(500, { error: 'Failed to create character' });
		}
	}
} satisfies Actions;
