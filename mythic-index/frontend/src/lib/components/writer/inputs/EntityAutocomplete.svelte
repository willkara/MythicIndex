<script lang="ts">
	/**
	 * Autocomplete input for selecting entities (characters, locations, chapters)
	 * TODO: Implement actual search/fetch from API
	 */
	interface Props {
		label: string;
		entityType: 'character' | 'location' | 'chapter';
		value?: string;
		placeholder?: string;
		required?: boolean;
	}

	let {
		label,
		entityType,
		value = $bindable(''),
		placeholder = `Select ${entityType}...`,
		required = false
	}: Props = $props();

	// Mock data - will be replaced with actual API calls
	let entities = $state<Array<{ id: string; slug: string; name: string }>>([]);
	let isOpen = $state(false);
	let searchQuery = $state('');
	let selectedEntity = $state<{ id: string; slug: string; name: string } | null>(null);

	// Filter entities based on search query
	let filteredEntities = $derived(
		entities.filter((e) =>
			e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			e.slug.toLowerCase().includes(searchQuery.toLowerCase())
		)
	);

	function selectEntity(entity: { id: string; slug: string; name: string }) {
		selectedEntity = entity;
		value = entity.id;
		searchQuery = entity.name;
		isOpen = false;
	}

	function clearSelection() {
		selectedEntity = null;
		value = '';
		searchQuery = '';
	}

	function handleFocus() {
		isOpen = true;
		// TODO: Fetch entities from API
	}

	function handleBlur() {
		// Delay to allow click on dropdown items
		setTimeout(() => {
			isOpen = false;
		}, 200);
	}
</script>

<div class="space-y-2">
	<label class="block text-sm font-medium">
		{label}
		{#if required}
			<span class="text-red-500">*</span>
		{/if}
	</label>

	<div class="relative">
		<input
			type="text"
			bind:value={searchQuery}
			onfocus={handleFocus}
			onblur={handleBlur}
			{placeholder}
			{required}
			class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-sm pr-8"
		/>

		{#if selectedEntity}
			<button
				type="button"
				onclick={clearSelection}
				class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
				aria-label="Clear selection"
			>
				<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
					<path
						fill-rule="evenodd"
						d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
						clip-rule="evenodd"
					/>
				</svg>
			</button>
		{/if}

		<!-- Dropdown -->
		{#if isOpen && filteredEntities.length > 0}
			<div
				class="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md shadow-lg max-h-60 overflow-auto"
			>
				{#each filteredEntities as entity}
					<button
						type="button"
						onclick={() => selectEntity(entity)}
						class="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 text-sm"
					>
						<div class="font-medium">{entity.name}</div>
						<div class="text-xs text-gray-500 dark:text-gray-400">{entity.slug}</div>
					</button>
				{/each}
			</div>
		{:else if isOpen && searchQuery && filteredEntities.length === 0}
			<div
				class="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md shadow-lg px-3 py-2 text-sm text-gray-500 dark:text-gray-400"
			>
				No {entityType}s found matching "{searchQuery}"
			</div>
		{/if}
	</div>

	{#if selectedEntity}
		<input type="hidden" name="{label.toLowerCase().replace(/\s+/g, '_')}_id" value={selectedEntity.id} />
	{/if}
</div>
