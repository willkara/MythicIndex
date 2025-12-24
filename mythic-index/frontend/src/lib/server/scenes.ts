import { eq, asc } from 'drizzle-orm';
import type { Database } from './db';
import {
  scene,
  sceneSegment,
  contentBlock,
  sceneCharacter,
  sceneTag,
  character,
  location,
} from './db/schema';

/**
 * Represents core scene data with content blocks.
 *
 * Provides essential scene information including metadata and the
 * content blocks that make up the scene. Used for basic scene
 * retrieval without additional enrichment data.
 */
export interface SceneData {
  /** Unique identifier for the scene */
  id: string;
  /** URL-friendly slug (typically the chapter slug) */
  slug: string;
  /** Optional scene title */
  title: string | null;
  /** Position of scene within chapter */
  sequenceOrder: number;
  /** Brief description of scene events */
  synopsis: string | null;
  /** Content blocks that comprise the scene */
  blocks: SceneBlockData[];
}

/**
 * Represents a content block within a scene.
 *
 * Simplified block representation focused on the data needed
 * for scene rendering, excluding position and metadata.
 */
export interface SceneBlockData {
  /** Unique identifier for the block */
  id: string;
  /** Type of block (prose, dialogue, scene_header, etc.) */
  blockType: string;
  /** Plain text content */
  textPayload: string | null;
  /** Structured JSON data for complex blocks */
  richPayload: Record<string, unknown> | null;
}

/**
 * Navigation data for moving between scenes.
 *
 * Provides links to previous and next scenes within a chapter,
 * enabling sequential navigation through narrative content.
 */
export interface SceneNavigation {
  /** Previous scene information, or null if this is the first scene */
  prev: { slug: string; title: string | null } | null;
  /** Next scene information, or null if this is the last scene */
  next: { slug: string; title: string | null } | null;
}

/**
 * Enriched scene data with character, location, and tag information.
 *
 * Extends the base SceneData with additional metadata about characters,
 * locations, and categorization. Used for displaying comprehensive scene
 * information including narrative context.
 */
export interface EnrichedSceneData extends SceneData {
  /** Characters appearing in this scene with their roles */
  characters: {
    /** Character unique identifier */
    id: string;
    /** Character URL slug */
    slug: string;
    /** Character display name */
    name: string;
    /** Character's role in scene: 'pov', 'major', 'minor', 'mentioned' */
    role: string | null;
  }[];
  /** Tags for categorization and search */
  tags: string[];
  /** Primary location where scene takes place */
  primaryLocation: {
    /** Location unique identifier */
    id: string;
    /** Location URL slug */
    slug: string;
    /** Location display name */
    name: string;
  } | null;
  /** Point-of-view character for this scene */
  povCharacter: {
    /** Character unique identifier */
    id: string;
    /** Character URL slug */
    slug: string;
    /** Character display name */
    name: string;
  } | null;
}

/**
 * Retrieves all scenes for a chapter with their content blocks.
 *
 * Loads scenes matching the chapter slug, including all associated content
 * blocks via scene segments. Results are sorted by sequence order.
 *
 * @param db - The Drizzle database instance
 * @param chapterSlug - The unique slug identifier for the chapter
 * @returns Array of scene data objects sorted by sequence order
 */
export async function getChapterScenes(db: Database, chapterSlug: string): Promise<SceneData[]> {
  // Find scenes for this chapter
  const scenes = await db.select().from(scene).where(eq(scene.slug, chapterSlug));

  const result: SceneData[] = [];

  for (const s of scenes) {
    // Get blocks for this scene via segments
    const segments = await db.select().from(sceneSegment).where(eq(sceneSegment.sceneId, s.id));

    const blocks: SceneBlockData[] = [];
    for (const seg of segments) {
      const blockData = await db
        .select()
        .from(contentBlock)
        .where(eq(contentBlock.id, seg.blockId))
        .limit(1);

      if (blockData.length > 0) {
        const block = blockData[0];
        blocks.push({
          id: block.id,
          blockType: block.blockType,
          textPayload: block.textPayload,
          richPayload: block.richPayload ? JSON.parse(block.richPayload) : null,
        });
      }
    }

    result.push({
      id: s.id,
      slug: s.slug,
      title: s.title,
      sequenceOrder: s.sequenceOrder,
      synopsis: s.synopsis,
      blocks,
    });
  }

  return result.sort((a, b) => a.sequenceOrder - b.sequenceOrder);
}

/**
 * Retrieves a specific scene by its position within a chapter.
 *
 * Finds and returns the scene at the specified sequence order position
 * within a chapter. Returns null if no scene exists at that position.
 *
 * @param db - The Drizzle database instance
 * @param chapterSlug - The unique slug identifier for the chapter
 * @param position - The sequence order position to retrieve
 * @returns The scene data at the specified position, or null if not found
 */
export async function getSceneAtPosition(
  db: Database,
  chapterSlug: string,
  position: number
): Promise<SceneData | null> {
  const scenes = await getChapterScenes(db, chapterSlug);
  return scenes.find(s => s.sequenceOrder === position) ?? null;
}

/**
 * Builds navigation links for moving between scenes.
 *
 * Generates previous/next scene navigation data for the current scene
 * position within a chapter, enabling sequential navigation.
 *
 * @param db - The Drizzle database instance
 * @param chapterSlug - The unique slug identifier for the chapter
 * @param currentOrder - The sequence order of the current scene
 * @returns Navigation object with prev/next scene links
 */
export async function getSceneNavigation(
  db: Database,
  chapterSlug: string,
  currentOrder: number
): Promise<SceneNavigation> {
  const scenes = await getChapterScenes(db, chapterSlug);

  const currentIndex = scenes.findIndex(s => s.sequenceOrder === currentOrder);

  return {
    prev:
      currentIndex > 0
        ? { slug: scenes[currentIndex - 1].slug, title: scenes[currentIndex - 1].title }
        : null,
    next:
      currentIndex < scenes.length - 1
        ? { slug: scenes[currentIndex + 1].slug, title: scenes[currentIndex + 1].title }
        : null,
  };
}

/**
 * Transforms scene data into API response format.
 *
 * Converts full scene data into a summary format suitable for API responses,
 * excluding the full content blocks and instead providing a block count.
 *
 * @param scenes - Array of scene data to transform
 * @returns Array of scene summary objects for API responses
 */
export function buildSceneResponses(scenes: SceneData[]) {
  return scenes.map(s => ({
    id: s.id,
    slug: s.slug,
    title: s.title,
    sequenceOrder: s.sequenceOrder,
    synopsis: s.synopsis,
    blockCount: s.blocks.length,
  }));
}

// ============================================================================
// Scene Enrichment Functions
// ============================================================================

/**
 * Enriches a single scene with character, location, and tag data.
 *
 * Enhances base scene data by loading and attaching related entities:
 * - Characters appearing in the scene with their roles
 * - Tags for categorization
 * - Primary location details
 * - POV character details
 *
 * This provides complete narrative context for comprehensive scene display.
 *
 * @param db - The Drizzle database instance
 * @param sceneData - The base scene data to enrich
 * @param sceneRow - Scene database row with location and POV references
 * @returns Enriched scene data with all related entities
 */
export async function enrichScene(
  db: Database,
  sceneData: SceneData,
  sceneRow: { primaryLocationId: string | null; povEntityId: string | null }
): Promise<EnrichedSceneData> {
  // Load characters present in this scene
  const sceneCharacters = await db
    .select({
      characterId: sceneCharacter.characterId,
      role: sceneCharacter.role,
      characterSlug: character.slug,
      characterName: character.name,
    })
    .from(sceneCharacter)
    .innerJoin(character, eq(sceneCharacter.characterId, character.id))
    .where(eq(sceneCharacter.sceneId, sceneData.id));

  // Load tags for this scene
  const sceneTags = await db
    .select({ tag: sceneTag.tag })
    .from(sceneTag)
    .where(eq(sceneTag.sceneId, sceneData.id));

  // Load primary location if set
  let primaryLocation: EnrichedSceneData['primaryLocation'] = null;
  if (sceneRow.primaryLocationId) {
    const loc = await db
      .select({ id: location.id, slug: location.slug, name: location.name })
      .from(location)
      .where(eq(location.id, sceneRow.primaryLocationId))
      .get();
    if (loc) {
      primaryLocation = loc;
    }
  }

  // Load POV character if set
  let povCharacter: EnrichedSceneData['povCharacter'] = null;
  if (sceneRow.povEntityId) {
    const pov = await db
      .select({ id: character.id, slug: character.slug, name: character.name })
      .from(character)
      .where(eq(character.id, sceneRow.povEntityId))
      .get();
    if (pov) {
      povCharacter = pov;
    }
  }

  return {
    ...sceneData,
    characters: sceneCharacters.map(c => ({
      id: c.characterId,
      slug: c.characterSlug,
      name: c.characterName,
      role: c.role,
    })),
    tags: sceneTags.map(t => t.tag),
    primaryLocation,
    povCharacter,
  };
}

/**
 * Retrieves all enriched scenes for a chapter.
 *
 * Loads all scenes for a chapter and enriches each with full character,
 * location, and tag data. This is more expensive than getChapterScenes
 * but provides complete narrative context for each scene.
 *
 * Results are sorted by sequence order within the chapter.
 *
 * @param db - The Drizzle database instance
 * @param chapterSlug - The unique slug identifier for the chapter
 * @returns Array of enriched scene data sorted by sequence order
 *
 * @example
 * ```typescript
 * const scenes = await getEnrichedChapterScenes(db, 'chapter-1');
 * scenes.forEach(scene => {
 *   console.log(`${scene.title}: ${scene.characters.length} characters`);
 * });
 * ```
 */
export async function getEnrichedChapterScenes(
  db: Database,
  chapterSlug: string
): Promise<EnrichedSceneData[]> {
  // Find scenes for this chapter
  const scenes = await db
    .select()
    .from(scene)
    .where(eq(scene.slug, chapterSlug))
    .orderBy(asc(scene.sequenceOrder));

  const enrichedScenes: EnrichedSceneData[] = [];

  for (const s of scenes) {
    // Get blocks for this scene via segments
    const segments = await db.select().from(sceneSegment).where(eq(sceneSegment.sceneId, s.id));

    const blocks: SceneBlockData[] = [];
    for (const seg of segments) {
      const blockData = await db
        .select()
        .from(contentBlock)
        .where(eq(contentBlock.id, seg.blockId))
        .limit(1);

      if (blockData.length > 0) {
        const block = blockData[0];
        blocks.push({
          id: block.id,
          blockType: block.blockType,
          textPayload: block.textPayload,
          richPayload: block.richPayload ? JSON.parse(block.richPayload) : null,
        });
      }
    }

    const baseSceneData: SceneData = {
      id: s.id,
      slug: s.slug,
      title: s.title,
      sequenceOrder: s.sequenceOrder,
      synopsis: s.synopsis,
      blocks,
    };

    // Enrich with character/location/tag data
    const enriched = await enrichScene(db, baseSceneData, {
      primaryLocationId: s.primaryLocationId,
      povEntityId: s.povEntityId,
    });

    enrichedScenes.push(enriched);
  }

  return enrichedScenes;
}

/**
 * Transforms enriched scene data into API response format.
 *
 * Converts full enriched scene data into a summary format suitable for
 * API responses, excluding full content blocks while retaining character,
 * location, and tag information.
 *
 * @param scenes - Array of enriched scene data to transform
 * @returns Array of enriched scene summary objects for API responses
 */
export function buildEnrichedSceneResponses(scenes: EnrichedSceneData[]) {
  return scenes.map(s => ({
    id: s.id,
    slug: s.slug,
    title: s.title,
    sequenceOrder: s.sequenceOrder,
    synopsis: s.synopsis,
    blockCount: s.blocks.length,
    characters: s.characters,
    tags: s.tags,
    primaryLocation: s.primaryLocation,
    povCharacter: s.povCharacter,
  }));
}
