<script lang="ts">
	import { Button } from '$lib/components/ui';
</script>

<div class="container mx-auto px-4 py-8 max-w-4xl">
	<div class="mb-6">
		<a href="/writer" class="text-blue-600 hover:underline">← Back to Writer</a>
	</div>

	<h1 class="text-3xl font-bold mb-6">Create New Scene</h1>

	<div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
		<p class="text-sm text-yellow-800 dark:text-yellow-200">
			Scene form coming soon!
		</p>
	</div>

	<div class="space-y-4">
		<div>
			<label class="block text-sm font-medium mb-2">Title</label>
			<input
				type="text"
				class="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
				placeholder="Scene title"
			/>
		</div>

		<div class="flex gap-3 pt-4">
			<Button type="submit" disabled>Save Scene</Button>
			<Button variant="outline" href="/writer">Cancel</Button>
		</div>
	</div>
</div>
