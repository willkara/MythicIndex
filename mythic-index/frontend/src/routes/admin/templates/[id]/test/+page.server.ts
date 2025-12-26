import type { PageServerLoad, Actions } from './$types';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { TemplateEngine } from '$lib/server/ai/template-engine';
import { PromptCompiler } from '$lib/server/ai/prompt-compiler';
import { renderPrompt, formatPromptForDisplay } from '$lib/server/ai/prompt-renderer';

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

	// Load sample entities based on category
	let sampleEntities: any[] = [];

	if (template.category === 'character') {
		sampleEntities = await db.select().from(schema.character).limit(10).all();
	} else if (template.category === 'location') {
		sampleEntities = await db.select().from(schema.location).limit(10).all();
	}

	return {
		template,
		sampleEntities,
	};
};

export const actions = {
	testTemplate: async ({ request, platform, params }) => {
		if (!platform?.env?.DB) {
			throw error(500, 'Database not available');
		}

		const db = drizzle(platform.env.DB, { schema });
		const { id } = params;
		const formData = await request.formData();

		const entitySlug = formData.get('entitySlug') as string;
		const template = await db
			.select()
			.from(schema.promptTemplate)
			.where(eq(schema.promptTemplate.id, id))
			.get();

		if (!template) {
			throw error(404, 'Template not found');
		}

		try {
			// Compile prompt using the actual compiler
			const compiler = new PromptCompiler(db);
			let ir;

			if (template.category === 'character') {
				ir = await compiler.compileCharacterPortrait(entitySlug);
			} else if (template.category === 'location') {
				ir = await compiler.compileLocationOverview(entitySlug);
			} else {
				return { error: 'Scene templates require a scene ID' };
			}

			// Render the prompt
			const rendered = renderPrompt(ir);

			// Format for display
			const formatted = formatPromptForDisplay(rendered);

			return {
				success: true,
				prompt: rendered.prompt,
				negativePrompt: rendered.negative_prompt,
				formatted,
				ir,
			};
		} catch (err) {
			return {
				error: `Failed to test template: ${err}`,
			};
		}
	},
} satisfies Actions;
