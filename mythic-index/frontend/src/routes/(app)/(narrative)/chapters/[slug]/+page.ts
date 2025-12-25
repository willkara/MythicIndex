/**
 * Page configuration for chapter detail pages
 *
 * Prerendering is disabled because chapters require database access.
 * SSR provides similar benefits:
 * - Fast initial page load via Cloudflare Workers (edge rendering)
 * - SEO-friendly fully rendered HTML
 * - Dynamic content updates without rebuild
 */
export const prerender = false;

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
