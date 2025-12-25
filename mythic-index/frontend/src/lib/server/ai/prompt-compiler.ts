/**
 * Prompt Compiler - Compiles entity data into CompiledPromptIR
 *
 * Uses the TemplateEngine to render database-driven templates and compiles
 * them into structured Intermediate Representation (IR) for image generation.
 *
 * Supports:
 * - Character portraits
 * - Location overviews and zones
 * - Chapter scenes
 * - Reference image resolution
 * - Negative prompt merging
 * - Style preset application
 */

import { DrizzleD1Database } from 'drizzle-orm/d1';
import { eq, and, inArray } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema';
import { TemplateEngine, type TemplateContext } from './template-engine';
import type {
	CompiledPromptIR,
	PromptSection,
	ResolvedReference,
	GenerationConstraints,
	CompilerOptions,
	StylePreset,
	NegativePromptPreset,
} from './types';

/**
 * Entity data for compilation
 */
interface EntityData {
	type: 'character' | 'location' | 'chapter';
	slug: string;
	data: Record<string, unknown>;
}

/**
 * Prompt Compiler - compiles entity data into CompiledPromptIR
 */
export class PromptCompiler {
	private db: DrizzleD1Database<typeof schema>;
	private templateEngine: TemplateEngine;

	constructor(db: DrizzleD1Database<typeof schema>) {
		this.db = db;
		this.templateEngine = new TemplateEngine(db);
	}

	/**
	 * Compile a character portrait prompt
	 */
	async compileCharacterPortrait(
		characterSlug: string,
		options: CompilerOptions = {}
	): Promise<CompiledPromptIR> {
		// Load character data
		const character = await this.db
			.select()
			.from(schema.character)
			.where(eq(schema.character.slug, characterSlug))
			.get();

		if (!character) {
			throw new Error(`Character not found: ${characterSlug}`);
		}

		// Build entity data
		const entityData: Record<string, unknown> = {
			name: character.name,
			species: character.species,
			age: character.age,
			hair: character.hairDescription,
			eyes: character.eyeDescription,
			distinguishingFeatures: character.distinguishingFeatures,
			clothing: character.typicalAttire,
			personality: character.personalityTraits,
		};

		// Render template
		const templateSlug = options.templateSlug || 'character-portrait-default';
		const sections = await this.templateEngine.renderTemplate(
			templateSlug,
			{ entity: entityData },
			'character',
			characterSlug
		);

		// Resolve references
		const references = await this.resolveCharacterReferences(characterSlug);

		// Load style preset
		const stylePreset = await this.loadStylePreset('character');

		// Load negative prompts
		const negativePrompts = await this.loadNegativePrompts(['base', 'character']);

		// Build IR
		return this.buildIR({
			targetId: `${characterSlug}-portrait`,
			entityType: 'character',
			entitySlug: characterSlug,
			imageType: 'establishing',
			title: `${character.name} Portrait`,
			sections,
			references,
			stylePreset,
			negativePrompts,
			constraints: {
				aspectRatio: options.aspectRatio || '1:1',
				size: options.size || '1024x1024',
				orientation: 'portrait',
				quality: options.quality || 'high',
			},
		});
	}

	/**
	 * Compile a location overview prompt
	 */
	async compileLocationOverview(
		locationSlug: string,
		options: CompilerOptions = {}
	): Promise<CompiledPromptIR> {
		// Load location data
		const location = await this.db
			.select()
			.from(schema.location)
			.where(eq(schema.location.slug, locationSlug))
			.get();

		if (!location) {
			throw new Error(`Location not found: ${locationSlug}`);
		}

		// Build entity data
		const entityData: Record<string, unknown> = {
			name: location.name,
			description: location.description,
			features: location.keyFeatures ? JSON.parse(location.keyFeatures) : [],
			atmosphere: location.atmosphere,
		};

		// Render template
		const templateSlug = options.templateSlug || 'location-overview-default';
		const sections = await this.templateEngine.renderTemplate(
			templateSlug,
			{ entity: entityData },
			'location',
			locationSlug
		);

		// Resolve references
		const references = await this.resolveLocationReferences(locationSlug);

		// Load style preset
		const stylePreset = await this.loadStylePreset('location');

		// Load negative prompts
		const negativePrompts = await this.loadNegativePrompts(['base', 'location']);

		// Build IR
		return this.buildIR({
			targetId: `${locationSlug}-overview`,
			entityType: 'location',
			entitySlug: locationSlug,
			imageType: 'establishing',
			title: `${location.name} Overview`,
			sections,
			references,
			stylePreset,
			negativePrompts,
			constraints: {
				aspectRatio: options.aspectRatio || '16:9',
				size: options.size || '1024x1024',
				orientation: 'landscape',
				quality: options.quality || 'high',
			},
		});
	}

	/**
	 * Compile a chapter scene prompt
	 */
	async compileChapterScene(
		chapterSlug: string,
		sceneId: string,
		options: CompilerOptions = {}
	): Promise<CompiledPromptIR> {
		// Load chapter and scene data
		const chapter = await this.db
			.select()
			.from(schema.contentItem)
			.where(
				and(eq(schema.contentItem.slug, chapterSlug), eq(schema.contentItem.kind, 'chapter'))
			)
			.get();

		if (!chapter) {
			throw new Error(`Chapter not found: ${chapterSlug}`);
		}

		const scene = await this.db
			.select()
			.from(schema.scene)
			.where(eq(schema.scene.id, sceneId))
			.get();

		if (!scene) {
			throw new Error(`Scene not found: ${sceneId}`);
		}

		// Build entity data
		const entityData: Record<string, unknown> = {
			chapterTitle: chapter.title,
			sceneDescription: scene.description,
			mood: scene.mood,
		};

		// Build metadata
		const metadata: Record<string, unknown> = {
			moment: scene.description,
			sceneMood: scene.mood,
			hasReferences: true,
		};

		// Load location if present
		if (scene.locationId) {
			const location = await this.db
				.select()
				.from(schema.location)
				.where(eq(schema.location.id, scene.locationId))
				.get();

			if (location) {
				metadata.location = {
					name: location.name,
					description: location.description,
				};
			}
		}

		// Render template
		const templateSlug = options.templateSlug || 'scene-composite-default';
		const sections = await this.templateEngine.renderTemplate(
			templateSlug,
			{ entity: entityData, metadata },
			'chapter',
			chapterSlug
		);

		// Resolve references (characters + location)
		const references = await this.resolveSceneReferences(sceneId);

		// Load style preset
		const stylePreset = await this.loadStylePreset('scene');

		// Load negative prompts
		const negativePrompts = await this.loadNegativePrompts(['base']);

		// Build IR
		return this.buildIR({
			targetId: `${chapterSlug}-${sceneId}`,
			entityType: 'chapter',
			entitySlug: chapterSlug,
			imageType: 'beat',
			title: `${chapter.title} - Scene`,
			sceneMood: scene.mood || undefined,
			sections,
			references,
			stylePreset,
			negativePrompts,
			constraints: {
				aspectRatio: options.aspectRatio || '16:9',
				size: options.size || '1024x1024',
				orientation: 'landscape',
				quality: options.quality || 'high',
			},
		});
	}

	/**
	 * Resolve character reference images
	 */
	private async resolveCharacterReferences(characterSlug: string): Promise<ResolvedReference[]> {
		// Find character's canonical portrait
		const images = await this.db
			.select({
				assetId: schema.imageAsset.id,
				path: schema.imageAsset.cloudflareId,
				isCanonical: schema.imageReferenceMetadata.isCanonical,
				quality: schema.imageReferenceMetadata.referenceQuality,
			})
			.from(schema.imageLink)
			.innerJoin(schema.imageAsset, eq(schema.imageLink.imageId, schema.imageAsset.id))
			.leftJoin(
				schema.imageReferenceMetadata,
				eq(schema.imageAsset.id, schema.imageReferenceMetadata.assetId)
			)
			.where(
				and(
					eq(schema.imageLink.entityType, 'character'),
					eq(schema.imageLink.entitySlug, characterSlug)
				)
			)
			.all();

		// Prioritize canonical, then high quality
		const sorted = images.sort((a, b) => {
			if (a.isCanonical && !b.isCanonical) return -1;
			if (!a.isCanonical && b.isCanonical) return 1;
			if (a.quality === 'high' && b.quality !== 'high') return -1;
			if (a.quality !== 'high' && b.quality === 'high') return 1;
			return 0;
		});

		return sorted.slice(0, 3).map((img) => ({
			asset_id: img.assetId,
			role: 'portrait',
			path: img.path,
			exists: true,
		}));
	}

	/**
	 * Resolve location reference images
	 */
	private async resolveLocationReferences(locationSlug: string): Promise<ResolvedReference[]> {
		const images = await this.db
			.select({
				assetId: schema.imageAsset.id,
				path: schema.imageAsset.cloudflareId,
				isCanonical: schema.imageReferenceMetadata.isCanonical,
			})
			.from(schema.imageLink)
			.innerJoin(schema.imageAsset, eq(schema.imageLink.imageId, schema.imageAsset.id))
			.leftJoin(
				schema.imageReferenceMetadata,
				eq(schema.imageAsset.id, schema.imageReferenceMetadata.assetId)
			)
			.where(
				and(
					eq(schema.imageLink.entityType, 'location'),
					eq(schema.imageLink.entitySlug, locationSlug)
				)
			)
			.all();

		// Prioritize canonical
		const sorted = images.sort((a, b) => {
			if (a.isCanonical && !b.isCanonical) return -1;
			if (!a.isCanonical && b.isCanonical) return 1;
			return 0;
		});

		return sorted.slice(0, 2).map((img) => ({
			asset_id: img.assetId,
			role: 'location_overview',
			path: img.path,
			exists: true,
		}));
	}

	/**
	 * Resolve scene reference images (characters + location)
	 */
	private async resolveSceneReferences(sceneId: string): Promise<ResolvedReference[]> {
		const references: ResolvedReference[] = [];

		// Get characters in scene
		const sceneCharacters = await this.db
			.select({
				characterSlug: schema.character.slug,
			})
			.from(schema.sceneCharacter)
			.innerJoin(schema.character, eq(schema.sceneCharacter.characterId, schema.character.id))
			.where(eq(schema.sceneCharacter.sceneId, sceneId))
			.all();

		// Get canonical portrait for each character
		for (const { characterSlug } of sceneCharacters) {
			const charRefs = await this.resolveCharacterReferences(characterSlug);
			references.push(...charRefs.slice(0, 1)); // One portrait per character
		}

		// Get location reference if present
		const scene = await this.db
			.select({ locationId: schema.scene.locationId })
			.from(schema.scene)
			.where(eq(schema.scene.id, sceneId))
			.get();

		if (scene?.locationId) {
			const location = await this.db
				.select({ slug: schema.location.slug })
				.from(schema.location)
				.where(eq(schema.location.id, scene.locationId))
				.get();

			if (location) {
				const locRefs = await this.resolveLocationReferences(location.slug);
				references.push(...locRefs.slice(0, 1));
			}
		}

		return references;
	}

	/**
	 * Load style preset by category
	 */
	private async loadStylePreset(category: string): Promise<StylePreset | null> {
		const preset = await this.db
			.select()
			.from(schema.stylePreset)
			.where(
				and(
					eq(schema.stylePreset.category, category),
					eq(schema.stylePreset.isMasterStyle, 1),
					eq(schema.stylePreset.status, 'active')
				)
			)
			.orderBy(schema.stylePreset.priority)
			.get();

		return preset as StylePreset | null;
	}

	/**
	 * Load and merge negative prompts by category
	 */
	private async loadNegativePrompts(categories: string[]): Promise<string[]> {
		const presets = await this.db
			.select()
			.from(schema.negativePromptPreset)
			.where(
				and(
					inArray(schema.negativePromptPreset.category, categories),
					eq(schema.negativePromptPreset.status, 'active')
				)
			)
			.orderBy(schema.negativePromptPreset.priority)
			.all();

		// Merge and deduplicate
		const allPrompts = new Set<string>();
		for (const preset of presets) {
			const prompts = JSON.parse(preset.prompts) as string[];
			prompts.forEach((p) => allPrompts.add(p));
		}

		return Array.from(allPrompts);
	}

	/**
	 * Build the CompiledPromptIR from rendered sections and metadata
	 */
	private buildIR({
		targetId,
		entityType,
		entitySlug,
		imageType,
		title,
		sceneMood,
		sections,
		references,
		stylePreset,
		negativePrompts,
		constraints,
	}: {
		targetId: string;
		entityType: 'character' | 'location' | 'chapter';
		entitySlug: string;
		imageType?: string;
		title?: string;
		sceneMood?: string;
		sections: Array<{ weight: 1 | 2 | 3 | 4 | 5; content: string; source: string }>;
		references: ResolvedReference[];
		stylePreset: StylePreset | null;
		negativePrompts: string[];
		constraints: GenerationConstraints;
	}): CompiledPromptIR {
		// Group sections by weight
		const positive: CompiledPromptIR['positive'] = {
			constraints: [],
			subject: [],
			composition: [],
			lighting: [],
			palette: [],
			style: [],
		};

		for (const section of sections) {
			const promptSection: PromptSection = {
				weight: section.weight,
				content: section.content,
				source: section.source,
			};

			switch (section.weight) {
				case 1:
					positive.constraints.push(promptSection);
					break;
				case 2:
					positive.subject.push(promptSection);
					break;
				case 3:
					positive.composition.push(promptSection);
					break;
				case 4:
					// Split lighting and palette based on content keywords
					if (
						section.content.includes('color') ||
						section.content.includes('palette') ||
						section.content.includes('hue')
					) {
						positive.palette.push(promptSection);
					} else {
						positive.lighting.push(promptSection);
					}
					break;
				case 5:
					positive.style.push(promptSection);
					break;
			}
		}

		// Add style preset if available
		if (stylePreset) {
			positive.style.push({
				weight: 5,
				content: stylePreset.styleDescription,
				source: 'style-preset',
			});

			// Merge style preset negative prompts
			const styleNegatives = JSON.parse(stylePreset.negativePrompts) as string[];
			negativePrompts.push(...styleNegatives);
		}

		// Deduplicate negative prompts
		const uniqueNegatives = Array.from(new Set(negativePrompts));

		return {
			target_id: targetId,
			entity_type: entityType,
			entity_slug: entitySlug,
			image_type: imageType,
			title,
			scene_mood: sceneMood,
			positive,
			negative: uniqueNegatives,
			references,
			constraints,
			sources: {
				entity_defaults: {},
				image_overrides: {},
				global_defaults: {},
			},
			compiled_at: new Date().toISOString(),
		};
	}
}
