#!/usr/bin/env npx tsx
/**
 * Test script for generate_character_variation tool
 */

import { join } from 'path';

// Initialize services
import { initConfig } from './src/services/config.js';
import { initLogger } from './src/services/logger.js';
import { initStorage } from './src/services/storage.js';
import { initImageService } from './src/services/images.js';
import { generateCharacterVariation } from './src/tools/images.js';

async function main() {
  console.log('Initializing services...');

  // Initialize config
  const workspaceDir = process.env.MEMORYQUILL_WORKSPACE_DIR || join(process.cwd(), '../MemoryQuill');
  initConfig({
    workspace: {
      id: process.env.MEMORYQUILL_WORKSPACE_ID || 'default',
      name: process.env.MEMORYQUILL_WORKSPACE_NAME || 'Default Workspace',
      baseDir: workspaceDir,
    },
    paths: {
      charactersDir: join(workspaceDir, 'story-content/characters'),
      chaptersDir: join(workspaceDir, 'story-content/chapters'),
      locationsDir: join(workspaceDir, 'story-content/locations'),
      outputDir: join(workspaceDir, 'output'),
    },
    cloudflare: {
      d1DatabaseName: process.env.CLOUDFLARE_D1_DATABASE_NAME,
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
    },
    imageGeneration: {
      defaultProvider: 'google',
      defaultModel: 'imagen-3',
    },
  });

  // Initialize logger
  initLogger({ level: 'debug' });

  // Initialize storage
  const cacheDb = '/home/willkara/.mythicindex/cache.db';
  await initStorage(cacheDb);

  // Initialize image service
  initImageService();

  console.log('Testing generate_character_variation for Aldwin...\n');

  try {
    const result = await generateCharacterVariation({
      character: 'aldwin-gentleheart',
      scenario: 'sitting by a campfire at night, cooking stew in his trusty pan, with a warm glow illuminating his face',
    });

    console.log('\n✅ Success!');
    console.log('Generated image path:', result.path);
    console.log('References used:', result.referencesUsed);
    console.log('Character:', result.character);
    if (result.fallbackMode) {
      console.log('Fallback mode:', result.fallbackMode);
    }
    console.log('\nPrompt used (first 300 chars):', result.prompt.substring(0, 300) + '...');
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
