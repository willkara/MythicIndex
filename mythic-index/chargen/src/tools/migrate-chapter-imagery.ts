#!/usr/bin/env npx tsx
/**
 * Migration Script: Chapter Imagery to Reference-Based Schema
 *
 * Converts chapter imagery.yaml files from embedded character/location
 * descriptions to reference-based schema.
 *
 * Usage:
 *   npx tsx src/tools/migrate-chapter-imagery.ts [--dry-run] [--chapter ch15-battle-for-westwall]
 */

import { readFile, writeFile, copyFile, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type {
  ChapterImagerySpec,
  LegacyChapterImagery,
  LegacyCharacterRef,
  LegacyChapterLocation,
  CharacterReference,
  LocationReference,
  MigrationResult,
} from '../types/chapter-imagery.js';

// Base paths - relative to chargen working directory
const STORY_CONTENT_BASE = join(process.cwd(), '..', 'MemoryQuill', 'story-content');

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

// Parse --chapter flag (supports --chapter=slug or --chapter slug)
let SINGLE_CHAPTER: string | undefined;
const chapterArgIndex = args.findIndex((a) => a.startsWith('--chapter'));
if (chapterArgIndex !== -1) {
  const arg = args[chapterArgIndex];
  if (arg.includes('=')) {
    SINGLE_CHAPTER = arg.split('=')[1];
  } else if (args[chapterArgIndex + 1] && !args[chapterArgIndex + 1].startsWith('--')) {
    SINGLE_CHAPTER = args[chapterArgIndex + 1];
  }
}

/**
 * Parse a legacy location slug to extract base ref and zone.
 * Examples:
 *   "westwall-watchpost-battlements" → ref: "westwall-watchpost", zone: "battlements"
 *   "salamander-hearth-tavern" → ref: "salamander-hearth-tavern", zone: undefined
 *
 * @param slug - The legacy location slug to parse
 * @returns Object containing the base ref and optional zone
 */
function parseLocationSlug(slug: string): { ref: string; zone?: string } {
  // Known location slugs (we'll check if directories exist)
  const locationDir = join(STORY_CONTENT_BASE, 'locations');

  // Try progressively shorter prefixes
  const parts = slug.split('-');

  for (let i = parts.length; i > 0; i--) {
    const potentialRef = parts.slice(0, i).join('-');
    const potentialZone = i < parts.length ? parts.slice(i).join('-') : undefined;

    if (existsSync(join(locationDir, potentialRef))) {
      return { ref: potentialRef, zone: potentialZone };
    }
  }

  // Couldn't find a matching location directory
  // Return full slug as ref with no zone
  return { ref: slug };
}

/**
 * Convert legacy character ref to new reference format
 *
 * @param legacy - The legacy character reference
 * @returns The migrated character reference
 */
function migrateCharacterRef(legacy: LegacyCharacterRef): CharacterReference {
  return {
    ref: legacy.slug,
    name: legacy.name,
    scene_variations: legacy.scene_variations,
    reference_images: legacy.reference_images,
    // Note: appearance field is dropped - will resolve from character's imagery.yaml
  };
}

/**
 * Convert legacy location to new reference format
 *
 * @param legacy - The legacy chapter location
 * @returns Object containing the migrated location reference and parsed components
 */
function migrateLocation(legacy: LegacyChapterLocation): {
  reference: LocationReference;
  parsed: { ref: string; zone?: string };
} {
  const parsed = parseLocationSlug(legacy.slug);

  const reference: LocationReference = {
    ref: parsed.ref,
    zones: parsed.zone
      ? [
          {
            id: parsed.zone,
            // Preserve the embedded description as chapter_context
            chapter_context: legacy.visual_description,
          },
        ]
      : [
          {
            id: 'overview',
            chapter_context: legacy.visual_description,
          },
        ],
  };

  return { reference, parsed };
}

/**
 * Check if a character's canonical imagery.yaml exists
 *
 * @param slug - Character slug identifier
 * @returns True if the canonical imagery file exists
 */
function characterImageryExists(slug: string): boolean {
  return existsSync(join(STORY_CONTENT_BASE, 'characters', slug, 'imagery.yaml'));
}

/**
 * Check if a location's imagery.yaml exists
 *
 * @param slug - Location slug identifier
 * @returns True if the master imagery file exists
 */
function locationImageryExists(slug: string): boolean {
  return existsSync(join(STORY_CONTENT_BASE, 'locations', slug, 'imagery.yaml'));
}

/**
 * Migrate a single chapter file
 *
 * @param chapterSlug - Chapter slug identifier
 * @returns Promise resolving to migration result with success/warning/error details
 */
async function migrateChapter(chapterSlug: string): Promise<MigrationResult> {
  const result: MigrationResult = {
    chapter_slug: chapterSlug,
    success: false,
    characters_migrated: [],
    locations_migrated: [],
    warnings: [],
    errors: [],
  };

  // Find the imagery file
  const chapterDir = join(STORY_CONTENT_BASE, 'chapters', chapterSlug);
  let imageryPath = join(chapterDir, 'imagery.yaml');

  if (!existsSync(imageryPath)) {
    imageryPath = join(chapterDir, 'chapter-imagery.yaml');
    if (!existsSync(imageryPath)) {
      result.errors.push(`No imagery.yaml found for ${chapterSlug}`);
      return result;
    }
  }

  try {
    // Read and parse the legacy file
    const content = await readFile(imageryPath, 'utf-8');
    const legacy = parseYaml(content) as LegacyChapterImagery;

    // Check if already migrated (has 'characters' array instead of 'character_refs')
    if ((legacy as unknown as ChapterImagerySpec).characters) {
      result.warnings.push('Already migrated or uses new schema');
      result.success = true;
      return result;
    }

    // Create new structure
    const migrated: ChapterImagerySpec = {
      metadata: legacy.metadata,
      characters: [],
      locations: [],
      images: legacy.images || [],
    };

    // Migrate characters
    if (legacy.character_refs) {
      for (const legacyChar of legacy.character_refs) {
        const newRef = migrateCharacterRef(legacyChar);
        migrated.characters.push(newRef);

        const canonicalExists = characterImageryExists(legacyChar.slug);
        result.characters_migrated.push({
          slug: legacyChar.slug,
          had_embedded_appearance: !!legacyChar.appearance,
          canonical_exists: canonicalExists,
        });

        if (!canonicalExists) {
          result.warnings.push(
            `Character ${legacyChar.slug} has no canonical imagery.yaml - appearance will be missing`
          );
        }
      }
    }

    // Migrate locations (consolidate by ref)
    const locationMap = new Map<string, LocationReference>();

    if (legacy.locations) {
      for (const legacyLoc of legacy.locations) {
        const { reference, parsed } = migrateLocation(legacyLoc);

        // Check if we already have this ref
        const existing = locationMap.get(parsed.ref);
        if (existing) {
          // Add zone to existing reference
          if (reference.zones && reference.zones.length > 0) {
            existing.zones = existing.zones || [];
            existing.zones.push(...reference.zones);
          }
        } else {
          locationMap.set(parsed.ref, reference);
        }

        const masterExists = locationImageryExists(parsed.ref);
        result.locations_migrated.push({
          original_slug: legacyLoc.slug,
          parsed_ref: parsed.ref,
          parsed_zone: parsed.zone,
          master_exists: masterExists,
        });

        if (!masterExists) {
          result.warnings.push(
            `Location ${parsed.ref} has no master imagery.yaml - visual anchor will be missing`
          );
        }
      }

      migrated.locations = Array.from(locationMap.values());
    }

    // Generate new YAML content
    const newContent = stringifyYaml(migrated, {
      lineWidth: 120,
      defaultStringType: 'QUOTE_DOUBLE',
      defaultKeyType: 'PLAIN',
    });

    if (DRY_RUN) {
      console.log(`\n[DRY RUN] Would migrate ${chapterSlug}:`);
      console.log(`  Characters: ${result.characters_migrated.length}`);
      console.log(`  Locations: ${result.locations_migrated.length}`);
      if (result.warnings.length > 0) {
        console.log('  Warnings:', result.warnings);
      }
    } else {
      // Create backup
      const backupPath = imageryPath + '.bak';
      await copyFile(imageryPath, backupPath);
      result.backup_path = backupPath;

      // Write migrated file
      await writeFile(imageryPath, newContent, 'utf-8');
    }

    result.success = true;
  } catch (error) {
    result.errors.push(`Migration error: ${(error as Error).message}`);
  }

  return result;
}

/**
 * Get all chapter slugs
 *
 * @returns Promise resolving to array of chapter slug identifiers
 */
async function getAllChapterSlugs(): Promise<string[]> {
  const chaptersDir = join(STORY_CONTENT_BASE, 'chapters');
  const entries = await readdir(chaptersDir);
  const slugs: string[] = [];

  for (const entry of entries) {
    if (entry.startsWith('.')) continue;
    const fullPath = join(chaptersDir, entry);
    const stats = await stat(fullPath);
    if (stats.isDirectory()) {
      // Check if has imagery file
      if (
        existsSync(join(fullPath, 'imagery.yaml')) ||
        existsSync(join(fullPath, 'chapter-imagery.yaml'))
      ) {
        slugs.push(entry);
      }
    }
  }

  return slugs.sort();
}

/**
 * Main migration function
 * Processes all chapters or a single chapter based on command-line arguments
 *
 * @returns Promise that resolves when migration is complete
 */
async function main(): Promise<void> {
  console.log('Chapter Imagery Migration Tool');
  console.log('==============================');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Target: ${SINGLE_CHAPTER || 'ALL CHAPTERS'}`);
  console.log('');

  const chapters = SINGLE_CHAPTER ? [SINGLE_CHAPTER] : await getAllChapterSlugs();

  console.log(`Found ${chapters.length} chapters to process`);
  console.log('');

  const results: MigrationResult[] = [];
  let success = 0;
  let failed = 0;
  let warnings = 0;

  for (const slug of chapters) {
    console.log(`Processing: ${slug}`);
    const result = await migrateChapter(slug);
    results.push(result);

    if (result.success) {
      success++;
      if (result.warnings.length > 0) warnings++;
    } else {
      failed++;
    }

    if (!result.success) {
      console.log(`  ❌ FAILED: ${result.errors.join(', ')}`);
    } else if (result.warnings.length > 0) {
      console.log(`  ⚠️  OK with warnings`);
    } else {
      console.log(`  ✅ OK`);
    }
  }

  console.log('');
  console.log('Summary');
  console.log('-------');
  console.log(`Total: ${chapters.length}`);
  console.log(`Success: ${success}`);
  console.log(`Failed: ${failed}`);
  console.log(`Warnings: ${warnings}`);

  // Show detailed warnings if any
  const allWarnings = results.flatMap((r) =>
    r.warnings.map((w) => ({ chapter: r.chapter_slug, warning: w }))
  );

  if (allWarnings.length > 0) {
    console.log('');
    console.log('Warnings:');
    for (const { chapter, warning } of allWarnings) {
      console.log(`  ${chapter}: ${warning}`);
    }
  }

  // Show missing references
  const missingCharacters = new Set<string>();
  const missingLocations = new Set<string>();

  for (const result of results) {
    for (const char of result.characters_migrated) {
      if (!char.canonical_exists) {
        missingCharacters.add(char.slug);
      }
    }
    for (const loc of result.locations_migrated) {
      if (!loc.master_exists) {
        missingLocations.add(loc.parsed_ref);
      }
    }
  }

  if (missingCharacters.size > 0) {
    console.log('');
    console.log('Characters missing canonical imagery.yaml:');
    for (const slug of Array.from(missingCharacters).sort()) {
      console.log(`  - ${slug}`);
    }
  }

  if (missingLocations.size > 0) {
    console.log('');
    console.log('Locations missing master imagery.yaml:');
    for (const slug of Array.from(missingLocations).sort()) {
      console.log(`  - ${slug}`);
    }
  }
}

main().catch(console.error);
