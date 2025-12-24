/**
 * Vite configuration for SvelteKit.
 *
 * Minimal Vite configuration that:
 * - Integrates the SvelteKit plugin for SSR and routing
 * - Inherits default Vite settings for development and build
 *
 * Additional configuration (aliases, optimizations, etc.) can be
 * added as needed. See https://vitejs.dev/config/ for options.
 */
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()]
});
