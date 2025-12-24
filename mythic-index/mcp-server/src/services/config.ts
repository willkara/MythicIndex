/**
 * Configuration management for Mythic Index MCP Server
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { Config, PathConfig } from '../types/config.js';
import { DEFAULT_CONFIG } from '../types/config.js';

const CONFIG_DIR = join(homedir(), '.mythicindex');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export function getPaths(): PathConfig {
  return {
    configDir: CONFIG_DIR,
    cacheDb: join(CONFIG_DIR, 'cache.db'),
    draftsDir: join(CONFIG_DIR, 'drafts'),
    imagesDir: join(CONFIG_DIR, 'images'),
  };
}

export async function ensureConfigDir(): Promise<void> {
  const paths = getPaths();
  await mkdir(paths.configDir, { recursive: true });
  await mkdir(paths.draftsDir, { recursive: true });
  await mkdir(paths.imagesDir, { recursive: true });
}

/**
 * Load API key from environment variable with priority fallback
 */
function getApiKeyFromEnv(envVar: string, configValue?: string): string {
  const envValue = process.env[envVar];
  return envValue || configValue || '';
}

export async function loadConfig(): Promise<Config> {
  await ensureConfigDir();
  const paths = getPaths();

  if (!existsSync(CONFIG_FILE)) {
    // Create default config
    const defaultConfig: Config = {
      workspace: {
        id: 'default',
        name: 'My Story',
        slug: 'my-story',
      },
      remote: DEFAULT_CONFIG.remote!,
      imageGeneration: DEFAULT_CONFIG.imageGeneration!,
      artStyle: DEFAULT_CONFIG.artStyle!,
      editor: DEFAULT_CONFIG.editor!,
      writing: DEFAULT_CONFIG.writing!,
      paths,
    };

    await saveConfig(defaultConfig);
    return enrichConfigWithEnv(defaultConfig);
  }

  const raw = await readFile(CONFIG_FILE, 'utf-8');
  const config = JSON.parse(raw) as Config;

  // Ensure paths are always current
  config.paths = paths;

  // Enrich with environment variables
  return enrichConfigWithEnv(config);
}

/**
 * Enrich configuration with environment variables, prioritizing env vars over config file
 */
function enrichConfigWithEnv(config: Config): Config {
  const enriched = JSON.parse(JSON.stringify(config)) as Config;

  // Load Google API key (supports GOOGLE_API_KEY, MYTHICINDEX_GOOGLE_API_KEY)
  if (enriched.imageGeneration.providers.google) {
    enriched.imageGeneration.providers.google.apiKey = getApiKeyFromEnv(
      'MYTHICINDEX_GOOGLE_API_KEY',
      getApiKeyFromEnv('GOOGLE_API_KEY', enriched.imageGeneration.providers.google.apiKey)
    );
  }

  // Load OpenAI API key (supports OPENAI_API_KEY, MYTHICINDEX_OPENAI_API_KEY)
  if (enriched.imageGeneration.providers.openai) {
    enriched.imageGeneration.providers.openai.apiKey = getApiKeyFromEnv(
      'MYTHICINDEX_OPENAI_API_KEY',
      getApiKeyFromEnv('OPENAI_API_KEY', enriched.imageGeneration.providers.openai.apiKey)
    );
  }

  // Load Remote API key (supports MYTHICINDEX_API_KEY)
  enriched.remote.apiKey = getApiKeyFromEnv('MYTHICINDEX_API_KEY', enriched.remote.apiKey);

  return enriched;
}

export async function saveConfig(config: Config): Promise<void> {
  await ensureConfigDir();
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export async function updateConfig(updates: Partial<Config>): Promise<Config> {
  const current = await loadConfig();
  const updated = deepMerge(current, updates);
  await saveConfig(updated);
  return updated;
}

function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (
      sourceValue !== undefined &&
      typeof sourceValue === 'object' &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === 'object' &&
      targetValue !== null
    ) {
      (result as any)[key] = deepMerge(targetValue as object, sourceValue as object);
    } else if (sourceValue !== undefined) {
      (result as any)[key] = sourceValue;
    }
  }

  return result;
}

// Singleton for config
let configInstance: Config | null = null;

export async function initConfig(): Promise<Config> {
  configInstance = await loadConfig();
  return configInstance;
}

export function getConfig(): Config {
  if (!configInstance) {
    throw new Error('Config not initialized. Call initConfig() first.');
  }
  return configInstance;
}
