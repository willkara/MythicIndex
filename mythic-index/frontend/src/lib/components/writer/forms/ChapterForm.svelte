<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui';
	import { FormSection } from '../inputs';
	import type { ChapterCreate } from '$lib/server/writer/validation';

	/**
	 * Simplified chapter editor focusing on metadata
	 * Content ingestion happens via chargen CLI or markdown upload
	 * This editor is for chapter-level metadata and scene organization
	 */
	export let chapter: Partial<ChapterCreate> = {};
	export let mode: 'create' | 'edit' = 'create';
	export let action: string = '?/create';
	export let onCancel: () => void = () => {};

	// Form state
	let formData = $state({
		title: chapter.title || '',
		summary: chapter.summary || '',
		status: chapter.status || 'draft',
		wordCount: chapter.wordCount || 0
	});
</script>

<form method="POST" {action} use:enhance class="space-y-6">
	<!-- Chapter Metadata Section -->
	<FormSection title="Chapter Information" icon="📖" defaultOpen={true}>
		<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
			<div class="md:col-span-2">
				<label class="block text-sm font-medium mb-2">
					Title <span class="text-red-500">*</span>
				</label>
				<input
					type="text"
					name="title"
					bind:value={formData.title}
					required
					placeholder="Chapter title"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				/>
			</div>

			<div class="md:col-span-2">
				<label class="block text-sm font-medium mb-2">Summary</label>
				<textarea
					name="summary"
					bind:value={formData.summary}
					rows="3"
					placeholder="Brief chapter summary or synopsis"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				></textarea>
				<p class="text-xs text-gray-500 mt-1">
					High-level overview of what happens in this chapter
				</p>
			</div>

			<div>
				<label class="block text-sm font-medium mb-2">Status</label>
				<select
					name="status"
					bind:value={formData.status}
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				>
					<option value="draft">Draft</option>
					<option value="published">Published</option>
				</select>
			</div>

			<div>
				<label class="block text-sm font-medium mb-2">Word Count</label>
				<input
					type="number"
					name="wordCount"
					bind:value={formData.wordCount}
					min="0"
					placeholder="0"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				/>
				<p class="text-xs text-gray-500 mt-1">Optional - auto-calculated from content</p>
			</div>
		</div>
	</FormSection>

	<!-- Information Section -->
	<div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
		<h3 class="font-medium text-blue-900 dark:text-blue-100 mb-2">💡 Content Management</h3>
		<p class="text-sm text-blue-800 dark:text-blue-200 mb-2">
			This editor focuses on chapter-level metadata. For full content ingestion:
		</p>
		<ul class="text-sm text-blue-800 dark:text-blue-200 space-y-1 ml-4 list-disc">
			<li>Use the <strong>Chargen CLI</strong> to ingest markdown files with full content</li>
			<li>Use <strong>/admin/upload</strong> to upload markdown files</li>
			<li>After creating the chapter here, add scenes with metadata below</li>
		</ul>
	</div>

	<!-- Form Actions -->
	<div class="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
		<Button type="submit">
			{mode === 'create' ? 'Create Chapter' : 'Update Chapter'}
		</Button>
		<Button type="button" variant="outline" onclick={onCancel}>Cancel</Button>
	</div>
</form>

{#if mode === 'edit'}
	<!-- Scene Management Section (only shown when editing existing chapter) -->
	<div class="mt-8">
		<FormSection title="Scenes in This Chapter" icon="🎬" defaultOpen={true}>
			<div class="space-y-4">
				<p class="text-sm text-gray-600 dark:text-gray-400">
					Manage scene metadata for this chapter. Scenes help organize narrative units and enable
					granular search and navigation.
				</p>

				<div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
					<p class="text-sm text-yellow-800 dark:text-yellow-200">
						Scene management UI coming soon! You'll be able to:
					</p>
					<ul class="text-sm text-yellow-800 dark:text-yellow-200 mt-2 ml-4 list-disc">
						<li>Add scenes with title, synopsis, and sequence order</li>
						<li>Assign primary location and POV character</li>
						<li>Tag characters and zones that appear in each scene</li>
						<li>Organize scenes within the chapter timeline</li>
					</ul>
				</div>

				<!-- TODO: Add SceneQuickAdd component here -->
				<!-- TODO: List existing scenes with edit/delete -->
			</div>
		</FormSection>
	</div>
{/if}
