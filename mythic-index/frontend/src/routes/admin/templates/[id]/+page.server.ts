import type { PageServerLoad, Actions } from './$types';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { error, redirect } from '@sveltejs/kit';
import { v4 as uuidv4 } from 'uuid';

export const load: PageServerLoad = async ({ platform, params }) => {
	if (!platform?.env?.DB) {
		throw error(500, 'Database not available');
	}

	const db = drizzle(platform.env.DB, { schema });
	const { id } = params;

	// Load template
	const template = await db
		.select()
		.from(schema.promptTemplate)
		.where(eq(schema.promptTemplate.id, id))
		.get();

	if (!template) {
		throw error(404, 'Template not found');
	}

	// Load sections
	const sections = await db
		.select()
		.from(schema.promptTemplateSection)
		.where(eq(schema.promptTemplateSection.templateId, id))
		.orderBy(schema.promptTemplateSection.weight, schema.promptTemplateSection.sortOrder)
		.all();

	// Load variables
	const variables = await db
		.select()
		.from(schema.promptTemplateVariable)
		.where(eq(schema.promptTemplateVariable.templateId, id))
		.all();

	// Load components (for reference)
	const components = await db
		.select()
		.from(schema.promptComponent)
		.where(eq(schema.promptComponent.status, 'active'))
		.all();

	return {
		template,
		sections,
		variables,
		components,
	};
};

export const actions = {
	updateTemplate: async ({ request, platform, params }) => {
		if (!platform?.env?.DB) {
			throw error(500, 'Database not available');
		}

		const db = drizzle(platform.env.DB, { schema });
		const { id } = params;
		const formData = await request.formData();

		const name = formData.get('name') as string;
		const description = formData.get('description') as string;
		const status = formData.get('status') as string;

		await db
			.update(schema.promptTemplate)
			.set({
				name,
				description,
				status,
				updatedAt: Date.now(),
			})
			.where(eq(schema.promptTemplate.id, id))
			.run();

		return { success: true };
	},

	addSection: async ({ request, platform, params }) => {
		if (!platform?.env?.DB) {
			throw error(500, 'Database not available');
		}

		const db = drizzle(platform.env.DB, { schema });
		const { id } = params;
		const formData = await request.formData();

		const name = formData.get('name') as string;
		const weight = parseInt(formData.get('weight') as string);
		const content = formData.get('content') as string;
		const condition = formData.get('condition') as string;

		// Get max sort order for this weight
		const sections = await db
			.select()
			.from(schema.promptTemplateSection)
			.where(eq(schema.promptTemplateSection.templateId, id))
			.all();

		const maxSort =
			sections.filter((s) => s.weight === weight).reduce((max, s) => Math.max(max, s.sortOrder), 0) ||
			0;

		await db
			.insert(schema.promptTemplateSection)
			.values({
				id: uuidv4(),
				templateId: id,
				name,
				weight,
				content,
				condition: condition || null,
				sortOrder: maxSort + 1,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			})
			.run();

		return { success: true };
	},

	updateSection: async ({ request, platform }) => {
		if (!platform?.env?.DB) {
			throw error(500, 'Database not available');
		}

		const db = drizzle(platform.env.DB, { schema });
		const formData = await request.formData();

		const sectionId = formData.get('sectionId') as string;
		const name = formData.get('name') as string;
		const weight = parseInt(formData.get('weight') as string);
		const content = formData.get('content') as string;
		const condition = formData.get('condition') as string;

		await db
			.update(schema.promptTemplateSection)
			.set({
				name,
				weight,
				content,
				condition: condition || null,
				updatedAt: Date.now(),
			})
			.where(eq(schema.promptTemplateSection.id, sectionId))
			.run();

		return { success: true };
	},

	deleteSection: async ({ request, platform }) => {
		if (!platform?.env?.DB) {
			throw error(500, 'Database not available');
		}

		const db = drizzle(platform.env.DB, { schema });
		const formData = await request.formData();
		const sectionId = formData.get('sectionId') as string;

		await db
			.delete(schema.promptTemplateSection)
			.where(eq(schema.promptTemplateSection.id, sectionId))
			.run();

		return { success: true };
	},

	deleteTemplate: async ({ platform, params }) => {
		if (!platform?.env?.DB) {
			throw error(500, 'Database not available');
		}

		const db = drizzle(platform.env.DB, { schema });
		const { id } = params;

		// Delete sections first
		await db
			.delete(schema.promptTemplateSection)
			.where(eq(schema.promptTemplateSection.templateId, id))
			.run();

		// Delete variables
		await db
			.delete(schema.promptTemplateVariable)
			.where(eq(schema.promptTemplateVariable.templateId, id))
			.run();

		// Delete template
		await db.delete(schema.promptTemplate).where(eq(schema.promptTemplate.id, id)).run();

		throw redirect(303, '/admin/templates');
	},
} satisfies Actions;
