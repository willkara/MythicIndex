/**
 * Provider selection menu
 */

import { select } from '@inquirer/prompts';
import chalk from 'chalk';
import { getConfig } from '../services/config.js';
import { getImageService, type ImageProvider } from '../services/images/index.js';
import { showWarning, newLine } from '../ui/display.js';

/**
 * Run the provider selection menu
 * Returns the selected provider or null if cancelled
 */
export async function runProviderSelect(): Promise<ImageProvider | null> {
  const config = getConfig();
  const imageService = getImageService();
  const availableProviders = imageService.getAvailableProviders();

  if (availableProviders.length === 0) {
    showWarning('No image providers configured. Add API keys in settings.');
    newLine();
    return null;
  }

  // If only one provider, use it automatically
  if (availableProviders.length === 1) {
    return availableProviders[0];
  }

  const defaultProvider = config.imageGeneration.defaultProvider;
  const googleConfig = config.imageGeneration.providers.google;
  const openaiConfig = config.imageGeneration.providers.openai;

  const choices: Array<{ name: string; value: ImageProvider | 'cancel'; description?: string }> =
    [];

  if (imageService.isProviderAvailable('google')) {
    const isDefault = defaultProvider === 'google';
    choices.push({
      name: `Google ${chalk.dim(`(${googleConfig?.model || 'gemini'})`)}${isDefault ? chalk.green(' (Recommended)') : ''}`,
      value: 'google',
      description: 'Supports character consistency with reference images',
    });
  }

  if (imageService.isProviderAvailable('openai')) {
    const isDefault = defaultProvider === 'openai';
    choices.push({
      name: `OpenAI ${chalk.dim(`(${openaiConfig?.model || 'dall-e'})`)}${isDefault ? chalk.green(' (Recommended)') : ''}`,
      value: 'openai',
      description: 'High quality image generation',
    });
  }

  choices.push({
    name: chalk.dim('Cancel'),
    value: 'cancel',
  });

  const selection = await select({
    message: 'Which provider?',
    choices,
  });

  if (selection === 'cancel') {
    return null;
  }

  return selection as ImageProvider;
}
