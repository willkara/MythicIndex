/**
 * Development environment configuration.
 *
 * Provides the configuration values used when running the application
 * locally in development mode. Includes API endpoints, image storage
 * settings, and logging configuration optimized for development.
 *
 * Note: Despite the comment about Angular, this is used in a SvelteKit
 * application. The configuration pattern is similar across frameworks.
 */
export const environment = {
  production: false,
  apiUrl: 'http://localhost:8000', // Base API URL - services will add /api/v1 prefix
  wsUrl: 'ws://localhost:8000/ws/writer', // WebSocket endpoint for real-time features
  imagery: {
    // Where images are served from in dev. For production you can switch to 's3' and set cdnBaseUrl.
    storage: 'local', // 'local' | 's3'
    baseUrl: '/assets/images',
    s3: {
      bucketBaseUrl: '',
      cdnBaseUrl: '',
    },
    // Common placeholder used until real imagery is generated
    placeholderPath: '/assets/images/reader/reader-placeholder.png',
  },
  logging: {
    level: 'DEBUG',
    serverLoggingUrl: null,
    disableConsoleLogging: false,
    enableSourceMaps: true,
  },
};
