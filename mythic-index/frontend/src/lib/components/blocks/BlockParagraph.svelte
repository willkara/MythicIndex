<script lang="ts">
	import { parseInlineMarkdown } from '$lib/utils/inline-markdown';

	interface Props {
		text: string;
	}

	let { text }: Props = $props();
	const html = $derived(parseInlineMarkdown(text));
</script>

<p class="leading-relaxed">{@html html}</p>
