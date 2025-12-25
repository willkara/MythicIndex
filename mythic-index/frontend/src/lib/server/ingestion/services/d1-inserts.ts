/**
 * D1 Insert Functions for Content Ingestion
 *
 * Raw SQL insert functions that map parsed content to database tables.
 * Uses the D1 REST API service for Cloudflare D1 connectivity.
 *
 * Provides functions for:
 * - Character and relationship insertion
 * - Location insertion
 * - Chapter and scene insertion with content blocks
 * - Image asset and link management
 */

import { execute, query, batch as _batch } from './d1-rest';
import { MarkdownBlockParser } from '../parser';
import type {
  ParsedCharacter,
  ParsedRelationship,
  ParsedLocation,
  ParsedChapter,
  SceneMarker,
} from '../types';

// ============================================================================
// Logging
// ============================================================================

/**
 * Log level for ingestion operations
 */
export type LogLevel = 'info' | 'debug' | 'warn';

/**
 * Logger function type
 */
export type LogFn = (level: LogLevel, message: string, data?: Record<string, unknown>) => void;

let logger: LogFn | null = null;

/**
 * Set the logger function for detailed ingestion logging
 *
 * @param fn - Logger function or null to disable logging
 */
export function setLogger(fn: LogFn | null): void {
  logger = fn;
}

function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  if (logger) logger(level, message, data);
}

// ============================================================================
// ID Generation
// ============================================================================

function generateId(): string {
  return crypto.randomUUID();
}

function nowISO(): string {
  return new Date().toISOString();
}

function toJsonString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value) && value.length === 0) return null;
  return JSON.stringify(value);
}

// ============================================================================
// Character Operations
// ============================================================================

/**
 * Result of character insertion
 */
export interface InsertCharacterResult {
  id: string;
  slug: string;
}

/**
 * Insert a parsed character into the character table
 *
 * Uses UPSERT (ON CONFLICT) to update existing characters by slug.
 *
 * @param workspaceId - Workspace ID
 * @param char - Parsed character data
 * @param contentItemId - Optional content item ID to link
 * @returns Insert result with character ID and slug
 */
export async function insertCharacter(
  workspaceId: string,
  char: ParsedCharacter,
  contentItemId?: string
): Promise<InsertCharacterResult> {
  log('info', 'Inserting character', { name: char.name, slug: char.slug });
  const id = generateId();
  const now = nowISO();

  const sql = `
		INSERT INTO character (
			id, workspace_id, slug, content_item_id,
			name, aliases, race, character_class, role, status, first_appearance,
			appearance_age, appearance_height, appearance_build, appearance_hair,
			appearance_eyes, appearance_distinguishing_features, appearance_clothing,
			visual_summary,
			personality_archetype, personality_temperament, personality_positive_traits,
			personality_negative_traits, personality_moral_alignment,
			background, motivations, fears, secrets,
			primary_weapons, fighting_style, tactical_role,
			speech_style, signature_phrases,
			faction, occupation, notes,
			portrait_image_id,
			created_at, updated_at
		) VALUES (
			?, ?, ?, ?,
			?, ?, ?, ?, ?, ?, ?,
			?, ?, ?, ?,
			?, ?, ?,
			?,
			?, ?, ?,
			?, ?,
			?, ?, ?, ?,
			?, ?, ?,
			?, ?,
			?, ?, ?,
			?,
			?, ?
		)
		ON CONFLICT(slug) DO UPDATE SET
			name = excluded.name,
			aliases = excluded.aliases,
			race = excluded.race,
			character_class = excluded.character_class,
			role = excluded.role,
			status = excluded.status,
			first_appearance = excluded.first_appearance,
			appearance_age = excluded.appearance_age,
			appearance_height = excluded.appearance_height,
			appearance_build = excluded.appearance_build,
			appearance_hair = excluded.appearance_hair,
			appearance_eyes = excluded.appearance_eyes,
			appearance_distinguishing_features = excluded.appearance_distinguishing_features,
			appearance_clothing = excluded.appearance_clothing,
			visual_summary = excluded.visual_summary,
			personality_archetype = excluded.personality_archetype,
			personality_temperament = excluded.personality_temperament,
			personality_positive_traits = excluded.personality_positive_traits,
			personality_negative_traits = excluded.personality_negative_traits,
			personality_moral_alignment = excluded.personality_moral_alignment,
			background = excluded.background,
			motivations = excluded.motivations,
			fears = excluded.fears,
			secrets = excluded.secrets,
			primary_weapons = excluded.primary_weapons,
			fighting_style = excluded.fighting_style,
			tactical_role = excluded.tactical_role,
			speech_style = excluded.speech_style,
			signature_phrases = excluded.signature_phrases,
			faction = excluded.faction,
			occupation = excluded.occupation,
			notes = excluded.notes,
			updated_at = excluded.updated_at
	`;

  const params = [
    id,
    workspaceId,
    char.slug,
    contentItemId || null,
    char.name,
    toJsonString(char.aliases),
    char.race || null,
    char.characterClass || null,
    char.role || null,
    char.status || 'alive',
    char.firstAppearance || null,
    char.appearance.age || null,
    char.appearance.height || null,
    char.appearance.build || null,
    char.appearance.hair || null,
    char.appearance.eyes || null,
    toJsonString(char.appearance.distinguishingFeatures),
    char.appearance.clothing || null,
    char.visualSummary || null,
    char.personality.archetype || null,
    char.personality.temperament || null,
    toJsonString(char.personality.positiveTraits),
    toJsonString(char.personality.negativeTraits),
    char.personality.moralAlignment || null,
    char.background || null,
    toJsonString(char.motivations),
    toJsonString(char.fears),
    toJsonString(char.secrets),
    char.combat.primaryWeapons || null,
    char.combat.fightingStyle || null,
    char.combat.tacticalRole || null,
    char.voice.speechStyle || null,
    toJsonString(char.voice.signaturePhrases),
    char.faction || null,
    char.occupation || null,
    char.notes || null,
    null, // portrait_image_id
    now,
    now,
  ];

  await execute(sql, params);

  // For upsert, we need to get the actual ID
  const result = await query<{ id: string }>('SELECT id FROM character WHERE slug = ?', [
    char.slug,
  ]);

  const finalId = result[0]?.id || id;
  log('info', 'Character upserted', { id: finalId, slug: char.slug });

  return {
    id: finalId,
    slug: char.slug,
  };
}

/**
 * Get character ID by slug
 */
export async function getCharacterIdBySlug(slug: string): Promise<string | null> {
  const results = await query<{ id: string }>('SELECT id FROM character WHERE slug = ?', [slug]);
  return results[0]?.id || null;
}

/**
 * Delete a character by slug
 */
export async function deleteCharacter(slug: string): Promise<void> {
  await execute('DELETE FROM character WHERE slug = ?', [slug]);
}

// ============================================================================
// Location Operations
// ============================================================================

/**
 * Result of location insertion
 */
export interface InsertLocationResult {
  id: string;
  slug: string;
}

/**
 * Insert a parsed location into the location table
 *
 * Uses UPSERT (ON CONFLICT) to update existing locations by slug.
 *
 * @param workspaceId - Workspace ID
 * @param loc - Parsed location data
 * @param contentItemId - Optional content item ID to link
 * @param parentLocationId - Optional parent location ID
 * @returns Insert result with location ID and slug
 */
export async function insertLocation(
  workspaceId: string,
  loc: ParsedLocation,
  contentItemId?: string,
  parentLocationId?: string
): Promise<InsertLocationResult> {
  log('info', 'Inserting location', { name: loc.name, slug: loc.slug, type: loc.locationType });
  const id = generateId();
  const now = nowISO();

  const sql = `
		INSERT INTO location (
			id, workspace_id, slug, content_item_id,
			name, location_type, region, parent_location_id,
			quick_description, visual_summary, atmosphere, history,
			notable_landmarks, key_personnel,
			story_role, hazards_dangers, connections, accessibility,
			significance_level, first_appearance,
			created_at, updated_at
		) VALUES (
			?, ?, ?, ?,
			?, ?, ?, ?,
			?, ?, ?, ?,
			?, ?,
			?, ?, ?, ?,
			?, ?,
			?, ?
		)
		ON CONFLICT(slug) DO UPDATE SET
			name = excluded.name,
			location_type = excluded.location_type,
			region = excluded.region,
			parent_location_id = excluded.parent_location_id,
			quick_description = excluded.quick_description,
			visual_summary = excluded.visual_summary,
			atmosphere = excluded.atmosphere,
			history = excluded.history,
			notable_landmarks = excluded.notable_landmarks,
			key_personnel = excluded.key_personnel,
			story_role = excluded.story_role,
			hazards_dangers = excluded.hazards_dangers,
			connections = excluded.connections,
			accessibility = excluded.accessibility,
			significance_level = excluded.significance_level,
			first_appearance = excluded.first_appearance,
			updated_at = excluded.updated_at
	`;

  const params = [
    id,
    workspaceId,
    loc.slug,
    contentItemId || null,
    loc.name,
    loc.locationType || null,
    loc.region || null,
    parentLocationId || null,
    loc.quickDescription || null,
    loc.visualSummary || null,
    loc.atmosphere || null,
    loc.history || null,
    toJsonString(loc.notableLandmarks),
    toJsonString(loc.keyPersonnel),
    loc.storyRole || null,
    toJsonString(loc.hazardsDangers),
    toJsonString(loc.connections),
    loc.accessibility || null,
    loc.significanceLevel || null,
    loc.firstAppearance || null,
    now,
    now,
  ];

  await execute(sql, params);

  // For upsert, get the actual ID
  const result = await query<{ id: string }>('SELECT id FROM location WHERE slug = ?', [loc.slug]);

  const finalId = result[0]?.id || id;
  log('info', 'Location upserted', { id: finalId, slug: loc.slug });

  return {
    id: finalId,
    slug: loc.slug,
  };
}

/**
 * Get location ID by slug
 */
export async function getLocationIdBySlug(slug: string): Promise<string | null> {
  const results = await query<{ id: string }>('SELECT id FROM location WHERE slug = ?', [slug]);
  return results[0]?.id || null;
}

/**
 * Delete a location by slug
 */
export async function deleteLocation(slug: string): Promise<void> {
  await execute('DELETE FROM location WHERE slug = ?', [slug]);
}

// ============================================================================
// Relationship Operations
// ============================================================================

export interface InsertRelationshipResult {
  id: string;
  sourceCharacterId: string;
  targetCharacterId: string;
}

/**
 * Insert a character relationship
 */
export async function insertRelationship(
  sourceCharacterId: string,
  targetCharacterId: string,
  relationship: ParsedRelationship
): Promise<InsertRelationshipResult> {
  const id = generateId();
  const now = nowISO();

  const sql = `
		INSERT INTO character_relationship (
			id, source_character_id, target_character_id,
			relationship_type, description, strength,
			created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(source_character_id, target_character_id, relationship_type) DO UPDATE SET
			description = excluded.description,
			strength = excluded.strength,
			updated_at = excluded.updated_at
	`;

  const params = [
    id,
    sourceCharacterId,
    targetCharacterId,
    relationship.relationshipType,
    relationship.description || null,
    relationship.strength || null,
    now,
    now,
  ];

  await execute(sql, params);

  return {
    id,
    sourceCharacterId,
    targetCharacterId,
  };
}

/**
 * Delete all relationships for a character
 */
export async function deleteCharacterRelationships(characterId: string): Promise<void> {
  await execute('DELETE FROM character_relationship WHERE source_character_id = ?', [characterId]);
}

// ============================================================================
// Chapter/Scene Operations
// ============================================================================

/**
 * Result of chapter insertion
 */
export interface InsertChapterResult {
  contentItemId: string;
  revisionId: string;
  sceneIds: string[];
}

/**
 * Insert a chapter into content_item and its scenes
 *
 * Creates or updates content_item, content_revision, scenes, content_sections,
 * and content_blocks. Parses full content with MarkdownBlockParser and links
 * blocks to scenes via scene_segments.
 *
 * @param workspaceId - Workspace ID
 * @param chapter - Parsed chapter data
 * @param authorId - Author identifier (defaults to 'ingestion')
 * @returns Insert result with content item ID, revision ID, and scene IDs
 */
export async function insertChapter(
  workspaceId: string,
  chapter: ParsedChapter,
  authorId: string = 'ingestion'
): Promise<InsertChapterResult> {
  log('info', 'Inserting chapter', {
    title: chapter.title,
    slug: chapter.slug,
    wordCount: chapter.wordCount,
  });
  const contentItemId = generateId();
  const revisionId = generateId();
  const now = nowISO();

  // Build metadata JSON for chapter
  const metadataJson = JSON.stringify({
    pov_character: chapter.povCharacter,
    key_characters: chapter.keyCharacters,
    key_locations: chapter.keyLocations,
    timeline_anchor: chapter.timelineAnchor,
    major_events: chapter.majorEvents,
    motifs: chapter.motifs,
    canon_level: chapter.canonLevel,
  });

  // First, check if content_item exists for this slug
  const existing = await query<{ id: string; default_revision_id: string }>(
    "SELECT id, default_revision_id FROM content_item WHERE slug = ? AND kind = 'chapter'",
    [chapter.slug]
  );

  const existingId = existing[0]?.id;

  if (existingId) {
    log('info', 'Chapter exists, updating', { id: existingId });
    const existingRevisionId = existing[0]?.default_revision_id || revisionId;

    // Update existing content_item
    await execute(
      `UPDATE content_item SET
				title = ?,
				metadata_json = ?,
				word_count = ?,
				updated_by = ?,
				updated_at = ?
			WHERE id = ?`,
      [chapter.title, metadataJson, chapter.wordCount, authorId, now, existingId]
    );

    // Delete existing blocks, sections, and scene segments before recreating
    log('debug', 'Deleting old content blocks and sections');
    await execute(
      `DELETE FROM scene_segment WHERE scene_id IN (SELECT id FROM scene WHERE content_id = ?)`,
      [existingId]
    );
    await execute(
      `DELETE FROM content_block WHERE section_id IN (SELECT id FROM content_section WHERE revision_id = ?)`,
      [existingRevisionId]
    );
    await execute('DELETE FROM content_section WHERE revision_id = ?', [existingRevisionId]);

    // Delete existing scenes for this content
    await execute('DELETE FROM scene WHERE content_id = ?', [existingId]);
    log('debug', 'Old content cleared');

    // Insert scenes
    const sceneIds = await insertScenes(existingId, existingRevisionId, chapter.scenes);
    log('info', 'Scenes inserted', { count: sceneIds.length });

    // Parse and insert content blocks
    const blockStats = await insertContentBlocks(
      existingRevisionId,
      chapter.fullContent,
      sceneIds,
      now
    );
    log('info', 'Chapter update complete', {
      contentItemId: existingId,
      scenes: sceneIds.length,
      blocks: blockStats.totalBlocks,
      blockTypes: blockStats.blockTypes,
    });

    return {
      contentItemId: existingId,
      revisionId: existingRevisionId,
      sceneIds,
    };
  }

  // Insert new content_item
  log('info', 'Creating new chapter');
  await execute(
    `INSERT INTO content_item (
			id, workspace_id, kind, slug, title, summary, status,
			default_revision_id, metadata_json, word_count,
			created_by, updated_by, created_at, updated_at
		) VALUES (?, ?, 'chapter', ?, ?, ?, 'published', ?, ?, ?, ?, ?, ?, ?)`,
    [
      contentItemId,
      workspaceId,
      chapter.slug,
      chapter.title,
      null, // summary
      revisionId,
      metadataJson,
      chapter.wordCount,
      authorId,
      authorId,
      now,
      now,
    ]
  );
  log('debug', 'Inserted content_item', { id: contentItemId });

  // Insert content_revision
  await execute(
    `INSERT INTO content_revision (
			id, content_id, revision_number, state, author_id,
			created_at, updated_at
		) VALUES (?, ?, 1, 'published', ?, ?, ?)`,
    [revisionId, contentItemId, authorId, now, now]
  );
  log('debug', 'Inserted content_revision', { id: revisionId });

  // Insert scenes
  const sceneIds = await insertScenes(contentItemId, revisionId, chapter.scenes);
  log('info', 'Scenes inserted', { count: sceneIds.length });

  // Parse and insert content blocks
  const blockStats = await insertContentBlocks(revisionId, chapter.fullContent, sceneIds, now);
  log('info', 'Chapter creation complete', {
    contentItemId,
    scenes: sceneIds.length,
    blocks: blockStats.totalBlocks,
    blockTypes: blockStats.blockTypes,
  });

  return {
    contentItemId,
    revisionId,
    sceneIds,
  };
}

/**
 * Insert scenes for a chapter
 */
async function insertScenes(
  contentId: string,
  revisionId: string,
  scenes: SceneMarker[]
): Promise<string[]> {
  const now = nowISO();
  const sceneIds: string[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const sceneId = generateId();
    sceneIds.push(sceneId);

    // Calculate estimated read time (average 200 words per minute)
    const estReadSeconds = Math.ceil((scene.wordCount / 200) * 60);

    await execute(
      `INSERT INTO scene (
				id, content_id, revision_id, slug, title,
				sequence_order, synopsis, scene_when,
				primary_location_id, pov_entity_id, est_read_seconds,
				created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sceneId,
        contentId,
        revisionId,
        scene.id,
        scene.title,
        i + 1,
        null, // synopsis - could extract from content
        scene.when || null,
        null, // primary_location_id - resolved later
        null, // pov_entity_id - resolved later
        estReadSeconds,
        now,
        now,
      ]
    );
  }

  return sceneIds;
}

interface BlockStats {
  totalBlocks: number;
  blockTypes: Record<string, number>;
  sceneSegments: number;
}

/**
 * Insert content blocks for a chapter using MarkdownBlockParser
 */
async function insertContentBlocks(
  revisionId: string,
  fullContent: string,
  sceneIds: string[],
  now: string
): Promise<BlockStats> {
  // Parse chapter content into blocks
  const parsed = MarkdownBlockParser.parse(fullContent);

  // Count block types for stats
  const blockTypes: Record<string, number> = {};
  for (const block of parsed.blocks) {
    blockTypes[block.type] = (blockTypes[block.type] || 0) + 1;
  }
  log('debug', 'Parsed content into blocks', { total: parsed.blocks.length, types: blockTypes });

  // Create content_section (main section for chapter content)
  const sectionId = generateId();
  await execute(
    `INSERT INTO content_section (id, revision_id, section_type, title, position, metadata_json, created_at, updated_at)
		 VALUES (?, ?, 'main', 'Main Content', 0, '{}', ?, ?)`,
    [sectionId, revisionId, now, now]
  );
  log('debug', 'Created content_section', { id: sectionId });

  // Track which scene we're in (scene markers indicate transitions)
  let currentSceneIndex = -1; // Start at -1 because first scene_marker increments to 0
  let blockPosition = 0;
  let sceneSegmentCount = 0;

  for (const block of parsed.blocks) {
    const blockId = generateId();

    // Track which scene we're in
    if (block.type === 'scene_marker') {
      currentSceneIndex++;
    }

    // Count words in this block for word_count column
    const blockWordCount = block.text
      ? block.text
          .trim()
          .split(/\s+/)
          .filter(w => w.length > 0).length
      : 0;

    await execute(
      `INSERT INTO content_block (
				id, section_id, block_type, position,
				text_payload, rich_payload, word_count, is_scene_anchor, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        blockId,
        sectionId,
        block.type,
        blockPosition,
        block.text || null,
        block.metadata ? JSON.stringify(block.metadata) : null,
        blockWordCount,
        block.type === 'scene_marker' ? 1 : 0,
        now,
        now,
      ]
    );

    // Link block to scene via scene_segment (if we have scenes and are in a scene)
    if (currentSceneIndex >= 0 && sceneIds[currentSceneIndex]) {
      await execute(
        `INSERT INTO scene_segment (id, scene_id, block_id, span_order, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?)`,
        [generateId(), sceneIds[currentSceneIndex], blockId, blockPosition, now, now]
      );
      sceneSegmentCount++;
    }

    blockPosition++;
  }

  log('debug', 'Inserted content blocks', {
    blocks: blockPosition,
    sceneSegments: sceneSegmentCount,
  });

  return {
    totalBlocks: blockPosition,
    blockTypes,
    sceneSegments: sceneSegmentCount,
  };
}

/**
 * Update scene with location ID
 */
export async function updateSceneLocation(sceneId: string, locationId: string): Promise<void> {
  const now = nowISO();
  await execute('UPDATE scene SET primary_location_id = ?, updated_at = ? WHERE id = ?', [
    locationId,
    now,
    sceneId,
  ]);
}

/**
 * Update scene with POV character ID
 */
export async function updateScenePovCharacter(sceneId: string, characterId: string): Promise<void> {
  const now = nowISO();
  await execute('UPDATE scene SET pov_entity_id = ?, updated_at = ? WHERE id = ?', [
    characterId,
    now,
    sceneId,
  ]);
}

// ============================================================================
// Scene-Character Junction Operations
// ============================================================================

/**
 * Insert a scene-character link
 */
export async function insertSceneCharacter(
  sceneId: string,
  characterId: string,
  role: 'pov' | 'major' | 'minor' | 'mentioned' = 'major'
): Promise<string> {
  const id = generateId();
  const now = nowISO();

  await execute(
    `INSERT INTO scene_character (id, scene_id, character_id, role, created_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(scene_id, character_id) DO UPDATE SET role = excluded.role`,
    [id, sceneId, characterId, role, now]
  );

  return id;
}

/**
 * Delete all scene-character links for a scene
 */
export async function deleteSceneCharacters(sceneId: string): Promise<void> {
  await execute('DELETE FROM scene_character WHERE scene_id = ?', [sceneId]);
}

// ============================================================================
// Scene Tag Operations
// ============================================================================

/**
 * Insert a scene tag
 */
export async function insertSceneTag(sceneId: string, tag: string): Promise<string> {
  const id = generateId();
  const now = nowISO();

  await execute(
    `INSERT INTO scene_tag (id, scene_id, tag, created_at)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(scene_id, tag) DO NOTHING`,
    [id, sceneId, tag, now]
  );

  return id;
}

/**
 * Delete all tags for a scene
 */
export async function deleteSceneTags(sceneId: string): Promise<void> {
  await execute('DELETE FROM scene_tag WHERE scene_id = ?', [sceneId]);
}

// ============================================================================
// Location Zone Operations
// ============================================================================

/**
 * Insert location zones from zones.yaml file
 *
 * Uses two-pass insertion:
 * - Pass 1: Insert all zones with NULL parent_zone_id
 * - Pass 2: Update parent_zone_id references
 *
 * @param workspaceId - Workspace ID
 * @param locationId - Location ID that owns these zones
 * @param zones - Array of parsed zone data
 * @returns Map of zone slugs to zone IDs for linking
 */
export async function insertLocationZones(
  workspaceId: string,
  locationId: string,
  zones: Array<{
    slug: string;
    name: string;
    zoneType?: string;
    locationWithin?: string;
    parentZoneSlug?: string | null;
    physicalDescription?: string;
    narrativeFunction?: string;
    emotionalRegister?: string;
    signatureDetails?: string[];
    lightConditions?: { natural?: string; artificial?: string };
    moodAffinity?: string[];
    characterAssociations?: string[];
    firstAppearance?: string;
    storySignificance?: string;
  }>
): Promise<Map<string, string>> {
  const now = nowISO();
  const slugToIdMap = new Map<string, string>();

  log('info', 'Inserting location zones', { locationId, count: zones.length });

  // Pass 1: Insert all zones with NULL parent_zone_id
  for (const zone of zones) {
    const zoneId = generateId();
    slugToIdMap.set(zone.slug, zoneId);

    await execute(
      `INSERT INTO location_zone (
				id, workspace_id, location_id, slug, name, zone_type,
				location_within, parent_zone_id,
				physical_description, narrative_function, emotional_register,
				signature_details, mood_affinity, character_associations, light_conditions,
				first_appearance, story_significance,
				created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        zoneId,
        workspaceId,
        locationId,
        zone.slug,
        zone.name,
        zone.zoneType || null,
        zone.locationWithin || null,
        null, // parent_zone_id set in pass 2
        zone.physicalDescription || null,
        zone.narrativeFunction || null,
        zone.emotionalRegister || null,
        toJsonString(zone.signatureDetails),
        toJsonString(zone.moodAffinity),
        toJsonString(zone.characterAssociations),
        toJsonString(zone.lightConditions),
        zone.firstAppearance || null,
        zone.storySignificance || null,
        now,
        now,
      ]
    );
  }

  log('debug', 'Inserted zones (pass 1)', { count: zones.length });

  // Pass 2: Update parent_zone_id references
  for (const zone of zones) {
    if (zone.parentZoneSlug) {
      const zoneId = slugToIdMap.get(zone.slug);
      const parentZoneId = slugToIdMap.get(zone.parentZoneSlug);

      if (zoneId && parentZoneId) {
        await execute('UPDATE location_zone SET parent_zone_id = ?, updated_at = ? WHERE id = ?', [
          parentZoneId,
          now,
          zoneId,
        ]);
      } else {
        log('warn', 'Invalid parent zone reference', {
          zone: zone.slug,
          parent: zone.parentZoneSlug,
        });
      }
    }
  }

  log('debug', 'Updated zone parent references (pass 2)');

  return slugToIdMap;
}

/**
 * Insert scene-zone links
 *
 * @param sceneId - Scene ID
 * @param primaryZoneSlug - Primary zone slug (optional)
 * @param locationZones - Additional zone slugs (optional)
 * @param zoneIdMap - Map of zone slugs to zone IDs
 */
export async function insertSceneZoneLinks(
  sceneId: string,
  primaryZoneSlug: string | undefined,
  locationZones: string[] | undefined,
  zoneIdMap: Map<string, string>
): Promise<void> {
  // Insert primary zone with role='primary'
  if (primaryZoneSlug) {
    const zoneId = zoneIdMap.get(primaryZoneSlug);
    if (zoneId) {
      await insertSceneZone(sceneId, zoneId, 'primary');
    } else {
      log('warn', 'Primary zone not found in map', { sceneId, slug: primaryZoneSlug });
    }
  }

  // Insert additional zones with role='secondary'
  if (locationZones && locationZones.length > 0) {
    for (const zoneSlug of locationZones) {
      const zoneId = zoneIdMap.get(zoneSlug);
      if (zoneId) {
        // Skip if this is the same as primary zone
        if (zoneSlug === primaryZoneSlug) continue;
        await insertSceneZone(sceneId, zoneId, 'secondary');
      } else {
        log('warn', 'Zone not found in map', { sceneId, slug: zoneSlug });
      }
    }
  }
}

/**
 * Insert a scene-zone link
 */
export async function insertSceneZone(
  sceneId: string,
  zoneId: string,
  role: 'primary' | 'secondary' | 'mentioned' = 'secondary'
): Promise<string> {
  const id = generateId();
  const now = nowISO();

  await execute(
    `INSERT INTO scene_zone (id, scene_id, zone_id, role, created_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(scene_id, zone_id) DO UPDATE SET role = excluded.role`,
    [id, sceneId, zoneId, role, now]
  );

  return id;
}

/**
 * Delete all scene-zone links for a scene
 */
export async function deleteSceneZones(sceneId: string): Promise<void> {
  await execute('DELETE FROM scene_zone WHERE scene_id = ?', [sceneId]);
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Get all existing character slugs
 */
export async function getAllCharacterSlugs(): Promise<string[]> {
  const results = await query<{ slug: string }>('SELECT slug FROM character');
  return results.map(r => r.slug);
}

/**
 * Get all existing location slugs
 */
export async function getAllLocationSlugs(): Promise<string[]> {
  const results = await query<{ slug: string }>('SELECT slug FROM location');
  return results.map(r => r.slug);
}

/**
 * Get all existing chapter slugs
 */
export async function getAllChapterSlugs(): Promise<string[]> {
  const results = await query<{ slug: string }>(
    "SELECT slug FROM content_item WHERE kind = 'chapter'"
  );
  return results.map(r => r.slug);
}

/**
 * Get scene ID by slug within a chapter
 */
export async function getSceneIdBySlug(
  contentId: string,
  sceneSlug: string
): Promise<string | null> {
  const results = await query<{ id: string }>(
    'SELECT id FROM scene WHERE content_id = ? AND slug = ?',
    [contentId, sceneSlug]
  );
  return results[0]?.id || null;
}

/**
 * Get all scenes for a chapter
 */
export async function getScenesByContentId(contentId: string): Promise<
  Array<{
    id: string;
    slug: string;
    title: string;
    sequenceOrder: number;
  }>
> {
  return query(
    'SELECT id, slug, title, sequence_order as sequenceOrder FROM scene WHERE content_id = ? ORDER BY sequence_order',
    [contentId]
  );
}

// ============================================================================
// Image Asset Operations
// ============================================================================

/**
 * Data for inserting an image asset record
 */
export interface ImageAssetData {
  id: string;
  sourcePath: string;
  storagePath: string;
  fileHash: string;
  fileSizeBytes: number;
  mimeType: string;
  width?: number;
  height?: number;
  generatedByProvider?: string;
  generatedPrompt?: string;
  cloudflareImageId: string;
  cloudflareBaseUrl: string;
  cloudflareVariantNames?: string; // JSON array
}

/**
 * Insert an image asset into the database
 *
 * Deduplicates by file hash - returns existing asset ID if hash matches.
 *
 * @param asset - Image asset data including file hash and Cloudflare details
 * @returns Asset ID (existing or newly created)
 */
export async function insertImageAsset(asset: ImageAssetData): Promise<string> {
  const now = nowISO();

  // Check if already exists by file hash (dedup)
  const existing = await query<{ id: string }>('SELECT id FROM image_asset WHERE file_hash = ?', [
    asset.fileHash,
  ]);

  if (existing.length > 0) {
    log('info', 'Image asset already exists (by hash)', {
      hash: asset.fileHash.slice(0, 8),
      id: existing[0].id,
    });
    return existing[0].id;
  }

  await execute(
    `INSERT INTO image_asset (
			id, source_path, storage_path, file_hash, file_size_bytes, mime_type,
			width, height, generated_by_provider, generated_prompt,
			cloudflare_image_id, cloudflare_base_url, cloudflare_variant_names,
			cloudflare_uploaded_at, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      asset.id,
      asset.sourcePath,
      asset.storagePath,
      asset.fileHash,
      asset.fileSizeBytes,
      asset.mimeType,
      asset.width ?? null,
      asset.height ?? null,
      asset.generatedByProvider ?? null,
      asset.generatedPrompt ?? null,
      asset.cloudflareImageId,
      asset.cloudflareBaseUrl,
      asset.cloudflareVariantNames ?? null,
      now,
      now,
      now,
    ]
  );

  log('info', 'Inserted image_asset', { id: asset.id, cloudflareId: asset.cloudflareImageId });
  return asset.id;
}

/**
 * Get image asset by file hash
 */
export async function getImageAssetByHash(fileHash: string): Promise<{
  id: string;
  cloudflareImageId: string;
} | null> {
  const results = await query<{ id: string; cloudflare_image_id: string }>(
    'SELECT id, cloudflare_image_id FROM image_asset WHERE file_hash = ?',
    [fileHash]
  );

  if (results.length === 0) return null;
  return {
    id: results[0].id,
    cloudflareImageId: results[0].cloudflare_image_id,
  };
}

/**
 * Get image asset by Cloudflare image ID
 */
export async function getImageAssetByCloudflareId(cloudflareImageId: string): Promise<{
  id: string;
  fileHash: string;
} | null> {
  const results = await query<{ id: string; file_hash: string }>(
    'SELECT id, file_hash FROM image_asset WHERE cloudflare_image_id = ?',
    [cloudflareImageId]
  );

  if (results.length === 0) return null;
  return {
    id: results[0].id,
    fileHash: results[0].file_hash,
  };
}

// ============================================================================
// Image Link Operations
// ============================================================================

/**
 * Data for linking an image asset to content
 */
export interface ImageLinkData {
  id: string;
  assetId: string;
  contentId: string;
  sceneId?: string;
  zoneId?: string; // NEW: Link to zone for location imagery
  role: 'portrait' | 'scene' | 'header' | 'gallery';
  sortOrder?: number;
  caption?: string;
  altText?: string;
}

/**
 * Insert an image link connecting an asset to content
 *
 * Prevents duplicate links for the same asset+content+role combination.
 *
 * @param link - Image link data including asset ID, content ID, and role
 * @returns Link ID (existing or newly created)
 */
export async function insertImageLink(link: ImageLinkData): Promise<string> {
  const now = nowISO();

  // Check for existing link (same asset + content + role)
  const existing = await query<{ id: string }>(
    'SELECT id FROM image_link WHERE asset_id = ? AND content_id = ? AND role = ?',
    [link.assetId, link.contentId, link.role]
  );

  if (existing.length > 0) {
    log('info', 'Image link already exists', {
      assetId: link.assetId,
      contentId: link.contentId,
      role: link.role,
    });
    return existing[0].id;
  }

  await execute(
    `INSERT INTO image_link (
			id, asset_id, content_id, scene_id, zone_id, role, sort_order, caption, alt_text, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      link.id,
      link.assetId,
      link.contentId,
      link.sceneId ?? null,
      link.zoneId ?? null, // NEW: Zone ID for location imagery
      link.role,
      link.sortOrder ?? 0,
      link.caption ?? null,
      link.altText ?? null,
      now,
    ]
  );

  log('info', 'Inserted image_link', { id: link.id, role: link.role, contentId: link.contentId });
  return link.id;
}

/**
 * Get all image links for a content item
 */
export async function getImageLinksByContentId(contentId: string): Promise<
  Array<{
    id: string;
    assetId: string;
    role: string;
    sortOrder: number;
  }>
> {
  return query(
    'SELECT id, asset_id as assetId, role, sort_order as sortOrder FROM image_link WHERE content_id = ? ORDER BY sort_order',
    [contentId]
  );
}

/**
 * Delete all image links for a content item
 */
export async function deleteImageLinksForContent(contentId: string): Promise<void> {
  await execute('DELETE FROM image_link WHERE content_id = ?', [contentId]);
}

/**
 * Update character portrait image ID
 */
export async function updateCharacterPortrait(
  characterSlug: string,
  imageAssetId: string
): Promise<void> {
  const now = nowISO();
  await execute('UPDATE character SET portrait_image_id = ?, updated_at = ? WHERE slug = ?', [
    imageAssetId,
    now,
    characterSlug,
  ]);
  log('info', 'Updated character portrait', { slug: characterSlug, assetId: imageAssetId });
}
