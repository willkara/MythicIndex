<script lang="ts">
	import { X, ChevronRight } from 'lucide-svelte';
	import { cn } from '$lib/utils/cn';

	export interface TOCItem {
		id: string;
		text: string;
		level: number;
	}

	interface Props {
		/** Table of contents items extracted from headings */
		items: TOCItem[];
		/** Whether the drawer is open */
		isOpen: boolean;
		/** Currently active section id */
		activeId?: string | null;
		/** Callback when drawer should close */
		onclose: () => void;
		/** Callback when an item is clicked */
		onNavigate?: (id: string) => void;
	}

	let { items, isOpen, activeId, onclose, onNavigate }: Props = $props();

	function handleItemClick(id: string) {
		if (onNavigate) {
			onNavigate(id);
		}
		// Update URL hash without triggering scroll (scroll is handled by onNavigate)
		history.replaceState(null, '', `#${id}`);
		// Close drawer on mobile after navigation
		if (window.innerWidth < 768) {
			onclose();
		}
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			onclose();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onclose();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<!-- Backdrop (mobile only) -->
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-40 bg-black/50 md:hidden"
		onclick={handleBackdropClick}
		aria-hidden="true"
	></div>

	<!-- Desktop: Slide-in panel from left -->
	<!-- Mobile: Bottom sheet drawer -->
	<nav
		class={cn(
			'fixed z-50 bg-background border shadow-lg transition-transform duration-200 ease-out',
			// Desktop styles
			'md:top-12 md:left-0 md:bottom-0 md:w-72 md:border-r md:border-t-0 md:rounded-none',
			// Mobile styles
			'inset-x-0 bottom-0 max-h-[60vh] rounded-t-2xl border-t md:max-h-none'
		)}
		aria-label="Table of contents"
	>
		<!-- Header -->
		<div class="flex items-center justify-between p-4 border-b">
			<h2 class="font-semibold text-sm">Contents</h2>
			<button
				onclick={onclose}
				class="p-1.5 rounded-md hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
				aria-label="Close table of contents"
			>
				<X class="h-4 w-4" />
			</button>
		</div>

		<!-- TOC Items -->
		<div class="overflow-y-auto max-h-[calc(60vh-56px)] md:max-h-[calc(100vh-112px)] p-2">
			{#if items.length === 0}
				<p class="text-sm text-muted-foreground p-3">No headings found</p>
			{:else}
				<ul class="space-y-0.5">
					{#each items as item}
						<li>
							<button
								onclick={() => handleItemClick(item.id)}
								class={cn(
									'w-full text-left px-3 py-2 text-sm rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
									'hover:bg-accent hover:text-accent-foreground',
									item.level === 3 && 'pl-6',
									item.level >= 4 && 'pl-9',
									activeId === item.id
										? 'bg-primary/10 text-primary font-medium'
										: 'text-muted-foreground'
								)}
							>
								<span class="flex items-center gap-2">
									{#if item.level > 2}
										<ChevronRight class="h-3 w-3 shrink-0 opacity-50" />
									{/if}
									<span class="line-clamp-2">{item.text}</span>
								</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</nav>
{/if}
