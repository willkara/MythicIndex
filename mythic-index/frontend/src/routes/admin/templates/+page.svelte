<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const categoryColors = {
		character: 'bg-blue-100 text-blue-800',
		location: 'bg-green-100 text-green-800',
		scene: 'bg-purple-100 text-purple-800',
	};

	const statusColors = {
		active: 'bg-green-100 text-green-800',
		draft: 'bg-yellow-100 text-yellow-800',
		deprecated: 'bg-red-100 text-red-800',
	};

	function formatDate(timestamp: number | null) {
		if (!timestamp) return 'N/A';
		return new Date(timestamp).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
		});
	}
</script>

<div class="space-y-6">
	<!-- Header with Create Button -->
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-2xl font-bold text-gray-900">Prompt Templates</h2>
			<p class="mt-1 text-sm text-gray-500">
				Manage Handlebars templates for AI image generation prompts
			</p>
		</div>
		<a
			href="/admin/templates/new"
			class="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
		>
			<span class="mr-2">+</span>
			New Template
		</a>
	</div>

	<!-- Template List -->
	<div class="bg-white shadow overflow-hidden sm:rounded-md">
		<ul class="divide-y divide-gray-200">
			{#each data.templates as template}
				<li>
					<a
						href="/admin/templates/{template.id}"
						class="block hover:bg-gray-50 transition-colors"
					>
						<div class="px-6 py-4">
							<div class="flex items-center justify-between">
								<div class="flex-1 min-w-0">
									<div class="flex items-center space-x-3">
										<h3 class="text-lg font-medium text-gray-900 truncate">
											{template.name}
										</h3>
										{#if template.isDefault}
											<span
												class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
											>
												Default
											</span>
										{/if}
										<span
											class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {categoryColors[
												template.category
											] || 'bg-gray-100 text-gray-800'}"
										>
											{template.category}
										</span>
										<span
											class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {statusColors[
												template.status
											] || 'bg-gray-100 text-gray-800'}"
										>
											{template.status}
										</span>
									</div>
									<div class="mt-2 flex items-center text-sm text-gray-500">
										<span class="font-mono text-xs">{template.slug}</span>
										{#if template.description}
											<span class="mx-2">•</span>
											<span class="truncate">{template.description}</span>
										{/if}
									</div>
									<div class="mt-2 flex items-center space-x-4 text-xs text-gray-500">
										<span>{template.sectionCount} sections</span>
										<span>•</span>
										<span>v{template.version}</span>
										<span>•</span>
										<span>Updated {formatDate(template.updatedAt)}</span>
									</div>
								</div>
								<div class="ml-4">
									<svg
										class="h-5 w-5 text-gray-400"
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 20 20"
										fill="currentColor"
									>
										<path
											fill-rule="evenodd"
											d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
											clip-rule="evenodd"
										/>
									</svg>
								</div>
							</div>
						</div>
					</a>
				</li>
			{:else}
				<li class="px-6 py-12 text-center">
					<p class="text-gray-500">No templates found</p>
					<a href="/admin/templates/new" class="mt-2 text-blue-600 hover:text-blue-800">
						Create your first template
					</a>
				</li>
			{/each}
		</ul>
	</div>

	<!-- Statistics -->
	<div class="grid grid-cols-1 gap-5 sm:grid-cols-3">
		<div class="bg-white overflow-hidden shadow rounded-lg">
			<div class="p-5">
				<div class="flex items-center">
					<div class="flex-shrink-0">
						<span class="text-2xl">📝</span>
					</div>
					<div class="ml-5 w-0 flex-1">
						<dl>
							<dt class="text-sm font-medium text-gray-500 truncate">Total Templates</dt>
							<dd class="text-3xl font-semibold text-gray-900">{data.templates.length}</dd>
						</dl>
					</div>
				</div>
			</div>
		</div>

		<div class="bg-white overflow-hidden shadow rounded-lg">
			<div class="p-5">
				<div class="flex items-center">
					<div class="flex-shrink-0">
						<span class="text-2xl">✅</span>
					</div>
					<div class="ml-5 w-0 flex-1">
						<dl>
							<dt class="text-sm font-medium text-gray-500 truncate">Active Templates</dt>
							<dd class="text-3xl font-semibold text-gray-900">
								{data.templates.filter((t) => t.status === 'active').length}
							</dd>
						</dl>
					</div>
				</div>
			</div>
		</div>

		<div class="bg-white overflow-hidden shadow rounded-lg">
			<div class="p-5">
				<div class="flex items-center">
					<div class="flex-shrink-0">
						<span class="text-2xl">⭐</span>
					</div>
					<div class="ml-5 w-0 flex-1">
						<dl>
							<dt class="text-sm font-medium text-gray-500 truncate">Default Templates</dt>
							<dd class="text-3xl font-semibold text-gray-900">
								{data.templates.filter((t) => t.isDefault).length}
							</dd>
						</dl>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
