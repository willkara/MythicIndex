/**
 * Imagery-only re-upload menu (without content re-ingestion)
 */

import { select } from '@inquirer/prompts';
import chalk from 'chalk';
import { startSpinner, succeedSpinner, failSpinner } from '../../ui/spinner.js';
import { showSection, showSuccess, showWarning, showError, newLine } from '../../ui/display.js';
import {
  getCachedCharacters as _getCachedCharacters,
  getCachedLocations as _getCachedLocations,
  getCachedChapters as _getCachedChapters,
} from '../../services/entity-cache.js';
import { runEntitySelect } from './entity-select.js';
import {
  getIngestionConfig,
  checkIngestionConfig,
  initD1,
  initCloudflareImages,
  discoverCharacters as _discoverCharacters,
  discoverLocations as _discoverLocations,
  discoverChapters as _discoverChapters,
  ingestAllCharacterImagery,
  ingestAllLocationImagery,
  ingestAllChapterImagery,
  ingestCharacterImagery,
  ingestLocationImagery,
  ingestChapterImagery,
} from '../../ingestion/index.js';

type ImageryMenuChoice =
  | 'all-characters'
  | 'all-locations'
  | 'all-chapters'
  | 'select-characters'
  | 'select-locations'
  | 'select-chapters'
  | 'back';

/**
 * Run imagery-only upload menu
 */
export async function runImageryOnlyMenu(): Promise<void> {
  const choice = await select<ImageryMenuChoice>({
    message: 'Re-upload Imagery (without content)',
    choices: [
      {
        name: 'All Character Imagery',
        value: 'all-characters',
        description: 'Re-upload all character images',
      },
      {
        name: 'All Location Imagery',
        value: 'all-locations',
        description: 'Re-upload all location images',
      },
      {
        name: 'All Chapter Imagery',
        value: 'all-chapters',
        description: 'Re-upload all chapter images',
      },
      {
        name: 'Select Characters',
        value: 'select-characters',
        description: 'Choose which characters to re-upload imagery for',
      },
      {
        name: 'Select Locations',
        value: 'select-locations',
        description: 'Choose which locations to re-upload imagery for',
      },
      {
        name: 'Select Chapters',
        value: 'select-chapters',
        description: 'Choose which chapters to re-upload imagery for',
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

  newLine();

  switch (choice) {
    case 'all-characters': {
      showSection('Re-uploading All Character Imagery');
      const _ingestSpinner = startSpinner('Processing character imagery...');
      const result = await ingestAllCharacterImagery(config.contentDir);
      succeedSpinner(`Uploaded ${result.uploaded} images, skipped ${result.skipped}`);
      if (result.errors.length > 0) {
        showWarning(`${result.errors.length} errors`);
      }
      break;
    }

    case 'all-locations': {
      showSection('Re-uploading All Location Imagery');
      const _ingestSpinner = startSpinner('Processing location imagery...');
      const result = await ingestAllLocationImagery(config.contentDir);
      succeedSpinner(`Uploaded ${result.uploaded} images, skipped ${result.skipped}`);
      if (result.errors.length > 0) {
        showWarning(`${result.errors.length} errors`);
      }
      break;
    }

    case 'all-chapters': {
      showSection('Re-uploading All Chapter Imagery');
      const _ingestSpinner = startSpinner('Processing chapter imagery...');
      const result = await ingestAllChapterImagery(config.contentDir);
      succeedSpinner(`Uploaded ${result.uploaded} images, skipped ${result.skipped}`);
      if (result.errors.length > 0) {
        showWarning(`${result.errors.length} errors`);
      }
      break;
    }

    case 'select-characters': {
      const cached = _getCachedCharacters();
      const entities = cached.map((c) => ({
        slug: c.slug,
        name: c.name,
        description: `${c.imageCount} images`,
      }));
      const slugs = await runEntitySelect(entities, 'Select characters:');
      if (slugs.length === 0) {
        console.log(chalk.dim('No characters selected'));
        return;
      }

      showSection(`Re-uploading Imagery for ${slugs.length} Characters`);
      let totalUploaded = 0;
      let totalErrors = 0;

      for (const slug of slugs) {
        const _ingestSpinner = startSpinner(`Processing ${slug}...`);
        const result = await ingestCharacterImagery(slug, config.contentDir);
        totalUploaded += result.uploaded;
        totalErrors += result.errors.length;
        succeedSpinner(`${slug}: ${result.uploaded} uploaded`);
      }

      newLine();
      showSuccess(`Total: ${totalUploaded} images uploaded`);
      if (totalErrors > 0) showWarning(`${totalErrors} errors`);
      break;
    }

    case 'select-locations': {
      const cached = _getCachedLocations();
      const entities = cached.map((l) => ({
        slug: l.slug,
        name: l.name,
        description: `${l.imageCount} images`,
      }));
      const slugs = await runEntitySelect(entities, 'Select locations:');
      if (slugs.length === 0) {
        console.log(chalk.dim('No locations selected'));
        return;
      }

      showSection(`Re-uploading Imagery for ${slugs.length} Locations`);
      let totalUploaded = 0;
      let totalErrors = 0;

      for (const slug of slugs) {
        const _ingestSpinner = startSpinner(`Processing ${slug}...`);
        const result = await ingestLocationImagery(slug, config.contentDir);
        totalUploaded += result.uploaded;
        totalErrors += result.errors.length;
        succeedSpinner(`${slug}: ${result.uploaded} uploaded`);
      }

      newLine();
      showSuccess(`Total: ${totalUploaded} images uploaded`);
      if (totalErrors > 0) showWarning(`${totalErrors} errors`);
      break;
    }

    case 'select-chapters': {
      const cached = _getCachedChapters();
      const entities = cached.map((c) => ({
        slug: c.slug,
        name: c.chapterNumber ? `Ch${c.chapterNumber}: ${c.title}` : c.title,
        description: `${c.imageCount} images`,
      }));
      const slugs = await runEntitySelect(entities, 'Select chapters:');
      if (slugs.length === 0) {
        console.log(chalk.dim('No chapters selected'));
        return;
      }

      showSection(`Re-uploading Imagery for ${slugs.length} Chapters`);
      let totalUploaded = 0;
      let totalErrors = 0;

      for (const slug of slugs) {
        const _ingestSpinner = startSpinner(`Processing ${slug}...`);
        const result = await ingestChapterImagery(slug, config.contentDir);
        totalUploaded += result.uploaded;
        totalErrors += result.errors.length;
        succeedSpinner(`${slug}: ${result.uploaded} uploaded`);
      }

      newLine();
      showSuccess(`Total: ${totalUploaded} images uploaded`);
      if (totalErrors > 0) showWarning(`${totalErrors} errors`);
      break;
    }
  }

  newLine();
}
