/**
 * Settings menu for chargen CLI
 */

import { select, input, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { getConfig, updateConfig } from '../services/config.js';
import { showSection, showKeyValue, showSuccess, showInfo, newLine } from '../ui/display.js';
import type { ImageProvider } from '../services/images/index.js';

type SettingsChoice = 'default-provider' | 'google-key' | 'openai-key' | 'view' | 'back';

/**
 * Run the settings menu
 */
export async function runSettingsMenu(): Promise<void> {
  let keepGoing = true;

  while (keepGoing) {
    showSection('Settings');

    const config = getConfig();

    const choice = await select<SettingsChoice>({
      message: 'Settings',
      choices: [
        {
          name: `Default Provider: ${chalk.cyan(config.imageGeneration.defaultProvider)}`,
          value: 'default-provider',
          description: 'Change the default image generation provider',
        },
        {
          name: 'Configure Google API Key',
          value: 'google-key',
          description: config.imageGeneration.providers.google?.apiKey
            ? chalk.green('Configured')
            : chalk.red('Not configured'),
        },
        {
          name: 'Configure OpenAI API Key',
          value: 'openai-key',
          description: config.imageGeneration.providers.openai?.apiKey
            ? chalk.green('Configured')
            : chalk.red('Not configured'),
        },
        {
          name: 'View Current Configuration',
          value: 'view',
        },
        {
          name: chalk.dim('Back'),
          value: 'back',
        },
      ],
    });

    switch (choice) {
      case 'default-provider':
        await changeDefaultProvider();
        break;

      case 'google-key':
        await configureApiKey('google');
        break;

      case 'openai-key':
        await configureApiKey('openai');
        break;

      case 'view':
        viewConfiguration();
        break;

      case 'back':
        keepGoing = false;
        break;
    }
  }
}

/**
 * Change the default provider
 */
async function changeDefaultProvider(): Promise<void> {
  const config = getConfig();

  const provider = await select<ImageProvider>({
    message: 'Select default provider:',
    choices: [
      {
        name: 'Google (Gemini)',
        value: 'google',
        description: 'Better character consistency, multimodal',
      },
      {
        name: 'OpenAI (DALL-E)',
        value: 'openai',
        description: 'High quality general images',
      },
    ],
    default: config.imageGeneration.defaultProvider,
  });

  await updateConfig({
    imageGeneration: {
      ...config.imageGeneration,
      defaultProvider: provider,
    },
  });

  showSuccess(`Default provider set to: ${provider}`);
  newLine();
}

/**
 * Configure an API key
 */
async function configureApiKey(provider: 'google' | 'openai'): Promise<void> {
  const config = getConfig();
  const providerName = provider === 'google' ? 'Google' : 'OpenAI';
  const envVar = provider === 'google' ? 'GOOGLE_API_KEY' : 'OPENAI_API_KEY';

  showInfo(`You can also set the ${envVar} environment variable instead.`);
  newLine();

  const currentKey =
    provider === 'google'
      ? config.imageGeneration.providers.google?.apiKey
      : config.imageGeneration.providers.openai?.apiKey;

  if (currentKey) {
    const masked = currentKey.slice(0, 8) + '...' + currentKey.slice(-4);
    showInfo(`Current key: ${masked}`);

    const shouldChange = await confirm({
      message: 'Change the API key?',
      default: false,
    });

    if (!shouldChange) return;
  }

  const newKey = await input({
    message: `Enter ${providerName} API key:`,
    validate: (value) => {
      if (!value.trim()) return 'API key is required';
      if (value.length < 10) return 'API key seems too short';
      return true;
    },
  });

  if (provider === 'google') {
    await updateConfig({
      imageGeneration: {
        ...config.imageGeneration,
        providers: {
          ...config.imageGeneration.providers,
          google: {
            ...config.imageGeneration.providers.google!,
            apiKey: newKey.trim(),
          },
        },
      },
    });
  } else {
    await updateConfig({
      imageGeneration: {
        ...config.imageGeneration,
        providers: {
          ...config.imageGeneration.providers,
          openai: {
            ...config.imageGeneration.providers.openai!,
            apiKey: newKey.trim(),
          },
        },
      },
    });
  }

  showSuccess(`${providerName} API key saved`);
  newLine();
}

/**
 * View current configuration
 */
function viewConfiguration(): void {
  const config = getConfig();

  showSection('Current Configuration');

  showKeyValue('Config location', config.paths.configDir);
  newLine();

  console.log(chalk.bold('Image Generation:'));
  showKeyValue('Default provider', config.imageGeneration.defaultProvider);
  newLine();

  console.log(chalk.bold('Google:'));
  const googleConfig = config.imageGeneration.providers.google;
  if (googleConfig) {
    showKeyValue('Model', googleConfig.model || 'not set');
    showKeyValue('API Key', googleConfig.apiKey ? chalk.green('configured') : chalk.red('not set'));
    showKeyValue('Aspect Ratio', googleConfig.defaultAspectRatio || 'default');
    showKeyValue('Image Size', googleConfig.defaultImageSize || 'default');
  } else {
    showInfo('Not configured');
  }
  newLine();

  console.log(chalk.bold('OpenAI:'));
  const openaiConfig = config.imageGeneration.providers.openai;
  if (openaiConfig) {
    showKeyValue('Model', openaiConfig.model || 'not set');
    showKeyValue('API Key', openaiConfig.apiKey ? chalk.green('configured') : chalk.red('not set'));
    showKeyValue('Size', openaiConfig.defaultSize || 'default');
    showKeyValue('Quality', openaiConfig.defaultQuality || 'default');
  } else {
    showInfo('Not configured');
  }
  newLine();

  console.log(chalk.bold('Art Style:'));
  showKeyValue('Description', config.artStyle.description);
  if (config.artStyle.negativePrompts.length > 0) {
    console.log(
      chalk.dim('  Negative prompts:'),
      config.artStyle.negativePrompts.slice(0, 5).join(', ') + '...'
    );
  }
  newLine();
}
