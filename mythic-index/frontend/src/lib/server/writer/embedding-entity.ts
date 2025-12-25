/**
 * Entity-level embedding service for Vectorize integration
 *
 * This service generates embeddings for entire entities (chapters, characters, locations, zones)
 * rather than individual blocks, matching the documented architecture.
 *
 * Benefits of entity-level embeddings:
 * - Preserves full narrative context (no fragmentation)
 * - Simpler ID mapping (vector ID = entity ID)
 * - Smaller index size (~115 entities vs 10K+ blocks)
 * - Better search relevance (whole entities, not snippets)
 * - Matches BGE-M3 capacity (8,192 tokens = ~32K chars)
 */

import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { character, location, contentItem, locationZone } from '../db/schema';

// ============================================================================
// Types
// ============================================================================

interface VectorMetadata {
	kind: 'character' | 'location' | 'chapter' | 'zone';
	slug: string;
	title: string;
	textPreview: string;
}

interface EmbeddingResult {
	success: boolean;
	vectorId?: string;
	error?: string;
}

// ============================================================================
// Entity-Level Embedding Service
// ============================================================================

export class EntityEmbeddingService {
	constructor(
		private ai: Ai,
		private vectorize: VectorizeIndex
	) {}

	/**
	 * Check if AI and Vectorize bindings are available
	 */
	isAvailable(): boolean {
		return !!this.ai && !!this.vectorize;
	}

	/**
	 * Generate embedding for a character entity
	 * Concatenates all relevant character fields into a single text blob
	 */
	async embedCharacter(
		characterId: string,
		db: D1Database
	): Promise<EmbeddingResult> {
		try {
			const drizzleDb = drizzle(db);

			// Fetch character from database
			const chars = await drizzleDb
				.select()
				.from(character)
				.where(eq(character.id, characterId))
				.limit(1)
				.all();

			if (chars.length === 0) {
				return { success: false, error: 'Character not found' };
			}

			const char = chars[0];

			// Concatenate all text fields for embedding
			const textParts: string[] = [
				`Name: ${char.name}`,
			];

			// Basic info
			if (char.aliases) {
				const aliases = JSON.parse(char.aliases);
				if (aliases.length > 0) {
					textParts.push(`Also known as: ${aliases.join(', ')}`);
				}
			}
			if (char.race) textParts.push(`Race: ${char.race}`);
			if (char.characterClass) textParts.push(`Class: ${char.characterClass}`);
			if (char.role) textParts.push(`Role: ${char.role}`);
			if (char.faction) textParts.push(`Faction: ${char.faction}`);
			if (char.occupation) textParts.push(`Occupation: ${char.occupation}`);

			// Appearance
			if (char.visualSummary) {
				textParts.push(`Appearance: ${char.visualSummary}`);
			} else {
				const appearance: string[] = [];
				if (char.appearanceAge) appearance.push(`age ${char.appearanceAge}`);
				if (char.appearanceHeight) appearance.push(char.appearanceHeight);
				if (char.appearanceBuild) appearance.push(char.appearanceBuild);
				if (char.appearanceHair) appearance.push(`${char.appearanceHair} hair`);
				if (char.appearanceEyes) appearance.push(`${char.appearanceEyes} eyes`);
				if (appearance.length > 0) {
					textParts.push(`Appearance: ${appearance.join(', ')}`);
				}
			}

			if (char.appearanceDistinguishingFeatures) {
				const features = JSON.parse(char.appearanceDistinguishingFeatures);
				if (features.length > 0) {
					textParts.push(`Distinguishing features: ${features.join(', ')}`);
				}
			}

			// Personality
			if (char.personalityArchetype) textParts.push(`Archetype: ${char.personalityArchetype}`);
			if (char.personalityTemperament) textParts.push(`Temperament: ${char.personalityTemperament}`);

			if (char.personalityPositiveTraits) {
				const traits = JSON.parse(char.personalityPositiveTraits);
				if (traits.length > 0) {
					textParts.push(`Positive traits: ${traits.join(', ')}`);
				}
			}

			if (char.personalityNegativeTraits) {
				const traits = JSON.parse(char.personalityNegativeTraits);
				if (traits.length > 0) {
					textParts.push(`Negative traits: ${traits.join(', ')}`);
				}
			}

			if (char.personalityMoralAlignment) textParts.push(`Moral alignment: ${char.personalityMoralAlignment}`);

			// Background & Psychology
			if (char.background) textParts.push(`Background: ${char.background}`);

			if (char.motivations) {
				const motivations = JSON.parse(char.motivations);
				if (motivations.length > 0) {
					textParts.push(`Motivations: ${motivations.join(', ')}`);
				}
			}

			if (char.fears) {
				const fears = JSON.parse(char.fears);
				if (fears.length > 0) {
					textParts.push(`Fears: ${fears.join(', ')}`);
				}
			}

			// Combat
			if (char.primaryWeapons) textParts.push(`Weapons: ${char.primaryWeapons}`);
			if (char.fightingStyle) textParts.push(`Fighting style: ${char.fightingStyle}`);

			// Voice
			if (char.speechStyle) textParts.push(`Speech style: ${char.speechStyle}`);

			if (char.signaturePhrases) {
				const phrases = JSON.parse(char.signaturePhrases);
				if (phrases.length > 0) {
					textParts.push(`Signature phrases: ${phrases.join('; ')}`);
				}
			}

			// Notes
			if (char.notes) textParts.push(char.notes);

			// Join all parts
			const fullText = textParts.join('\n');

			// Generate metadata
			const metadata: VectorMetadata = {
				kind: 'character',
				slug: char.slug,
				title: char.name,
				textPreview: fullText.substring(0, 200)
			};

			// Generate and upsert embedding
			return await this.generateAndUpsert(characterId, fullText, metadata);

		} catch (error) {
			console.error('Error embedding character:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Generate embedding for a location entity
	 */
	async embedLocation(
		locationId: string,
		db: D1Database
	): Promise<EmbeddingResult> {
		try {
			const drizzleDb = drizzle(db);

			const locs = await drizzleDb
				.select()
				.from(location)
				.where(eq(location.id, locationId))
				.limit(1)
				.all();

			if (locs.length === 0) {
				return { success: false, error: 'Location not found' };
			}

			const loc = locs[0];

			// Concatenate all text fields
			const textParts: string[] = [
				`Name: ${loc.name}`,
			];

			if (loc.locationType) textParts.push(`Type: ${loc.locationType}`);
			if (loc.region) textParts.push(`Region: ${loc.region}`);
			if (loc.quickDescription) textParts.push(loc.quickDescription);
			if (loc.visualSummary) textParts.push(`Visual: ${loc.visualSummary}`);
			if (loc.atmosphere) textParts.push(`Atmosphere: ${loc.atmosphere}`);
			if (loc.history) textParts.push(`History: ${loc.history}`);
			if (loc.storyRole) textParts.push(`Story role: ${loc.storyRole}`);

			if (loc.notableLandmarks) {
				const landmarks = JSON.parse(loc.notableLandmarks);
				if (landmarks.length > 0) {
					textParts.push(`Landmarks: ${landmarks.join(', ')}`);
				}
			}

			const fullText = textParts.join('\n');

			const metadata: VectorMetadata = {
				kind: 'location',
				slug: loc.slug,
				title: loc.name,
				textPreview: fullText.substring(0, 200)
			};

			return await this.generateAndUpsert(locationId, fullText, metadata);

		} catch (error) {
			console.error('Error embedding location:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Generate embedding for a chapter entity
	 * TODO: Implement once chapter content structure is finalized
	 */
	async embedChapter(
		chapterId: string,
		db: D1Database
	): Promise<EmbeddingResult> {
		// TODO: Concatenate chapter content from content_item → content_revision → content_section → content_block
		return {
			success: false,
			error: 'Chapter embedding not yet implemented'
		};
	}

	/**
	 * Generate embedding for a zone entity
	 */
	async embedZone(
		zoneId: string,
		db: D1Database
	): Promise<EmbeddingResult> {
		try {
			const drizzleDb = drizzle(db);

			const zones = await drizzleDb
				.select()
				.from(locationZone)
				.where(eq(locationZone.id, zoneId))
				.limit(1)
				.all();

			if (zones.length === 0) {
				return { success: false, error: 'Zone not found' };
			}

			const zone = zones[0];

			const textParts: string[] = [
				`Name: ${zone.name}`,
			];

			if (zone.zoneType) textParts.push(`Type: ${zone.zoneType}`);
			if (zone.physicalDescription) textParts.push(`Physical: ${zone.physicalDescription}`);
			if (zone.narrativeFunction) textParts.push(`Narrative function: ${zone.narrativeFunction}`);
			if (zone.emotionalRegister) textParts.push(`Emotional register: ${zone.emotionalRegister}`);

			if (zone.signatureDetails) {
				const details = JSON.parse(zone.signatureDetails);
				if (details.length > 0) {
					textParts.push(`Details: ${details.join(', ')}`);
				}
			}

			const fullText = textParts.join('\n');

			const metadata: VectorMetadata = {
				kind: 'zone',
				slug: zone.slug,
				title: zone.name,
				textPreview: fullText.substring(0, 200)
			};

			return await this.generateAndUpsert(zoneId, fullText, metadata);

		} catch (error) {
			console.error('Error embedding zone:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Delete embedding from Vectorize by entity ID
	 */
	async deleteEmbedding(entityId: string): Promise<EmbeddingResult> {
		try {
			await this.vectorize.deleteByIds([entityId]);
			return { success: true, vectorId: entityId };
		} catch (error) {
			console.error('Error deleting embedding:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Private helper: Generate embedding and upsert to Vectorize
	 */
	private async generateAndUpsert(
		id: string,
		text: string,
		metadata: VectorMetadata
	): Promise<EmbeddingResult> {
		try {
			// Generate embedding using Workers AI (BGE-M3 model)
			const response = await this.ai.run('@cf/baai/bge-m3', {
				text: [text] // BGE-M3 accepts array of strings
			});

			// Extract embedding vector
			const embedding = response.data[0];

			if (!embedding || embedding.length === 0) {
				return { success: false, error: 'Failed to generate embedding' };
			}

			// Upsert to Vectorize (vector ID = entity ID)
			await this.vectorize.upsert([
				{
					id,
					values: embedding,
					metadata: {
						kind: metadata.kind,
						slug: metadata.slug,
						title: metadata.title,
						textPreview: metadata.textPreview
					}
				}
			]);

			return { success: true, vectorId: id };

		} catch (error) {
			console.error('Error generating/upserting embedding:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}
}
