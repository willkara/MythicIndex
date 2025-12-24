<script lang="ts">
	import { parseInlineMarkdown } from '$lib/utils/inline-markdown';

	interface Props {
		text: string;
	}

	let { text }: Props = $props();
	const html = $derived(parseInlineMarkdown(text));
</script>

<blockquote class="border-l-4 border-primary/50 pl-4 py-2 my-4 bg-muted/30 rounded-r italic">
	<p class="leading-relaxed">{@html html}</p>
</blockquote>
