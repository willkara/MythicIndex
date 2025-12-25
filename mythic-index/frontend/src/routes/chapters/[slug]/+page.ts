/**
 * Page configuration for chapter detail pages
 *
 * Enables automatic prerendering for static content generation.
 * Chapters are mostly static content, so prerendering improves:
 * - Initial page load performance
 * - SEO (fully rendered HTML)
 * - Reduced server load on Cloudflare Workers
 */
export const prerender = 'auto';

/**
 * Enable SSR for dynamic data (e.g., user-specific features in future)
 * This can be set to false if pages are fully static
 */
export const ssr = true;

/**
 * Enable client-side hydration for interactive features
 * (lightbox, reading progress, etc.)
 */
export const csr = true;
