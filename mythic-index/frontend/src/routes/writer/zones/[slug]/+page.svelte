<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui';
	import ZoneForm from '$lib/components/writer/forms/ZoneForm.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const slug = $page.params.slug;

	function handleCancel() {
		goto('/writer');
	}

	async function handleDelete() {
		if (!confirm(`Are you sure you want to delete "${data.zone.name}"? This cannot be undone.`)) {
			return;
		}

		const formData = new FormData();
		const response = await fetch(`?/delete&locationId=${data.locationId}`, {
			method: 'POST',
			body: formData
		});

		if (response.ok) {
			goto('/writer');
		} else {
			alert('Failed to delete zone');
		}
	}
</script>

<div class="container mx-auto px-4 py-8 max-w-5xl">
	<div class="mb-6 flex items-center justify-between">
		<a href="/writer" class="text-blue-600 hover:underline">← Back to Writer</a>
		<Button variant="destructive" onclick={handleDelete}>Delete Zone</Button>
	</div>

	<div class="mb-6">
		<h1 class="text-3xl font-bold mb-2">Edit Zone: {data.zone.name}</h1>
		<p class="text-gray-600 dark:text-gray-400">
			Slug: {slug} | Location ID: {data.locationId}
		</p>
	</div>

	<ZoneForm
		mode="edit"
		action="?/update&locationId={data.locationId}"
		zone={data.zone}
		onCancel={handleCancel}
	/>
</div>
