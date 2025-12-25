<script lang="ts">
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui';

	const slug = $page.params.slug;
</script>

<div class="container mx-auto px-4 py-8 max-w-4xl">
	<div class="mb-6">
		<a href="/writer" class="text-blue-600 hover:underline">← Back to Writer</a>
	</div>

	<h1 class="text-3xl font-bold mb-6">Edit Character: {slug}</h1>

	<div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
		<p class="text-sm text-yellow-800 dark:text-yellow-200">
			Character editor coming soon! This will load and edit existing character data.
		</p>
	</div>

	<div class="space-y-4">
		<div>
			<label class="block text-sm font-medium mb-2">Name *</label>
			<input
				type="text"
				class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				placeholder="Character name"
			/>
		</div>

		<div>
			<label class="block text-sm font-medium mb-2">Slug</label>
			<input
				type="text"
				class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-gray-100 dark:bg-gray-900"
				value={slug}
				disabled
			/>
		</div>

		<div class="flex gap-3 pt-4">
			<Button type="submit" disabled>Update Character</Button>
			<Button variant="outline" href="/writer">Cancel</Button>
			<Button variant="destructive" disabled class="ml-auto">Delete</Button>
		</div>
	</div>
</div>
