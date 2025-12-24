/**
 * Production environment configuration.
 *
 * Provides the configuration values used when running the application
 * in production mode. Includes production API endpoints, optimized
 * logging settings, and cloud-based image storage configuration.
 *
 * Note: Despite the comment about Angular, this is used in a SvelteKit
 * application. The configuration pattern is similar across frameworks.
 */
export const environment = {
  production: true,
  apiUrl: 'https://api.mythicindex.com',
  imagery: {
    storage: 'local' as const,
    baseUrl: '/assets/images',
    s3: {
      bucketBaseUrl: '',
      cdnBaseUrl: '',
    },
    placeholderPath: '/assets/images/reader/reader-placeholder.png',
  },
  logging: {
    level: 'WARN',
    serverLoggingUrl: null,
    disableConsoleLogging: false,
    enableSourceMaps: false,
  },
};
