<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui';
	import ChapterForm from '$lib/components/writer/forms/ChapterForm.svelte';
	import SceneForm from '$lib/components/writer/forms/SceneForm.svelte';
	import SceneList from '$lib/components/writer/SceneList.svelte';
	import { FormSection } from '$lib/components/writer/inputs';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const slug = $page.params.slug;
	let showAddScene = $state(false);

	function handleCancel() {
		goto('/writer');
	}

	async function handleDelete() {
		if (!confirm(`Are you sure you want to delete "${data.chapter.title}"? This cannot be undone.`)) {
			return;
		}

		const formData = new FormData();
		const response = await fetch('?/delete', { method: 'POST', body: formData });

		if (response.ok) {
			goto('/writer');
		} else {
			alert('Failed to delete chapter');
		}
	}

	function handleAddScene() {
		showAddScene = true;
	}

	function handleCancelAddScene() {
		showAddScene = false;
	}

	// Calculate next sequence order for new scenes
	const nextSequenceOrder = data.scenes.length > 0
		? Math.max(...data.scenes.map((s: any) => s.sequenceOrder)) + 1
		: 0;
</script>

<div class="container mx-auto px-4 py-8 max-w-5xl">
	<div class="mb-6 flex items-center justify-between">
		<a href="/writer" class="text-blue-600 hover:underline">← Back to Writer</a>
		<Button variant="destructive" onclick={handleDelete}>Delete Chapter</Button>
	</div>

	<div class="mb-6">
		<h1 class="text-3xl font-bold mb-2">Edit Chapter: {data.chapter.title}</h1>
		<p class="text-gray-600 dark:text-gray-400">Slug: {slug}</p>
	</div>

	<ChapterForm mode="edit" action="?/update" chapter={data.chapter} onCancel={handleCancel} />

	<!-- Scene Management Section -->
	<div class="mt-8">
		<FormSection title="Scenes" icon="🎬" defaultOpen={true}>
			<SceneList scenes={data.scenes} chapterId={data.chapter.id} onAddScene={handleAddScene} />
		</FormSection>
	</div>

	<!-- Add Scene Modal/Section -->
	{#if showAddScene}
		<div class="mt-8 border-t border-gray-200 dark:border-gray-700 pt-8">
			<h2 class="text-2xl font-bold mb-4">Add New Scene</h2>
			<SceneForm
				mode="create"
				action="?/createScene"
				chapterId={data.chapter.id}
				nextSequenceOrder={nextSequenceOrder}
				onCancel={handleCancelAddScene}
			/>
		</div>
	{/if}
</div>
