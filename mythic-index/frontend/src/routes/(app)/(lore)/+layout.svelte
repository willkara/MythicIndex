<script lang="ts">
	/**
	 * Lore & worldbuilding layout (lore group)
	 *
	 * This layout wraps worldbuilding documentation:
	 * - /lore - Lore articles and mythology
	 * - /worldbuilding - World systems and mechanics
	 *
	 * Shared functionality for lore content:
	 * - Documentation navigation
	 * - Cross-reference linking
	 * - Hierarchical content structure
	 * - Wiki-style presentation
	 */
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	interface Props {
		data: LayoutData;
		children: Snippet;
	}

	let { data, children }: Props = $props();
</script>

<!-- Lore & worldbuilding wrapper -->
<div class="lore-content">
	{@render children()}
</div>

<style>
	.lore-content {
		/* Documentation-optimized layout */
		min-height: 100vh;
	}
</style>
