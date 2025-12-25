<script lang="ts">
	/**
	 * Collapsible form section component for organizing complex forms
	 */
	interface Props {
		title: string;
		defaultOpen?: boolean;
		icon?: string;
	}

	let { title, defaultOpen = true, icon = '' }: Props = $props();

	let isOpen = $state(defaultOpen);

	function toggle() {
		isOpen = !isOpen;
	}
</script>

<div class="border border-gray-200 dark:border-gray-700 rounded-lg mb-4 bg-white dark:bg-gray-800">
	<button
		type="button"
		onclick={toggle}
		class="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors rounded-t-lg"
	>
		<div class="flex items-center gap-2">
			{#if icon}
				<span class="text-lg">{icon}</span>
			{/if}
			<h3 class="text-lg font-semibold">{title}</h3>
		</div>
		<svg
			class="w-5 h-5 transition-transform {isOpen ? 'rotate-180' : ''}"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
		>
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
		</svg>
	</button>

	{#if isOpen}
		<div class="px-4 py-4 space-y-4 border-t border-gray-200 dark:border-gray-700">
			<slot />
		</div>
	{/if}
</div>
