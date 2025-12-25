<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui';
	import LocationForm from '$lib/components/writer/forms/LocationForm.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const slug = $page.params.slug;

	function handleCancel() {
		goto('/writer');
	}

	async function handleDelete() {
		if (!confirm(`Are you sure you want to delete "${data.location.name}"? This cannot be undone.`)) {
			return;
		}

		const formData = new FormData();
		const response = await fetch('?/delete', { method: 'POST', body: formData });

		if (response.ok) {
			goto('/writer');
		} else {
			alert('Failed to delete location');
		}
	}
</script>

<div class="container mx-auto px-4 py-8 max-w-5xl">
	<div class="mb-6 flex items-center justify-between">
		<a href="/writer" class="text-blue-600 hover:underline">← Back to Writer</a>
		<Button variant="destructive" onclick={handleDelete}>Delete Location</Button>
	</div>

	<div class="mb-6">
		<h1 class="text-3xl font-bold mb-2">Edit Location: {data.location.name}</h1>
		<p class="text-gray-600 dark:text-gray-400">Slug: {slug}</p>
	</div>

	<LocationForm mode="edit" action="?/update" location={data.location} onCancel={handleCancel} />
</div>
