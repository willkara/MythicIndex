/**
 * Location ingestion submenu
 */

import { select } from '@inquirer/prompts';
import chalk from 'chalk';
import { startSpinner, succeedSpinner, failSpinner } from '../../ui/spinner.js';
import { showSection, showSuccess, showWarning, showError, newLine } from '../../ui/display.js';
import { getCachedLocations } from '../../services/entity-cache.js';
import { runEntitySelect } from './entity-select.js';
import {
  getIngestionConfig,
  checkIngestionConfig,
  initD1,
  initCloudflareImages,
  discoverLocations,
  ingestLocations,
} from '../../ingestion/index.js';

type LocationMenuChoice = 'all' | 'select' | 'back';

/**
 * Run location ingestion menu
 */
export async function runIngestLocationsMenu(): Promise<void> {
  const choice = await select<LocationMenuChoice>({
    message: 'Ingest Locations',
    choices: [
      {
        name: 'All Locations',
        value: 'all',
        description: 'Ingest all locations with their imagery',
      },
      {
        name: 'Select Specific Locations',
        value: 'select',
        description: 'Choose which locations to ingest',
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
    // Discover all locations
    const _discoverSpinner = startSpinner('Discovering locations...');
    slugsToIngest = await discoverLocations(config.contentDir);
    succeedSpinner(`Found ${slugsToIngest.length} locations`);

    if (slugsToIngest.length === 0) {
      showWarning('No locations found to ingest');
      return;
    }
  } else {
    // Use cached locations for selection
    const cached = getCachedLocations();
    const entities = cached.map((l) => ({
      slug: l.slug,
      name: l.name,
      description: `${l.imageCount} images${l.hasImagery ? ', has imagery.yaml' : ''}`,
    }));

    slugsToIngest = await runEntitySelect(entities, 'Select locations to ingest:');

    if (slugsToIngest.length === 0) {
      console.log(chalk.dim('\nNo locations selected'));
      return;
    }
  }

  // Run ingestion
  newLine();
  showSection(`Ingesting ${slugsToIngest.length} Locations`);

  const ingestSpinner = startSpinner('Starting location ingestion...');

  const result = await ingestLocations(
    slugsToIngest,
    config.contentDir,
    config.workspaceId,
    (progress) => {
      ingestSpinner.text = `[${progress.current}/${progress.total}] ${progress.message}`;
    }
  );

  if (result.success) {
    succeedSpinner('Location ingestion complete');
  } else {
    failSpinner('Ingestion completed with errors');
  }

  // Show stats
  newLine();
  showSuccess(`Locations: ${result.stats.locations}`);
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
