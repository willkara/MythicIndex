/**
 * Configuration Module
 *
 * Main entry point for configuration access.
 * Provides initialization, getters, and template rendering.
 */

import { loadAllConfigs, configFilesExist as _configFilesExist, type LoadedConfig } from './loader.js';
import { renderTemplate, type TemplateVariables } from './template.js';
import { ConfigNotInitializedError } from './errors.js';
import type {
  ChargenConfig,
  PromptsConfig,
  StylesConfig,
  MasterStyle,
  ScenarioDefault,
} from './schemas.js';

// Re-export types and utilities
export * from './schemas.js';
export * from './errors.js';
export * from './template.js';
export { loadAllConfigs, configFilesExist as _configFilesExist, getConfigDir, type LoadedConfig } from './loader.js';

// Re-export art direction accessors
export {
  getMoodStyle,
  getAvailableMoods,
  getAestheticPhilosophy,
  getMediumSimulation,
  getNorthStar,
  getLightingPrinciples,
  getColorPrinciples,
  getSignatureColors,
  getCompositionPrinciples,
  getNegativePromptBase,
  getFantasyGrounding,
  getPromptTemplateStructure,
  getAspectRatio as getArtDirectionAspectRatio,
  getOpenAISizeForAspectRatio,
  buildMoodStyleSuffix,
  artDirectionExists,
  resetArtDirection,
  type MoodStyle,
  type MediumSimulation,
  type LightingPrinciples,
  type ColorPrinciples,
  type CompositionPrinciples,
} from './art-direction.js';

// ============================================================================
// Singleton Config Instance
// ============================================================================

let configInstance: LoadedConfig | null = null;

/**
 * Initialize the configuration system.
 * Must be called before accessing config values.
 *
 * @returns The loaded configuration object
 * @throws ConfigFileMissingError if required files don't exist
 * @throws ConfigValidationError if config is invalid
 */
export function initConfig(): LoadedConfig {
  configInstance = loadAllConfigs();
  return configInstance;
}

/**
 * Get the loaded configuration.
 *
 * @returns The loaded configuration object
 * @throws ConfigNotInitializedError if initConfig() hasn't been called
 */
export function getLoadedConfig(): LoadedConfig {
  if (!configInstance) {
    throw new ConfigNotInitializedError();
  }
  return configInstance;
}

/**
 * Check if config is initialized
 *
 * @returns True if config has been initialized, false otherwise
 */
export function isConfigInitialized(): boolean {
  return configInstance !== null;
}

/**
 * Reset config (mainly for testing)
 */
export function resetConfig(): void {
  configInstance = null;
}

// ============================================================================
// Config Accessors
// ============================================================================

/**
 * Get the main chargen configuration
 *
 * @returns The main configuration object
 * @throws ConfigNotInitializedError if initConfig() hasn't been called
 */
export function getMainConfig(): ChargenConfig {
  return getLoadedConfig().main;
}

/**
 * Get the prompts configuration
 *
 * @returns The prompts configuration object
 * @throws ConfigNotInitializedError if initConfig() hasn't been called
 */
export function getPromptsConfig(): PromptsConfig {
  return getLoadedConfig().prompts;
}

/**
 * Get the styles configuration
 *
 * @returns The styles configuration object
 * @throws ConfigNotInitializedError if initConfig() hasn't been called
 */
export function getStylesConfig(): StylesConfig {
  return getLoadedConfig().styles;
}

// ============================================================================
// Convenience Getters
// ============================================================================

/**
 * Valid model use case types
 */
export type ModelUseCase =
  | 'image_analysis'
  | 'batch_analysis'
  | 'batch_generation'
  | 'single_generation';

/**
 * Get the model for a specific use case
 *
 * @param useCase - The use case to get the model for
 * @returns The model name, or empty string if not configured
 * @throws ConfigNotInitializedError if initConfig() hasn't been called
 */
export function getModel(useCase: ModelUseCase): string {
  const config = getMainConfig();
  const provider = config.default_provider;

  if (provider === 'google' && config.providers?.google) {
    return config.providers.google.models[useCase] ?? '';
  }

  if (provider === 'openai' && config.providers?.openai) {
    if (useCase === 'single_generation') {
      return config.providers.openai.models.single_generation ?? '';
    }
    // OpenAI doesn't support other use cases, fall back to empty
    return '';
  }

  return '';
}

/**
 * Get the Google API key
 *
 * @returns The Google API key, or empty string if not configured
 * @throws ConfigNotInitializedError if initConfig() hasn't been called
 */
export function getGoogleApiKey(): string {
  return getMainConfig().providers?.google?.api_key ?? '';
}

/**
 * Get the OpenAI API key
 *
 * @returns The OpenAI API key, or empty string if not configured
 * @throws ConfigNotInitializedError if initConfig() hasn't been called
 */
export function getOpenAIApiKey(): string {
  return getMainConfig().providers?.openai?.api_key ?? '';
}

/**
 * Get batch configuration
 *
 * @returns The batch configuration object
 * @throws ConfigNotInitializedError if initConfig() hasn't been called
 */
export function getBatchConfig() {
  return getMainConfig().batch;
}

// ============================================================================
// Prompt Getters
// ============================================================================

/**
 * Valid prompt template keys
 */
export type PromptKey =
  | 'archivist_enhanced'
  | 'archivist_basic'
  | 'appearance_generator'
  | 'appearance_multimodal'
  | 'character_consistency'
  | 'location_consistency'
  | 'scene_consistency'
  | 'negative_default'
  | 'negative_character';

/**
 * Get a raw prompt template (without variable substitution)
 *
 * @param key - The prompt template key
 * @returns The prompt template string
 * @throws Error if the prompt key is unknown
 * @throws ConfigNotInitializedError if initConfig() hasn't been called
 */
export function getPromptTemplate(key: PromptKey): string {
  const prompts = getPromptsConfig();

  switch (key) {
    case 'archivist_enhanced':
      return prompts.analysis.archivist_enhanced;
    case 'archivist_basic':
      return prompts.analysis.archivist_basic;
    case 'appearance_generator':
      return prompts.analysis.appearance_generator;
    case 'appearance_multimodal':
      return prompts.analysis.appearance_multimodal;
    case 'character_consistency':
      return prompts.generation.character_consistency;
    case 'location_consistency':
      return prompts.generation.location_consistency;
    case 'scene_consistency':
      return prompts.generation.scene_consistency;
    case 'negative_default':
      return prompts.negatives.default;
    case 'negative_character':
      return prompts.negatives.character;
    default:
      throw new Error(`Unknown prompt key: ${key}`);
  }
}

/**
 * Get a prompt with variables substituted
 *
 * @param key - The prompt template key
 * @param variables - Variables to substitute in the template
 * @returns The prompt with variables substituted
 * @throws Error if the prompt key is unknown
 * @throws ConfigNotInitializedError if initConfig() hasn't been called
 */
export function getPrompt(key: PromptKey, variables: TemplateVariables = {}): string {
  const template = getPromptTemplate(key);
  return renderTemplate(template, variables);
}

// ============================================================================
// Style Getters
// ============================================================================

/**
 * Get the master style configuration
 *
 * @returns The master style configuration object
 * @throws ConfigNotInitializedError if initConfig() hasn't been called
 */
export function getMasterStyle(): MasterStyle {
  return getStylesConfig().master_style;
}

/**
 * Get scenario defaults for a specific scenario type
 *
 * @param scenario - The scenario type name
 * @returns The scenario defaults, or undefined if not found
 * @throws ConfigNotInitializedError if initConfig() hasn't been called
 */
export function getScenarioDefaults(scenario: string): ScenarioDefault | undefined {
  return getStylesConfig().scenario_defaults[scenario];
}

/**
 * Get exterior keywords for location detection
 *
 * @returns Array of exterior location keywords
 * @throws ConfigNotInitializedError if initConfig() hasn't been called
 */
export function getExteriorKeywords(): string[] {
  return getStylesConfig().keywords.exterior;
}

/**
 * Get interior keywords for location detection
 *
 * @returns Array of interior location keywords
 * @throws ConfigNotInitializedError if initConfig() hasn't been called
 */
export function getInteriorKeywords(): string[] {
  return getStylesConfig().keywords.interior;
}

/**
 * Get the rate limiting delay in milliseconds
 *
 * @returns Delay in milliseconds between requests
 * @throws ConfigNotInitializedError if initConfig() hasn't been called
 */
export function getRateLimitDelay(): number {
  return getStylesConfig().rate_limiting.delay_ms;
}

/**
 * Get the maximum prompt length
 *
 * @returns Maximum allowed prompt length in characters
 * @throws ConfigNotInitializedError if initConfig() hasn't been called
 */
export function getMaxPromptLength(): number {
  return getStylesConfig().global_defaults.max_prompt_length;
}
