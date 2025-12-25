/**
 * Template Engine - Handlebars-based prompt template rendering
 *
 * Loads prompt templates from the database and renders them with entity context.
 * Supports:
 * - Template sections with conditional logic
 * - Reusable components (partials)
 * - Custom Handlebars helpers
 * - Entity-specific overrides
 * - Variable validation
 */

import Handlebars from 'handlebars';
import { DrizzleD1Database } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import type {
	PromptTemplate,
	PromptTemplateSection as DBTemplateSection,
	PromptComponent,
	PromptTemplateVariable,
	PromptTemplateOverride,
} from './types';

/**
 * Rendered template section with weight and source tracking
 */
export interface RenderedSection {
	weight: 1 | 2 | 3 | 4 | 5;
	content: string;
	source: string;
	sortOrder: number;
}

/**
 * Template rendering context
 */
export interface TemplateContext {
	entity: Record<string, unknown>;
	metadata?: Record<string, unknown>;
	[key: string]: unknown;
}

/**
 * Template Engine - renders database-driven Handlebars templates
 */
export class TemplateEngine {
	private handlebars: typeof Handlebars;
	private db: DrizzleD1Database<typeof schema>;
	private componentsLoaded = false;

	constructor(db: DrizzleD1Database<typeof schema>) {
		this.db = db;
		this.handlebars = Handlebars.create();
		this.registerHelpers();
	}

	/**
	 * Register custom Handlebars helpers
	 */
	private registerHelpers(): void {
		// Helper: capitalize - Capitalize first letter of a string
		this.handlebars.registerHelper('capitalize', (str: string) => {
			if (typeof str !== 'string') return '';
			return str.charAt(0).toUpperCase() + str.slice(1);
		});

		// Helper: join - Join an array with a separator
		this.handlebars.registerHelper('join', (arr: unknown, separator: string) => {
			if (!Array.isArray(arr)) return '';
			return arr.join(separator);
		});

		// Helper: inferExpression - Infer facial expression from personality traits
		this.handlebars.registerHelper('inferExpression', (personality: string) => {
			if (!personality) return 'neutral, composed expression';

			const lower = personality.toLowerCase();

			// Map personality traits to expressions
			if (lower.includes('cheerful') || lower.includes('friendly') || lower.includes('optimistic')) {
				return 'warm, approachable expression with hint of a smile';
			}
			if (lower.includes('serious') || lower.includes('stern') || lower.includes('stoic')) {
				return 'serious, focused expression with firm jaw';
			}
			if (lower.includes('cunning') || lower.includes('shrewd') || lower.includes('calculating')) {
				return 'sharp, perceptive gaze with subtle smirk';
			}
			if (lower.includes('gentle') || lower.includes('kind') || lower.includes('compassionate')) {
				return 'soft, empathetic expression with gentle eyes';
			}
			if (lower.includes('fierce') || lower.includes('intense') || lower.includes('passionate')) {
				return 'intense, determined expression with strong features';
			}
			if (lower.includes('weary') || lower.includes('tired') || lower.includes('exhausted')) {
				return 'tired eyes with weathered, care-worn features';
			}
			if (lower.includes('mysterious') || lower.includes('enigmatic') || lower.includes('cryptic')) {
				return 'enigmatic expression with knowing gaze';
			}

			return 'neutral expression reflecting inner thoughts';
		});

		// Helper: ifCond - Conditional comparison
		this.handlebars.registerHelper('ifCond', function (v1, operator, v2, options) {
			switch (operator) {
				case '==':
					return v1 == v2 ? options.fn(this) : options.inverse(this);
				case '===':
					return v1 === v2 ? options.fn(this) : options.inverse(this);
				case '!=':
					return v1 != v2 ? options.fn(this) : options.inverse(this);
				case '!==':
					return v1 !== v2 ? options.fn(this) : options.inverse(this);
				case '<':
					return v1 < v2 ? options.fn(this) : options.inverse(this);
				case '<=':
					return v1 <= v2 ? options.fn(this) : options.inverse(this);
				case '>':
					return v1 > v2 ? options.fn(this) : options.inverse(this);
				case '>=':
					return v1 >= v2 ? options.fn(this) : options.inverse(this);
				case '&&':
					return v1 && v2 ? options.fn(this) : options.inverse(this);
				case '||':
					return v1 || v2 ? options.fn(this) : options.inverse(this);
				default:
					return options.inverse(this);
			}
		});
	}

	/**
	 * Load reusable components as Handlebars partials
	 */
	private async loadComponents(): Promise<void> {
		if (this.componentsLoaded) return;

		const components = await this.db
			.select()
			.from(schema.promptComponent)
			.where(eq(schema.promptComponent.status, 'active'))
			.all();

		for (const component of components) {
			this.handlebars.registerPartial(component.slug, component.content);
		}

		this.componentsLoaded = true;
	}

	/**
	 * Load a template by slug or ID
	 */
	async loadTemplate(slugOrId: string): Promise<PromptTemplate | null> {
		const template = await this.db
			.select()
			.from(schema.promptTemplate)
			.where(
				and(
					eq(schema.promptTemplate.status, 'active'),
					// Try both slug and id
					eq(schema.promptTemplate.slug, slugOrId)
				)
			)
			.get();

		if (!template) {
			// Try by ID
			const byId = await this.db
				.select()
				.from(schema.promptTemplate)
				.where(
					and(eq(schema.promptTemplate.status, 'active'), eq(schema.promptTemplate.id, slugOrId))
				)
				.get();

			return byId as PromptTemplate | null;
		}

		return template as PromptTemplate;
	}

	/**
	 * Load template sections
	 */
	async loadTemplateSections(templateId: string): Promise<DBTemplateSection[]> {
		const sections = await this.db
			.select()
			.from(schema.promptTemplateSection)
			.where(eq(schema.promptTemplateSection.templateId, templateId))
			.orderBy(schema.promptTemplateSection.weight, schema.promptTemplateSection.sortOrder)
			.all();

		return sections as DBTemplateSection[];
	}

	/**
	 * Load entity-specific overrides for a template
	 */
	async loadOverrides(
		templateId: string,
		entityType: string,
		entitySlug: string
	): Promise<PromptTemplateOverride[]> {
		const overrides = await this.db
			.select()
			.from(schema.promptTemplateOverride)
			.where(
				and(
					eq(schema.promptTemplateOverride.templateId, templateId),
					eq(schema.promptTemplateOverride.entityType, entityType),
					eq(schema.promptTemplateOverride.entitySlug, entitySlug),
					eq(schema.promptTemplateOverride.status, 'active')
				)
			)
			.all();

		return overrides as PromptTemplateOverride[];
	}

	/**
	 * Evaluate a condition string with the given context
	 *
	 * Conditions are simple JavaScript expressions like:
	 * - "entity.species"
	 * - "entity.age && entity.hair"
	 * - "metadata.hasReferences"
	 */
	private evaluateCondition(condition: string | null, context: TemplateContext): boolean {
		if (!condition) return true;

		try {
			// Create a function that evaluates the condition in the context
			// This is safe because conditions come from the database, not user input
			const func = new Function(
				...Object.keys(context),
				`return Boolean(${condition});`
			);
			return func(...Object.values(context));
		} catch (error) {
			console.warn(`Failed to evaluate condition: ${condition}`, error);
			return false;
		}
	}

	/**
	 * Render a template with the given context
	 *
	 * @param slugOrId - Template slug or ID
	 * @param context - Template context (entity data, metadata, etc.)
	 * @param entityType - Optional entity type for overrides
	 * @param entitySlug - Optional entity slug for overrides
	 * @returns Array of rendered sections with weights
	 */
	async renderTemplate(
		slugOrId: string,
		context: TemplateContext,
		entityType?: string,
		entitySlug?: string
	): Promise<RenderedSection[]> {
		// Load components if not already loaded
		await this.loadComponents();

		// Load the template
		const template = await this.loadTemplate(slugOrId);
		if (!template) {
			throw new Error(`Template not found: ${slugOrId}`);
		}

		// Load sections
		const sections = await this.loadTemplateSections(template.id);

		// Load overrides if entity context provided
		const overrides =
			entityType && entitySlug
				? await this.loadOverrides(template.id, entityType, entitySlug)
				: [];

		// Build override map
		const overrideMap = new Map<string, string>();
		for (const override of overrides) {
			overrideMap.set(override.sectionName, override.overrideContent);
		}

		// Render each section
		const rendered: RenderedSection[] = [];

		for (const section of sections) {
			// Check condition
			if (!this.evaluateCondition(section.condition, context)) {
				continue;
			}

			// Get content (use override if available)
			const content = overrideMap.get(section.name) || section.content;

			// Compile and render
			try {
				const compiled = this.handlebars.compile(content);
				const result = compiled(context);

				// Only include non-empty results
				if (result.trim()) {
					rendered.push({
						weight: section.weight as 1 | 2 | 3 | 4 | 5,
						content: result.trim(),
						source: `${template.slug}.${section.name}`,
						sortOrder: section.sortOrder,
					});
				}
			} catch (error) {
				console.error(`Failed to render section ${section.name}:`, error);
				// Continue with other sections
			}
		}

		return rendered;
	}

	/**
	 * Validate that all required variables are present in the context
	 */
	async validateContext(
		slugOrId: string,
		context: TemplateContext
	): Promise<{ valid: boolean; missing: string[]; warnings: string[] }> {
		const template = await this.loadTemplate(slugOrId);
		if (!template) {
			return { valid: false, missing: ['template'], warnings: [] };
		}

		const variables = await this.db
			.select()
			.from(schema.promptTemplateVariable)
			.where(eq(schema.promptTemplateVariable.templateId, template.id))
			.all();

		const missing: string[] = [];
		const warnings: string[] = [];

		for (const variable of variables) {
			const path = variable.name.split('.');
			let current: unknown = context;

			for (const key of path) {
				if (current && typeof current === 'object' && key in current) {
					current = (current as Record<string, unknown>)[key];
				} else {
					current = undefined;
					break;
				}
			}

			if (current === undefined || current === null) {
				if (variable.isRequired) {
					missing.push(variable.name);
				} else {
					warnings.push(`Optional variable missing: ${variable.name}`);
				}
			}
		}

		return {
			valid: missing.length === 0,
			missing,
			warnings,
		};
	}

	/**
	 * Get template info for debugging
	 */
	async getTemplateInfo(slugOrId: string): Promise<{
		template: PromptTemplate | null;
		sections: DBTemplateSection[];
		variables: PromptTemplateVariable[];
		components: PromptComponent[];
	}> {
		const template = await this.loadTemplate(slugOrId);
		if (!template) {
			return { template: null, sections: [], variables: [], components: [] };
		}

		const sections = await this.loadTemplateSections(template.id);

		const variables = await this.db
			.select()
			.from(schema.promptTemplateVariable)
			.where(eq(schema.promptTemplateVariable.templateId, template.id))
			.all();

		const components = await this.db
			.select()
			.from(schema.promptComponent)
			.where(eq(schema.promptComponent.status, 'active'))
			.all();

		return {
			template: template as PromptTemplate,
			sections: sections as DBTemplateSection[],
			variables: variables as PromptTemplateVariable[],
			components: components as PromptComponent[],
		};
	}
}
