/**
 * Chapter ingestion submenu
 */

import { select } from '@inquirer/prompts';
import chalk from 'chalk';
import { startSpinner, succeedSpinner, failSpinner } from '../../ui/spinner.js';
import { showSection, showSuccess, showWarning, showError, newLine } from '../../ui/display.js';
import { getCachedChapters } from '../../services/entity-cache.js';
import { runEntitySelect } from './entity-select.js';
import {
  getIngestionConfig,
  checkIngestionConfig,
  initD1,
  initCloudflareImages,
  discoverChapters,
  ingestChapters,
} from '../../ingestion/index.js';

type ChapterMenuChoice = 'all' | 'select' | 'back';

/**
 * Run chapter ingestion menu
 */
export async function runIngestChaptersMenu(): Promise<void> {
  const choice = await select<ChapterMenuChoice>({
    message: 'Ingest Chapters',
    choices: [
      {
        name: 'All Chapters',
        value: 'all',
        description: 'Ingest all chapters with their imagery',
      },
      {
        name: 'Select Specific Chapters',
        value: 'select',
        description: 'Choose which chapters to ingest',
      },
      {
        name: chalk.dim('Back'),
        value: 'back',
      },
    ],
  });

  if (choice === 'back') return;

  // Check configuration
  const configCheck = checkIngestionConfig();
  if (!configCheck.valid) {
    showError(`Missing environment variables: ${configCheck.missing.join(', ')}`);
    return;
  }

  const config = getIngestionConfig();

  // Initialize services
  const _spinner = startSpinner('Initializing services...');

  try {
    initD1({
      accountId: config.cloudflareAccountId,
      databaseId: config.cloudflareD1DatabaseId,
      token: config.cloudflareApiToken,
    });
    initCloudflareImages({
      accountId: config.cloudflareAccountId,
      apiToken: config.cloudflareApiToken,
    });
    succeedSpinner('Services initialized');
  } catch (err) {
    failSpinner(`Failed to initialize: ${err}`);
    return;
  }

  let slugsToIngest: string[];

  if (choice === 'all') {
    // Discover all chapters
    const _discoverSpinner = startSpinner('Discovering chapters...');
    slugsToIngest = await discoverChapters(config.contentDir);
    succeedSpinner(`Found ${slugsToIngest.length} chapters`);

    if (slugsToIngest.length === 0) {
      showWarning('No chapters found to ingest');
      return;
    }
  } else {
    // Use cached chapters for selection
    const cached = getCachedChapters();
    const entities = cached.map((c) => ({
      slug: c.slug,
      name: c.chapterNumber ? `Ch${c.chapterNumber}: ${c.title}` : c.title,
      description: `${c.imageCount} images${c.hasImagery ? ', has imagery.yaml' : ''}`,
    }));

    slugsToIngest = await runEntitySelect(entities, 'Select chapters to ingest:');

    if (slugsToIngest.length === 0) {
      console.log(chalk.dim('\nNo chapters selected'));
      return;
    }
  }

  // Run ingestion
  newLine();
  showSection(`Ingesting ${slugsToIngest.length} Chapters`);

  const ingestSpinner = startSpinner('Starting chapter ingestion...');

  const result = await ingestChapters(
    slugsToIngest,
    config.contentDir,
    config.workspaceId,
    (progress) => {
      ingestSpinner.text = `[${progress.current}/${progress.total}] ${progress.message}`;
    }
  );

  if (result.success) {
    succeedSpinner('Chapter ingestion complete');
  } else {
    failSpinner('Ingestion completed with errors');
  }

  // Show stats
  newLine();
  showSuccess(`Chapters: ${result.stats.chapters}`);
  showSuccess(`Images uploaded: ${result.stats.imagesUploaded}`);

  if (result.errors.length > 0) {
    newLine();
    showWarning(`${result.errors.length} errors occurred:`);
    for (const err of result.errors.slice(0, 5)) {
      console.log(chalk.dim(`  - ${err}`));
    }
    if (result.errors.length > 5) {
      console.log(chalk.dim(`  ... and ${result.errors.length - 5} more`));
    }
  }

  newLine();
}
