<script lang="ts">
	/**
	 * Narrative content layout (narrative group)
	 *
	 * This layout wraps reading-focused content:
	 * - /chapters - Story chapters with scene navigation
	 * - /canon - Content index and browsing
	 *
	 * Shared functionality for narrative consumption:
	 * - Reading progress tracking
	 * - Scene navigation
	 * - Full-width prose rendering
	 */
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	interface Props {
		data: LayoutData;
		children: Snippet;
	}

	let { data, children }: Props = $props();
</script>

<!-- Narrative content wrapper -->
<div class="narrative-content">
	{@render children()}
</div>

<style>
	.narrative-content {
		/* Reading-optimized container */
		min-height: 100vh;
	}
</style>
