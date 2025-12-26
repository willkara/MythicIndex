<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let selectedEntity = $state('');
	let testing = $state(false);
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<div class="flex items-center space-x-3">
				<a
					href="/admin/templates/{data.template.id}"
					class="text-gray-400 hover:text-gray-600 transition-colors"
				>
					<svg
						class="h-6 w-6"
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M10 19l-7-7m0 0l7-7m-7 7h18"
						/>
					</svg>
				</a>
				<h1 class="text-2xl font-bold text-gray-900">Test Template: {data.template.name}</h1>
			</div>
			<p class="mt-1 text-sm text-gray-500 ml-9">
				Preview how this template renders with real entity data
			</p>
		</div>
	</div>

	<!-- Test Form -->
	<div class="bg-white shadow rounded-lg p-6">
		<form
			method="POST"
			action="?/testTemplate"
			use:enhance={() => {
				testing = true;
				return async ({ update }) => {
					testing = false;
					await update();
				};
			}}
		>
			<div class="space-y-4">
				<div>
					<label for="entitySlug" class="block text-sm font-medium text-gray-700">
						Select {data.template.category} to test
					</label>
					<select
						name="entitySlug"
						id="entitySlug"
						bind:value={selectedEntity}
						required
						class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
					>
						<option value="">-- Select a {data.template.category} --</option>
						{#each data.sampleEntities as entity}
							<option value={entity.slug}>{entity.name}</option>
						{/each}
					</select>
				</div>

				<div>
					<button
						type="submit"
						disabled={!selectedEntity || testing}
						class="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{testing ? '🔄 Testing...' : '🧪 Test Template'}
					</button>
				</div>
			</div>
		</form>
	</div>

	<!-- Results -->
	{#if form?.success}
		<div class="bg-white shadow rounded-lg overflow-hidden">
			<div class="px-6 py-4 bg-green-50 border-b border-green-200">
				<h2 class="text-lg font-medium text-green-900">✅ Template Test Successful</h2>
			</div>

			<!-- Formatted Output -->
			<div class="p-6">
				<h3 class="text-sm font-medium text-gray-700 mb-2">Formatted Output</h3>
				<pre
					class="bg-gray-900 text-gray-100 p-4 rounded overflow-x-auto text-xs font-mono whitespace-pre">{form.formatted}</pre>
			</div>

			<!-- Positive Prompt -->
			<div class="px-6 pb-4">
				<h3 class="text-sm font-medium text-gray-700 mb-2">Positive Prompt</h3>
				<div class="bg-gray-50 p-4 rounded border border-gray-200">
					<p class="text-sm text-gray-900 whitespace-pre-wrap">{form.prompt}</p>
				</div>
				<p class="mt-1 text-xs text-gray-500">
					Character count: {form.prompt.length}
				</p>
			</div>

			<!-- Negative Prompt -->
			<div class="px-6 pb-4">
				<h3 class="text-sm font-medium text-gray-700 mb-2">Negative Prompt</h3>
				<div class="bg-gray-50 p-4 rounded border border-gray-200">
					<p class="text-sm text-gray-900 whitespace-pre-wrap">{form.negativePrompt}</p>
				</div>
			</div>

			<!-- IR Details -->
			{#if form.ir}
				<div class="px-6 pb-6">
					<details class="mt-4">
						<summary class="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
							📊 View IR (Intermediate Representation)
						</summary>
						<div class="mt-2 bg-gray-50 p-4 rounded border border-gray-200">
							<pre
								class="text-xs font-mono text-gray-800 overflow-x-auto">{JSON.stringify(form.ir, null, 2)}</pre>
						</div>
					</details>
				</div>
			{/if}
		</div>
	{:else if form?.error}
		<div class="bg-red-50 border border-red-200 rounded-lg p-6">
			<div class="flex">
				<div class="flex-shrink-0">
					<span class="text-2xl">❌</span>
				</div>
				<div class="ml-3">
					<h3 class="text-sm font-medium text-red-800">Error Testing Template</h3>
					<div class="mt-2 text-sm text-red-700">
						<p>{form.error}</p>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Help Text -->
	<div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
		<h3 class="text-sm font-medium text-blue-900 mb-2">💡 Testing Tips</h3>
		<ul class="text-sm text-blue-800 space-y-1 list-disc list-inside">
			<li>Select an entity to see how the template renders with real data</li>
			<li>The test uses the full compilation pipeline including reference images</li>
			<li>Check the IR to see how sections are weighted and ordered</li>
			<li>Verify that all Handlebars variables resolve correctly</li>
			<li>
				Character count helps ensure prompts fit within AI provider limits (typically 4000 chars)
			</li>
		</ul>
	</div>
</div>
