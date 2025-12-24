/**
 * Configuration Error Classes
 *
 * Custom errors for configuration loading and validation failures.
 */

import type { ZodError } from 'zod';

/**
 * Base configuration error
 *
 * @param message - Error message describing the configuration issue
 */
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/**
 * Error thrown when a required config file is missing
 *
 * @param filePath - Path to the missing configuration file
 */
export class ConfigFileMissingError extends ConfigurationError {
  constructor(public readonly filePath: string) {
    super(`Required configuration file missing: ${filePath}`);
    this.name = 'ConfigFileMissingError';
  }
}

/**
 * Error thrown when config validation fails
 *
 * @param filePath - Path to the invalid configuration file
 * @param zodError - Zod validation error containing detailed issue information
 */
export class ConfigValidationError extends ConfigurationError {
  constructor(
    public readonly filePath: string,
    public readonly zodError: ZodError
  ) {
    const issues = zodError.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    super(`Invalid configuration in ${filePath}:\n${issues}`);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Error thrown when config is accessed before initialization
 */
export class ConfigNotInitializedError extends ConfigurationError {
  constructor() {
    super('Configuration not initialized. Call initConfig() first.');
    this.name = 'ConfigNotInitializedError';
  }
}
