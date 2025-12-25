import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter({
			// Cloudflare Pages configuration
			routes: {
				include: ['/*'],
				exclude: ['<build>', '<files>', '<prerendered>']
			}
		}),

		// Inline critical CSS for faster first paint
		inlineStyleThreshold: 2048
	}
};

export default config;
