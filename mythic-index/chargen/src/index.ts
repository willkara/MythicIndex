#!/usr/bin/env tsx
/**
 * chargen - Interactive character image generator for MythicIndex
 *
 * Usage: chargen
 *
 * This CLI provides interactive menus for:
 * - Generating character portraits and variations
 * - Creating images from image_ideas.yaml files
 * - Managing image generation settings
 */

import { initConfig } from './services/config.js';
import { initImageService } from './services/images/index.js';
import { initEntityCache } from './services/entity-cache.js';
import { initAssetRegistry } from './services/asset-registry.js';
import { runMainMenu } from './menus/main.js';
import { showHeader, showError } from './ui/display.js';
import { withSpinner } from './ui/spinner.js';
import { ConfigFileMissingError, ConfigValidationError } from './config/errors.js';
import chalk from 'chalk';

/**
 * Main entry point for the chargen CLI.
 * Initializes configuration and services, then starts the main menu.
 *
 * @returns A promise that resolves when the CLI exits.
 */
async function main(): Promise<void> {
  try {
    // Show header immediately
    showHeader();

    // Initialize configuration
    await initConfig();

    // Initialize entity cache with progress feedback
    await withSpinner(
      'Scanning story content...',
      () => initEntityCache(),
      (cache) =>
        `Found ${cache.characters.length} characters, ` +
        `${cache.locations.length} locations, ` +
        `${cache.chapters.length} chapters`
    );

    // Initialize asset registry for reference resolution
    await initAssetRegistry();

    // Initialize image service
    initImageService();

    // Run the main menu loop
    await runMainMenu();
  } catch (error) {
    if ((error as Error).name === 'ExitPromptError') {
      // User pressed Ctrl+C - exit gracefully
      console.log(chalk.dim('\n\nGoodbye!\n'));
      process.exit(0);
    }

    // Handle configuration errors with helpful messages
    if (error instanceof ConfigFileMissingError) {
      showError('Configuration file missing');
      console.error(chalk.red(`\n  ${error.message}`));
      console.error(chalk.dim('\n  Ensure all config files exist in chargen/config/:'));
      console.error(chalk.dim('    - chargen.yaml'));
      console.error(chalk.dim('    - prompts.yaml'));
      console.error(chalk.dim('    - styles.yaml\n'));
      process.exit(1);
    }

    if (error instanceof ConfigValidationError) {
      showError('Configuration validation failed');
      console.error(chalk.red(`\n  ${error.message}`));
      console.error(chalk.dim('\n  Please fix the errors above and try again.\n'));
      process.exit(1);
    }

    showError(`Fatal error: ${(error as Error).message}`);
    console.error(error);
    process.exit(1);
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log(chalk.dim('\n\nGoodbye!\n'));
  process.exit(0);
});

main();
