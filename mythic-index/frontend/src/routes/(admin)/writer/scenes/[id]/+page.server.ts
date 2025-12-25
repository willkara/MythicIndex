import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { sceneUpdateSchema } from '$lib/server/writer/validation';
import { getSceneById, updateScene, deleteScene, getChapterById } from '$lib/server/writer/crud';

const WORKSPACE_ID = 'default'; // TODO: Get from user session or env

export const load: PageServerLoad = async ({ params, platform }) => {
	if (!platform?.env?.DB) {
		throw error(500, 'Database not available');
	}

	const scene = await getSceneById(platform.env.DB, params.id, WORKSPACE_ID);

	if (!scene) {
		throw error(404, `Scene not found: ${params.id}`);
	}

	return {
		scene
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
			const validated = sceneUpdateSchema.parse({
				...data,
				chapterId: data.chapterId,
				workspaceId: WORKSPACE_ID,
				// Convert numeric fields
				sequenceOrder: data.sequenceOrder ? parseInt(data.sequenceOrder as string) : undefined,
				wordCount: data.wordCount ? parseInt(data.wordCount as string) : undefined,
				// Content is passed as HTML string
				content: data.content || undefined
			});

			// Get scene to find parent chapter
			const scene = await getSceneById(platform.env.DB, params.id, WORKSPACE_ID);
			if (!scene) {
				return fail(404, { error: 'Scene not found' });
			}

			// Update scene in database
			await updateScene(platform.env.DB, params.id, validated, WORKSPACE_ID);

			// Auto-republish if parent chapter is published
			const chapter = await getChapterById(platform.env.DB, scene.chapterId, WORKSPACE_ID);
			if (chapter?.status === 'published' && platform.env.AI && platform.env.VECTORIZE_INDEX) {
				const { EntityEmbeddingService } = await import('$lib/server/writer/embedding-entity');
				const embeddingService = new EntityEmbeddingService(
					platform.env.AI,
					platform.env.VECTORIZE_INDEX
				);
				await embeddingService.embedChapter(chapter.id, platform.env.DB);
			}

			return {
				success: true,
				message: 'Scene updated successfully'
			};
		} catch (error) {
			console.error('Error updating scene:', error);

			if (error instanceof Error) {
				return fail(400, {
					error: error.message,
					fields: Object.fromEntries(await request.formData())
				});
			}

			return fail(500, { error: 'Failed to update scene' });
		}
	},

	delete: async ({ params, platform }) => {
		if (!platform?.env?.DB) {
			return fail(500, { error: 'Database not available' });
		}

		try {
			// Get scene to find chapter for redirect
			const scene = await getSceneById(platform.env.DB, params.id, WORKSPACE_ID);

			if (!scene) {
				return fail(404, { error: 'Scene not found' });
			}

			// Get parent chapter for redirect and auto-republish
			const chapter = await getChapterById(platform.env.DB, scene.chapterId, WORKSPACE_ID);
			if (!chapter) {
				return fail(404, { error: 'Parent chapter not found' });
			}

			// Delete scene from database
			await deleteScene(platform.env.DB, params.id, WORKSPACE_ID);

			// Auto-republish if parent chapter is published
			if (chapter.status === 'published' && platform.env.AI && platform.env.VECTORIZE_INDEX) {
				const { EntityEmbeddingService } = await import('$lib/server/writer/embedding-entity');
				const embeddingService = new EntityEmbeddingService(
					platform.env.AI,
					platform.env.VECTORIZE_INDEX
				);
				await embeddingService.embedChapter(chapter.id, platform.env.DB);
			}

			// Redirect back to chapter edit page
			throw redirect(303, `/writer/chapters/${chapter.slug}`);
		} catch (error) {
			console.error('Error deleting scene:', error);

			if (error instanceof Error) {
				return fail(400, { error: error.message });
			}

			return fail(500, { error: 'Failed to delete scene' });
		}
	}
} satisfies Actions;
