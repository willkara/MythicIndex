import type { PageServerLoad } from './$types';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ platform }) => {
	if (!platform?.env?.DB) {
		throw new Error('Database not available');
	}

	const db = drizzle(platform.env.DB, { schema });

	// Load all templates with section counts
	const templates = await db
		.select({
			id: schema.promptTemplate.id,
			name: schema.promptTemplate.name,
			slug: schema.promptTemplate.slug,
			category: schema.promptTemplate.category,
			subcategory: schema.promptTemplate.subcategory,
			description: schema.promptTemplate.description,
			version: schema.promptTemplate.version,
			status: schema.promptTemplate.status,
			isDefault: schema.promptTemplate.isDefault,
			createdAt: schema.promptTemplate.createdAt,
			updatedAt: schema.promptTemplate.updatedAt,
		})
		.from(schema.promptTemplate)
		.orderBy(schema.promptTemplate.category, schema.promptTemplate.name)
		.all();

	// Get section counts for each template
	const templateIds = templates.map((t) => t.id);
	const sections = await db
		.select({
			templateId: schema.promptTemplateSection.templateId,
		})
		.from(schema.promptTemplateSection)
		.all();

	const sectionCounts = sections.reduce(
		(acc, s) => {
			acc[s.templateId] = (acc[s.templateId] || 0) + 1;
			return acc;
		},
		{} as Record<string, number>
	);

	return {
		templates: templates.map((t) => ({
			...t,
			sectionCount: sectionCounts[t.id] || 0,
		})),
	};
};
