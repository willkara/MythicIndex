<script lang="ts">
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui';

	const slug = $page.params.slug;
</script>

<div class="container mx-auto px-4 py-8 max-w-4xl">
	<div class="mb-6">
		<a href="/writer" class="text-blue-600 hover:underline">← Back to Writer</a>
	</div>

	<h1 class="text-3xl font-bold mb-6">Edit Scene: {slug}</h1>

	<div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
		<p class="text-sm text-yellow-800 dark:text-yellow-200">
			Scene editor coming soon!
		</p>
	</div>

	<div class="flex gap-3 pt-4">
		<Button type="submit" disabled>Update Scene</Button>
		<Button variant="outline" href="/writer">Cancel</Button>
		<Button variant="destructive" disabled class="ml-auto">Delete</Button>
	</div>
</div>
