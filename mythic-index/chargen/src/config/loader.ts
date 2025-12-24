/**
 * YAML Configuration Loader
 *
 * Loads and validates YAML configuration files with environment variable overrides.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';
import type { ZodType, ZodError } from 'zod';
import {
  ChargenConfigSchema,
  PromptsConfigSchema,
  StylesConfigSchema,
  type ChargenConfig,
  type PromptsConfig,
  type StylesConfig,
} from './schemas.js';
import { ConfigFileMissingError, ConfigValidationError } from './errors.js';

// Get the config directory path (chargen/config/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONFIG_DIR = join(__dirname, '..', '..', 'config');

/**
 * All loaded configuration files combined
 */
export interface LoadedConfig {
  /** Main chargen configuration */
  main: ChargenConfig;
  /** Prompt templates configuration */
  prompts: PromptsConfig;
  /** Style and visual configuration */
  styles: StylesConfig;
}

/**
 * Load and validate a YAML config file
 *
 * @param path - Path to the YAML configuration file
 * @param schema - Zod schema for validation
 * @returns Parsed and validated configuration object
 * @throws ConfigFileMissingError if the file doesn't exist
 * @throws ConfigValidationError if the file fails validation
 */
function loadYamlFile<T>(path: string, schema: ZodType<T>): T {
  if (!existsSync(path)) {
    throw new ConfigFileMissingError(path);
  }

  const content = readFileSync(path, 'utf-8');
  const parsed = parseYaml(content);
  const result = schema.safeParse(parsed);

  if (!result.success) {
    throw new ConfigValidationError(path, result.error as ZodError);
  }

  return result.data;
}

/**
 * Get environment variable value or fallback
 *
 * @param name - Environment variable name
 * @param fallback - Default value if variable is not set
 * @returns Environment variable value or fallback
 */
function getEnvVar(name: string, fallback: string = ''): string {
  return process.env[name] ?? fallback;
}

/**
 * Apply environment variable overrides for sensitive values
 * Allows API keys and other secrets to be set via environment variables
 * instead of storing them in config files.
 *
 * @param config - Base configuration loaded from YAML files
 * @returns Configuration with environment variable overrides applied
 */
function applyEnvOverrides(config: LoadedConfig): LoadedConfig {
  // Deep clone to avoid mutating original
  const enriched = JSON.parse(JSON.stringify(config)) as LoadedConfig;

  // Google API key overrides
  if (enriched.main.providers?.google) {
    const googleKey =
      getEnvVar('MYTHICINDEX_GOOGLE_API_KEY') ||
      getEnvVar('GOOGLE_API_KEY') ||
      enriched.main.providers.google.api_key;
    enriched.main.providers.google.api_key = googleKey;
  }

  // OpenAI API key overrides
  if (enriched.main.providers?.openai) {
    const openaiKey =
      getEnvVar('MYTHICINDEX_OPENAI_API_KEY') ||
      getEnvVar('OPENAI_API_KEY') ||
      enriched.main.providers.openai.api_key;
    enriched.main.providers.openai.api_key = openaiKey;
  }

  // Remote API key override
  const remoteKey = getEnvVar('MYTHICINDEX_API_KEY') || enriched.main.remote.api_key;
  enriched.main.remote.api_key = remoteKey;

  return enriched;
}

/**
 * Load all configuration files from the config directory
 * Loads chargen.yaml, prompts.yaml, and styles.yaml, validates them,
 * and applies environment variable overrides.
 *
 * @returns Complete loaded configuration
 * @throws ConfigFileMissingError if any required file is missing
 * @throws ConfigValidationError if any file fails validation
 */
export function loadAllConfigs(): LoadedConfig {
  const mainPath = join(CONFIG_DIR, 'chargen.yaml');
  const promptsPath = join(CONFIG_DIR, 'prompts.yaml');
  const stylesPath = join(CONFIG_DIR, 'styles.yaml');

  // Load and validate each config file
  // Type assertions are safe because Zod applies defaults during parsing
  const config: LoadedConfig = {
    main: loadYamlFile(mainPath, ChargenConfigSchema) as ChargenConfig,
    prompts: loadYamlFile(promptsPath, PromptsConfigSchema) as PromptsConfig,
    styles: loadYamlFile(stylesPath, StylesConfigSchema) as StylesConfig,
  };

  return applyEnvOverrides(config);
}

/**
 * Get the config directory path
 *
 * @returns Absolute path to the config directory
 */
export function getConfigDir(): string {
  return CONFIG_DIR;
}

/**
 * Check if all required config files exist
 *
 * @returns Object with exists flag and array of missing filenames
 */
export function configFilesExist(): { exists: boolean; missing: string[] } {
  const requiredFiles = ['chargen.yaml', 'prompts.yaml', 'styles.yaml'];
  const missing: string[] = [];

  for (const file of requiredFiles) {
    const path = join(CONFIG_DIR, file);
    if (!existsSync(path)) {
      missing.push(file);
    }
  }

  return {
    exists: missing.length === 0,
    missing,
  };
}
