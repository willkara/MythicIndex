<script lang="ts">
	import { X, Clapperboard, ChevronRight, Film } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';

	interface Scene {
		id: string;
		slug: string;
		title: string | null;
		sequenceOrder: number;
		synopsis: string | null;
	}

	interface Props {
		scenes: Scene[];
		currentSceneId?: string | null;
		onSceneSelect: (sceneId: string) => void;
		isOpen?: boolean;
		onToggle?: () => void;
	}

	let { scenes, currentSceneId = null, onSceneSelect, isOpen = $bindable(false), onToggle }: Props = $props();

	function handleSceneClick(sceneId: string) {
		onSceneSelect(sceneId);
		// Close on mobile after selection
		if (window.innerWidth < 768) {
			isOpen = false;
		}
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			isOpen = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			isOpen = false;
		}
		// Toggle on Shift+S (unless typing)
		if (e.shiftKey && e.key === 'S') {
			const target = e.target as HTMLElement;
			if (['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable) return;

			e.preventDefault();
			isOpen = !isOpen;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Toggle Button -->
<Button
	onclick={() => isOpen = !isOpen}
	variant="secondary"
	size="sm"
	class="fixed bottom-20 right-6 rounded-full shadow-lg z-30 md:bottom-6"
	aria-label="Toggle scene navigation (Shift+S)"
	aria-expanded={isOpen}
	aria-controls="scene-nav-drawer"
	aria-keyshortcuts="Shift+S"
	title="Scenes (Shift+S)"
>
	<Clapperboard class="h-4 w-4" aria-hidden="true" />
	<span class="sr-only md:not-sr-only md:ml-2">Scenes</span>
	<kbd class="hidden md:inline-flex h-5 items-center gap-1 rounded border bg-muted/20 px-1.5 font-mono text-[10px] font-medium text-muted-foreground ml-2 select-none pointer-events-none">
		<span class="text-xs">⇧</span>S
	</kbd>
</Button>

<!-- Backdrop and Drawer -->
{#if isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-40 bg-black/50 md:bg-transparent md:pointer-events-none"
		onclick={handleBackdropClick}
	>
		<!-- Drawer -->
		<nav
			id="scene-nav-drawer"
			class="absolute inset-y-0 right-0 w-full max-w-sm bg-background shadow-xl md:w-72 md:pointer-events-auto
				transform transition-transform duration-200 ease-out
				flex flex-col"
			aria-label="Scene navigation"
		>
			<!-- Header -->
			<div class="flex items-center justify-between p-4 border-b">
				<h2 class="text-lg font-semibold">Scenes</h2>
				<Button
					onclick={() => isOpen = false}
					variant="ghost"
					size="icon"
					class="h-8 w-8"
					aria-label="Close scene navigation"
				>
					<X class="h-4 w-4" />
				</Button>
			</div>

			<!-- Scene List -->
			<div class="flex-1 overflow-y-auto p-2">
				{#if scenes.length === 0}
					<div class="flex flex-col items-center justify-center h-full p-4 text-center text-muted-foreground">
						<Film class="h-8 w-8 mb-2 opacity-20" aria-hidden="true" />
						<p class="text-sm">No scenes in this chapter</p>
					</div>
				{:else}
					<ul class="space-y-1">
						{#each scenes as scene, index}
							{@const isCurrent = currentSceneId === scene.id}
							<li>
								<button
									onclick={() => handleSceneClick(scene.id)}
									class="w-full text-left p-3 rounded-lg transition-colors
										hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
										{isCurrent ? 'bg-primary/10 border-l-2 border-primary' : ''}"
									aria-current={isCurrent ? 'location' : undefined}
								>
									<div class="flex items-start gap-3">
										<span class="flex-shrink-0 w-6 h-6 rounded-full bg-muted text-xs font-medium flex items-center justify-center
											{isCurrent ? 'bg-primary text-primary-foreground' : ''}">
											{index + 1}
										</span>
										<div class="flex-1 min-w-0">
											<p class="font-medium text-sm truncate {isCurrent ? 'text-primary' : ''}">
												{scene.title || `Scene ${index + 1}`}
											</p>
											{#if scene.synopsis}
												<p class="text-xs text-muted-foreground line-clamp-2 mt-1">
													{scene.synopsis}
												</p>
											{/if}
										</div>
										{#if isCurrent}
											<ChevronRight class="h-4 w-4 text-primary flex-shrink-0" />
										{/if}
									</div>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<!-- Footer hint -->
			<div class="p-4 border-t text-xs text-muted-foreground text-center">
				Pro tip: Press <kbd class="font-mono bg-muted px-1 rounded">⇧S</kbd> to toggle
			</div>
		</nav>
	</div>
{/if}
