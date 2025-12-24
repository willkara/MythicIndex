<script lang="ts">
	import { parseInlineMarkdown } from '$lib/utils/inline-markdown';

	interface Props {
		text: string;
		level?: number;
		id?: string;
	}

	let { text, level = 2, id }: Props = $props();
	const html = $derived(parseInlineMarkdown(text));
</script>

{#if level === 1}
	<h1 {id} class="text-3xl font-bold tracking-tight mt-8 mb-4 scroll-mt-16">{@html html}</h1>
{:else if level === 2}
	<h2 {id} class="text-2xl font-semibold tracking-tight mt-6 mb-3 scroll-mt-16">{@html html}</h2>
{:else if level === 3}
	<h3 {id} class="text-xl font-semibold mt-5 mb-2 scroll-mt-16">{@html html}</h3>
{:else if level === 4}
	<h4 {id} class="text-lg font-medium mt-4 mb-2 scroll-mt-16">{@html html}</h4>
{:else if level === 5}
	<h5 {id} class="text-base font-medium mt-3 mb-1 scroll-mt-16">{@html html}</h5>
{:else}
	<h6 {id} class="text-sm font-medium mt-2 mb-1 scroll-mt-16">{@html html}</h6>
{/if}
