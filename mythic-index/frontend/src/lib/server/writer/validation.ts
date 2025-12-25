/**
 * Zod validation schemas for content writer module
 * Ensures data integrity before database operations
 */

import { z } from 'zod';

// ============================================================================
// Shared Schemas
// ============================================================================

/**
 * Slug validation: lowercase alphanumeric with hyphens, no leading/trailing hyphens
 */
const slugSchema = z
	.string()
	.min(1, 'Slug is required')
	.max(100, 'Slug must be 100 characters or less')
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens');

/**
 * JSON array field (stored as JSON string in D1)
 */
const jsonArraySchema = z.union([
	z.array(z.string()),
	z.string().transform((val) => {
		try {
			return JSON.parse(val);
		} catch {
			return [];
		}
	})
]);

// ============================================================================
// Character Validation
// ============================================================================

export const characterCreateSchema = z.object({
	// Required fields
	name: z.string().min(1, 'Name is required').max(200, 'Name too long'),
	workspaceId: z.string().min(1, 'Workspace ID is required'),

	// Auto-generated or optional
	slug: slugSchema.optional(),

	// Basic Info
	aliases: jsonArraySchema.optional(),
	race: z.string().max(100).optional(),
	characterClass: z.string().max(100).optional(),
	role: z.enum(['protagonist', 'antagonist', 'supporting', 'minor']).optional(),
	status: z.enum(['alive', 'dead', 'unknown']).default('alive'),
	firstAppearance: z.string().max(100).optional(),

	// Appearance
	appearanceAge: z.string().max(50).optional(),
	appearanceHeight: z.string().max(50).optional(),
	appearanceBuild: z.string().max(100).optional(),
	appearanceHair: z.string().max(100).optional(),
	appearanceEyes: z.string().max(100).optional(),
	appearanceDistinguishingFeatures: jsonArraySchema.optional(),
	appearanceClothing: z.string().max(500).optional(),
	visualSummary: z.string().max(2000).optional(),

	// Personality
	personalityArchetype: z.string().max(100).optional(),
	personalityTemperament: z.string().max(100).optional(),
	personalityPositiveTraits: jsonArraySchema.optional(),
	personalityNegativeTraits: jsonArraySchema.optional(),
	personalityMoralAlignment: z.string().max(100).optional(),

	// Background & Psychology
	background: z.string().max(5000).optional(),
	motivations: jsonArraySchema.optional(),
	fears: jsonArraySchema.optional(),
	secrets: jsonArraySchema.optional(),

	// Combat
	primaryWeapons: z.string().max(200).optional(),
	fightingStyle: z.string().max(200).optional(),
	tacticalRole: z.string().max(100).optional(),

	// Voice
	speechStyle: z.string().max(200).optional(),
	signaturePhrases: jsonArraySchema.optional(),

	// Story
	faction: z.string().max(100).optional(),
	occupation: z.string().max(100).optional(),
	notes: z.string().max(5000).optional(),

	// Media
	portraitImageId: z.string().uuid().optional()
});

export const characterUpdateSchema = characterCreateSchema.partial().required({
	name: true,
	workspaceId: true
});

export type CharacterCreate = z.infer<typeof characterCreateSchema>;
export type CharacterUpdate = z.infer<typeof characterUpdateSchema>;

// ============================================================================
// Location Validation
// ============================================================================

export const locationCreateSchema = z.object({
	// Required fields
	name: z.string().min(1, 'Name is required').max(200, 'Name too long'),
	workspaceId: z.string().min(1, 'Workspace ID is required'),

	// Auto-generated or optional
	slug: slugSchema.optional(),

	// Basic Info
	locationType: z
		.enum(['city', 'town', 'village', 'building', 'room', 'region', 'landmark', 'natural'])
		.optional(),
	region: z.string().max(100).optional(),
	parentLocationId: z.string().uuid().optional(),

	// Descriptions
	quickDescription: z.string().max(1000).optional(),
	visualSummary: z.string().max(2000).optional(),
	atmosphere: z.string().max(2000).optional(),
	history: z.string().max(5000).optional(),

	// Content
	notableLandmarks: jsonArraySchema.optional(),
	keyPersonnel: jsonArraySchema.optional(),

	// Extended
	storyRole: z.string().max(2000).optional(),
	hazardsDangers: jsonArraySchema.optional(),
	connections: jsonArraySchema.optional(),
	accessibility: z.string().max(2000).optional(),
	significanceLevel: z.enum(['high', 'medium', 'low']).optional(),
	firstAppearance: z.string().max(100).optional()
});

export const locationUpdateSchema = locationCreateSchema.partial().required({
	name: true,
	workspaceId: true
});

export type LocationCreate = z.infer<typeof locationCreateSchema>;
export type LocationUpdate = z.infer<typeof locationUpdateSchema>;

// ============================================================================
// Chapter Validation
// ============================================================================

export const chapterCreateSchema = z.object({
	// Required fields
	title: z.string().min(1, 'Title is required').max(300, 'Title too long'),
	workspaceId: z.string().min(1, 'Workspace ID is required'),

	// Auto-generated or optional
	slug: slugSchema.optional(),

	// Content fields
	summary: z.string().max(2000).optional(),
	content: z.string().optional(), // Rich text HTML content from Tiptap
	status: z.enum(['draft', 'published']).default('draft'),
	wordCount: z.number().int().nonnegative().optional(),
	metadataJson: z.string().optional()
});

export const chapterUpdateSchema = chapterCreateSchema.partial().required({
	title: true,
	workspaceId: true
});

export type ChapterCreate = z.infer<typeof chapterCreateSchema>;
export type ChapterUpdate = z.infer<typeof chapterUpdateSchema>;

// ============================================================================
// Scene Validation
// ============================================================================

export const sceneCreateSchema = z.object({
	// Required fields
	contentId: z.string().uuid('Invalid chapter ID'),
	revisionId: z.string().uuid('Invalid revision ID'),
	sequenceOrder: z.number().int().nonnegative('Sequence order must be non-negative'),

	// Auto-generated or optional
	slug: slugSchema.optional(),

	// Scene metadata
	title: z.string().max(300).optional(),
	synopsis: z.string().max(2000).optional(),
	sceneWhen: z.string().max(200).optional(),
	primaryLocationId: z.string().uuid().optional(),
	povEntityId: z.string().uuid().optional(),
	estReadSeconds: z.number().int().nonnegative().optional()
});

export const sceneUpdateSchema = sceneCreateSchema.partial().required({
	contentId: true,
	revisionId: true,
	sequenceOrder: true
});

export type SceneCreate = z.infer<typeof sceneCreateSchema>;
export type SceneUpdate = z.infer<typeof sceneUpdateSchema>;

// ============================================================================
// Zone Validation
// ============================================================================

export const zoneCreateSchema = z.object({
	// Required fields
	locationId: z.string().uuid('Invalid location ID'),
	name: z.string().min(1, 'Name is required').max(200, 'Name too long'),
	workspaceId: z.string().min(1, 'Workspace ID is required'),

	// Auto-generated or optional
	slug: slugSchema.optional(),

	// Zone fields
	zoneType: z
		.enum(['perimeter', 'threshold', 'heart', 'forge', 'liminal', 'sanctuary'])
		.optional(),
	locationWithin: z.string().max(200).optional(),
	parentZoneId: z.string().uuid().optional(),
	physicalDescription: z.string().max(2000).optional(),
	narrativeFunction: z.string().max(2000).optional(),
	emotionalRegister: z.string().max(200).optional(),
	signatureDetails: jsonArraySchema.optional(),
	moodAffinity: jsonArraySchema.optional(),
	characterAssociations: jsonArraySchema.optional(),
	lightConditions: z.string().optional(), // JSON object as string
	firstAppearance: z.string().max(100).optional(),
	storySignificance: z.enum(['high', 'medium', 'low']).optional()
});

export const zoneUpdateSchema = zoneCreateSchema.partial().required({
	locationId: true,
	name: true,
	workspaceId: true
});

export type ZoneCreate = z.infer<typeof zoneCreateSchema>;
export type ZoneUpdate = z.infer<typeof zoneUpdateSchema>;

// ============================================================================
// Character Relationship Validation
// ============================================================================

export const characterRelationshipCreateSchema = z.object({
	sourceCharacterId: z.string().uuid('Invalid source character ID'),
	targetCharacterId: z.string().uuid('Invalid target character ID'),
	relationshipType: z.enum([
		'ally',
		'rival',
		'mentor',
		'student',
		'family',
		'romantic',
		'enemy',
		'neutral'
	]),
	description: z.string().max(1000).optional(),
	strength: z.number().int().min(0).max(10).optional()
});

export const characterRelationshipUpdateSchema = characterRelationshipCreateSchema.partial();

export type CharacterRelationshipCreate = z.infer<typeof characterRelationshipCreateSchema>;
export type CharacterRelationshipUpdate = z.infer<typeof characterRelationshipUpdateSchema>;
