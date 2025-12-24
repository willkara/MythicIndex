<script lang="ts">
	import { onMount } from 'svelte';
	import { marked } from 'marked';
	import DOMPurify from 'isomorphic-dompurify';
	import { sanitizeMarkdown, isEmptyOrTBD } from '$lib/utils/markdown-sanitizer';

	interface Props {
		content: string;
		class?: string;
	}

	let { content, class: className }: Props = $props();
	let html = $state<string>('');

	onMount(() => {
		if (content) {
			// Skip rendering if content is empty or just TBD
			if (isEmptyOrTBD(content)) {
				html = '';
				return;
			}

			const sanitized = sanitizeMarkdown(content);
			// Parse markdown to HTML (which might include unsafe tags)
			const rawHtml = marked(sanitized) as string;
			// Sanitize the HTML to prevent XSS
			html = DOMPurify.sanitize(rawHtml);
		}
	});
</script>

{#if html}
	<div class={className}>
		{@html html}
	</div>
{:else if content}
	<!-- Loading state while marked() processes -->
	<div class={className}>
		<div class="animate-pulse space-y-2">
			<div class="h-4 bg-muted rounded w-full"></div>
			<div class="h-4 bg-muted rounded w-5/6"></div>
		</div>
	</div>
{/if}
