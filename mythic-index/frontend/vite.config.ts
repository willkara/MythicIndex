/**
 * Vite configuration for SvelteKit with production optimizations.
 *
 * Optimizations include:
 * - Manual chunk splitting for better caching
 * - Dependency pre-bundling for faster dev server
 * - Minification and tree-shaking
 * - CSS code splitting
 * - Resource inlining for small assets
 */
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],

	build: {
		// Target modern browsers for smaller bundles
		target: 'es2020',

		// Minification settings
		minify: 'esbuild',
		cssMinify: true,

		// Enable CSS code splitting for better caching
		cssCodeSplit: true,

		// Inline assets smaller than 4kb as base64
		assetsInlineLimit: 4096,

		// Chunk size warnings (Cloudflare Workers has 1MB limit per script)
		chunkSizeWarningLimit: 500,

		rollupOptions: {
			output: {
				// Manual chunk splitting for better long-term caching
				manualChunks: (id) => {
					// Vendor chunks for stable dependencies
					if (id.includes('node_modules')) {
						// Large UI libraries
						if (id.includes('@tiptap') || id.includes('prosemirror')) {
							return 'vendor-editor';
						}
						if (id.includes('lucide-svelte')) {
							return 'vendor-icons';
						}
						if (id.includes('drizzle-orm')) {
							return 'vendor-db';
						}
						// Other vendor code
						return 'vendor';
					}

					// Split large application chunks
					if (id.includes('/routes/chapters/')) {
						return 'route-chapters';
					}
					if (id.includes('/routes/characters/')) {
						return 'route-characters';
					}
					if (id.includes('/routes/locations/')) {
						return 'route-locations';
					}
					if (id.includes('/routes/writer/')) {
						return 'route-writer';
					}
				},

				// Consistent chunk naming for better caching
				chunkFileNames: '_app/immutable/chunks/[name]-[hash].js',
				entryFileNames: '_app/immutable/entry/[name]-[hash].js',
				assetFileNames: '_app/immutable/assets/[name]-[hash][extname]'
			}
		}
	},

	optimizeDeps: {
		// Pre-bundle these dependencies for faster dev server startup
		include: [
			'@tiptap/core',
			'@tiptap/starter-kit',
			'lucide-svelte',
			'drizzle-orm'
		],

		// Exclude these from pre-bundling (SSR-only or problematic)
		exclude: []
	},

	ssr: {
		// Don't externalize these for SSR (keep in bundle)
		noExternal: ['lucide-svelte']
	}
});
