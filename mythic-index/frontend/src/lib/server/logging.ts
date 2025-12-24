/**
 * Creates a structured logger for route handlers with prefixed output.
 *
 * Provides a consistent logging interface for SvelteKit route handlers,
 * automatically prefixing all log messages with the route name for easier
 * debugging and monitoring. The debug level only outputs in development mode.
 *
 * @param routeName - The name of the route/handler (e.g., 'API:Content', 'Page:Characters')
 * @returns Logger object with info, warn, error, and debug methods
 *
 * @example
 * ```typescript
 * const log = createRouteLogger('API:Content');
 * log.info('Loading content items', { kind: 'chapter', count: 5 });
 * log.error('Failed to load content', error, { slug: 'chapter-1' });
 * ```
 */
export function createRouteLogger(routeName: string) {
  const prefix = `[${routeName}]`;

  return {
    /**
     * Logs an informational message.
     * @param message - The log message
     * @param data - Optional data to include with the message
     */
    info: (message: string, data?: unknown) => {
      console.log(`${prefix} ${message}`, data ?? '');
    },
    /**
     * Logs a warning message.
     * @param message - The warning message
     * @param data - Optional data to include with the warning
     */
    warn: (message: string, data?: unknown) => {
      console.warn(`${prefix} ${message}`, data ?? '');
    },
    /**
     * Logs an error message with error details and context.
     * @param message - The error message
     * @param error - Optional error object or details
     * @param context - Optional additional context about the error
     */
    error: (message: string, error?: unknown, context?: unknown) => {
      console.error(`${prefix} ${message}`, error ?? '', context ?? '');
    },
    /**
     * Logs a debug message (development mode only).
     * @param message - The debug message
     * @param data - Optional data to include with the message
     */
    debug: (message: string, data?: unknown) => {
      if (import.meta.env.DEV) {
        console.debug(`${prefix} ${message}`, data ?? '');
      }
    },
  };
}
