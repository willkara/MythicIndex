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

	// Load all style presets
	const presets = await db
		.select()
		.from(schema.stylePreset)
		.orderBy(schema.stylePreset.category, schema.stylePreset.priority)
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
		const styleDescription = formData.get('styleDescription') as string;
		const negativePrompts = formData.get('negativePrompts') as string;
		const isMasterStyle = formData.get('isMasterStyle') === 'true';
		const priority = parseInt(formData.get('priority') as string) || 1;

		// Parse negative prompts as JSON array
		let negativesArray: string[] = [];
		try {
			negativesArray = JSON.parse(negativePrompts);
		} catch (e) {
			// If not valid JSON, split by newlines or commas
			negativesArray = negativePrompts
				.split(/[\n,]/)
				.map((s) => s.trim())
				.filter(Boolean);
		}

		await db
			.insert(schema.stylePreset)
			.values({
				id: uuidv4(),
				name,
				slug,
				category,
				styleDescription,
				negativePrompts: JSON.stringify(negativesArray),
				isMasterStyle: isMasterStyle ? 1 : 0,
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
		const styleDescription = formData.get('styleDescription') as string;
		const negativePrompts = formData.get('negativePrompts') as string;
		const isMasterStyle = formData.get('isMasterStyle') === 'true';
		const priority = parseInt(formData.get('priority') as string) || 1;
		const status = formData.get('status') as string;

		// Parse negative prompts
		let negativesArray: string[] = [];
		try {
			negativesArray = JSON.parse(negativePrompts);
		} catch (e) {
			negativesArray = negativePrompts
				.split(/[\n,]/)
				.map((s) => s.trim())
				.filter(Boolean);
		}

		await db
			.update(schema.stylePreset)
			.set({
				name,
				styleDescription,
				negativePrompts: JSON.stringify(negativesArray),
				isMasterStyle: isMasterStyle ? 1 : 0,
				priority,
				status,
				updatedAt: Date.now(),
			})
			.where(eq(schema.stylePreset.id, id))
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

		await db.delete(schema.stylePreset).where(eq(schema.stylePreset.id, id)).run();

		return { success: true };
	},
} satisfies Actions;
