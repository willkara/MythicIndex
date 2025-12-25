<script lang="ts">
	/**
	 * Public content area layout (app group)
	 *
	 * This layout wraps all public-facing content routes:
	 * - /chapters, /characters, /locations
	 * - /canon, /lore, /worldbuilding, /search
	 *
	 * Shared functionality for content consumption
	 */
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	interface Props {
		data: LayoutData;
		children: Snippet;
	}

	let { data, children }: Props = $props();
</script>

<!-- Public content wrapper -->
<div class="public-content-area">
	{@render children()}
</div>

<style>
	.public-content-area {
		/* Add any public-specific styling */
		min-height: 100vh;
	}
</style>
