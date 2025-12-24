/**
 * Character management tools
 * Query, create, edit, and explore characters in your story
 */

import { z } from 'zod';
import { getStorage } from '../services/storage.js';
import { getConfig } from '../services/config.js';
import type { Character, Relationship } from '../types/index.js';
import * as d1 from '../services/d1.js';
import { getLogger } from '../services/logger.js';
import { elicitEntitySelection, formatCandidatesForGuidance } from '../services/elicitation.js';

/**
 * Transform D1 CharacterRow to Character type
 * Parses JSON fields from the dedicated character table schema
 */
export function characterRowToCharacter(row: d1.CharacterRow): Character {
  const logger = getLogger();

  // Helper to safely parse JSON arrays
  const parseJsonArray = (field: string | null): string[] | undefined => {
    if (!field) return undefined;
    try {
      return JSON.parse(field);
    } catch (error) {
      logger.debug('Failed to parse JSON array', { module: 'characters', field, error });
      return undefined;
    }
  };

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    slug: row.slug,
    name: row.name,
    aliases: parseJsonArray(row.aliases),

    // Physical appearance
    appearance: {
      age: row.appearance_age || undefined,
      height: row.appearance_height || undefined,
      build: row.appearance_build || undefined,
      hair: row.appearance_hair || undefined,
      eyes: row.appearance_eyes || undefined,
      distinguishingFeatures: parseJsonArray(row.appearance_distinguishing_features),
      clothing: row.appearance_clothing || undefined,
    },

    // Personality & background
    personality: row.personality_archetype || undefined,
    background: row.background || undefined,
    motivations: parseJsonArray(row.motivations),
    fears: parseJsonArray(row.fears),
    secrets: parseJsonArray(row.secrets),

    // Speech patterns
    speechPatterns: {
      vocabulary: row.speech_style || undefined,
      quirks: undefined, // TODO: Add quirks field to schema if needed
      catchphrases: parseJsonArray(row.signature_phrases),
    },

    // Story role
    role: row.role as Character['role'],
    faction: row.faction || undefined,
    occupation: row.occupation || undefined,
    status: (row.status as Character['status']) || 'alive',

    // Relationships (TODO: Query character_relationship table separately)
    relationships: [],

    // Media (TODO: Query image table if needed)
    portraitUrl: undefined,
    galleryUrls: undefined,

    // Metadata
    firstAppearance: row.first_appearance || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Transform D1 ContentItemRow to Character type (legacy support)
 * Parses metadata_json to extract character-specific fields
 */
function contentItemToCharacter(row: d1.ContentItemRow): Character {
  let metadata: Record<string, unknown> = {};

  try {
    metadata = row.metadata_json ? JSON.parse(row.metadata_json) : {};
  } catch (error) {
    const logger = getLogger();
    logger.debug('Failed to parse metadata_json for character', { module: 'characters', slug: row.slug, error });
  }

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    slug: row.slug,
    name: row.title,
    aliases: metadata.aliases as string[] | undefined,

    // Physical & personality
    appearance: metadata.appearance as Character['appearance'],
    personality: metadata.personality as string | undefined,
    background: metadata.background as string | undefined,
    motivations: metadata.motivations as string[] | undefined,
    fears: metadata.fears as string[] | undefined,
    secrets: metadata.secrets as string[] | undefined,
    speechPatterns: metadata.speechPatterns as Character['speechPatterns'],

    // Story role
    role: metadata.role as Character['role'],
    faction: metadata.faction as string | undefined,
    occupation: metadata.occupation as string | undefined,
    status: (metadata.status as Character['status']) || 'alive',

    // Relationships
    relationships: (metadata.relationships as Relationship[]) || [],

    // Media
    portraitUrl: metadata.portraitUrl as string | undefined,
    galleryUrls: metadata.galleryUrls as string[] | undefined,

    // Metadata
    firstAppearance: metadata.firstAppearance as string | undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Result types for fuzzy search + elicitation
export type MatchType = 'exact' | 'fuzzy' | 'elicited' | 'ambiguous';

export interface MatchInfo {
  type: MatchType;
  originalQuery: string;
  matchCount: number;
}

export interface GetCharacterResult {
  character: Character | null;
  candidates?: Character[];
  matchInfo?: MatchInfo;
  guidanceMessage?: string;
}

// Tool schemas
export const getCharacterSchema = z.object({
  name: z.string().describe('Character name or slug to look up'),
});

export const listCharactersSchema = z.object({
  role: z.enum(['protagonist', 'antagonist', 'supporting', 'minor']).optional()
    .describe('Filter by story role'),
  faction: z.string().optional().describe('Filter by faction/group'),
  status: z.enum(['alive', 'deceased', 'unknown']).optional()
    .describe('Filter by status'),
});

export const createCharacterSchema = z.object({
  name: z.string().describe('Character name'),
  role: z.enum(['protagonist', 'antagonist', 'supporting', 'minor']).optional(),
  appearance: z.object({
    age: z.string().optional(),
    height: z.string().optional(),
    build: z.string().optional(),
    hair: z.string().optional(),
    eyes: z.string().optional(),
    distinguishingFeatures: z.array(z.string()).optional(),
    clothing: z.string().optional(),
  }).optional(),
  personality: z.string().optional().describe('Personality description'),
  background: z.string().optional().describe('Character background/history'),
  motivations: z.array(z.string()).optional(),
  fears: z.array(z.string()).optional(),
  secrets: z.array(z.string()).optional(),
  faction: z.string().optional(),
  occupation: z.string().optional(),
});

export const editCharacterSchema = z.object({
  name: z.string().describe('Character name or slug to edit'),
  updates: z.object({
    appearance: z.object({
      age: z.string().optional(),
      height: z.string().optional(),
      build: z.string().optional(),
      hair: z.string().optional(),
      eyes: z.string().optional(),
      distinguishingFeatures: z.array(z.string()).optional(),
      clothing: z.string().optional(),
    }).optional(),
    personality: z.string().optional(),
    background: z.string().optional(),
    motivations: z.array(z.string()).optional(),
    fears: z.array(z.string()).optional(),
    secrets: z.array(z.string()).optional(),
    role: z.enum(['protagonist', 'antagonist', 'supporting', 'minor']).optional(),
    faction: z.string().optional(),
    occupation: z.string().optional(),
    status: z.enum(['alive', 'deceased', 'unknown']).optional(),
  }).describe('Fields to update'),
});

export const addRelationshipSchema = z.object({
  character: z.string().describe('Character to add relationship to'),
  target: z.string().describe('Target character name'),
  type: z.enum(['ally', 'rival', 'mentor', 'student', 'family', 'romantic', 'enemy', 'neutral']),
  description: z.string().optional().describe('Relationship description'),
  bidirectional: z.boolean().optional().describe('Add reverse relationship too'),
});

export const getRelationshipsSchema = z.object({
  name: z.string().describe('Character name to get relationships for'),
});

/**
 * Format a character for elicitation display
 */
function formatCharacterOption(character: Character): string {
  const parts: string[] = [];
  if (character.role) parts.push(character.role);
  if (character.faction) parts.push(character.faction);
  if (character.occupation) parts.push(character.occupation);
  return parts.length > 0 ? parts.join(' - ') : 'no details';
}

// Tool implementations
export async function getCharacter(input: z.infer<typeof getCharacterSchema>): Promise<GetCharacterResult> {
  const logger = getLogger();
  const searchTerm = input.name.trim();

  // Try D1 first if available
  if (d1.isD1Available()) {
    try {
      // Step 1: Try exact slug match first (fast path)
      const exactMatch = await d1.getCharacter(searchTerm);
      if (exactMatch) {
        return {
          character: characterRowToCharacter(exactMatch),
          matchInfo: { type: 'exact', originalQuery: searchTerm, matchCount: 1 }
        };
      }

      // Step 2: Fuzzy search
      const fuzzyResults = await d1.searchCharacters(searchTerm, { limit: 5 });

      if (fuzzyResults.length === 0) {
        // No matches at all
        return {
          character: null,
          matchInfo: { type: 'fuzzy', originalQuery: searchTerm, matchCount: 0 }
        };
      }

      if (fuzzyResults.length === 1) {
        // Single match - return it
        logger.debug('Single fuzzy match found', {
          module: 'characters',
          query: searchTerm,
          matchedSlug: fuzzyResults[0].slug
        });
        return {
          character: characterRowToCharacter(fuzzyResults[0]),
          matchInfo: { type: 'fuzzy', originalQuery: searchTerm, matchCount: 1 }
        };
      }

      // Step 3: Multiple matches - try elicitation
      const candidates = fuzzyResults.map(characterRowToCharacter);
      const elicitResult = await elicitEntitySelection(
        'character',
        candidates,
        searchTerm,
        formatCharacterOption
      );

      if (elicitResult.success && elicitResult.selected) {
        return {
          character: elicitResult.selected,
          matchInfo: { type: 'elicited', originalQuery: searchTerm, matchCount: fuzzyResults.length }
        };
      }

      // Elicitation declined or not supported - return ambiguous result with guidance
      const guidanceMessage = formatCandidatesForGuidance(
        'character',
        candidates,
        searchTerm,
        formatCharacterOption
      );

      return {
        character: null,
        candidates,
        matchInfo: { type: 'ambiguous', originalQuery: searchTerm, matchCount: fuzzyResults.length },
        guidanceMessage
      };

    } catch (error) {
      logger.warn('D1 fuzzy search failed for character, falling back to storage', {
        module: 'characters',
        error: (error as Error).message
      });
      // Fall through to storage
    }
  }

  // Fallback to local storage (existing exact-match logic)
  const config = getConfig();
  const storage = getStorage();
  const character = storage.getCharacter(config.workspace.id, searchTerm);

  return {
    character,
    matchInfo: { type: 'exact', originalQuery: searchTerm, matchCount: character ? 1 : 0 }
  };
}

export async function listCharacters(input: z.infer<typeof listCharactersSchema>): Promise<Character[]> {
  const logger = getLogger();

  // Try D1 first if available
  if (d1.isD1Available()) {
    try {
      // Query character table with workspace filtering
      const rows = await d1.listCharacters({ workspaceId: 'default' });
      let characters = rows.map(characterRowToCharacter);

      logger.debug('D1 query returned characters', {
        module: 'characters',
        count: characters.length
      });

      // Apply filters
      if (input.role) {
        characters = characters.filter(c => c.role === input.role);
      }
      if (input.faction) {
        characters = characters.filter(c => c.faction === input.faction);
      }
      if (input.status) {
        characters = characters.filter(c => c.status === input.status);
      }

      // If D1 returned no results AND no filters were applied, fall back to storage
      if (characters.length === 0 && !input.role && !input.faction && !input.status) {
        logger.debug('D1 returned no characters, falling back to storage', { module: 'characters' });
        // Fall through to storage
      } else {
        return characters;
      }
    } catch (error) {
      logger.warn('D1 query failed for characters, falling back to storage', {
        module: 'characters',
        error: (error as Error).message
      });
      // Fall through to storage
    }
  }

  // Fallback to local storage
  const config = getConfig();
  const storage = getStorage();
  return storage.listCharacters(config.workspace.id, input);
}

export function createCharacter(input: z.infer<typeof createCharacterSchema>): Character {
  const config = getConfig();
  const storage = getStorage();

  const now = new Date().toISOString();
  const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const id = `char_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const character: Character = {
    id,
    workspaceId: config.workspace.id,
    slug,
    name: input.name,
    role: input.role,
    appearance: input.appearance,
    personality: input.personality,
    background: input.background,
    motivations: input.motivations,
    fears: input.fears,
    secrets: input.secrets,
    faction: input.faction,
    occupation: input.occupation,
    status: 'alive',
    relationships: [],
    createdAt: now,
    updatedAt: now,
  };

  storage.saveCharacter(character);
  return character;
}

export function editCharacter(input: z.infer<typeof editCharacterSchema>): Character {
  const config = getConfig();
  const storage = getStorage();

  const existing = storage.getCharacter(config.workspace.id, input.name);
  if (!existing) {
    throw new Error(`Character not found: ${input.name}`);
  }

  const updated: Character = {
    ...existing,
    ...input.updates,
    appearance: input.updates.appearance
      ? { ...existing.appearance, ...input.updates.appearance }
      : existing.appearance,
    updatedAt: new Date().toISOString(),
  };

  storage.saveCharacter(updated);
  return updated;
}

export function addRelationship(input: z.infer<typeof addRelationshipSchema>): Character {
  const config = getConfig();
  const storage = getStorage();

  const character = storage.getCharacter(config.workspace.id, input.character);
  if (!character) {
    throw new Error(`Character not found: ${input.character}`);
  }

  const target = storage.getCharacter(config.workspace.id, input.target);
  if (!target) {
    throw new Error(`Target character not found: ${input.target}`);
  }

  // Add relationship to character
  const relationships = character.relationships || [];
  const existingIdx = relationships.findIndex(r => r.targetId === target.id);

  const newRelationship: Relationship = {
    targetId: target.id,
    targetName: target.name,
    type: input.type,
    description: input.description,
  };

  if (existingIdx >= 0) {
    relationships[existingIdx] = newRelationship;
  } else {
    relationships.push(newRelationship);
  }

  character.relationships = relationships;
  character.updatedAt = new Date().toISOString();
  storage.saveCharacter(character);

  // Add bidirectional relationship if requested
  if (input.bidirectional) {
    const reverseType = getReciprocalRelationType(input.type);
    const targetRelationships = target.relationships || [];
    const existingReverseIdx = targetRelationships.findIndex(r => r.targetId === character.id);

    const reverseRelationship: Relationship = {
      targetId: character.id,
      targetName: character.name,
      type: reverseType,
      description: input.description,
    };

    if (existingReverseIdx >= 0) {
      targetRelationships[existingReverseIdx] = reverseRelationship;
    } else {
      targetRelationships.push(reverseRelationship);
    }

    target.relationships = targetRelationships;
    target.updatedAt = new Date().toISOString();
    storage.saveCharacter(target);
  }

  return character;
}

export async function getRelationships(input: z.infer<typeof getRelationshipsSchema>): Promise<{
  character: string;
  relationships: Relationship[];
}> {
  // Try D1 first if available
  if (d1.isD1Available()) {
    try {
      const row = await d1.getCharacter(input.name);
      if (row) {
        const character = characterRowToCharacter(row);
        return {
          character: character.name,
          relationships: character.relationships || [],
        };
      }
      // Not found in D1, fall through to storage
    } catch (error) {
      const logger = getLogger();
      logger.warn('D1 query failed for character relationships, falling back to storage', { module: 'characters', error });
      // Fall through to storage
    }
  }

  // Fallback to local storage
  const config = getConfig();
  const storage = getStorage();
  const character = storage.getCharacter(config.workspace.id, input.name);
  if (!character) {
    throw new Error(`Character not found: ${input.name}`);
  }

  return {
    character: character.name,
    relationships: character.relationships || [],
  };
}

function getReciprocalRelationType(type: Relationship['type']): Relationship['type'] {
  switch (type) {
    case 'mentor': return 'student';
    case 'student': return 'mentor';
    case 'ally': return 'ally';
    case 'rival': return 'rival';
    case 'enemy': return 'enemy';
    case 'family': return 'family';
    case 'romantic': return 'romantic';
    case 'neutral': return 'neutral';
    default: return 'neutral';
  }
}

// Format character for display
export function formatCharacterSummary(character: Character): string {
  const lines: string[] = [];

  lines.push(`# ${character.name}`);
  if (character.role) lines.push(`**Role:** ${character.role}`);
  if (character.faction) lines.push(`**Faction:** ${character.faction}`);
  if (character.occupation) lines.push(`**Occupation:** ${character.occupation}`);
  if (character.status) lines.push(`**Status:** ${character.status}`);

  if (character.appearance) {
    lines.push('\n## Appearance');
    const app = character.appearance;
    if (app.age) lines.push(`- Age: ${app.age}`);
    if (app.height) lines.push(`- Height: ${app.height}`);
    if (app.build) lines.push(`- Build: ${app.build}`);
    if (app.hair) lines.push(`- Hair: ${app.hair}`);
    if (app.eyes) lines.push(`- Eyes: ${app.eyes}`);
    if (app.distinguishingFeatures?.length) {
      lines.push(`- Features: ${app.distinguishingFeatures.join(', ')}`);
    }
    if (app.clothing) lines.push(`- Clothing: ${app.clothing}`);
  }

  if (character.personality) {
    lines.push(`\n## Personality\n${character.personality}`);
  }

  if (character.background) {
    lines.push(`\n## Background\n${character.background}`);
  }

  if (character.motivations?.length) {
    lines.push('\n## Motivations');
    character.motivations.forEach(m => lines.push(`- ${m}`));
  }

  if (character.fears?.length) {
    lines.push('\n## Fears');
    character.fears.forEach(f => lines.push(`- ${f}`));
  }

  if (character.secrets?.length) {
    lines.push('\n## Secrets');
    character.secrets.forEach(s => lines.push(`- ${s}`));
  }

  if (character.relationships?.length) {
    lines.push('\n## Relationships');
    character.relationships.forEach(r => {
      lines.push(`- **${r.targetName}** (${r.type})${r.description ? `: ${r.description}` : ''}`);
    });
  }

  return lines.join('\n');
}
