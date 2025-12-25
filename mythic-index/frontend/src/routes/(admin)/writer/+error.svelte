<script lang="ts">
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui';
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
	<div class="max-w-md w-full text-center space-y-8">
		<!-- Writer-specific Error Icon -->
		<div class="flex justify-center">
			<div
				class="rounded-full bg-yellow-100 dark:bg-yellow-900/20 p-6 w-24 h-24 flex items-center justify-center"
			>
				<svg
					class="w-12 h-12 text-yellow-600 dark:text-yellow-400"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
					/>
				</svg>
			</div>
		</div>

		<!-- Error Code -->
		<div>
			<h1 class="text-6xl font-bold text-gray-900 dark:text-white">
				{$page.status}
			</h1>
			<h2 class="mt-2 text-xl font-semibold text-gray-700 dark:text-gray-300">
				{$page.status === 404 ? 'Content Not Found' :
				 $page.status === 500 ? 'Save Failed' :
				 $page.status === 503 ? 'Database Unavailable' :
				 'Writer Error'}
			</h2>
		</div>

		<!-- Error Message -->
		{#if $page.error?.message}
			<div class="bg-yellow-50 dark:bg-yellow-900/10 rounded-lg p-4 border border-yellow-200 dark:border-yellow-800">
				<p class="text-sm text-yellow-800 dark:text-yellow-200 font-mono break-words">
					{$page.error.message}
				</p>
			</div>
		{/if}

		<!-- Writer-specific Description -->
		<p class="text-gray-600 dark:text-gray-400">
			{#if $page.status === 404}
				The content you're trying to edit doesn't exist or may have been deleted.
			{:else if $page.status === 503}
				Cannot connect to the database. Ensure you're running with <code class="text-sm bg-gray-200 dark:bg-gray-700 px-1 rounded">npm run dev</code> for local D1 access.
			{:else if $page.status === 400}
				There was a problem with your submission. Please check the form and try again.
			{:else}
				An error occurred while saving your work. Your changes may not have been saved.
			{/if}
		</p>

		<!-- Actions -->
		<div class="flex flex-col sm:flex-row gap-4 justify-center">
			<Button href="/writer">
				Writer Dashboard
			</Button>
			<Button variant="outline" onclick={() => window.history.back()}>
				Go Back
			</Button>
		</div>

		<!-- Auto-save Warning -->
		{#if $page.status >= 500}
			<div class="bg-red-50 dark:bg-red-900/10 rounded-lg p-4 border border-red-200 dark:border-red-800">
				<p class="text-sm text-red-800 dark:text-red-200">
					⚠️ Your recent changes may not have been saved. If you had unsaved work, try refreshing and submitting again.
				</p>
			</div>
		{/if}
	</div>
</div>
