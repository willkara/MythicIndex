import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { chapterUpdateSchema, sceneCreateSchema } from '$lib/server/writer/validation';
import { getChapterBySlug, updateChapter, deleteChapter, listScenesForChapter, createScene } from '$lib/server/writer/crud';

const WORKSPACE_ID = 'default'; // TODO: Get from user session or env

export const load: PageServerLoad = async ({ params, platform }) => {
	if (!platform?.env?.DB) {
		throw error(500, 'Database not available');
	}

	const chapter = await getChapterBySlug(platform.env.DB, params.slug, WORKSPACE_ID);

	if (!chapter) {
		throw error(404, `Chapter not found: ${params.slug}`);
	}

	// Load scenes for this chapter
	const scenes = await listScenesForChapter(platform.env.DB, chapter.id, WORKSPACE_ID);

	return {
		chapter,
		scenes
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

			// NOTE: Embeddings are only regenerated when chapter is re-published
			// Not on every update to avoid unnecessary AI calls during editing

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

			// Delete embedding from Vectorize
			if (platform.env.AI && platform.env.VECTORIZE_INDEX) {
				const { EntityEmbeddingService } = await import('$lib/server/writer/embedding-entity');
				const embeddingService = new EntityEmbeddingService(
					platform.env.AI,
					platform.env.VECTORIZE_INDEX
				);
				await embeddingService.deleteEmbedding(chapter.id);
			}

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
	},

	createScene: async ({ params, request, platform }) => {
		if (!platform?.env?.DB) {
			return fail(500, { error: 'Database not available' });
		}

		try {
			// Get chapter to find its ID
			const chapter = await getChapterBySlug(platform.env.DB, params.slug, WORKSPACE_ID);

			if (!chapter) {
				return fail(404, { error: 'Chapter not found' });
			}

			const formData = await request.formData();
			const data = Object.fromEntries(formData);

			// Validate data
			const validated = sceneCreateSchema.parse({
				...data,
				chapterId: chapter.id,
				workspaceId: WORKSPACE_ID,
				// Convert numeric fields
				sequenceOrder: data.sequenceOrder ? parseInt(data.sequenceOrder as string) : 0,
				wordCount: data.wordCount ? parseInt(data.wordCount as string) : undefined,
				// Content is passed as HTML string
				content: data.content || undefined
			});

			// Create scene in database
			const { id } = await createScene(platform.env.DB, validated, WORKSPACE_ID);

			// Auto-republish if parent chapter is published
			if (chapter.status === 'published' && platform.env.AI && platform.env.VECTORIZE_INDEX) {
				const { EntityEmbeddingService } = await import('$lib/server/writer/embedding-entity');
				const embeddingService = new EntityEmbeddingService(
					platform.env.AI,
					platform.env.VECTORIZE_INDEX
				);
				await embeddingService.embedChapter(chapter.id, platform.env.DB);
			}

			// Redirect to scene edit page
			throw redirect(303, `/writer/scenes/${id}`);
		} catch (error) {
			console.error('Error creating scene:', error);

			if (error instanceof Error) {
				return fail(400, {
					error: error.message,
					fields: Object.fromEntries(await request.formData())
				});
			}

			return fail(500, { error: 'Failed to create scene' });
		}
	},

	publish: async ({ params, platform }) => {
		if (!platform?.env?.DB) {
			return fail(500, { error: 'Database not available' });
		}

		try {
			// Get chapter
			const chapter = await getChapterBySlug(platform.env.DB, params.slug, WORKSPACE_ID);

			if (!chapter) {
				return fail(404, { error: 'Chapter not found' });
			}

			// Get all scenes for validation
			const scenes = await listScenesForChapter(platform.env.DB, chapter.id, WORKSPACE_ID);

			// Validation: All scenes must be "done" before publishing
			const draftScenes = scenes.filter((s: any) => s.status === 'draft');
			if (draftScenes.length > 0) {
				return fail(400, {
					error: `Cannot publish: ${draftScenes.length} scene(s) are still in draft status. All scenes must be marked as "done" before publishing.`
				});
			}

			// Update chapter status to published
			await updateChapter(
				platform.env.DB,
				params.slug,
				{ status: 'published' },
				WORKSPACE_ID
			);

			// Generate embedding with all scene content
			if (platform.env.AI && platform.env.VECTORIZE_INDEX) {
				const { EntityEmbeddingService } = await import('$lib/server/writer/embedding-entity');
				const embeddingService = new EntityEmbeddingService(
					platform.env.AI,
					platform.env.VECTORIZE_INDEX
				);
				await embeddingService.embedChapter(chapter.id, platform.env.DB);
			}

			return {
				success: true,
				message: 'Chapter published successfully'
			};
		} catch (error) {
			console.error('Error publishing chapter:', error);

			if (error instanceof Error) {
				return fail(400, { error: error.message });
			}

			return fail(500, { error: 'Failed to publish chapter' });
		}
	},

	unpublish: async ({ params, platform }) => {
		if (!platform?.env?.DB) {
			return fail(500, { error: 'Database not available' });
		}

		try {
			// Get chapter
			const chapter = await getChapterBySlug(platform.env.DB, params.slug, WORKSPACE_ID);

			if (!chapter) {
				return fail(404, { error: 'Chapter not found' });
			}

			// Get all scenes to unpublish them
			const scenes = await listScenesForChapter(platform.env.DB, chapter.id, WORKSPACE_ID);

			// Unpublish all scenes (set status to draft)
			const { updateScene } = await import('$lib/server/writer/crud');
			for (const scene of scenes) {
				await updateScene(platform.env.DB, scene.id, { status: 'draft' }, WORKSPACE_ID);
			}

			// Update chapter status to draft
			await updateChapter(
				platform.env.DB,
				params.slug,
				{ status: 'draft' },
				WORKSPACE_ID
			);

			// Delete embedding from Vectorize
			if (platform.env.AI && platform.env.VECTORIZE_INDEX) {
				const { EntityEmbeddingService } = await import('$lib/server/writer/embedding-entity');
				const embeddingService = new EntityEmbeddingService(
					platform.env.AI,
					platform.env.VECTORIZE_INDEX
				);
				await embeddingService.deleteEmbedding(chapter.id);
			}

			return {
				success: true,
				message: 'Chapter unpublished successfully (all scenes reverted to draft)'
			};
		} catch (error) {
			console.error('Error unpublishing chapter:', error);

			if (error instanceof Error) {
				return fail(400, { error: error.message });
			}

			return fail(500, { error: 'Failed to unpublish chapter' });
		}
	}
} satisfies Actions;
