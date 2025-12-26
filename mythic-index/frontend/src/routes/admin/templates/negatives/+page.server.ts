import type { PageServerLoad, Actions } from './$types';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { v4 as uuidv4 } from 'uuid';

export const load: PageServerLoad = async ({ platform }) => {
	if (!platform?.env?.DB) {
		throw error(500, 'Database not available');
	}

	const db = drizzle(platform.env.DB, { schema });

	// Load all negative prompt presets
	const presets = await db
		.select()
		.from(schema.negativePromptPreset)
		.orderBy(schema.negativePromptPreset.category, schema.negativePromptPreset.priority)
		.all();

	return {
		presets,
	};
};

export const actions = {
	createPreset: async ({ request, platform }) => {
		if (!platform?.env?.DB) {
			throw error(500, 'Database not available');
		}

		const db = drizzle(platform.env.DB, { schema });
		const formData = await request.formData();

		const name = formData.get('name') as string;
		const slug = formData.get('slug') as string;
		const category = formData.get('category') as string;
		const description = formData.get('description') as string;
		const prompts = formData.get('prompts') as string;
		const priority = parseInt(formData.get('priority') as string) || 1;

		// Parse prompts as JSON array or split by newlines
		let promptsArray: string[] = [];
		try {
			promptsArray = JSON.parse(prompts);
		} catch (e) {
			// If not valid JSON, split by newlines
			promptsArray = prompts
				.split('\n')
				.map((s) => s.trim())
				.filter(Boolean);
		}

		await db
			.insert(schema.negativePromptPreset)
			.values({
				id: uuidv4(),
				name,
				slug,
				category,
				description: description || null,
				prompts: JSON.stringify(promptsArray),
				priority,
				status: 'active',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			})
			.run();

		return { success: true };
	},

	updatePreset: async ({ request, platform }) => {
		if (!platform?.env?.DB) {
			throw error(500, 'Database not available');
		}

		const db = drizzle(platform.env.DB, { schema });
		const formData = await request.formData();

		const id = formData.get('id') as string;
		const name = formData.get('name') as string;
		const description = formData.get('description') as string;
		const prompts = formData.get('prompts') as string;
		const priority = parseInt(formData.get('priority') as string) || 1;
		const status = formData.get('status') as string;

		// Parse prompts
		let promptsArray: string[] = [];
		try {
			promptsArray = JSON.parse(prompts);
		} catch (e) {
			promptsArray = prompts
				.split('\n')
				.map((s) => s.trim())
				.filter(Boolean);
		}

		await db
			.update(schema.negativePromptPreset)
			.set({
				name,
				description: description || null,
				prompts: JSON.stringify(promptsArray),
				priority,
				status,
				updatedAt: Date.now(),
			})
			.where(eq(schema.negativePromptPreset.id, id))
			.run();

		return { success: true };
	},

	deletePreset: async ({ request, platform }) => {
		if (!platform?.env?.DB) {
			throw error(500, 'Database not available');
		}

		const db = drizzle(platform.env.DB, { schema });
		const formData = await request.formData();
		const id = formData.get('id') as string;

		await db.delete(schema.negativePromptPreset).where(eq(schema.negativePromptPreset.id, id)).run();

		return { success: true };
	},
} satisfies Actions;
