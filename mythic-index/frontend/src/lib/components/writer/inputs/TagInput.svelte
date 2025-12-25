<script lang="ts">
	import { Button } from '$lib/components/ui';

	/**
	 * Tag input component for managing string arrays
	 */
	export let label: string;
	export let placeholder: string = 'Add item...';
	export let tags: string[] = $bindable([]);
	export let maxTags: number | undefined = undefined;

	let inputValue = $state('');

	function addTag() {
		const trimmed = inputValue.trim();
		if (!trimmed) return;
		if (maxTags && tags.length >= maxTags) return;
		if (tags.includes(trimmed)) return; // Prevent duplicates

		tags = [...tags, trimmed];
		inputValue = '';
	}

	function removeTag(index: number) {
		tags = tags.filter((_, i) => i !== index);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			addTag();
		}
	}
</script>

<div class="space-y-2">
	<label class="block text-sm font-medium">
		{label}
		{#if maxTags}
			<span class="text-gray-500 text-xs">({tags.length}/{maxTags})</span>
		{/if}
	</label>

	<!-- Input area -->
	<div class="flex gap-2">
		<input
			type="text"
			bind:value={inputValue}
			onkeydown={handleKeydown}
			{placeholder}
			disabled={maxTags ? tags.length >= maxTags : false}
			class="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-sm disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:cursor-not-allowed"
		/>
		<Button
			type="button"
			variant="outline"
			size="sm"
			onclick={addTag}
			disabled={!inputValue.trim() || (maxTags ? tags.length >= maxTags : false)}
		>
			Add
		</Button>
	</div>

	<!-- Tags display -->
	{#if tags.length > 0}
		<div class="flex flex-wrap gap-2 mt-2">
			{#each tags as tag, index}
				<span
					class="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded-full text-sm"
				>
					{tag}
					<button
						type="button"
						onclick={() => removeTag(index)}
						class="hover:text-blue-600 dark:hover:text-blue-400 ml-1"
						aria-label="Remove {tag}"
					>
						<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
							<path
								fill-rule="evenodd"
								d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
								clip-rule="evenodd"
							/>
						</svg>
					</button>
				</span>
			{/each}
		</div>
	{/if}
</div>
