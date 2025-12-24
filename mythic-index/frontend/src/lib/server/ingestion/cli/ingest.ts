#!/usr/bin/env npx tsx
/**
 * MythicIndex Content Ingestion CLI
 *
 * A beautiful command-line tool for ingesting markdown content into D1 database.
 * Uses Clack for interactive prompts and Commander for argument parsing.
 * Connects to Cloudflare D1 via REST API.
 */

import { Command } from 'commander';

const program = new Command();
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { parseCharacterProfile, parseLocationOverview, parseChapterContent } from '../index';
import { parseCharacterRelationships } from '../character';
import type { ParsedCharacter as _ParsedCharacter, ParsedLocation as _ParsedLocation, ParsedChapter as _ParsedChapter, ParsedRelationship as _ParsedRelationship } from '../types';

// D1 REST API services
import {
  initD1,
  isD1Available,
  getMissingEnvVars,
  testConnection,
  getTableCounts,
  clearAllTables,
} from '../services/d1-rest';
import {
  insertCharacter,
  insertLocation,
  insertChapter,
  insertRelationship,
  insertSceneCharacter,
  insertSceneTag,
  getCharacterIdBySlug,
  getLocationIdBySlug,
  updateSceneLocation,
  updateScenePovCharacter,
  getScenesByContentId,
  deleteSceneCharacters,
  deleteSceneTags,
  setLogger,
  type LogLevel,
} from '../services/d1-inserts';

// Cloudflare Images services
import {
  initCloudflareImages,
  isCloudflareImagesAvailable,
  testConnection as testCloudflareConnection,
} from '../services/cloudflare-images';

// Imagery ingestion services
import {
  ingestChapterImagery,
  ingestCharacterImagery,
  ingestLocationImagery,
  ingestAllChapterImagery,
  ingestAllCharacterImagery,
  ingestAllLocationImagery,
  setImageryLogger,
  type IngestImageryResult,
} from '../services/imagery-ingest';

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_CONTENT_DIR = join(process.cwd(), '..', 'MemoryQuill', 'story-content');
const DEFAULT_WORKSPACE_ID = 'default';

interface CLIOptions {
  contentDir: string;
  workspaceId: string;
  dryRun: boolean;
  verbose: boolean;
}

interface IngestionStats {
  charactersProcessed: number;
  locationsProcessed: number;
  chaptersProcessed: number;
  scenesProcessed: number;
  relationshipsProcessed: number;
  errors: string[];
}

// ============================================================================
// Helpers
// ============================================================================

function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * Create a CLI logger that respects verbose mode
 */
function createCLILogger(
  verbose: boolean
): (level: LogLevel, message: string, data?: Record<string, unknown>) => void {
  return (level: LogLevel, message: string, data?: Record<string, unknown>) => {
    // Skip debug messages unless verbose
    if (level === 'debug' && !verbose) return;

    const prefix = {
      info: pc.blue('ℹ'),
      debug: pc.dim('◦'),
      warn: pc.yellow('⚠'),
    }[level];

    const dataStr = data ? pc.dim(` ${JSON.stringify(data)}`) : '';
    console.log(`  ${prefix} ${message}${dataStr}`);
  };
}

function printBanner() {
  console.log();
  console.log(pc.cyan('  ╔══════════════════════════════════════════════════════════╗'));
  console.log(
    pc.cyan('  ║') +
      pc.bold(pc.white('          MythicIndex Content Ingestion CLI           ')) +
      pc.cyan('║')
  );
  console.log(
    pc.cyan('  ║') +
      pc.dim('        Transform markdown into structured data         ') +
      pc.cyan('║')
  );
  console.log(pc.cyan('  ╚══════════════════════════════════════════════════════════╝'));
  console.log();
}

function countItems(contentDir: string, type: 'characters' | 'locations' | 'chapters'): number {
  const dirPath = join(contentDir, type);
  if (!existsSync(dirPath)) return 0;

  return readdirSync(dirPath).filter(item => {
    const itemPath = join(dirPath, item);
    return existsSync(itemPath) && !item.includes('template') && !item.includes('DO_NOT_USE');
  }).length;
}

function getItemDirs(contentDir: string, type: 'characters' | 'locations' | 'chapters'): string[] {
  const dirPath = join(contentDir, type);
  if (!existsSync(dirPath)) return [];

  return readdirSync(dirPath).filter(item => {
    const itemPath = join(dirPath, item);
    return existsSync(itemPath) && !item.includes('template') && !item.includes('DO_NOT_USE');
  });
}

// ============================================================================
// D1 Connection via REST API
// ============================================================================

async function checkD1Connection(): Promise<boolean> {
  // Check if environment variables are set
  if (!isD1Available()) {
    const missing = getMissingEnvVars();
    p.log.error(`Missing environment variables: ${pc.yellow(missing.join(', '))}`);
    p.log.info('Set these in your .env file:');
    p.log.info('  CLOUDFLARE_ACCOUNT_ID=your-account-id');
    p.log.info('  CLOUDFLARE_D1_DATABASE_ID=your-database-id');
    p.log.info('  CLOUDFLARE_API_TOKEN=your-api-token');
    return false;
  }

  // Initialize and test connection
  try {
    initD1();
    const result = await testConnection();
    if (!result.success) {
      p.log.error(`D1 connection failed: ${result.message}`);
      return false;
    }
    return true;
  } catch (err) {
    p.log.error(`D1 connection error: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

// ============================================================================
// Content Ingestion Functions
// ============================================================================

async function ingestCharacters(
  contentDir: string,
  workspaceId: string,
  onProgress?: (msg: string) => void
): Promise<{ processed: number; errors: string[]; characterMap: Map<string, string> }> {
  const errors: string[] = [];
  const characterMap = new Map<string, string>(); // slug -> id
  const charDirs = getItemDirs(contentDir, 'characters');

  for (const slug of charDirs) {
    try {
      const profilePath = join(contentDir, 'characters', slug, 'profile.md');
      if (!existsSync(profilePath)) {
        errors.push(`No profile.md found for character: ${slug}`);
        continue;
      }

      const content = readFileSync(profilePath, 'utf-8');
      const parsed = parseCharacterProfile(slug, content);

      onProgress?.(`Processing character: ${parsed.name}`);

      const result = await insertCharacter(workspaceId, parsed);
      characterMap.set(slug, result.id);
    } catch (err) {
      errors.push(`Character ${slug}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { processed: charDirs.length - errors.length, errors, characterMap };
}

async function ingestRelationships(
  contentDir: string,
  characterMap: Map<string, string>,
  onProgress?: (msg: string) => void
): Promise<{ processed: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;
  const charDirs = getItemDirs(contentDir, 'characters');

  for (const slug of charDirs) {
    try {
      const relPath = join(contentDir, 'characters', slug, 'relationships.md');
      if (!existsSync(relPath)) continue;

      const sourceId = characterMap.get(slug);
      if (!sourceId) {
        errors.push(`No character ID found for: ${slug}`);
        continue;
      }

      const content = readFileSync(relPath, 'utf-8');
      const relationships = parseCharacterRelationships(content);

      for (const rel of relationships) {
        const targetId = characterMap.get(rel.targetSlug);
        if (!targetId) {
          // Try to look up by slug in database
          const lookedUpId = await getCharacterIdBySlug(rel.targetSlug);
          if (!lookedUpId) {
            errors.push(`Relationship target not found: ${rel.targetSlug}`);
            continue;
          }
          onProgress?.(`Relationship: ${slug} -> ${rel.targetSlug}`);
          await insertRelationship(sourceId, lookedUpId, rel);
        } else {
          onProgress?.(`Relationship: ${slug} -> ${rel.targetSlug}`);
          await insertRelationship(sourceId, targetId, rel);
        }
        processed++;
      }
    } catch (err) {
      errors.push(`Relationships for ${slug}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { processed, errors };
}

async function ingestLocations(
  contentDir: string,
  workspaceId: string,
  onProgress?: (msg: string) => void
): Promise<{ processed: number; errors: string[]; locationMap: Map<string, string> }> {
  const errors: string[] = [];
  const locationMap = new Map<string, string>(); // slug -> id
  const locDirs = getItemDirs(contentDir, 'locations');

  for (const slug of locDirs) {
    try {
      const overviewPath = join(contentDir, 'locations', slug, 'overview.md');
      if (!existsSync(overviewPath)) {
        errors.push(`No overview.md found for location: ${slug}`);
        continue;
      }

      const content = readFileSync(overviewPath, 'utf-8');
      const parsed = parseLocationOverview(slug, content);

      onProgress?.(`Processing location: ${parsed.name}`);

      const result = await insertLocation(workspaceId, parsed);
      locationMap.set(slug, result.id);
    } catch (err) {
      errors.push(`Location ${slug}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { processed: locDirs.length - errors.length, errors, locationMap };
}

async function ingestChapters(
  contentDir: string,
  workspaceId: string,
  characterMap: Map<string, string>,
  locationMap: Map<string, string>,
  onProgress?: (msg: string) => void
): Promise<{ processed: number; scenesProcessed: number; errors: string[] }> {
  const errors: string[] = [];
  let scenesProcessed = 0;
  const chapDirs = getItemDirs(contentDir, 'chapters');

  for (const slug of chapDirs) {
    try {
      const contentPath = join(contentDir, 'chapters', slug, 'content.md');
      if (!existsSync(contentPath)) {
        errors.push(`No content.md found for chapter: ${slug}`);
        continue;
      }

      const content = readFileSync(contentPath, 'utf-8');
      const parsed = parseChapterContent(slug, content);

      onProgress?.(`Processing chapter: ${parsed.title}`);

      const result = await insertChapter(workspaceId, parsed);

      // Now link scenes to characters and locations
      const scenes = await getScenesByContentId(result.contentItemId);

      for (let i = 0; i < parsed.scenes.length; i++) {
        const sceneMarker = parsed.scenes[i];
        const sceneRecord = scenes[i];

        if (!sceneRecord) continue;

        // Link location
        if (sceneMarker.location) {
          let locationId = locationMap.get(sceneMarker.location);
          if (!locationId) {
            locationId = (await getLocationIdBySlug(sceneMarker.location)) || undefined;
          }
          if (locationId) {
            await updateSceneLocation(sceneRecord.id, locationId);
          }
        }

        // Link POV character (from chapter frontmatter)
        if (parsed.povCharacter) {
          let povId = characterMap.get(parsed.povCharacter);
          if (!povId) {
            povId = (await getCharacterIdBySlug(parsed.povCharacter)) || undefined;
          }
          if (povId) {
            await updateScenePovCharacter(sceneRecord.id, povId);
          }
        }

        // Link characters present in scene
        await deleteSceneCharacters(sceneRecord.id);
        for (const charSlug of sceneMarker.characters) {
          let charId = characterMap.get(charSlug);
          if (!charId) {
            charId = (await getCharacterIdBySlug(charSlug)) || undefined;
          }
          if (charId) {
            const role = charSlug === parsed.povCharacter ? 'pov' : 'major';
            await insertSceneCharacter(sceneRecord.id, charId, role);
          }
        }

        // Add scene tags
        await deleteSceneTags(sceneRecord.id);
        for (const tag of sceneMarker.tags) {
          await insertSceneTag(sceneRecord.id, tag);
        }

        scenesProcessed++;
      }
    } catch (err) {
      errors.push(`Chapter ${slug}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { processed: chapDirs.length - errors.length, scenesProcessed, errors };
}

// ============================================================================
// Commands
// ============================================================================

async function runIngestAll(options: CLIOptions) {
  printBanner();
  p.intro(pc.bgCyan(pc.black(' Starting Full Ingestion ')));

  // Validate content directory
  if (!existsSync(options.contentDir)) {
    p.cancel(`Content directory not found: ${options.contentDir}`);
    process.exit(1);
  }

  // Count items to process
  const counts = {
    characters: countItems(options.contentDir, 'characters'),
    locations: countItems(options.contentDir, 'locations'),
    chapters: countItems(options.contentDir, 'chapters'),
  };

  p.log.info(`Content directory: ${pc.cyan(options.contentDir)}`);
  p.log.info(
    `Found: ${pc.green(formatNumber(counts.characters))} characters, ` +
      `${pc.green(formatNumber(counts.locations))} locations, ` +
      `${pc.green(formatNumber(counts.chapters))} chapters`
  );

  if (options.dryRun) {
    p.log.warn(pc.yellow('DRY RUN MODE - No database changes will be made'));
    p.log.info('Preview the content using the `preview` command instead.');
    p.outro('Dry run complete');
    return;
  }

  // Check D1 connection
  const s = p.spinner();
  s.start('Connecting to Cloudflare D1...');

  const connected = await checkD1Connection();
  if (!connected) {
    s.stop('Connection failed');
    p.cancel('Could not connect to Cloudflare D1');
    process.exit(1);
  }
  s.stop('Connected to Cloudflare D1');

  // Set up detailed logging
  setLogger(createCLILogger(options.verbose));

  // Show current table counts
  const tableCounts = await getTableCounts();
  p.log.info(`Current database: ${pc.dim(JSON.stringify(tableCounts))}`);

  // Confirm before proceeding
  const shouldContinue = await p.confirm({
    message: 'Proceed with ingestion?',
  });

  if (p.isCancel(shouldContinue) || !shouldContinue) {
    p.cancel('Ingestion cancelled');
    process.exit(0);
  }

  // Run ingestion with progress
  const stats: IngestionStats = {
    charactersProcessed: 0,
    locationsProcessed: 0,
    chaptersProcessed: 0,
    scenesProcessed: 0,
    relationshipsProcessed: 0,
    errors: [],
  };

  // 1. Ingest characters first
  s.start('Ingesting characters...');
  const charResult = await ingestCharacters(
    options.contentDir,
    options.workspaceId,
    options.verbose ? msg => s.message(msg) : undefined
  );
  stats.charactersProcessed = charResult.processed;
  stats.errors.push(...charResult.errors);
  s.stop(`Processed ${charResult.processed} characters`);

  // 2. Ingest relationships (after characters exist)
  s.start('Ingesting relationships...');
  const relResult = await ingestRelationships(
    options.contentDir,
    charResult.characterMap,
    options.verbose ? msg => s.message(msg) : undefined
  );
  stats.relationshipsProcessed = relResult.processed;
  stats.errors.push(...relResult.errors);
  s.stop(`Processed ${relResult.processed} relationships`);

  // 3. Ingest locations
  s.start('Ingesting locations...');
  const locResult = await ingestLocations(
    options.contentDir,
    options.workspaceId,
    options.verbose ? msg => s.message(msg) : undefined
  );
  stats.locationsProcessed = locResult.processed;
  stats.errors.push(...locResult.errors);
  s.stop(`Processed ${locResult.processed} locations`);

  // 4. Ingest chapters and scenes (after characters and locations exist)
  s.start('Ingesting chapters and scenes...');
  const chapResult = await ingestChapters(
    options.contentDir,
    options.workspaceId,
    charResult.characterMap,
    locResult.locationMap,
    options.verbose ? msg => s.message(msg) : undefined
  );
  stats.chaptersProcessed = chapResult.processed;
  stats.scenesProcessed = chapResult.scenesProcessed;
  stats.errors.push(...chapResult.errors);
  s.stop(`Processed ${chapResult.processed} chapters, ${chapResult.scenesProcessed} scenes`);

  // Display results
  console.log();
  p.note(
    [
      `${pc.green('Characters:')} ${formatNumber(stats.charactersProcessed)}`,
      `${pc.green('Locations:')} ${formatNumber(stats.locationsProcessed)}`,
      `${pc.green('Chapters:')} ${formatNumber(stats.chaptersProcessed)}`,
      `${pc.green('Scenes:')} ${formatNumber(stats.scenesProcessed)}`,
      `${pc.green('Relationships:')} ${formatNumber(stats.relationshipsProcessed)}`,
    ].join('\n'),
    'Ingestion Results'
  );

  if (stats.errors.length > 0) {
    console.log();
    p.log.warn(`${stats.errors.length} errors occurred:`);
    for (const error of stats.errors.slice(0, 10)) {
      p.log.error(`  ${pc.red('•')} ${error}`);
    }
    if (stats.errors.length > 10) {
      p.log.info(`  ... and ${stats.errors.length - 10} more errors`);
    }
  }

  p.outro(
    stats.errors.length === 0
      ? pc.green('Ingestion completed successfully!')
      : pc.yellow('Ingestion completed with errors')
  );
}

async function runIngestCharacters(options: CLIOptions) {
  printBanner();
  p.intro(pc.bgMagenta(pc.black(' Character Ingestion ')));

  if (!existsSync(options.contentDir)) {
    p.cancel(`Content directory not found: ${options.contentDir}`);
    process.exit(1);
  }

  const charCount = countItems(options.contentDir, 'characters');
  p.log.info(`Found ${pc.green(formatNumber(charCount))} characters to process`);

  if (options.dryRun) {
    p.log.warn(pc.yellow('DRY RUN MODE - No database changes will be made'));
    p.outro('Dry run complete');
    return;
  }

  // Check D1 connection
  const s = p.spinner();
  s.start('Connecting to Cloudflare D1...');

  const connected = await checkD1Connection();
  if (!connected) {
    s.stop('Connection failed');
    p.cancel('Could not connect to Cloudflare D1');
    process.exit(1);
  }
  s.stop('Connected to Cloudflare D1');

  // Set up detailed logging
  setLogger(createCLILogger(options.verbose));

  // Process characters
  s.start('Processing characters...');
  const result = await ingestCharacters(
    options.contentDir,
    options.workspaceId,
    options.verbose ? msg => s.message(msg) : undefined
  );
  s.stop(`Processed ${result.processed} characters`);

  // Process relationships
  s.start('Processing relationships...');
  const relResult = await ingestRelationships(
    options.contentDir,
    result.characterMap,
    options.verbose ? msg => s.message(msg) : undefined
  );
  s.stop(`Processed ${relResult.processed} relationships`);

  // Show errors
  const allErrors = [...result.errors, ...relResult.errors];
  if (allErrors.length > 0) {
    p.log.warn(`${allErrors.length} errors occurred:`);
    for (const error of allErrors.slice(0, 5)) {
      p.log.error(`  ${pc.red('•')} ${error}`);
    }
  }

  p.outro(pc.green('Character ingestion complete!'));
}

async function runIngestLocations(options: CLIOptions) {
  printBanner();
  p.intro(pc.bgBlue(pc.black(' Location Ingestion ')));

  if (!existsSync(options.contentDir)) {
    p.cancel(`Content directory not found: ${options.contentDir}`);
    process.exit(1);
  }

  const locCount = countItems(options.contentDir, 'locations');
  p.log.info(`Found ${pc.green(formatNumber(locCount))} locations to process`);

  if (options.dryRun) {
    p.log.warn(pc.yellow('DRY RUN MODE - No database changes will be made'));
    p.outro('Dry run complete');
    return;
  }

  // Check D1 connection
  const s = p.spinner();
  s.start('Connecting to Cloudflare D1...');

  const connected = await checkD1Connection();
  if (!connected) {
    s.stop('Connection failed');
    p.cancel('Could not connect to Cloudflare D1');
    process.exit(1);
  }
  s.stop('Connected to Cloudflare D1');

  // Set up detailed logging
  setLogger(createCLILogger(options.verbose));

  // Process locations
  s.start('Processing locations...');
  const result = await ingestLocations(
    options.contentDir,
    options.workspaceId,
    options.verbose ? msg => s.message(msg) : undefined
  );
  s.stop(`Processed ${result.processed} locations`);

  // Show errors
  if (result.errors.length > 0) {
    p.log.warn(`${result.errors.length} errors occurred:`);
    for (const error of result.errors.slice(0, 5)) {
      p.log.error(`  ${pc.red('•')} ${error}`);
    }
  }

  p.outro(pc.green('Location ingestion complete!'));
}

async function runIngestChapters(options: CLIOptions) {
  printBanner();
  p.intro(pc.bgYellow(pc.black(' Chapter Ingestion ')));

  if (!existsSync(options.contentDir)) {
    p.cancel(`Content directory not found: ${options.contentDir}`);
    process.exit(1);
  }

  const chapCount = countItems(options.contentDir, 'chapters');
  p.log.info(`Found ${pc.green(formatNumber(chapCount))} chapters to process`);

  if (options.dryRun) {
    p.log.warn(pc.yellow('DRY RUN MODE - No database changes will be made'));
    p.outro('Dry run complete');
    return;
  }

  // Check D1 connection
  const s = p.spinner();
  s.start('Connecting to Cloudflare D1...');

  const connected = await checkD1Connection();
  if (!connected) {
    s.stop('Connection failed');
    p.cancel('Could not connect to Cloudflare D1');
    process.exit(1);
  }
  s.stop('Connected to Cloudflare D1');

  // Set up detailed logging
  setLogger(createCLILogger(options.verbose));

  // Need to get character and location maps first
  p.log.info('Loading existing characters and locations...');

  const characterMap = new Map<string, string>();
  const locationMap = new Map<string, string>();

  // Process chapters
  s.start('Processing chapters...');
  const result = await ingestChapters(
    options.contentDir,
    options.workspaceId,
    characterMap,
    locationMap,
    options.verbose ? msg => s.message(msg) : undefined
  );
  s.stop(`Processed ${result.processed} chapters, ${result.scenesProcessed} scenes`);

  // Show errors
  if (result.errors.length > 0) {
    p.log.warn(`${result.errors.length} errors occurred:`);
    for (const error of result.errors.slice(0, 5)) {
      p.log.error(`  ${pc.red('•')} ${error}`);
    }
  }

  p.outro(pc.green('Chapter ingestion complete!'));
}

async function runPreview(options: CLIOptions) {
  printBanner();
  p.intro(pc.bgGreen(pc.black(' Content Preview ')));

  if (!existsSync(options.contentDir)) {
    p.cancel(`Content directory not found: ${options.contentDir}`);
    process.exit(1);
  }

  // Select what to preview
  const previewType = await p.select({
    message: 'What would you like to preview?',
    options: [
      { value: 'character', label: 'Character', hint: 'Preview a character profile' },
      { value: 'location', label: 'Location', hint: 'Preview a location' },
      { value: 'chapter', label: 'Chapter', hint: 'Preview a chapter' },
    ],
  });

  if (p.isCancel(previewType)) {
    p.cancel('Preview cancelled');
    process.exit(0);
  }

  const dirPath = join(options.contentDir, `${previewType}s`);
  const items = readdirSync(dirPath).filter(
    item => !item.includes('template') && !item.includes('DO_NOT_USE')
  );

  const selectedItem = await p.select({
    message: `Select a ${previewType}:`,
    options: items.slice(0, 20).map(item => ({ value: item, label: item })),
  });

  if (p.isCancel(selectedItem)) {
    p.cancel('Preview cancelled');
    process.exit(0);
  }

  const s = p.spinner();
  s.start(`Parsing ${selectedItem}...`);

  try {
    const { readFileSync } = await import('fs');
    let parsed: unknown;
    let filename: string;

    if (previewType === 'character') {
      filename = 'profile.md';
      const content = readFileSync(join(dirPath, selectedItem as string, filename), 'utf-8');
      parsed = parseCharacterProfile(selectedItem as string, content);
    } else if (previewType === 'location') {
      filename = 'overview.md';
      const content = readFileSync(join(dirPath, selectedItem as string, filename), 'utf-8');
      parsed = parseLocationOverview(selectedItem as string, content);
    } else {
      filename = 'content.md';
      const content = readFileSync(join(dirPath, selectedItem as string, filename), 'utf-8');
      parsed = parseChapterContent(selectedItem as string, content);
    }

    s.stop('Parsed successfully!');

    console.log();
    console.log(pc.dim('─'.repeat(60)));
    console.log(pc.bold(`Parsed ${previewType}: ${selectedItem}`));
    console.log(pc.dim('─'.repeat(60)));
    console.log(JSON.stringify(parsed, null, 2));
    console.log(pc.dim('─'.repeat(60)));
  } catch (err) {
    s.stop('Parse failed');
    p.cancel(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  p.outro(pc.green('Preview complete!'));
}

async function runInteractive() {
  printBanner();
  p.intro(pc.bgCyan(pc.black(' Interactive Mode ')));

  // Content directory
  const contentDir = await p.text({
    message: 'Content directory path:',
    placeholder: DEFAULT_CONTENT_DIR,
    defaultValue: DEFAULT_CONTENT_DIR,
    validate: value => {
      if (!existsSync(value)) {
        return 'Directory does not exist';
      }
    },
  });

  if (p.isCancel(contentDir)) {
    p.cancel('Cancelled');
    process.exit(0);
  }

  // Action selection
  const action = await p.select({
    message: 'What would you like to do?',
    options: [
      { value: 'all', label: 'Ingest All', hint: 'Process all content types' },
      { value: 'characters', label: 'Ingest Characters', hint: 'Process character profiles only' },
      { value: 'locations', label: 'Ingest Locations', hint: 'Process locations only' },
      { value: 'chapters', label: 'Ingest Chapters', hint: 'Process chapters and scenes only' },
      { value: 'preview', label: 'Preview', hint: 'Preview parsed content without ingesting' },
      { value: 'status', label: 'Status', hint: 'Check D1 connection and table counts' },
    ],
  });

  if (p.isCancel(action)) {
    p.cancel('Cancelled');
    process.exit(0);
  }

  // Options
  const dryRun = await p.confirm({
    message: 'Dry run? (no database changes)',
    initialValue: true,
  });

  if (p.isCancel(dryRun)) {
    p.cancel('Cancelled');
    process.exit(0);
  }

  const options: CLIOptions = {
    contentDir: contentDir as string,
    workspaceId: DEFAULT_WORKSPACE_ID,
    dryRun: dryRun as boolean,
    verbose: true,
  };

  // Execute selected action
  switch (action) {
    case 'all':
      await runIngestAll(options);
      break;
    case 'characters':
      await runIngestCharacters(options);
      break;
    case 'locations':
      await runIngestLocations(options);
      break;
    case 'chapters':
      await runIngestChapters(options);
      break;
    case 'preview':
      await runPreview(options);
      break;
    case 'status':
      await runStatus();
      break;
  }
}

async function runReset(confirm: boolean = false) {
  printBanner();
  p.intro(pc.bgRed(pc.white(' Database Reset ')));

  // Check D1 connection
  const s = p.spinner();
  s.start('Checking D1 connection...');

  const connected = await checkD1Connection();
  if (!connected) {
    s.stop('Connection failed');
    p.cancel('Could not connect to Cloudflare D1');
    process.exit(1);
  }
  s.stop('Connected to Cloudflare D1');

  // Show current table counts
  const currentCounts = await getTableCounts();
  p.log.warn('Current database contents:');
  const lines: string[] = [];
  let totalRows = 0;
  for (const [table, count] of Object.entries(currentCounts)) {
    if (count > 0) {
      lines.push(`  ${pc.cyan(table.padEnd(25))} ${pc.yellow(formatNumber(count))} rows`);
      totalRows += count;
    }
  }
  if (lines.length > 0) {
    console.log(lines.join('\n'));
  } else {
    p.log.info('Database is already empty');
    p.outro(pc.green('Nothing to clear!'));
    return;
  }

  p.log.warn(`Total: ${pc.bold(formatNumber(totalRows))} rows will be deleted`);

  // Confirm unless --confirm flag was passed
  if (!confirm) {
    const shouldContinue = await p.confirm({
      message: pc.red('Are you sure you want to delete all ingested data?'),
    });

    if (p.isCancel(shouldContinue) || !shouldContinue) {
      p.cancel('Reset cancelled');
      process.exit(0);
    }
  }

  // Clear all tables
  s.start('Clearing all tables...');
  const deletedCounts = await clearAllTables();
  s.stop('Tables cleared');

  // Show deleted counts
  console.log();
  p.log.success('Deleted rows by table:');
  for (const [table, count] of Object.entries(deletedCounts)) {
    if (count >= 0) {
      console.log(`  ${pc.cyan(table.padEnd(25))} ${pc.green(formatNumber(count))} rows deleted`);
    } else {
      console.log(`  ${pc.cyan(table.padEnd(25))} ${pc.dim('skipped')}`);
    }
  }

  const totalDeleted = Object.values(deletedCounts).reduce((sum, c) => sum + (c > 0 ? c : 0), 0);
  p.outro(pc.green(`Reset complete! Deleted ${formatNumber(totalDeleted)} total rows.`));
}

async function runStatus() {
  printBanner();
  p.intro(pc.bgWhite(pc.black(' Database Status ')));

  const s = p.spinner();
  s.start('Checking D1 connection...');

  const connected = await checkD1Connection();
  if (!connected) {
    s.stop('Connection failed');
    p.cancel('Could not connect to Cloudflare D1');
    process.exit(1);
  }
  s.stop('Connected to Cloudflare D1');

  // Get table counts
  s.start('Fetching table counts...');
  const counts = await getTableCounts();
  s.stop('Table counts retrieved');

  // Display counts
  console.log();
  const lines: string[] = [];
  for (const [table, count] of Object.entries(counts)) {
    const status = count >= 0 ? pc.green(formatNumber(count)) : pc.red('N/A');
    lines.push(`${pc.cyan(table.padEnd(25))} ${status}`);
  }
  p.note(lines.join('\n'), 'Table Row Counts');

  p.outro(pc.green('Status check complete!'));
}

// ============================================================================
// Image Ingestion
// ============================================================================

interface ImageIngestionOptions extends CLIOptions {
  chapter?: string;
  character?: string;
  location?: string;
  type?: 'chapters' | 'characters' | 'locations' | 'all';
}

async function runIngestImages(options: ImageIngestionOptions) {
  printBanner();
  p.intro(pc.bgMagenta(pc.white(' Image Ingestion ')));

  // Validate content directory
  if (!existsSync(options.contentDir)) {
    p.cancel(`Content directory not found: ${options.contentDir}`);
    process.exit(1);
  }

  p.log.info(`Content directory: ${pc.cyan(options.contentDir)}`);

  // Check D1 connection
  const s = p.spinner();
  s.start('Connecting to Cloudflare D1...');

  const d1Connected = await checkD1Connection();
  if (!d1Connected) {
    s.stop('D1 connection failed');
    p.cancel('Could not connect to Cloudflare D1');
    process.exit(1);
  }
  s.stop('Connected to Cloudflare D1');

  // Check Cloudflare Images connection
  s.start('Checking Cloudflare Images...');

  if (!isCloudflareImagesAvailable()) {
    s.stop('Cloudflare Images not configured');
    p.log.error('Missing CLOUDFLARE_ACCOUNT_ID and/or CLOUDFLARE_API_TOKEN');
    p.cancel('Could not connect to Cloudflare Images');
    process.exit(1);
  }

  try {
    initCloudflareImages();
    const cfResult = await testCloudflareConnection();
    if (!cfResult.success) {
      s.stop('Cloudflare Images connection failed');
      p.cancel(`Could not connect to Cloudflare Images: ${cfResult.message}`);
      process.exit(1);
    }
  } catch (err) {
    s.stop('Cloudflare Images connection failed');
    p.cancel(`Cloudflare Images error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
  s.stop('Connected to Cloudflare Images');

  // Set up logging
  setLogger(createCLILogger(options.verbose));
  setImageryLogger(createCLILogger(options.verbose));

  if (options.dryRun) {
    p.log.warn(pc.yellow('DRY RUN MODE - No uploads or database changes will be made'));
    p.outro('Dry run complete (image ingestion skipped)');
    return;
  }

  // Determine what to process
  const results: IngestImageryResult = { uploaded: 0, skipped: 0, linked: 0, errors: [] };

  // Specific entity processing
  if (options.chapter) {
    s.start(`Processing chapter: ${options.chapter}`);
    const result = await ingestChapterImagery(options.chapter, options.contentDir);
    results.uploaded += result.uploaded;
    results.skipped += result.skipped;
    results.linked += result.linked;
    results.errors.push(...result.errors);
    s.stop(
      `Chapter complete: ${result.uploaded} uploaded, ${result.skipped} skipped, ${result.linked} linked`
    );
  } else if (options.character) {
    s.start(`Processing character: ${options.character}`);
    const result = await ingestCharacterImagery(options.character, options.contentDir);
    results.uploaded += result.uploaded;
    results.skipped += result.skipped;
    results.linked += result.linked;
    results.errors.push(...result.errors);
    s.stop(
      `Character complete: ${result.uploaded} uploaded, ${result.skipped} skipped, ${result.linked} linked`
    );
  } else if (options.location) {
    s.start(`Processing location: ${options.location}`);
    const result = await ingestLocationImagery(options.location, options.contentDir);
    results.uploaded += result.uploaded;
    results.skipped += result.skipped;
    results.linked += result.linked;
    results.errors.push(...result.errors);
    s.stop(
      `Location complete: ${result.uploaded} uploaded, ${result.skipped} skipped, ${result.linked} linked`
    );
  } else {
    // Batch processing by type
    const processType = options.type || 'all';

    if (processType === 'all' || processType === 'chapters') {
      s.start('Processing all chapter imagery...');
      const result = await ingestAllChapterImagery(options.contentDir);
      results.uploaded += result.uploaded;
      results.skipped += result.skipped;
      results.linked += result.linked;
      results.errors.push(...result.errors);
      s.stop(
        `Chapters complete: ${result.uploaded} uploaded, ${result.skipped} skipped, ${result.linked} linked`
      );
    }

    if (processType === 'all' || processType === 'characters') {
      s.start('Processing all character imagery...');
      const result = await ingestAllCharacterImagery(options.contentDir);
      results.uploaded += result.uploaded;
      results.skipped += result.skipped;
      results.linked += result.linked;
      results.errors.push(...result.errors);
      s.stop(
        `Characters complete: ${result.uploaded} uploaded, ${result.skipped} skipped, ${result.linked} linked`
      );
    }

    if (processType === 'all' || processType === 'locations') {
      s.start('Processing all location imagery...');
      const result = await ingestAllLocationImagery(options.contentDir);
      results.uploaded += result.uploaded;
      results.skipped += result.skipped;
      results.linked += result.linked;
      results.errors.push(...result.errors);
      s.stop(
        `Locations complete: ${result.uploaded} uploaded, ${result.skipped} skipped, ${result.linked} linked`
      );
    }
  }

  // Display results
  console.log();
  p.note(
    [
      `${pc.green('Uploaded:')} ${formatNumber(results.uploaded)}`,
      `${pc.yellow('Skipped (existing):')} ${formatNumber(results.skipped)}`,
      `${pc.blue('Links created:')} ${formatNumber(results.linked)}`,
    ].join('\n'),
    'Image Ingestion Results'
  );

  if (results.errors.length > 0) {
    console.log();
    p.log.warn(`${results.errors.length} errors occurred:`);
    for (const error of results.errors.slice(0, 10)) {
      p.log.error(`  ${pc.red('•')} ${error}`);
    }
    if (results.errors.length > 10) {
      p.log.info(`  ... and ${results.errors.length - 10} more errors`);
    }
  }

  p.outro(
    results.errors.length === 0
      ? pc.green('Image ingestion completed successfully!')
      : pc.yellow('Image ingestion completed with errors')
  );
}

// ============================================================================
// CLI Setup
// ============================================================================

program.name('mythic-ingest').description('MythicIndex content ingestion CLI').version('1.0.0');

// Global options
program
  .option('-c, --content-dir <path>', 'Content directory path', DEFAULT_CONTENT_DIR)
  .option('-w, --workspace-id <id>', 'Workspace ID', DEFAULT_WORKSPACE_ID)
  .option('-d, --dry-run', 'Dry run mode (no database changes)', false)
  .option('-v, --verbose', 'Verbose output', false);

// Interactive mode (default)
program
  .command('interactive', { isDefault: true })
  .description('Interactive mode with prompts')
  .action(async () => {
    await runInteractive();
  });

// Ingest all
program
  .command('all')
  .description('Ingest all content (characters, locations, chapters)')
  .action(async () => {
    const opts = program.opts();
    await runIngestAll({
      contentDir: opts.contentDir,
      workspaceId: opts.workspaceId,
      dryRun: opts.dryRun,
      verbose: opts.verbose,
    });
  });

// Ingest characters
program
  .command('characters')
  .description('Ingest character profiles')
  .action(async () => {
    const opts = program.opts();
    await runIngestCharacters({
      contentDir: opts.contentDir,
      workspaceId: opts.workspaceId,
      dryRun: opts.dryRun,
      verbose: opts.verbose,
    });
  });

// Ingest locations
program
  .command('locations')
  .description('Ingest location data')
  .action(async () => {
    const opts = program.opts();
    await runIngestLocations({
      contentDir: opts.contentDir,
      workspaceId: opts.workspaceId,
      dryRun: opts.dryRun,
      verbose: opts.verbose,
    });
  });

// Ingest chapters
program
  .command('chapters')
  .description('Ingest chapters and scenes')
  .action(async () => {
    const opts = program.opts();
    await runIngestChapters({
      contentDir: opts.contentDir,
      workspaceId: opts.workspaceId,
      dryRun: opts.dryRun,
      verbose: opts.verbose,
    });
  });

// Preview
program
  .command('preview')
  .description('Preview parsed content without ingesting')
  .action(async () => {
    const opts = program.opts();
    await runPreview({
      contentDir: opts.contentDir,
      workspaceId: opts.workspaceId,
      dryRun: true,
      verbose: opts.verbose,
    });
  });

// Status
program
  .command('status')
  .description('Check D1 connection and show table counts')
  .action(async () => {
    await runStatus();
  });

// Reset
program
  .command('reset')
  .description('Clear all ingested data from the database')
  .option('--confirm', 'Skip confirmation prompt')
  .action(async opts => {
    await runReset(opts.confirm);
  });

// Images
program
  .command('images')
  .description('Upload images from imagery.yaml files to Cloudflare and link to content')
  .option('--chapter <slug>', 'Process specific chapter only')
  .option('--character <slug>', 'Process specific character only')
  .option('--location <slug>', 'Process specific location only')
  .option('--type <type>', 'Process type: chapters, characters, locations, all', 'all')
  .action(async opts => {
    const globalOpts = program.opts();
    await runIngestImages({
      contentDir: globalOpts.contentDir,
      workspaceId: globalOpts.workspaceId,
      dryRun: globalOpts.dryRun,
      verbose: globalOpts.verbose,
      chapter: opts.chapter,
      character: opts.character,
      location: opts.location,
      type: opts.type as 'chapters' | 'characters' | 'locations' | 'all',
    });
  });

// Parse and run
program.parse(process.argv);
