<script lang="ts">
	import { goto } from '$app/navigation';
	import CharacterForm from '$lib/components/writer/forms/CharacterForm.svelte';

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

	<CharacterForm mode="create" action="?/create" onCancel={handleCancel} />
</div>
