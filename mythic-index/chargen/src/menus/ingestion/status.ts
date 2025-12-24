/**
 * Database status and reset menu
 */

import { select, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { startSpinner, succeedSpinner, failSpinner } from '../../ui/spinner.js';
import { showSection, showSuccess as _showSuccess, showWarning, showError, newLine } from '../../ui/display.js';
import {
  getIngestionConfig,
  checkIngestionConfig,
  getConfigStatus,
  initD1,
  initCloudflareImages,
  testD1Connection,
  testImagesConnection,
  getTableCounts,
  clearAllTables,
  resetD1 as _resetD1,
  resetCloudflareImages as _resetCloudflareImages,
} from '../../ingestion/index.js';

type StatusMenuChoice = 'status' | 'counts' | 'test' | 'clear' | 'back';

/**
 * Run database status menu
 */
export async function runStatusMenu(): Promise<void> {
  let running = true;

  while (running) {
    const choice = await select<StatusMenuChoice>({
      message: 'Database Status',
      choices: [
        {
          name: 'Show Configuration Status',
          value: 'status',
          description: 'Display current configuration and paths',
        },
        {
          name: 'Show Table Counts',
          value: 'counts',
          description: 'Display row counts for all tables',
        },
        {
          name: 'Test Connections',
          value: 'test',
          description: 'Test D1 and Cloudflare Images connections',
        },
        {
          name: chalk.red('Clear All Tables'),
          value: 'clear',
          description: 'Delete all data from D1 (requires confirmation)',
        },
        {
          name: chalk.dim('Back'),
          value: 'back',
        },
      ],
    });

    switch (choice) {
      case 'status':
        await showConfigStatus();
        break;

      case 'counts':
        await showTableCounts();
        break;

      case 'test':
        await testConnections();
        break;

      case 'clear':
        await clearDatabase();
        break;

      case 'back':
        running = false;
        break;
    }
  }
}

/**
 * Show configuration status
 */
async function showConfigStatus(): Promise<void> {
  newLine();
  showSection('Configuration Status');

  const status = getConfigStatus();

  console.log(`D1 Configured: ${status.d1Configured ? chalk.green('Yes') : chalk.red('No')}`);
  console.log(
    `Images Configured: ${status.imagesConfigured ? chalk.green('Yes') : chalk.red('No')}`
  );
  console.log(`Content Dir: ${status.contentDir}`);
  console.log(
    `Content Dir Exists: ${status.contentDirExists ? chalk.green('Yes') : chalk.red('No')}`
  );

  const configCheck = checkIngestionConfig();
  if (!configCheck.valid) {
    newLine();
    showWarning(`Missing: ${configCheck.missing.join(', ')}`);
  }

  newLine();
}

/**
 * Show table counts
 */
async function showTableCounts(): Promise<void> {
  const configCheck = checkIngestionConfig();
  if (!configCheck.valid) {
    showError(`Missing environment variables: ${configCheck.missing.join(', ')}`);
    return;
  }

  const config = getIngestionConfig();

  const spinner = startSpinner('Connecting to D1...');

  try {
    initD1({
      accountId: config.cloudflareAccountId,
      databaseId: config.cloudflareD1DatabaseId,
      token: config.cloudflareApiToken,
    });
    spinner.text = 'Fetching table counts...';

    const counts = await getTableCounts();

    succeedSpinner('Table counts retrieved');
    newLine();

    showSection('Table Counts');
    for (const [table, count] of Object.entries(counts)) {
      console.log(`  ${table}: ${chalk.cyan(count)}`);
    }

    newLine();
  } catch (err) {
    failSpinner(`Failed: ${err}`);
  }
}

/**
 * Test D1 and Images connections
 */
async function testConnections(): Promise<void> {
  const configCheck = checkIngestionConfig();
  if (!configCheck.valid) {
    showError(`Missing environment variables: ${configCheck.missing.join(', ')}`);
    return;
  }

  const config = getIngestionConfig();

  newLine();
  showSection('Testing Connections');

  // Test D1
  const _d1Spinner = startSpinner('Testing D1 connection...');
  try {
    initD1({
      accountId: config.cloudflareAccountId,
      databaseId: config.cloudflareD1DatabaseId,
      token: config.cloudflareApiToken,
    });
    const d1Ok = await testD1Connection();
    if (d1Ok) {
      succeedSpinner('D1 connection successful');
    } else {
      failSpinner('D1 connection failed');
    }
  } catch (err) {
    failSpinner(`D1 error: ${err}`);
  }

  // Test Cloudflare Images
  const _imagesSpinner = startSpinner('Testing Cloudflare Images connection...');
  try {
    initCloudflareImages({
      accountId: config.cloudflareAccountId,
      apiToken: config.cloudflareApiToken,
    });
    const imagesOk = await testImagesConnection();
    if (imagesOk) {
      succeedSpinner('Cloudflare Images connection successful');
    } else {
      failSpinner('Cloudflare Images connection failed');
    }
  } catch (err) {
    failSpinner(`Images error: ${err}`);
  }

  newLine();
}

/**
 * Clear all database tables
 */
async function clearDatabase(): Promise<void> {
  newLine();
  showSection(chalk.red('Clear All Database Tables'));
  console.log(chalk.yellow('WARNING: This will delete ALL data from the D1 database!'));
  newLine();

  const confirm1 = await confirm({
    message: 'Are you sure you want to clear all tables?',
    default: false,
  });

  if (!confirm1) {
    console.log(chalk.dim('Cancelled'));
    return;
  }

  const confirm2 = await confirm({
    message: 'This action cannot be undone. Proceed?',
    default: false,
  });

  if (!confirm2) {
    console.log(chalk.dim('Cancelled'));
    return;
  }

  const configCheck = checkIngestionConfig();
  if (!configCheck.valid) {
    showError(`Missing environment variables: ${configCheck.missing.join(', ')}`);
    return;
  }

  const config = getIngestionConfig();

  const _spinner = startSpinner('Clearing all tables...');

  try {
    initD1({
      accountId: config.cloudflareAccountId,
      databaseId: config.cloudflareD1DatabaseId,
      token: config.cloudflareApiToken,
    });
    await clearAllTables();
    succeedSpinner('All tables cleared');
  } catch (err) {
    failSpinner(`Failed: ${err}`);
  }

  newLine();
}
