/**
 * Image discovery workflow
 *
 * Discovers and catalogs existing character images,
 * matching them to scenes with AI-powered analysis.
 */

import { select, confirm, input } from '@inquirer/prompts';
import {
  showSection,
  showInfo,
  showSuccess,
  showError,
  newLine,
} from '../../ui/display.js';
import {
  discoverAndAnalyzeCharacterImages,
  type DiscoveryOptions,
} from '../../tools/discover-character-images.js';
import { getApiKey } from './helpers.js';

/**
 * Discovery workflow for existing character images
 */
export async function runDiscoveryWorkflow(): Promise<void> {
  showSection('Image Discovery & Cataloging');
  showInfo('Match images to scenes and analyze with Gemini Vision');
  newLine();

  // Check API key
  const apiKey = getApiKey();
  if (!apiKey) {
    showError('Google API key not configured. Please set it in settings first.');
    newLine();
    return;
  }

  // Step 1: Select scope
  const scopeChoice = await select<'all' | 'specific'>({
    message: 'Discover images for:',
    choices: [
      {
        name: 'All Characters',
        value: 'all',
        description: 'Scan all character image directories',
      },
      {
        name: 'Specific Characters',
        value: 'specific',
        description: 'Filter by character slug',
      },
    ],
  });

  let slugFilter: string[] | undefined;
  if (scopeChoice === 'specific') {
    const slugInput = await input({
      message: 'Enter character slug(s) (comma-separated):',
    });
    slugFilter = slugInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // Step 2: Re-analyze option
  const reAnalyze = await confirm({
    message: 'Re-analyze already catalogued images?',
    default: false,
  });

  // Step 3: Dry run first
  const dryRun = await confirm({
    message: 'Preview without updating files (dry run)?',
    default: true,
  });

  // Step 4: Worker count
  const workersInput = await input({
    message: 'Number of parallel workers:',
    default: '10',
  });

  const maxWorkers = parseInt(workersInput, 10);

  if (isNaN(maxWorkers) || maxWorkers < 1 || maxWorkers > 50) {
    showError('Invalid worker count. Must be between 1 and 50.');
    newLine();
    return;
  }

  // Execute discovery
  const options: DiscoveryOptions = {
    slugFilter,
    reAnalyze,
    dryRun,
    maxWorkers,
  };

  try {
    await discoverAndAnalyzeCharacterImages(options);

    if (!dryRun) {
      newLine();
      showSuccess('Discovery and cataloging complete!');
    }
  } catch (error) {
    newLine();
    showError(`Discovery failed: ${(error as Error).message}`);
  }

  newLine();
  await input({ message: 'Press Enter to continue...' });
}
