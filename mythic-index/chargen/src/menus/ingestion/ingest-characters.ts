/**
 * Character ingestion submenu
 */

import { select } from '@inquirer/prompts';
import chalk from 'chalk';
import { startSpinner, succeedSpinner, failSpinner } from '../../ui/spinner.js';
import { showSection, showSuccess, showWarning, showError, newLine } from '../../ui/display.js';
import { getCachedCharacters } from '../../services/entity-cache.js';
import { runEntitySelect } from './entity-select.js';
import {
  getIngestionConfig,
  checkIngestionConfig,
  initD1,
  initCloudflareImages,
  discoverCharacters,
  ingestCharacters,
} from '../../ingestion/index.js';

type CharacterMenuChoice = 'all' | 'select' | 'back';

/**
 * Run character ingestion menu
 */
export async function runIngestCharactersMenu(): Promise<void> {
  const choice = await select<CharacterMenuChoice>({
    message: 'Ingest Characters',
    choices: [
      {
        name: 'All Characters',
        value: 'all',
        description: 'Ingest all characters with their imagery',
      },
      {
        name: 'Select Specific Characters',
        value: 'select',
        description: 'Choose which characters to ingest',
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
    // Discover all characters
    const _discoverSpinner = startSpinner('Discovering characters...');
    slugsToIngest = await discoverCharacters(config.contentDir);
    succeedSpinner(`Found ${slugsToIngest.length} characters`);

    if (slugsToIngest.length === 0) {
      showWarning('No characters found to ingest');
      return;
    }
  } else {
    // Use cached characters for selection
    const cached = getCachedCharacters();
    const entities = cached.map((c) => ({
      slug: c.slug,
      name: c.name,
      description: `${c.imageCount} images${c.hasPortrait ? ', has portrait' : ''}`,
    }));

    slugsToIngest = await runEntitySelect(entities, 'Select characters to ingest:');

    if (slugsToIngest.length === 0) {
      console.log(chalk.dim('\nNo characters selected'));
      return;
    }
  }

  // Run ingestion
  newLine();
  showSection(`Ingesting ${slugsToIngest.length} Characters`);

  const ingestSpinner = startSpinner('Starting character ingestion...');

  const result = await ingestCharacters(
    slugsToIngest,
    config.contentDir,
    config.workspaceId,
    (progress) => {
      ingestSpinner.text = `[${progress.current}/${progress.total}] ${progress.message}`;
    }
  );

  if (result.success) {
    succeedSpinner('Character ingestion complete');
  } else {
    failSpinner('Ingestion completed with errors');
  }

  // Show stats
  newLine();
  showSuccess(`Characters: ${result.stats.characters}`);
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
