<script lang="ts">
	/**
	 * Entity profiles layout (entities group)
	 *
	 * This layout wraps entity profile pages:
	 * - /characters - Character profiles with relationships
	 * - /locations - Location descriptions with maps
	 *
	 * Shared functionality for entity profiles:
	 * - Metadata displays
	 * - Image galleries
	 * - Relationship networks
	 * - Quick facts sidebars
	 */
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	interface Props {
		data: LayoutData;
		children: Snippet;
	}

	let { data, children }: Props = $props();
</script>

<!-- Entity profile wrapper -->
<div class="entity-profile-content">
	{@render children()}
</div>

<style>
	.entity-profile-content {
		/* Profile-optimized layout */
		min-height: 100vh;
	}
</style>
