/**
 * Content Ingestion Pipeline
 *
 * Scans markdown content directories and ingests into D1 database
 * using the new dedicated entity tables (character, location, etc.)
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

import { parseCharacterProfile, parseCharacterRelationships } from './character';
import { parseLocationOverview } from './location';
import { parseChapterContent, extractChapterMetadataJson } from './chapter';
import { parseZonesYaml } from './zone';
import type {
  IngestOptions,
  IngestResult,
  ParsedCharacter as _ParsedCharacter,
  ParsedRelationship as _ParsedRelationship,
  ParsedLocation as _ParsedLocation,
  ParsedChapter as _ParsedChapter,
} from './types';
import { insertLocationZones, insertSceneZoneLinks } from './services/d1-inserts';

import * as schema from '../db/schema';

// ============================================================================
// Directory Scanning
// ============================================================================

/**
 * Scan a content directory for entity slugs
 *
 * @param basePath - Base path to story content
 * @param type - Content type to scan (characters, locations, or chapters)
 * @returns Array of slug identifiers
 */
function scanContentDirectory(
  basePath: string,
  type: 'characters' | 'locations' | 'chapters'
): string[] {
  const dirPath = join(basePath, type);
  if (!existsSync(dirPath)) {
    return [];
  }

  const items = readdirSync(dirPath);
  const slugs: string[] = [];

  for (const item of items) {
    const itemPath = join(dirPath, item);
    const stat = statSync(itemPath);

    if (stat.isDirectory()) {
      // Skip template directories
      if (item.includes('template') || item.includes('DO_NOT_USE')) {
        continue;
      }
      slugs.push(item);
    }
  }

  return slugs;
}

// ============================================================================
// File Reading
// ============================================================================

/**
 * Read a specific content file from a content directory
 *
 * @param basePath - Base path to story content
 * @param type - Content type directory
 * @param slug - Entity slug
 * @param filename - Filename to read (e.g., 'profile.md', 'content.md')
 * @returns File contents or null if not found
 */
function readContentFile(
  basePath: string,
  type: string,
  slug: string,
  filename: string
): string | null {
  const filePath = join(basePath, type, slug, filename);
  if (!existsSync(filePath)) {
    return null;
  }
  return readFileSync(filePath, 'utf-8');
}

// ============================================================================
// Character Ingestion
// ============================================================================

/**
 * Ingest all characters from the content directory
 *
 * @param db - Drizzle D1 database instance
 * @param options - Ingestion options
 * @returns Count of processed characters, errors, and character ID map
 */
async function ingestCharacters(
  db: DrizzleD1Database<typeof schema>,
  options: IngestOptions
): Promise<{ count: number; errors: string[]; characters: Map<string, string> }> {
  const errors: string[] = [];
  const characterIdMap = new Map<string, string>(); // slug -> id
  const slugs = scanContentDirectory(options.contentDir, 'characters');

  options.onProgress?.(`Found ${slugs.length} characters to process`);

  for (const slug of slugs) {
    try {
      // Read profile.md
      const profileContent = readContentFile(options.contentDir, 'characters', slug, 'profile.md');
      if (!profileContent) {
        errors.push(`Character ${slug}: No profile.md found`);
        continue;
      }

      const parsed = parseCharacterProfile(slug, profileContent);
      const now = new Date().toISOString();
      const id = uuidv4();

      if (!options.dryRun) {
        await db.insert(schema.character).values({
          id,
          workspaceId: options.workspaceId,
          slug: parsed.slug,
          name: parsed.name,
          aliases: JSON.stringify(parsed.aliases),
          race: parsed.race,
          characterClass: parsed.characterClass,
          role: parsed.role,
          status: parsed.status,
          firstAppearance: parsed.firstAppearance,
          appearanceAge: parsed.appearance.age,
          appearanceHeight: parsed.appearance.height,
          appearanceBuild: parsed.appearance.build,
          appearanceHair: parsed.appearance.hair,
          appearanceEyes: parsed.appearance.eyes,
          appearanceDistinguishingFeatures: parsed.appearance.distinguishingFeatures
            ? JSON.stringify(parsed.appearance.distinguishingFeatures)
            : null,
          appearanceClothing: parsed.appearance.clothing,
          visualSummary: parsed.visualSummary,
          personalityArchetype: parsed.personality.archetype,
          personalityTemperament: parsed.personality.temperament,
          personalityPositiveTraits: parsed.personality.positiveTraits
            ? JSON.stringify(parsed.personality.positiveTraits)
            : null,
          personalityNegativeTraits: parsed.personality.negativeTraits
            ? JSON.stringify(parsed.personality.negativeTraits)
            : null,
          personalityMoralAlignment: parsed.personality.moralAlignment,
          background: parsed.background,
          motivations: parsed.motivations.length > 0 ? JSON.stringify(parsed.motivations) : null,
          fears: parsed.fears.length > 0 ? JSON.stringify(parsed.fears) : null,
          secrets: parsed.secrets.length > 0 ? JSON.stringify(parsed.secrets) : null,
          primaryWeapons: parsed.combat.primaryWeapons,
          fightingStyle: parsed.combat.fightingStyle,
          tacticalRole: parsed.combat.tacticalRole,
          speechStyle: parsed.voice.speechStyle,
          signaturePhrases: parsed.voice.signaturePhrases
            ? JSON.stringify(parsed.voice.signaturePhrases)
            : null,
          faction: parsed.faction,
          occupation: parsed.occupation,
          notes: parsed.notes,
          createdAt: now,
          updatedAt: now,
        });
      }

      characterIdMap.set(slug, id);
      options.onProgress?.(`  Processed character: ${parsed.name}`);
    } catch (err) {
      errors.push(`Character ${slug}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { count: characterIdMap.size, errors, characters: characterIdMap };
}

// ============================================================================
// Relationship Ingestion
// ============================================================================

/**
 * Ingest character relationships from relationships.md files
 *
 * @param db - Drizzle D1 database instance
 * @param options - Ingestion options
 * @param characterIdMap - Map of character slugs to database IDs
 * @returns Count of processed relationships and errors
 */
async function ingestRelationships(
  db: DrizzleD1Database<typeof schema>,
  options: IngestOptions,
  characterIdMap: Map<string, string>
): Promise<{ count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;
  const slugs = scanContentDirectory(options.contentDir, 'characters');

  for (const slug of slugs) {
    const sourceId = characterIdMap.get(slug);
    if (!sourceId) continue;

    try {
      // Read relationships.md
      const relContent = readContentFile(
        options.contentDir,
        'characters',
        slug,
        'relationships.md'
      );
      if (!relContent) continue;

      const relationships = parseCharacterRelationships(relContent);
      const now = new Date().toISOString();

      for (const rel of relationships) {
        const targetId = characterIdMap.get(rel.targetSlug);
        if (!targetId) {
          // Target character may not exist - skip silently
          continue;
        }

        if (!options.dryRun) {
          await db.insert(schema.characterRelationship).values({
            id: uuidv4(),
            sourceCharacterId: sourceId,
            targetCharacterId: targetId,
            relationshipType: rel.relationshipType,
            description: rel.description,
            strength: rel.strength,
            createdAt: now,
            updatedAt: now,
          });
        }
        count++;
      }
    } catch (err) {
      errors.push(`Relationships for ${slug}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  options.onProgress?.(`  Processed ${count} relationships`);
  return { count, errors };
}

// ============================================================================
// Location Ingestion
// ============================================================================

/**
 * Ingest all locations from the content directory
 *
 * @param db - Drizzle D1 database instance
 * @param options - Ingestion options
 * @returns Count of processed locations, errors, location ID map, and zone maps
 */
async function ingestLocations(
  db: DrizzleD1Database<typeof schema>,
  options: IngestOptions
): Promise<{
  count: number;
  errors: string[];
  locations: Map<string, string>;
  zoneMaps: Map<string, Map<string, string>>;
}> {
  const errors: string[] = [];
  const locationIdMap = new Map<string, string>(); // slug -> id
  const locationZoneMaps = new Map<string, Map<string, string>>(); // location slug -> (zone slug -> zone id)
  const slugs = scanContentDirectory(options.contentDir, 'locations');

  options.onProgress?.(`Found ${slugs.length} locations to process`);

  for (const slug of slugs) {
    try {
      // Read overview.md
      const overviewContent = readContentFile(options.contentDir, 'locations', slug, 'overview.md');
      if (!overviewContent) {
        errors.push(`Location ${slug}: No overview.md found`);
        continue;
      }

      const parsed = parseLocationOverview(slug, overviewContent);
      const now = new Date().toISOString();
      const id = uuidv4();

      if (!options.dryRun) {
        await db.insert(schema.location).values({
          id,
          workspaceId: options.workspaceId,
          slug: parsed.slug,
          name: parsed.name,
          locationType: parsed.locationType,
          region: parsed.region,
          parentLocationId: null, // Would need second pass to resolve
          quickDescription: parsed.quickDescription,
          visualSummary: parsed.visualSummary,
          atmosphere: parsed.atmosphere,
          history: parsed.history,
          notableLandmarks:
            parsed.notableLandmarks.length > 0 ? JSON.stringify(parsed.notableLandmarks) : null,
          keyPersonnel: parsed.keyPersonnel.length > 0 ? JSON.stringify(parsed.keyPersonnel) : null,
          createdAt: now,
          updatedAt: now,
        });

        // Check for zones.yaml and process if present
        const zonesPath = join(options.contentDir, 'locations', slug, 'zones.yaml');
        if (existsSync(zonesPath)) {
          try {
            const zonesContent = readFileSync(zonesPath, 'utf-8');
            const parsedZones = parseZonesYaml(zonesContent, slug);

            if (parsedZones && parsedZones.zones.length > 0) {
              // Insert zones and get zone ID map
              const zoneIdMap = await insertLocationZones(
                db,
                options.workspaceId,
                id,
                parsedZones.zones
              );

              // Store zone map for later scene-zone linking
              locationZoneMaps.set(slug, zoneIdMap);
              options.onProgress?.(
                `    Processed ${parsedZones.zones.length} zones for ${parsed.name}`
              );
            }
          } catch (zoneErr) {
            errors.push(
              `Location ${slug} zones: ${zoneErr instanceof Error ? zoneErr.message : String(zoneErr)}`
            );
          }
        }
      }

      locationIdMap.set(slug, id);
      options.onProgress?.(`  Processed location: ${parsed.name}`);
    } catch (err) {
      errors.push(`Location ${slug}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { count: locationIdMap.size, errors, locations: locationIdMap, zoneMaps: locationZoneMaps };
}

// ============================================================================
// Chapter Ingestion
// ============================================================================

/**
 * Ingest all chapters with scenes from the content directory
 *
 * @param db - Drizzle D1 database instance
 * @param options - Ingestion options
 * @param characterIdMap - Map of character slugs to database IDs
 * @param locationIdMap - Map of location slugs to database IDs
 * @param zoneMaps - Map of location slugs to their zone slug->ID maps
 * @returns Count of processed chapters, scenes, and errors
 */
async function ingestChapters(
  db: DrizzleD1Database<typeof schema>,
  options: IngestOptions,
  characterIdMap: Map<string, string>,
  locationIdMap: Map<string, string>,
  zoneMaps: Map<string, Map<string, string>>
): Promise<{ chaptersCount: number; scenesCount: number; errors: string[] }> {
  const errors: string[] = [];
  let chaptersCount = 0;
  let scenesCount = 0;
  const slugs = scanContentDirectory(options.contentDir, 'chapters');

  options.onProgress?.(`Found ${slugs.length} chapters to process`);

  for (const slug of slugs) {
    try {
      // Read content.md
      const chapterContent = readContentFile(options.contentDir, 'chapters', slug, 'content.md');
      if (!chapterContent) {
        errors.push(`Chapter ${slug}: No content.md found`);
        continue;
      }

      const parsed = parseChapterContent(slug, chapterContent);
      const now = new Date().toISOString();
      const contentItemId = uuidv4();
      const revisionId = uuidv4();

      if (!options.dryRun) {
        // Create content_item for chapter
        await db.insert(schema.contentItem).values({
          id: contentItemId,
          workspaceId: options.workspaceId,
          kind: 'chapter',
          slug: parsed.slug,
          title: parsed.title,
          summary: parsed.scenes[0]?.content.slice(0, 200) || null,
          status: parsed.status,
          metadataJson: JSON.stringify(extractChapterMetadataJson(parsed)),
          wordCount: parsed.wordCount,
          createdBy: 'ingestion',
          updatedBy: 'ingestion',
          createdAt: now,
          updatedAt: now,
        });

        // Create content_revision
        await db.insert(schema.contentRevision).values({
          id: revisionId,
          contentId: contentItemId,
          revisionNumber: 1,
          state: 'published',
          authorId: 'ingestion',
          createdAt: now,
          updatedAt: now,
        });

        // Create scenes
        for (let i = 0; i < parsed.scenes.length; i++) {
          const scene = parsed.scenes[i];
          const sceneId = uuidv4();

          // Resolve location ID
          const locationId = scene.location ? locationIdMap.get(scene.location) : null;

          // Resolve POV character ID
          const povCharacterId = parsed.povCharacter
            ? characterIdMap.get(parsed.povCharacter)
            : null;

          await db.insert(schema.scene).values({
            id: sceneId,
            contentId: contentItemId,
            revisionId: revisionId,
            slug: scene.id,
            title: scene.title,
            sequenceOrder: i + 1,
            synopsis: scene.content.slice(0, 500),
            sceneWhen: scene.when,
            primaryLocationId: locationId,
            povEntityId: povCharacterId,
            estReadSeconds: Math.ceil((scene.wordCount / 200) * 60), // ~200 words/min
            createdAt: now,
            updatedAt: now,
          });

          // Create scene-character links
          for (const charSlug of scene.characters) {
            const charId = characterIdMap.get(charSlug);
            if (charId) {
              await db.insert(schema.sceneCharacter).values({
                id: uuidv4(),
                sceneId: sceneId,
                characterId: charId,
                role: charSlug === parsed.povCharacter ? 'pov' : 'present',
                createdAt: now,
              });
            }
          }

          // Create scene tags
          for (const tag of scene.tags) {
            await db.insert(schema.sceneTag).values({
              id: uuidv4(),
              sceneId: sceneId,
              tag: tag,
              createdAt: now,
            });
          }

          // Create scene-zone links if zones are referenced
          if ((scene.primaryZone || scene.locationZones) && scene.location) {
            const zoneIdMap = zoneMaps.get(scene.location);
            if (zoneIdMap) {
              try {
                await insertSceneZoneLinks(
                  db,
                  sceneId,
                  scene.primaryZone,
                  scene.locationZones ?? [],
                  zoneIdMap
                );
              } catch (zoneErr) {
                errors.push(
                  `Scene ${scene.id} zone links: ${zoneErr instanceof Error ? zoneErr.message : String(zoneErr)}`
                );
              }
            } else if (scene.primaryZone || (scene.locationZones && scene.locationZones.length > 0)) {
              // Zone references exist but no zone map found - log warning
              errors.push(
                `Scene ${scene.id}: References zones but location ${scene.location} has no zones.yaml`
              );
            }
          }

          scenesCount++;
        }
      }

      chaptersCount++;
      options.onProgress?.(`  Processed chapter: ${parsed.title} (${parsed.scenes.length} scenes)`);
    } catch (err) {
      errors.push(`Chapter ${slug}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { chaptersCount, scenesCount, errors };
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Main content ingestion function
 *
 * Orchestrates the full ingestion pipeline:
 * 1. Ingest characters
 * 2. Ingest locations
 * 3. Ingest chapters and scenes
 * 4. Ingest character relationships
 *
 * @param db - Drizzle D1 database instance
 * @param options - Ingestion options including content directory and workspace ID
 * @returns Ingestion result with statistics and errors
 */
export async function ingestContent(
  db: DrizzleD1Database<typeof schema>,
  options: IngestOptions
): Promise<IngestResult> {
  const allErrors: string[] = [];
  const stats = {
    charactersProcessed: 0,
    locationsProcessed: 0,
    chaptersProcessed: 0,
    scenesProcessed: 0,
    relationshipsProcessed: 0,
  };

  options.onProgress?.('Starting content ingestion...');

  // Step 1: Ingest characters
  options.onProgress?.('Phase 1: Ingesting characters...');
  const characterResult = await ingestCharacters(db, options);
  stats.charactersProcessed = characterResult.count;
  allErrors.push(...characterResult.errors);

  // Step 2: Ingest locations
  options.onProgress?.('Phase 2: Ingesting locations...');
  const locationResult = await ingestLocations(db, options);
  stats.locationsProcessed = locationResult.count;
  allErrors.push(...locationResult.errors);

  // Step 3: Ingest chapters (needs character and location ID maps, and zone maps)
  options.onProgress?.('Phase 3: Ingesting chapters and scenes...');
  const chapterResult = await ingestChapters(
    db,
    options,
    characterResult.characters,
    locationResult.locations,
    locationResult.zoneMaps
  );
  stats.chaptersProcessed = chapterResult.chaptersCount;
  stats.scenesProcessed = chapterResult.scenesCount;
  allErrors.push(...chapterResult.errors);

  // Step 4: Ingest relationships (needs character ID map)
  options.onProgress?.('Phase 4: Ingesting character relationships...');
  const relationshipResult = await ingestRelationships(db, options, characterResult.characters);
  stats.relationshipsProcessed = relationshipResult.count;
  allErrors.push(...relationshipResult.errors);

  options.onProgress?.(
    `Ingestion complete! ${stats.charactersProcessed} characters, ${stats.locationsProcessed} locations, ${stats.chaptersProcessed} chapters, ${stats.scenesProcessed} scenes, ${stats.relationshipsProcessed} relationships`
  );

  return {
    success: allErrors.length === 0,
    errors: allErrors,
    stats,
  };
}

// Re-export parsers for individual use
export { parseCharacterProfile, parseCharacterRelationships } from './character';
export { parseLocationOverview } from './location';
export { parseChapterContent, extractChapterMetadataJson } from './chapter';
export * from './types';
