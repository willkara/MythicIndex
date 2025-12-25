<script lang="ts">
	import { Button } from '$lib/components/ui';

	/**
	 * Scene list component for managing scenes within a chapter
	 */
	export let scenes: any[] = [];
	export let chapterId: string;
	export let onAddScene: () => void = () => {};

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString();
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h3 class="text-lg font-semibold">Scenes in This Chapter</h3>
		<Button onclick={onAddScene}>+ Add Scene</Button>
	</div>

	{#if scenes.length === 0}
		<div
			class="bg-gray-50 dark:bg-gray-900 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-8 text-center"
		>
			<p class="text-gray-600 dark:text-gray-400 mb-4">No scenes yet</p>
			<p class="text-sm text-gray-500 dark:text-gray-500 mb-4">
				Scenes help organize your chapter into manageable narrative units
			</p>
			<Button onclick={onAddScene}>Create First Scene</Button>
		</div>
	{:else}
		<div class="space-y-3">
			{#each scenes as scene (scene.id)}
				<a
					href="/writer/scenes/{scene.id}"
					class="block p-4 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
				>
					<div class="flex items-start justify-between">
						<div class="flex-1">
							<div class="flex items-center gap-2 mb-1">
								<span
									class="text-xs font-medium px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded"
								>
									Scene {scene.sequenceOrder}
								</span>
								{#if scene.title}
									<h4 class="font-semibold text-gray-900 dark:text-gray-100">
										{scene.title}
									</h4>
								{:else}
									<h4 class="font-semibold text-gray-500 dark:text-gray-500 italic">
										Untitled Scene
									</h4>
								{/if}
							</div>

							{#if scene.synopsis}
								<p class="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-2">
									{scene.synopsis}
								</p>
							{/if}

							<div class="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-500">
								{#if scene.wordCount}
									<span>{scene.wordCount.toLocaleString()} words</span>
								{/if}
								<span>Updated {formatDate(scene.updatedAt)}</span>
							</div>
						</div>

						<svg
							class="w-5 h-5 text-gray-400 flex-shrink-0 mt-1"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M9 5l7 7-7 7"
							/>
						</svg>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>
