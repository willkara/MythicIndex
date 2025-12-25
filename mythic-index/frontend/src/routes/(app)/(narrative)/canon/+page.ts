/**
 * Page configuration for canon content browser
 *
 * Prerendering disabled - requires database access.
 * SSR provides edge rendering via Cloudflare Workers.
 */
export const prerender = false;
export const ssr = true;
export const csr = true;
