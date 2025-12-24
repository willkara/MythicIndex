<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { BookOpen, Users, MapPin, Search, ArrowRight, Command, CornerDownLeft } from 'lucide-svelte';

	interface SearchItem {
		id: string;
		title: string;
		slug: string;
		kind: 'chapter' | 'character' | 'location';
		summary?: string | null;
	}

	interface Props {
		items: SearchItem[];
	}

	let { items }: Props = $props();

	let isOpen = $state(false);
	let query = $state('');
	let selectedIndex = $state(0);
	let inputEl = $state<HTMLInputElement | null>(null);

	// Filter and categorize results
	const results = $derived.by(() => {
		if (!query.trim()) {
			// Show recent/popular items when no query
			return items.slice(0, 8);
		}
		const q = query.toLowerCase();
		return items
			.filter(item =>
				item.title.toLowerCase().includes(q) ||
				(item.summary && item.summary.toLowerCase().includes(q))
			)
			.slice(0, 10);
	});

	// Reset selection when results change
	$effect(() => {
		results; // dependency
		selectedIndex = 0;
	});

	const icons = {
		chapter: BookOpen,
		character: Users,
		location: MapPin
	};

	const routes = {
		chapter: 'chapters',
		character: 'characters',
		location: 'locations'
	};

	function open() {
		isOpen = true;
		query = '';
		selectedIndex = 0;
		// Focus input after modal renders
		requestAnimationFrame(() => {
			inputEl?.focus();
		});
	}

	function close() {
		isOpen = false;
		query = '';
	}

	function navigateTo(item: SearchItem) {
		close();
		goto(`/${routes[item.kind]}/${item.slug}`);
	}

	function handleKeydown(event: KeyboardEvent) {
		// Global shortcut: Cmd+K / Ctrl+K
		if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
			event.preventDefault();
			if (isOpen) {
				close();
			} else {
				open();
			}
			return;
		}

		// Only handle these when palette is open
		if (!isOpen) return;

		switch (event.key) {
			case 'Escape':
				event.preventDefault();
				close();
				break;
			case 'ArrowDown':
				event.preventDefault();
				selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
				break;
			case 'ArrowUp':
				event.preventDefault();
				selectedIndex = Math.max(selectedIndex - 1, 0);
				break;
			case 'Enter':
				event.preventDefault();
				if (results[selectedIndex]) {
					navigateTo(results[selectedIndex]);
				}
				break;
		}
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			close();
		}
	}

	// Platform detection for keyboard hint
	let isMac = $state(false);
	onMount(() => {
		isMac = navigator.platform.toUpperCase().includes('MAC');
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Trigger button (can be placed in navbar) -->
<button
	onclick={open}
	class="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground bg-muted/50 hover:bg-muted rounded-lg border transition-colors"
	aria-label="Open command palette"
>
	<Search class="h-4 w-4" />
	<span class="hidden sm:inline">Quick search...</span>
	<kbd class="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-mono bg-background rounded border">
		{#if isMac}
			<Command class="h-3 w-3" />
		{:else}
			<span>Ctrl</span>
		{/if}
		<span>K</span>
	</kbd>
</button>

<!-- Modal -->
{#if isOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
		onclick={handleBackdropClick}
		onkeydown={(e) => e.key === 'Escape' && close()}
	>
		<div class="fixed left-1/2 top-[20%] -translate-x-1/2 w-full max-w-lg">
			<div class="mx-4 bg-background rounded-xl shadow-2xl border overflow-hidden">
				<!-- Search input -->
				<div class="flex items-center gap-3 px-4 py-3 border-b">
					<Search class="h-5 w-5 text-muted-foreground shrink-0" />
					<input
						bind:this={inputEl}
						bind:value={query}
						type="text"
						placeholder="Search chapters, characters, locations..."
						class="flex-1 bg-transparent text-lg outline-none placeholder:text-muted-foreground"
						aria-label="Search"
					/>
					<kbd class="hidden sm:inline-flex items-center px-2 py-1 text-xs font-mono text-muted-foreground bg-muted rounded">
						ESC
					</kbd>
				</div>

				<!-- Results -->
				<div class="max-h-80 overflow-y-auto">
					{#if results.length === 0}
						<div class="px-4 py-8 text-center text-muted-foreground">
							<Search class="h-8 w-8 mx-auto mb-2 opacity-50" />
							<p class="text-sm">No results found for "{query}"</p>
						</div>
					{:else}
						<ul class="py-2" role="listbox">
							{#each results as item, i}
								{@const Icon = icons[item.kind]}
								{@const isSelected = i === selectedIndex}
								<li role="option" aria-selected={isSelected}>
									<button
										onclick={() => navigateTo(item)}
										onmouseenter={() => selectedIndex = i}
										class="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors
											{isSelected ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/50 text-muted-foreground'}"
									>
										<div class="p-1.5 rounded-md bg-muted shrink-0">
											<Icon class="h-4 w-4 {isSelected ? 'text-primary' : ''}" />
										</div>
										<div class="flex-1 min-w-0">
											<p class="font-medium truncate {isSelected ? 'text-foreground' : ''}">
												{item.title}
											</p>
											<p class="text-xs text-muted-foreground capitalize">
												{item.kind}
											</p>
										</div>
										{#if isSelected}
											<div class="flex items-center gap-1 text-xs text-muted-foreground">
												<span>Go</span>
												<CornerDownLeft class="h-3 w-3" />
											</div>
										{/if}
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>

				<!-- Footer hints -->
				<div class="flex items-center justify-between px-4 py-2 border-t bg-muted/30 text-xs text-muted-foreground">
					<div class="flex items-center gap-3">
						<span class="inline-flex items-center gap-1">
							<kbd class="px-1.5 py-0.5 bg-background rounded border">↑</kbd>
							<kbd class="px-1.5 py-0.5 bg-background rounded border">↓</kbd>
							<span>Navigate</span>
						</span>
						<span class="inline-flex items-center gap-1">
							<kbd class="px-1.5 py-0.5 bg-background rounded border">↵</kbd>
							<span>Open</span>
						</span>
					</div>
					<span class="inline-flex items-center gap-1">
						<kbd class="px-1.5 py-0.5 bg-background rounded border">ESC</kbd>
						<span>Close</span>
					</span>
				</div>
			</div>
		</div>
	</div>
{/if}
