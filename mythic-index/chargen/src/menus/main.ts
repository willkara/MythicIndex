/**
 * Main menu for chargen CLI
 */

import { select } from '@inquirer/prompts';
import chalk from 'chalk';
import { showProviderStatus, newLine, showInfo } from '../ui/display.js';
import { getConfig } from '../services/config.js';
import { getImageService } from '../services/images/index.js';
import { runCharacterMenu } from './character-select.js';
import { runLocationMenu } from './location-select.js';
import { runChapterMenu } from './chapter-select.js';
import { runSettingsMenu } from './settings.js';
import { runIngestionMenu } from './ingestion/index.js';
import {
  runBatchGenerationWorkflow,
  runScaffoldAnalyzeWorkflow,
  runAnalysisWorkflow,
  runDiscoveryWorkflow,
  runResumeWorkflow,
  runHistoryBrowser,
  runDLQManager,
} from './batch/index.js';

type MainMenuChoice =
  | 'generate'
  | 'location'
  | 'chapter'
  | 'batch'
  | 'ingestion'
  | 'settings'
  | 'exit';

/**
 * Show provider status before main menu
 */
function showStatus(): void {
  const config = getConfig();
  const imageService = getImageService();

  showInfo('Checking configuration...');
  newLine();

  const googleConfig = config.imageGeneration.providers.google;
  const openaiConfig = config.imageGeneration.providers.openai;

  showProviderStatus('Google', imageService.isProviderAvailable('google'), googleConfig?.model);
  showProviderStatus('OpenAI', imageService.isProviderAvailable('openai'), openaiConfig?.model);

  newLine();

  const defaultProvider = config.imageGeneration.defaultProvider;
  console.log(chalk.dim(`Default provider: ${defaultProvider}`));
  newLine();
}

/**
 * Run the main menu loop
 */
export async function runMainMenu(): Promise<void> {
  showStatus();

  let running = true;

  while (running) {
    const choice = await select<MainMenuChoice>({
      message: 'What would you like to do?',
      choices: [
        {
          name: 'Generate Images for Character',
          value: 'generate',
          description: 'Select a character and generate images',
        },
        {
          name: 'Generate Images for Location',
          value: 'location',
          description: 'Select a location and generate environment images',
        },
        {
          name: 'Generate Images for Chapter',
          value: 'chapter',
          description: 'Select a chapter and generate scene images',
        },
        {
          name: 'Batch Operations',
          value: 'batch',
          description: 'Generate images for multiple characters',
        },
        {
          name: 'Content Ingestion',
          value: 'ingestion',
          description: 'Ingest content and imagery to Cloudflare D1/Images',
        },
        {
          name: 'Settings',
          value: 'settings',
          description: 'Configure providers and preferences',
        },
        {
          name: chalk.dim('Exit'),
          value: 'exit',
        },
      ],
    });

    switch (choice) {
      case 'generate':
        await runCharacterMenu();
        break;

      case 'location':
        await runLocationMenu();
        break;

      case 'chapter':
        await runChapterMenu();
        break;

      case 'batch':
        await runBatchMenu();
        break;

      case 'ingestion':
        await runIngestionMenu();
        break;

      case 'settings':
        await runSettingsMenu();
        break;

      case 'exit':
        running = false;
        console.log(chalk.dim('\nGoodbye!\n'));
        break;
    }
  }
}

/**
 * Batch operations menu - flat structure with clear categories
 */
type BatchMenuChoice =
  | 'generate'
  | 'scaffold-analyze'
  | 'analyze'
  | 'discover'
  | 'resume'
  | 'history'
  | 'dlq'
  | 'back';

async function runBatchMenu(): Promise<void> {
  const choice = await select<BatchMenuChoice>({
    message: 'Batch Operations',
    choices: [
      // ── Image Generation ──
      {
        name: 'Generate Images (Characters/Locations/Chapters)',
        value: 'generate',
        description: 'Batch image generation via Google Batch API (50% cost savings)',
      },
      // ── Analysis & Scaffolding ──
      {
        name: 'Scaffold & Analyze Character Imagery',
        value: 'scaffold-analyze',
        description: 'Multimodal appearance extraction + full image analysis',
      },
      {
        name: 'Analyze Existing Character Images',
        value: 'analyze',
        description: 'Generate enhanced metadata for existing images',
      },
      {
        name: 'Discover & Catalog Images',
        value: 'discover',
        description: 'Match existing images to scenes with AI analysis',
      },
      // ── Run Management ──
      {
        name: 'Resume Interrupted Run',
        value: 'resume',
        description: 'Continue a previously started batch run',
      },
      {
        name: 'View Batch History',
        value: 'history',
        description: 'Browse previous batch runs and reports',
      },
      {
        name: 'Manage Failed Tasks (DLQ)',
        value: 'dlq',
        description: 'View and retry failed tasks from dead letter queue',
      },
      {
        name: chalk.dim('Back'),
        value: 'back',
      },
    ],
  });

  switch (choice) {
    case 'generate':
      await runBatchGenerationWorkflow();
      break;
    case 'scaffold-analyze':
      await runScaffoldAnalyzeWorkflow();
      break;
    case 'analyze':
      await runAnalysisWorkflow();
      break;
    case 'discover':
      await runDiscoveryWorkflow();
      break;
    case 'resume':
      await runResumeWorkflow();
      break;
    case 'history':
      await runHistoryBrowser();
      break;
    case 'dlq':
      await runDLQManager();
      break;
    case 'back':
      // Return to main menu
      break;
  }
}
