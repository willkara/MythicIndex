<script lang="ts">
	/**
	 * Admin/Writer area layout (admin group)
	 *
	 * This layout wraps all writer/admin routes:
	 * - /writer/* (content editing, chapter management)
	 * - /upload (content ingestion)
	 *
	 * Shared functionality for content creation/editing
	 */
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	interface Props {
		data: LayoutData;
		children: Snippet;
	}

	let { data, children }: Props = $props();

	// Future: Add auth checks, writer-specific navigation, etc.
</script>

<!-- Writer/Admin area wrapper -->
<div class="admin-content-area">
	<!-- Optional: Add writer-specific header/nav -->
	<div class="admin-content">
		{@render children()}
	</div>
</div>

<style>
	.admin-content-area {
		/* Writer-specific styling */
		min-height: 100vh;
		background: var(--background);
	}

	.admin-content {
		/* Add spacing/constraints for writer UI */
	}
</style>
