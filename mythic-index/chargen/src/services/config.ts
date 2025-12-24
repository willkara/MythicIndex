/**
 * Configuration management for chargen CLI
 *
 * Now loads from YAML config files in chargen/config/.
 * Legacy JSON config is no longer used.
 */

import { mkdir } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import {
  initConfig as initYamlConfig,
  getLoadedConfig,
  type LoadedConfig,
} from '../config/index.js';
import type { ChargenConfig as _ChargenConfig, StylesConfig } from '../config/schemas.js';

// ============================================================================
// Legacy Types (maintained for backwards compatibility)
// ============================================================================

export interface Config {
  workspace: WorkspaceConfig;
  remote: RemoteConfig;
  imageGeneration: ImageGenerationConfig;
  artStyle: ArtStyleConfig;
  editor: EditorConfig;
  writing: WritingConfig;
  paths: PathConfig;
}

export interface WorkspaceConfig {
  id: string;
  name: string;
  slug: string;
}

export interface RemoteConfig {
  apiUrl: string;
  apiKey: string;
  autoSync: boolean;
  syncIntervalMinutes: number;
}

export interface ImageGenerationConfig {
  defaultProvider: 'openai' | 'google';
  providers: {
    openai?: {
      apiKey: string;
      model: string;
      defaultSize: string;
      defaultQuality: 'standard' | 'hd';
    };
    google?: {
      apiKey: string;
      model: string;
      defaultAspectRatio?: string;
      defaultImageSize?: string;
      defaultResponseMimeType?: string;
      defaultTemperature?: number;
      defaultTopP?: number;
      defaultTopK?: number;
      defaultCandidateCount?: number;
      defaultSeed?: number;
      safetySettings?: Array<{
        category: string;
        threshold: string;
        method?: string;
      }>;
    };
  };
}

export interface MasterStyleConfig {
  universalSuffix: string;
  scenarios: {
    character?: string;
    location?: string;
    exterior?: string;
    scene?: string;
  };
  artistReferences?: string[];
  useArtistReferences?: boolean;
}

export interface ArtStyleConfig {
  description: string;
  negativePrompts: string[];
  referenceImages: string[];
  masterStyle?: MasterStyleConfig;
}

export interface EditorConfig {
  command: string;
  markdownPreview: boolean;
}

export interface WritingConfig {
  defaultPov: 'first' | 'third-limited' | 'third-omniscient';
  chapterWordTarget: number;
  sceneSeparator: string;
}

export interface PathConfig {
  configDir: string;
  cacheDb: string;
  draftsDir: string;
  imagesDir: string;
}

// ============================================================================
// Path Configuration
// ============================================================================

const CONFIG_DIR = join(homedir(), '.mythicindex');

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

// ============================================================================
// YAML to Legacy Config Adapter
// ============================================================================

/**
 * Convert YAML config to legacy Config interface for backwards compatibility
 */
function yamlToLegacyConfig(yaml: LoadedConfig): Config {
  const main = yaml.main;
  const styles = yaml.styles;

  return {
    workspace: {
      id: main.workspace.id,
      name: main.workspace.name,
      slug: main.workspace.slug,
    },
    remote: {
      apiUrl: main.remote.api_url,
      apiKey: main.remote.api_key,
      autoSync: main.remote.auto_sync,
      syncIntervalMinutes: main.remote.sync_interval_minutes,
    },
    imageGeneration: {
      defaultProvider: main.default_provider,
      providers: {
        google: main.providers.google
          ? {
              apiKey: main.providers.google.api_key,
              model: main.providers.google.models.single_generation,
              defaultAspectRatio: main.providers.google.defaults.aspect_ratio,
              defaultImageSize: main.providers.google.defaults.image_size,
              defaultResponseMimeType: main.providers.google.defaults.response_mime_type,
              defaultTemperature: main.providers.google.defaults.temperature,
              defaultTopP: main.providers.google.defaults.top_p,
              defaultTopK: main.providers.google.defaults.top_k,
              defaultCandidateCount: main.providers.google.defaults.candidate_count,
              defaultSeed: main.providers.google.defaults.seed,
              safetySettings: main.providers.google.safety_settings,
            }
          : undefined,
        openai: main.providers.openai
          ? {
              apiKey: main.providers.openai.api_key,
              model: main.providers.openai.models.single_generation,
              defaultSize: main.providers.openai.defaults.size,
              defaultQuality: main.providers.openai.defaults.quality,
            }
          : undefined,
      },
    },
    artStyle: buildArtStyleConfig(styles),
    editor: {
      command: main.editor.command,
      markdownPreview: main.editor.markdown_preview,
    },
    writing: {
      defaultPov: main.writing.default_pov as 'first' | 'third-limited' | 'third-omniscient',
      chapterWordTarget: main.writing.chapter_word_target,
      sceneSeparator: main.writing.scene_separator,
    },
    paths: getPaths(),
  };
}

/**
 * Build ArtStyleConfig from styles.yaml
 */
function buildArtStyleConfig(styles: StylesConfig): ArtStyleConfig {
  return {
    description: styles.master_style?.universal_suffix ?? '',
    negativePrompts: [], // Now handled separately via prompts.yaml negatives
    referenceImages: [],
    masterStyle: {
      universalSuffix: styles.master_style?.universal_suffix ?? '',
      scenarios: styles.master_style?.scenarios ?? {},
      artistReferences: styles.master_style?.artist_references ?? [],
      useArtistReferences: styles.master_style?.use_artist_references ?? false,
    },
  };
}

// ============================================================================
// Config Singleton
// ============================================================================

let configInstance: Config | null = null;

/**
 * Initialize configuration from YAML files.
 * Must be called before getConfig().
 */
export async function initConfig(): Promise<Config> {
  await ensureConfigDir();

  // Initialize YAML config loader
  initYamlConfig();

  // Convert to legacy format
  const yamlConfig = getLoadedConfig();
  configInstance = yamlToLegacyConfig(yamlConfig);

  return configInstance;
}

/**
 * Get the loaded configuration.
 * Throws if initConfig() hasn't been called.
 */
export function getConfig(): Config {
  if (!configInstance) {
    throw new Error('Config not initialized. Call initConfig() first.');
  }
  return configInstance;
}

/**
 * Update configuration.
 * Note: YAML config files are read-only at runtime.
 * This updates the in-memory config but does not persist changes.
 * To change config, edit the YAML files in chargen/config/ directly.
 */
export async function updateConfig(updates: Partial<Config>): Promise<Config> {
  if (!configInstance) {
    throw new Error('Config not initialized. Call initConfig() first.');
  }

  // Deep merge updates into current config (in-memory only)
  configInstance = deepMerge(configInstance, updates);

  console.warn(
    'Note: Config changes are in-memory only. Edit chargen/config/*.yaml to persist changes.'
  );

  return configInstance;
}

/**
 * Save configuration.
 * @deprecated YAML configs are read-only. Edit chargen/config/*.yaml directly.
 */
export async function saveConfig(_config: Config): Promise<void> {
  console.warn('saveConfig() is deprecated. Edit chargen/config/*.yaml to change configuration.');
}

// ============================================================================
// Utilities
// ============================================================================

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
      result[key] = deepMerge(targetValue as object, sourceValue as object) as T[keyof T];
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as T[keyof T];
    }
  }

  return result;
}

// ============================================================================
// Direct YAML Config Access
// ============================================================================

/**
 * Get the raw loaded YAML configuration.
 * Use this for direct access to prompts, styles, and models.
 */
export function getYamlConfig(): LoadedConfig {
  return getLoadedConfig();
}
