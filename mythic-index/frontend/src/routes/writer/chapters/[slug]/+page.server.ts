import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { chapterUpdateSchema } from '$lib/server/writer/validation';
import { getChapterBySlug, updateChapter, deleteChapter } from '$lib/server/writer/crud';

const WORKSPACE_ID = 'default'; // TODO: Get from user session or env

export const load: PageServerLoad = async ({ params, platform }) => {
	if (!platform?.env?.DB) {
		throw error(500, 'Database not available');
	}

	const chapter = await getChapterBySlug(platform.env.DB, params.slug, WORKSPACE_ID);

	if (!chapter) {
		throw error(404, `Chapter not found: ${params.slug}`);
	}

	// TODO: Load scenes for this chapter
	// const scenes = await listScenesForChapter(platform.env.DB, chapter.id, WORKSPACE_ID);

	return {
		chapter
		// scenes
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

			// Validate data
			const validated = chapterUpdateSchema.parse({
				...data,
				workspaceId: WORKSPACE_ID,
				// Convert wordCount to number if present
				wordCount: data.wordCount ? parseInt(data.wordCount as string) : undefined
			});

			// Update chapter in database
			await updateChapter(platform.env.DB, params.slug, validated, WORKSPACE_ID);

			// TODO: Regenerate embedding for chapter
			// if (platform.env.AI && platform.env.VECTORIZE_INDEX) {
			//   const chapter = await getChapterBySlug(platform.env.DB, params.slug, WORKSPACE_ID);
			//   if (chapter) {
			//     const embeddingService = new EntityEmbeddingService(platform.env.AI, platform.env.VECTORIZE_INDEX);
			//     const result = await embeddingService.embedChapter(chapter.id, platform.env.DB);
			//   }
			// }

			return {
				success: true,
				message: 'Chapter updated successfully'
			};
		} catch (error) {
			console.error('Error updating chapter:', error);

			if (error instanceof Error) {
				return fail(400, {
					error: error.message,
					fields: Object.fromEntries(await request.formData())
				});
			}

			return fail(500, { error: 'Failed to update chapter' });
		}
	},

	delete: async ({ params, platform }) => {
		if (!platform?.env?.DB) {
			return fail(500, { error: 'Database not available' });
		}

		try {
			// Get chapter to find ID for embedding deletion
			const chapter = await getChapterBySlug(platform.env.DB, params.slug, WORKSPACE_ID);

			if (!chapter) {
				return fail(404, { error: 'Chapter not found' });
			}

			// TODO: Delete embedding from Vectorize
			// if (platform.env.AI && platform.env.VECTORIZE_INDEX) {
			//   const embeddingService = new EntityEmbeddingService(platform.env.AI, platform.env.VECTORIZE_INDEX);
			//   const result = await embeddingService.deleteEmbedding(chapter.id);
			// }

			// Delete chapter from database
			await deleteChapter(platform.env.DB, params.slug, WORKSPACE_ID);

			// Redirect to writer home
			throw redirect(303, '/writer');
		} catch (error) {
			console.error('Error deleting chapter:', error);

			if (error instanceof Error) {
				return fail(400, { error: error.message });
			}

			return fail(500, { error: 'Failed to delete chapter' });
		}
	}
} satisfies Actions;
