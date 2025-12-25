import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { chapterCreateSchema } from '$lib/server/writer/validation';
import { createChapter } from '$lib/server/writer/crud';

const WORKSPACE_ID = 'default'; // TODO: Get from user session or env

export const actions = {
	create: async ({ request, platform }) => {
		if (!platform?.env?.DB) {
			return fail(500, { error: 'Database not available' });
		}

		try {
			const formData = await request.formData();
			const data = Object.fromEntries(formData);

			// Validate data
			const validated = chapterCreateSchema.parse({
				...data,
				workspaceId: WORKSPACE_ID,
				// Convert wordCount to number if present
				wordCount: data.wordCount ? parseInt(data.wordCount as string) : undefined
			});

			// Create chapter in database
			const { id, slug } = await createChapter(platform.env.DB, validated, WORKSPACE_ID);

			// TODO: Generate embedding for chapter
			// Chapter embeddings require content block concatenation
			// This will be implemented once content is ingested via chargen CLI
			// if (platform.env.AI && platform.env.VECTORIZE_INDEX) {
			//   const embeddingService = new EntityEmbeddingService(platform.env.AI, platform.env.VECTORIZE_INDEX);
			//   const result = await embeddingService.embedChapter(id, platform.env.DB);
			// }

			// Redirect to chapter edit page for scene management
			throw redirect(303, `/writer/chapters/${slug}`);
		} catch (error) {
			console.error('Error creating chapter:', error);

			if (error instanceof Error) {
				return fail(400, {
					error: error.message,
					fields: Object.fromEntries(await request.formData())
				});
			}

			return fail(500, { error: 'Failed to create chapter' });
		}
	}
} satisfies Actions;
