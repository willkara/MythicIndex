/**
 * Full content ingestion menu
 */

import { confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { startSpinner, succeedSpinner, failSpinner } from '../../ui/spinner.js';
import { showSection, showSuccess, showError, showWarning, newLine } from '../../ui/display.js';
import {
  getIngestionConfig,
  checkIngestionConfig,
  getConfigStatus,
  initD1,
  initCloudflareImages,
  initWorkersAI,
  initVectorize,
  testD1Connection,
  testImagesConnection,
  testWorkersAIConnection,
  testVectorizeConnection,
  ingestAllContent,
  discoverCharacters,
  discoverLocations,
  discoverChapters,
} from '../../ingestion/index.js';

/**
 * Run full content ingestion with confirmation
 */
export async function runIngestAllMenu(): Promise<void> {
  showSection('Full Content Ingestion');

  // Check configuration
  const configCheck = checkIngestionConfig();
  if (!configCheck.valid) {
    showError(`Missing environment variables: ${configCheck.missing.join(', ')}`);
    showWarning('Please set these in your .env file');
    newLine();
    return;
  }

  const config = getIngestionConfig();
  const configStatus = getConfigStatus();

  // Initialize services
  const spinner = startSpinner('Initializing services...');

  try {
    // Core services (required)
    initD1({
      accountId: config.cloudflareAccountId,
      databaseId: config.cloudflareD1DatabaseId,
      token: config.cloudflareApiToken,
    });
    initCloudflareImages({
      accountId: config.cloudflareAccountId,
      apiToken: config.cloudflareApiToken,
    });

    // Embedding services (optional - for semantic search)
    let embeddingsAvailable = false;
    if (configStatus.vectorizeConfigured) {
      initWorkersAI({
        accountId: config.cloudflareAccountId,
        apiToken: config.cloudflareApiToken,
      });
      initVectorize({
        accountId: config.cloudflareAccountId,
        indexId: config.cloudflareVectorizeIndexId!,
        apiToken: config.cloudflareApiToken,
      });
      embeddingsAvailable = true;
    }

    // Test connections
    spinner.text = 'Testing D1 connection...';
    const d1Ok = await testD1Connection();
    if (!d1Ok) {
      failSpinner('D1 connection failed');
      return;
    }

    spinner.text = 'Testing Cloudflare Images connection...';
    const imagesOk = await testImagesConnection();
    if (!imagesOk) {
      failSpinner('Cloudflare Images connection failed');
      return;
    }

    // Test embedding services if available
    if (embeddingsAvailable) {
      spinner.text = 'Testing Workers AI connection...';
      const aiOk = await testWorkersAIConnection();
      if (!aiOk) {
        showWarning('Workers AI connection failed - embeddings will be skipped');
        embeddingsAvailable = false;
      }

      if (embeddingsAvailable) {
        spinner.text = 'Testing Vectorize connection...';
        const vectorizeOk = await testVectorizeConnection();
        if (!vectorizeOk) {
          showWarning('Vectorize connection failed - embeddings will be skipped');
          embeddingsAvailable = false;
        }
      }
    }

    if (embeddingsAvailable) {
      succeedSpinner('All services initialized (including semantic search)');
    } else {
      succeedSpinner('Core services initialized (embeddings disabled)');
    }

    // Store for later use
    config.embeddingsAvailable = embeddingsAvailable;
  } catch (err) {
    failSpinner(`Failed to initialize services: ${err}`);
    return;
  }

  // Discover content
  const _discoverSpinner = startSpinner('Discovering content...');

  try {
    const [characters, locations, chapters] = await Promise.all([
      discoverCharacters(config.contentDir),
      discoverLocations(config.contentDir),
      discoverChapters(config.contentDir),
    ]);

    succeedSpinner(
      `Found ${characters.length} characters, ${locations.length} locations, ${chapters.length} chapters`
    );

    if (characters.length === 0 && locations.length === 0 && chapters.length === 0) {
      showWarning('No content found to ingest');
      newLine();
      return;
    }

    // Confirm
    newLine();
    console.log(chalk.yellow('This will:'));
    console.log(chalk.dim('  - Insert/update all content in D1 database'));
    console.log(chalk.dim('  - Upload all images to Cloudflare Images'));
    console.log(chalk.dim('  - Link images to their entities'));
    if ((config as any).embeddingsAvailable) {
      console.log(chalk.dim('  - Generate BGE-M3 embeddings for semantic search'));
    } else {
      console.log(chalk.dim('  - Skip embeddings (Vectorize not configured)'));
    }
    newLine();

    const proceed = await confirm({
      message: 'Proceed with full ingestion?',
      default: false,
    });

    if (!proceed) {
      console.log(chalk.dim('\nCancelled'));
      return;
    }

    // Run ingestion
    newLine();
    const ingestSpinner = startSpinner('Starting ingestion...');

    const result = await ingestAllContent(
      config.contentDir,
      config.workspaceId,
      (progress) => {
        ingestSpinner.text = `[${progress.current}/${progress.total}] ${progress.message}`;
      },
      {
        generateEmbedding: (config as any).embeddingsAvailable,
      }
    );

    if (result.success) {
      succeedSpinner('Ingestion complete');
    } else {
      failSpinner('Ingestion completed with errors');
    }

    // Show stats
    newLine();
    showSuccess(`Characters: ${result.stats.characters}`);
    showSuccess(`Locations: ${result.stats.locations}`);
    showSuccess(`Chapters: ${result.stats.chapters}`);
    showSuccess(`Images uploaded: ${result.stats.imagesUploaded}`);

    if (result.errors.length > 0) {
      newLine();
      showWarning(`${result.errors.length} errors occurred:`);
      for (const err of result.errors.slice(0, 10)) {
        console.log(chalk.dim(`  - ${err}`));
      }
      if (result.errors.length > 10) {
        console.log(chalk.dim(`  ... and ${result.errors.length - 10} more`));
      }
    }

    newLine();
  } catch (err) {
    failSpinner(`Discovery failed: ${err}`);
  }
}
