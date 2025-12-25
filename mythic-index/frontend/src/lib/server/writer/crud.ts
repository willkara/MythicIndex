/**
 * CRUD operations for content writer entities
 * Provides database helpers for creating, reading, updating, and deleting entities
 */

import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import { character, location } from '../db/schema';
import { generateSlug, makeSlugUnique } from './slug-generator';
import type { CharacterCreate, CharacterUpdate, LocationCreate, LocationUpdate } from './validation';

// ============================================================================
// Character CRUD Operations
// ============================================================================

/**
 * Create a new character in the database
 */
export async function createCharacter(
	db: D1Database,
	data: CharacterCreate,
	workspaceId: string
): Promise<{ id: string; slug: string }> {
	const drizzleDb = drizzle(db);

	// Generate ID and timestamps
	const id = crypto.randomUUID();
	const now = new Date().toISOString();

	// Generate slug from name if not provided
	let slug = data.slug || generateSlug(data.name);

	// Check for slug uniqueness
	const existingSlugs = await drizzleDb
		.select({ slug: character.slug })
		.from(character)
		.where(eq(character.workspaceId, workspaceId))
		.all();

	slug = makeSlugUnique(slug, existingSlugs.map((r) => r.slug));

	// Convert array fields to JSON strings
	const characterData = {
		id,
		workspaceId,
		slug,
		name: data.name,

		// Basic Info
		aliases: data.aliases ? JSON.stringify(data.aliases) : null,
		race: data.race || null,
		characterClass: data.characterClass || null,
		role: data.role || null,
		status: data.status || 'alive',
		firstAppearance: data.firstAppearance || null,
		faction: data.faction || null,
		occupation: data.occupation || null,

		// Appearance
		appearanceAge: data.appearanceAge || null,
		appearanceHeight: data.appearanceHeight || null,
		appearanceBuild: data.appearanceBuild || null,
		appearanceHair: data.appearanceHair || null,
		appearanceEyes: data.appearanceEyes || null,
		appearanceDistinguishingFeatures: data.appearanceDistinguishingFeatures
			? JSON.stringify(data.appearanceDistinguishingFeatures)
			: null,
		appearanceClothing: data.appearanceClothing || null,
		visualSummary: data.visualSummary || null,

		// Personality
		personalityArchetype: data.personalityArchetype || null,
		personalityTemperament: data.personalityTemperament || null,
		personalityPositiveTraits: data.personalityPositiveTraits
			? JSON.stringify(data.personalityPositiveTraits)
			: null,
		personalityNegativeTraits: data.personalityNegativeTraits
			? JSON.stringify(data.personalityNegativeTraits)
			: null,
		personalityMoralAlignment: data.personalityMoralAlignment || null,

		// Background & Psychology
		background: data.background || null,
		motivations: data.motivations ? JSON.stringify(data.motivations) : null,
		fears: data.fears ? JSON.stringify(data.fears) : null,
		secrets: data.secrets ? JSON.stringify(data.secrets) : null,

		// Combat
		primaryWeapons: data.primaryWeapons || null,
		fightingStyle: data.fightingStyle || null,
		tacticalRole: data.tacticalRole || null,

		// Voice
		speechStyle: data.speechStyle || null,
		signaturePhrases: data.signaturePhrases ? JSON.stringify(data.signaturePhrases) : null,

		// Notes
		notes: data.notes || null,

		// Media
		portraitImageId: data.portraitImageId || null,
		contentItemId: null, // TODO: Create content_item for prose description

		// Timestamps
		createdAt: now,
		updatedAt: now
	};

	await drizzleDb.insert(character).values(characterData).execute();

	return { id, slug };
}

/**
 * Get a character by slug
 */
export async function getCharacterBySlug(
	db: D1Database,
	slug: string,
	workspaceId: string
): Promise<any | null> {
	const drizzleDb = drizzle(db);

	const results = await drizzleDb
		.select()
		.from(character)
		.where(and(eq(character.slug, slug), eq(character.workspaceId, workspaceId)))
		.limit(1)
		.all();

	if (results.length === 0) return null;

	// Parse JSON fields back to arrays
	const char = results[0];
	return {
		...char,
		aliases: char.aliases ? JSON.parse(char.aliases) : [],
		appearanceDistinguishingFeatures: char.appearanceDistinguishingFeatures
			? JSON.parse(char.appearanceDistinguishingFeatures)
			: [],
		personalityPositiveTraits: char.personalityPositiveTraits
			? JSON.parse(char.personalityPositiveTraits)
			: [],
		personalityNegativeTraits: char.personalityNegativeTraits
			? JSON.parse(char.personalityNegativeTraits)
			: [],
		motivations: char.motivations ? JSON.parse(char.motivations) : [],
		fears: char.fears ? JSON.parse(char.fears) : [],
		secrets: char.secrets ? JSON.parse(char.secrets) : [],
		signaturePhrases: char.signaturePhrases ? JSON.parse(char.signaturePhrases) : []
	};
}

/**
 * Update an existing character
 */
export async function updateCharacter(
	db: D1Database,
	slug: string,
	data: CharacterUpdate,
	workspaceId: string
): Promise<void> {
	const drizzleDb = drizzle(db);

	const now = new Date().toISOString();

	// Convert array fields to JSON strings
	const updateData: any = {
		updatedAt: now
	};

	// Only update provided fields
	if (data.name !== undefined) updateData.name = data.name;
	if (data.aliases !== undefined) updateData.aliases = JSON.stringify(data.aliases);
	if (data.race !== undefined) updateData.race = data.race;
	if (data.characterClass !== undefined) updateData.characterClass = data.characterClass;
	if (data.role !== undefined) updateData.role = data.role;
	if (data.status !== undefined) updateData.status = data.status;
	if (data.firstAppearance !== undefined) updateData.firstAppearance = data.firstAppearance;
	if (data.faction !== undefined) updateData.faction = data.faction;
	if (data.occupation !== undefined) updateData.occupation = data.occupation;

	// Appearance
	if (data.appearanceAge !== undefined) updateData.appearanceAge = data.appearanceAge;
	if (data.appearanceHeight !== undefined) updateData.appearanceHeight = data.appearanceHeight;
	if (data.appearanceBuild !== undefined) updateData.appearanceBuild = data.appearanceBuild;
	if (data.appearanceHair !== undefined) updateData.appearanceHair = data.appearanceHair;
	if (data.appearanceEyes !== undefined) updateData.appearanceEyes = data.appearanceEyes;
	if (data.appearanceDistinguishingFeatures !== undefined)
		updateData.appearanceDistinguishingFeatures = JSON.stringify(
			data.appearanceDistinguishingFeatures
		);
	if (data.appearanceClothing !== undefined)
		updateData.appearanceClothing = data.appearanceClothing;
	if (data.visualSummary !== undefined) updateData.visualSummary = data.visualSummary;

	// Personality
	if (data.personalityArchetype !== undefined)
		updateData.personalityArchetype = data.personalityArchetype;
	if (data.personalityTemperament !== undefined)
		updateData.personalityTemperament = data.personalityTemperament;
	if (data.personalityPositiveTraits !== undefined)
		updateData.personalityPositiveTraits = JSON.stringify(data.personalityPositiveTraits);
	if (data.personalityNegativeTraits !== undefined)
		updateData.personalityNegativeTraits = JSON.stringify(data.personalityNegativeTraits);
	if (data.personalityMoralAlignment !== undefined)
		updateData.personalityMoralAlignment = data.personalityMoralAlignment;

	// Background
	if (data.background !== undefined) updateData.background = data.background;
	if (data.motivations !== undefined) updateData.motivations = JSON.stringify(data.motivations);
	if (data.fears !== undefined) updateData.fears = JSON.stringify(data.fears);
	if (data.secrets !== undefined) updateData.secrets = JSON.stringify(data.secrets);

	// Combat
	if (data.primaryWeapons !== undefined) updateData.primaryWeapons = data.primaryWeapons;
	if (data.fightingStyle !== undefined) updateData.fightingStyle = data.fightingStyle;
	if (data.tacticalRole !== undefined) updateData.tacticalRole = data.tacticalRole;

	// Voice
	if (data.speechStyle !== undefined) updateData.speechStyle = data.speechStyle;
	if (data.signaturePhrases !== undefined)
		updateData.signaturePhrases = JSON.stringify(data.signaturePhrases);

	// Notes
	if (data.notes !== undefined) updateData.notes = data.notes;

	// Media
	if (data.portraitImageId !== undefined) updateData.portraitImageId = data.portraitImageId;

	await drizzleDb
		.update(character)
		.set(updateData)
		.where(and(eq(character.slug, slug), eq(character.workspaceId, workspaceId)))
		.execute();
}

/**
 * Delete a character by slug
 */
export async function deleteCharacter(
	db: D1Database,
	slug: string,
	workspaceId: string
): Promise<void> {
	const drizzleDb = drizzle(db);

	await drizzleDb
		.delete(character)
		.where(and(eq(character.slug, slug), eq(character.workspaceId, workspaceId)))
		.execute();
}

/**
 * List all characters in a workspace
 */
export async function listCharacters(
	db: D1Database,
	workspaceId: string,
	options?: {
		limit?: number;
		offset?: number;
		role?: string;
		status?: string;
	}
): Promise<any[]> {
	const drizzleDb = drizzle(db);

	let query = drizzleDb
		.select({
			id: character.id,
			slug: character.slug,
			name: character.name,
			race: character.race,
			characterClass: character.characterClass,
			role: character.role,
			status: character.status,
			faction: character.faction,
			portraitImageId: character.portraitImageId,
			createdAt: character.createdAt,
			updatedAt: character.updatedAt
		})
		.from(character)
		.where(eq(character.workspaceId, workspaceId));

	// Apply filters
	if (options?.role) {
		query = query.where(eq(character.role, options.role));
	}
	if (options?.status) {
		query = query.where(eq(character.status, options.status));
	}

	// Apply pagination
	if (options?.limit) {
		query = query.limit(options.limit);
	}
	if (options?.offset) {
		query = query.offset(options.offset);
	}

	return await query.all();
}

// ============================================================================
// Location CRUD Operations
// ============================================================================

/**
 * Create a new location in the database
 */
export async function createLocation(
	db: D1Database,
	data: LocationCreate,
	workspaceId: string
): Promise<{ id: string; slug: string }> {
	const drizzleDb = drizzle(db);

	const id = crypto.randomUUID();
	const now = new Date().toISOString();

	// Generate slug from name if not provided
	let slug = data.slug || generateSlug(data.name);

	// Check for slug uniqueness
	const existingSlugs = await drizzleDb
		.select({ slug: location.slug })
		.from(location)
		.where(eq(location.workspaceId, workspaceId))
		.all();

	slug = makeSlugUnique(slug, existingSlugs.map((r) => r.slug));

	// Convert array fields to JSON strings
	const locationData = {
		id,
		workspaceId,
		slug,
		name: data.name,

		// Basic Info
		locationType: data.locationType || null,
		region: data.region || null,
		parentLocationId: data.parentLocationId || null,
		significanceLevel: data.significanceLevel || null,
		firstAppearance: data.firstAppearance || null,

		// Descriptions
		quickDescription: data.quickDescription || null,
		visualSummary: data.visualSummary || null,
		atmosphere: data.atmosphere || null,
		history: data.history || null,
		storyRole: data.storyRole || null,
		accessibility: data.accessibility || null,

		// Content (arrays)
		notableLandmarks: data.notableLandmarks ? JSON.stringify(data.notableLandmarks) : null,
		keyPersonnel: data.keyPersonnel ? JSON.stringify(data.keyPersonnel) : null,
		hazardsDangers: data.hazardsDangers ? JSON.stringify(data.hazardsDangers) : null,
		connections: data.connections ? JSON.stringify(data.connections) : null,

		contentItemId: null, // TODO: Create content_item for prose description

		createdAt: now,
		updatedAt: now
	};

	await drizzleDb.insert(location).values(locationData).execute();

	return { id, slug };
}

/**
 * Get a location by slug
 */
export async function getLocationBySlug(
	db: D1Database,
	slug: string,
	workspaceId: string
): Promise<any | null> {
	const drizzleDb = drizzle(db);

	const results = await drizzleDb
		.select()
		.from(location)
		.where(and(eq(location.slug, slug), eq(location.workspaceId, workspaceId)))
		.limit(1)
		.all();

	if (results.length === 0) return null;

	// Parse JSON fields back to arrays
	const loc = results[0];
	return {
		...loc,
		notableLandmarks: loc.notableLandmarks ? JSON.parse(loc.notableLandmarks) : [],
		keyPersonnel: loc.keyPersonnel ? JSON.parse(loc.keyPersonnel) : [],
		hazardsDangers: loc.hazardsDangers ? JSON.parse(loc.hazardsDangers) : [],
		connections: loc.connections ? JSON.parse(loc.connections) : []
	};
}

/**
 * Update an existing location
 */
export async function updateLocation(
	db: D1Database,
	slug: string,
	data: LocationUpdate,
	workspaceId: string
): Promise<void> {
	const drizzleDb = drizzle(db);

	const now = new Date().toISOString();

	const updateData: any = {
		updatedAt: now
	};

	// Only update provided fields
	if (data.name !== undefined) updateData.name = data.name;
	if (data.locationType !== undefined) updateData.locationType = data.locationType;
	if (data.region !== undefined) updateData.region = data.region;
	if (data.parentLocationId !== undefined) updateData.parentLocationId = data.parentLocationId;
	if (data.significanceLevel !== undefined) updateData.significanceLevel = data.significanceLevel;
	if (data.firstAppearance !== undefined) updateData.firstAppearance = data.firstAppearance;

	// Descriptions
	if (data.quickDescription !== undefined) updateData.quickDescription = data.quickDescription;
	if (data.visualSummary !== undefined) updateData.visualSummary = data.visualSummary;
	if (data.atmosphere !== undefined) updateData.atmosphere = data.atmosphere;
	if (data.history !== undefined) updateData.history = data.history;
	if (data.storyRole !== undefined) updateData.storyRole = data.storyRole;
	if (data.accessibility !== undefined) updateData.accessibility = data.accessibility;

	// Content (arrays)
	if (data.notableLandmarks !== undefined)
		updateData.notableLandmarks = JSON.stringify(data.notableLandmarks);
	if (data.keyPersonnel !== undefined)
		updateData.keyPersonnel = JSON.stringify(data.keyPersonnel);
	if (data.hazardsDangers !== undefined)
		updateData.hazardsDangers = JSON.stringify(data.hazardsDangers);
	if (data.connections !== undefined) updateData.connections = JSON.stringify(data.connections);

	await drizzleDb
		.update(location)
		.set(updateData)
		.where(and(eq(location.slug, slug), eq(location.workspaceId, workspaceId)))
		.execute();
}

/**
 * Delete a location by slug
 */
export async function deleteLocation(
	db: D1Database,
	slug: string,
	workspaceId: string
): Promise<void> {
	const drizzleDb = drizzle(db);

	await drizzleDb
		.delete(location)
		.where(and(eq(location.slug, slug), eq(location.workspaceId, workspaceId)))
		.execute();
}

/**
 * List all locations in a workspace
 */
export async function listLocations(
	db: D1Database,
	workspaceId: string,
	options?: {
		limit?: number;
		offset?: number;
		locationType?: string;
		significanceLevel?: string;
	}
): Promise<any[]> {
	const drizzleDb = drizzle(db);

	let query = drizzleDb
		.select({
			id: location.id,
			slug: location.slug,
			name: location.name,
			locationType: location.locationType,
			region: location.region,
			significanceLevel: location.significanceLevel,
			createdAt: location.createdAt,
			updatedAt: location.updatedAt
		})
		.from(location)
		.where(eq(location.workspaceId, workspaceId));

	// Apply filters
	if (options?.locationType) {
		query = query.where(eq(location.locationType, options.locationType));
	}
	if (options?.significanceLevel) {
		query = query.where(eq(location.significanceLevel, options.significanceLevel));
	}

	// Apply pagination
	if (options?.limit) {
		query = query.limit(options.limit);
	}
	if (options?.offset) {
		query = query.offset(options.offset);
	}

	return await query.all();
}
