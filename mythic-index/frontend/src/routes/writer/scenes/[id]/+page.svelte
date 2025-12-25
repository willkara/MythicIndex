<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui';
	import SceneForm from '$lib/components/writer/forms/SceneForm.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const sceneId = $page.params.id;

	function handleCancel() {
		// Navigate back to chapter editor
		if (data.scene.chapterId) {
			goto(`/writer/chapters/${data.scene.chapterId}`);
		} else {
			goto('/writer');
		}
	}

	async function handleDelete() {
		if (
			!confirm(
				`Are you sure you want to delete this scene${data.scene.title ? ` "${data.scene.title}"` : ''}? This cannot be undone.`
			)
		) {
			return;
		}

		const formData = new FormData();
		const response = await fetch('?/delete', { method: 'POST', body: formData });

		if (response.ok) {
			// Redirect handled by server
		} else {
			alert('Failed to delete scene');
		}
	}
</script>

<div class="container mx-auto px-4 py-8 max-w-5xl">
	<div class="mb-6 flex items-center justify-between">
		<a
			href="/writer/chapters/{data.scene.chapterId}"
			class="text-blue-600 hover:underline dark:text-blue-400"
		>
			← Back to Chapter
		</a>
		<Button variant="destructive" onclick={handleDelete}>Delete Scene</Button>
	</div>

	<div class="mb-6">
		<h1 class="text-3xl font-bold mb-2">
			Edit Scene: {data.scene.title || `Scene ${data.scene.sequenceOrder}`}
		</h1>
		<p class="text-gray-600 dark:text-gray-400">ID: {sceneId}</p>
	</div>

	<SceneForm
		mode="edit"
		action="?/update"
		scene={data.scene}
		chapterId={data.scene.chapterId}
		onCancel={handleCancel}
	/>
</div>
