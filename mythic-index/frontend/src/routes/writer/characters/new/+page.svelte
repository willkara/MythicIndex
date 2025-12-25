<script lang="ts">
	import { goto } from '$app/navigation';
	import CharacterForm from '$lib/components/writer/forms/CharacterForm.svelte';
	import type { CharacterCreate } from '$lib/server/writer/validation';

	async function handleSubmit(data: Partial<CharacterCreate>) {
		try {
			// TODO: Implement actual server action
			console.log('Character data:', data);

			// For now, just show alert
			alert('Character creation coming soon! Check console for form data.');

			// Later: submit to server action and redirect
			// const response = await fetch('?/create', { method: 'POST', body: JSON.stringify(data) });
			// if (response.ok) {
			//   goto('/writer');
			// }
		} catch (error) {
			console.error('Error creating character:', error);
			alert('Error creating character. See console for details.');
		}
	}

	function handleCancel() {
		goto('/writer');
	}
</script>

<div class="container mx-auto px-4 py-8 max-w-5xl">
	<div class="mb-6">
		<a href="/writer" class="text-blue-600 hover:underline">← Back to Writer</a>
	</div>

	<div class="mb-6">
		<h1 class="text-3xl font-bold mb-2">Create New Character</h1>
		<p class="text-gray-600 dark:text-gray-400">
			Define your character with detailed appearance, personality, background, and more.
		</p>
	</div>

	<CharacterForm mode="create" onSubmit={handleSubmit} onCancel={handleCancel} />
</div>
