<script lang="ts">
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui';
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
	<div class="max-w-md w-full text-center space-y-8">
		<!-- Error Icon -->
		<div class="flex justify-center">
			<div
				class="rounded-full bg-red-100 dark:bg-red-900/20 p-6 w-24 h-24 flex items-center justify-center"
			>
				<svg
					class="w-12 h-12 text-red-600 dark:text-red-400"
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
				{$page.status === 404 ? 'Page Not Found' :
				 $page.status === 500 ? 'Internal Server Error' :
				 $page.status === 503 ? 'Service Unavailable' :
				 'Something Went Wrong'}
			</h2>
		</div>

		<!-- Error Message -->
		{#if $page.error?.message}
			<div class="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
				<p class="text-sm text-gray-600 dark:text-gray-400 font-mono break-words">
					{$page.error.message}
				</p>
			</div>
		{/if}

		<!-- Description -->
		<p class="text-gray-600 dark:text-gray-400">
			{#if $page.status === 404}
				The page you're looking for doesn't exist. It might have been moved or deleted.
			{:else if $page.status === 503}
				The database is not available. Make sure you're running with <code class="text-sm bg-gray-200 dark:bg-gray-700 px-1 rounded">npm run dev</code> to enable D1 bindings.
			{:else}
				An unexpected error occurred. Please try again or contact support if the problem persists.
			{/if}
		</p>

		<!-- Actions -->
		<div class="flex flex-col sm:flex-row gap-4 justify-center">
			<Button href="/">
				Go Home
			</Button>
			<Button variant="outline" onclick={() => window.history.back()}>
				Go Back
			</Button>
		</div>

		<!-- Debug Info (development only) -->
		{#if import.meta.env.DEV}
			<details class="text-left bg-gray-100 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
				<summary class="cursor-pointer text-sm font-semibold text-gray-700 dark:text-gray-300">
					Debug Information
				</summary>
				<div class="mt-4 space-y-2 text-xs text-gray-600 dark:text-gray-400 font-mono">
					<div><strong>Status:</strong> {$page.status}</div>
					<div><strong>URL:</strong> {$page.url.pathname}</div>
					{#if $page.error}
						<div class="mt-2 pt-2 border-t border-gray-300 dark:border-gray-600">
							<pre class="whitespace-pre-wrap overflow-x-auto">{JSON.stringify($page.error, null, 2)}</pre>
						</div>
					{/if}
				</div>
			</details>
		{/if}
	</div>
</div>
