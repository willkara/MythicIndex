<script lang="ts">
	import { goto } from '$app/navigation';
	import LocationForm from '$lib/components/writer/forms/LocationForm.svelte';

	function handleCancel() {
		goto('/writer');
	}
</script>

<div class="container mx-auto px-4 py-8 max-w-5xl">
	<div class="mb-6">
		<a href="/writer" class="text-blue-600 hover:underline">← Back to Writer</a>
	</div>

	<div class="mb-6">
		<h1 class="text-3xl font-bold mb-2">Create New Location</h1>
		<p class="text-gray-600 dark:text-gray-400">
			Define your location with descriptions, atmosphere, history, and notable features.
		</p>
	</div>

	<LocationForm mode="create" action="?/create" onCancel={handleCancel} />
</div>
