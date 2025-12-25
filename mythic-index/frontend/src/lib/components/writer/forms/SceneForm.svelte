<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui';
	import { FormSection, RichTextEditor } from '../inputs';
	import type { SceneCreate } from '$lib/server/writer/validation';

	/**
	 * Scene editor form with rich text content
	 * Used for creating/editing scenes within chapters
	 */
	interface Props {
		scene?: Partial<SceneCreate>;
		chapterId: string;
		mode?: 'create' | 'edit';
		action?: string;
		onCancel?: () => void;
		nextSequenceOrder?: number;
	}

	let {
		scene = {},
		chapterId,
		mode = 'create',
		action = '?/createScene',
		onCancel = () => {},
		nextSequenceOrder = 1
	}: Props = $props();

	// Form state
	let formData = $state({
		title: scene.title || '',
		synopsis: scene.synopsis || '',
		content: (scene as any).content || '',
		status: (scene as any).status || 'draft',
		sceneWhen: scene.sceneWhen || '',
		primaryLocationId: scene.primaryLocationId || '',
		povEntityId: scene.povEntityId || '',
		sequenceOrder: scene.sequenceOrder ?? nextSequenceOrder,
		wordCount: (scene as any).wordCount || 0
	});

	// Auto-calculate word count from content
	$effect(() => {
		if (formData.content) {
			const text = formData.content.replace(/<[^>]*>/g, ''); // Strip HTML tags
			const words = text.trim().split(/\s+/).filter(Boolean);
			formData.wordCount = words.length;
		}
	});
</script>

<form method="POST" {action} use:enhance class="space-y-6">
	<!-- Hidden fields -->
	<input type="hidden" name="chapterId" value={chapterId} />
	<input type="hidden" name="content" value={formData.content} />

	<!-- Scene Metadata Section -->
	<FormSection title="Scene Information" icon="🎬" defaultOpen={true}>
		<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
			<div class="md:col-span-2">
				<label class="block text-sm font-medium mb-2">Title</label>
				<input
					type="text"
					name="title"
					bind:value={formData.title}
					placeholder="Scene title (optional)"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				/>
				<p class="text-xs text-gray-500 mt-1">Optional - helps identify the scene</p>
			</div>

			<div class="md:col-span-2">
				<label class="block text-sm font-medium mb-2">Synopsis</label>
				<textarea
					name="synopsis"
					bind:value={formData.synopsis}
					rows="2"
					placeholder="Brief scene summary"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				></textarea>
				<p class="text-xs text-gray-500 mt-1">Quick summary of what happens in this scene</p>
			</div>

			<div>
				<label class="block text-sm font-medium mb-2">
					Sequence Order <span class="text-red-500">*</span>
				</label>
				<input
					type="number"
					name="sequenceOrder"
					bind:value={formData.sequenceOrder}
					required
					min="0"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				/>
				<p class="text-xs text-gray-500 mt-1">Order within chapter</p>
			</div>

			<div>
				<label class="block text-sm font-medium mb-2">Status</label>
				<select
					name="status"
					bind:value={formData.status}
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				>
					<option value="draft">Draft</option>
					<option value="done">Done</option>
				</select>
				<p class="text-xs text-gray-500 mt-1">
					Mark as "Done" when ready for chapter publishing
				</p>
			</div>

			<div>
				<label class="block text-sm font-medium mb-2">Word Count</label>
				<input
					type="number"
					name="wordCount"
					bind:value={formData.wordCount}
					min="0"
					readonly
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400"
				/>
				<p class="text-xs text-gray-500 mt-1">Auto-calculated from content</p>
			</div>

			<div>
				<label class="block text-sm font-medium mb-2">When (Temporal)</label>
				<input
					type="text"
					name="sceneWhen"
					bind:value={formData.sceneWhen}
					placeholder="e.g., 'Dawn', 'Three days later'"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				/>
				<p class="text-xs text-gray-500 mt-1">Time of day or temporal marker</p>
			</div>

			<div>
				<label class="block text-sm font-medium mb-2">POV Character ID</label>
				<input
					type="text"
					name="povEntityId"
					bind:value={formData.povEntityId}
					placeholder="Character UUID"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				/>
				<p class="text-xs text-gray-500 mt-1">Point-of-view character</p>
			</div>

			<div class="md:col-span-2">
				<label class="block text-sm font-medium mb-2">Primary Location ID</label>
				<input
					type="text"
					name="primaryLocationId"
					bind:value={formData.primaryLocationId}
					placeholder="Location UUID"
					class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				/>
				<p class="text-xs text-gray-500 mt-1">Where this scene takes place</p>
			</div>
		</div>
	</FormSection>

	<!-- Rich Text Content Section -->
	<FormSection title="Scene Content" icon="✍️" defaultOpen={true}>
		<div class="space-y-4">
			<RichTextEditor
				bind:content={formData.content}
				placeholder="Write your scene content here... Use the toolbar for formatting."
				label="Content"
			/>
			<p class="text-xs text-gray-500">
				Write the actual scene content. Supports bold, italic, headings, blockquotes, lists, and
				more.
			</p>
		</div>
	</FormSection>

	<!-- Form Actions -->
	<div class="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
		<Button type="submit">
			{mode === 'create' ? 'Create Scene' : 'Update Scene'}
		</Button>
		<Button type="button" variant="outline" onclick={onCancel}>Cancel</Button>
	</div>
</form>
