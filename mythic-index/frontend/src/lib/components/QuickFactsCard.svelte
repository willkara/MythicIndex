<script lang="ts">
	interface Props {
		metadata: Record<string, unknown>;
		kind: 'character' | 'location';
	}

	let { metadata, kind }: Props = $props();

	// Keys to display based on content type
	const characterKeys = ['role', 'status', 'occupation', 'faction', 'affiliation', 'title', 'rank'];
	const locationKeys = ['type', 'region', 'atmosphere', 'inhabitants', 'significance'];

	const displayKeys = $derived(kind === 'character' ? characterKeys : locationKeys);

	// Format a value for display
	function formatValue(value: unknown): string {
		if (Array.isArray(value)) {
			return value.join(', ');
		}
		if (typeof value === 'object' && value !== null) {
			// Handle nested objects like appearance
			return Object.entries(value)
				.map(([k, v]) => `${k}: ${v}`)
				.join('; ');
		}
		return String(value);
	}

	// Format key for display (capitalize, add spaces)
	function formatKey(key: string): string {
		return key
			.replace(/([A-Z])/g, ' $1')
			.replace(/^./, str => str.toUpperCase())
			.trim();
	}

	// Get filtered entries that have values and are in our display list
	const displayEntries = $derived(
		Object.entries(metadata)
			.filter(([key, value]) => {
				// Must be in our display list
				if (!displayKeys.includes(key)) return false;
				// Must have a value
				if (value === null || value === undefined || value === '') return false;
				if (Array.isArray(value) && value.length === 0) return false;
				return true;
			})
			.sort((a, b) => displayKeys.indexOf(a[0]) - displayKeys.indexOf(b[0]))
	);

	const hasContent = $derived(displayEntries.length > 0);
</script>

{#if hasContent}
	<aside class="bg-card/50 border rounded-xl p-4 space-y-3 mt-4">
		<h3 class="font-semibold text-sm text-foreground/80 uppercase tracking-wide">Quick Facts</h3>
		<dl class="space-y-2">
			{#each displayEntries as [key, value]}
				<div class="flex flex-col gap-0.5">
					<dt class="text-xs text-muted-foreground uppercase tracking-wide">{formatKey(key)}</dt>
					<dd class="text-sm font-medium">{formatValue(value)}</dd>
				</div>
			{/each}
		</dl>
	</aside>
{/if}
