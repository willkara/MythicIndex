<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		header?: Snippet;
		marginLeft?: Snippet;
		marginRight?: Snippet;
		children: Snippet;
	}

	let { header, marginLeft, marginRight, children }: Props = $props();
</script>

<div class="chapter-layout">
	<!-- Full-width header area (hero image, title, metadata) -->
	{#if header}
		<header class="chapter-header">
			{@render header()}
		</header>
	{/if}

	<!-- Three-column reading area -->
	<div class="chapter-body">
		<!-- Left margin: Scene images -->
		<aside class="margin-left" aria-label="Chapter images">
			{#if marginLeft}
				{@render marginLeft()}
			{/if}
		</aside>

		<!-- Center: Prose content -->
		<article class="prose-column">
			{@render children()}
		</article>

		<!-- Right margin: Navigation/context -->
		<aside class="margin-right" aria-label="Chapter navigation">
			{#if marginRight}
				{@render marginRight()}
			{/if}
		</aside>
	</div>
</div>

<style>
	.chapter-layout {
		--margin-width: 220px;
		--prose-max-width: 680px;
		--gap: 2.5rem;
		--toolbar-height: 3.5rem;
	}

	.chapter-header {
		max-width: calc(var(--prose-max-width) + 2 * var(--margin-width) + 2 * var(--gap));
		margin: 0 auto;
		padding: 0 1rem;
	}

	.chapter-body {
		display: grid;
		grid-template-columns:
			minmax(0, var(--margin-width))
			minmax(0, var(--prose-max-width))
			minmax(0, var(--margin-width));
		gap: var(--gap);
		max-width: calc(var(--prose-max-width) + 2 * var(--margin-width) + 2 * var(--gap));
		margin: 0 auto;
		padding: 0 1rem 4rem;
	}

	.margin-left,
	.margin-right {
		position: relative;
		min-width: 0;
	}

	.margin-left :global(> *) {
		position: sticky;
		top: calc(var(--toolbar-height) + 1.5rem);
	}

	.margin-right :global(> *) {
		position: sticky;
		top: calc(var(--toolbar-height) + 1.5rem);
	}

	.prose-column {
		min-width: 0;
	}

	/* Tablet: Two columns (left margin + prose) */
	@media (max-width: 1200px) {
		.chapter-body {
			grid-template-columns:
				minmax(0, 180px)
				minmax(0, 1fr);
			--gap: 2rem;
		}

		.margin-right {
			display: none;
		}
	}

	/* Mobile: Single column */
	@media (max-width: 768px) {
		.chapter-body {
			grid-template-columns: 1fr;
			gap: 0;
			padding: 0 1rem 2rem;
		}

		.margin-left {
			display: none;
		}

		.chapter-header {
			padding: 0;
		}
	}
</style>
