<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let showAddSection = $state(false);
	let editingSection: any = $state(null);
	let showDeleteConfirm = $state(false);

	const weightLabels = {
		1: 'Constraints (Highest Priority)',
		2: 'Subject',
		3: 'Composition',
		4: 'Lighting/Palette',
		5: 'Style (Lowest Priority)',
	};

	function startEditSection(section: any) {
		editingSection = { ...section };
	}

	function cancelEdit() {
		editingSection = null;
	}

	function formatDate(timestamp: number | null) {
		if (!timestamp) return 'N/A';
		return new Date(timestamp).toLocaleString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		});
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<div class="flex items-center space-x-3">
				<a
					href="/admin/templates"
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
				<h1 class="text-2xl font-bold text-gray-900">{data.template.name}</h1>
			</div>
			<p class="mt-1 text-sm text-gray-500 ml-9">
				{data.template.description || 'No description'}
			</p>
		</div>
		<div class="flex space-x-3">
			<a
				href="/admin/templates/{data.template.id}/test"
				class="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
			>
				🧪 Test Template
			</a>
			<button
				onclick={() => (showDeleteConfirm = true)}
				class="inline-flex items-center px-4 py-2 border border-red-300 rounded-md shadow-sm text-sm font-medium text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
			>
				🗑️ Delete
			</button>
		</div>
	</div>

	<!-- Template Metadata -->
	<div class="bg-white shadow rounded-lg p-6">
		<h2 class="text-lg font-medium text-gray-900 mb-4">Template Details</h2>
		<form method="POST" action="?/updateTemplate" use:enhance>
			<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
				<div>
					<label for="name" class="block text-sm font-medium text-gray-700">Name</label>
					<input
						type="text"
						name="name"
						id="name"
						value={data.template.name}
						class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
					/>
				</div>

				<div>
					<label for="status" class="block text-sm font-medium text-gray-700">Status</label>
					<select
						name="status"
						id="status"
						value={data.template.status}
						class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
					>
						<option value="active">Active</option>
						<option value="draft">Draft</option>
						<option value="deprecated">Deprecated</option>
					</select>
				</div>

				<div class="sm:col-span-2">
					<label for="description" class="block text-sm font-medium text-gray-700"
						>Description</label
					>
					<textarea
						name="description"
						id="description"
						rows="3"
						value={data.template.description || ''}
						class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
					></textarea>
				</div>

				<div>
					<span class="block text-sm font-medium text-gray-700">Slug</span>
					<span class="mt-1 block text-sm text-gray-500 font-mono">{data.template.slug}</span>
				</div>

				<div>
					<span class="block text-sm font-medium text-gray-700">Category</span>
					<span class="mt-1 block text-sm text-gray-500">{data.template.category}</span>
				</div>

				<div>
					<span class="block text-sm font-medium text-gray-700">Version</span>
					<span class="mt-1 block text-sm text-gray-500">{data.template.version}</span>
				</div>

				<div>
					<span class="block text-sm font-medium text-gray-700">Last Updated</span>
					<span class="mt-1 block text-sm text-gray-500"
						>{formatDate(data.template.updatedAt)}</span
					>
				</div>
			</div>

			<div class="mt-6">
				<button
					type="submit"
					class="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
				>
					Save Changes
				</button>
			</div>
		</form>
	</div>

	<!-- Sections -->
	<div class="bg-white shadow rounded-lg">
		<div class="px-6 py-4 border-b border-gray-200">
			<div class="flex items-center justify-between">
				<h2 class="text-lg font-medium text-gray-900">Template Sections</h2>
				<button
					onclick={() => (showAddSection = true)}
					class="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
				>
					+ Add Section
				</button>
			</div>
		</div>

		<div class="divide-y divide-gray-200">
			{#each data.sections as section}
				<div class="px-6 py-4">
					{#if editingSection?.id === section.id}
						<!-- Edit Mode -->
						<form method="POST" action="?/updateSection" use:enhance>
							<input type="hidden" name="sectionId" value={section.id} />
							<div class="space-y-4">
								<div class="grid grid-cols-2 gap-4">
									<div>
										<label class="block text-sm font-medium text-gray-700">Name</label>
										<input
											type="text"
											name="name"
											value={editingSection.name}
											class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm"
										/>
									</div>
									<div>
										<label class="block text-sm font-medium text-gray-700">Weight</label>
										<select
											name="weight"
											bind:value={editingSection.weight}
											class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm"
										>
											{#each Object.entries(weightLabels) as [value, label]}
												<option {value}>{label}</option>
											{/each}
										</select>
									</div>
								</div>

								<div>
									<label class="block text-sm font-medium text-gray-700">Content (Handlebars)</label>
									<textarea
										name="content"
										rows="6"
										bind:value={editingSection.content}
										class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm font-mono"
									></textarea>
								</div>

								<div>
									<label class="block text-sm font-medium text-gray-700"
										>Condition (optional)</label
									>
									<input
										type="text"
										name="condition"
										value={editingSection.condition || ''}
										placeholder="e.g., entity.species"
										class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm font-mono"
									/>
								</div>

								<div class="flex space-x-2">
									<button
										type="submit"
										class="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-blue-600 hover:bg-blue-700"
									>
										Save
									</button>
									<button
										type="button"
										onclick={cancelEdit}
										class="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50"
									>
										Cancel
									</button>
								</div>
							</div>
						</form>
					{:else}
						<!-- View Mode -->
						<div class="flex items-start justify-between">
							<div class="flex-1">
								<div class="flex items-center space-x-3">
									<h3 class="text-sm font-medium text-gray-900">{section.name}</h3>
									<span
										class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800"
									>
										Weight {section.weight}
									</span>
									{#if section.condition}
										<span
											class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800"
										>
											Conditional
										</span>
									{/if}
								</div>
								<pre
									class="mt-2 text-xs font-mono text-gray-600 bg-gray-50 p-3 rounded overflow-x-auto">{section.content}</pre>
								{#if section.condition}
									<p class="mt-2 text-xs text-gray-500">
										Condition: <code class="font-mono bg-gray-100 px-1 rounded"
											>{section.condition}</code
										>
									</p>
								{/if}
							</div>
							<div class="ml-4 flex space-x-2">
								<button
									onclick={() => startEditSection(section)}
									class="text-blue-600 hover:text-blue-800 text-sm"
								>
									Edit
								</button>
								<form method="POST" action="?/deleteSection" use:enhance>
									<input type="hidden" name="sectionId" value={section.id} />
									<button type="submit" class="text-red-600 hover:text-red-800 text-sm">
										Delete
									</button>
								</form>
							</div>
						</div>
					{/if}
				</div>
			{:else}
				<div class="px-6 py-8 text-center text-gray-500">
					<p>No sections defined yet</p>
					<button
						onclick={() => (showAddSection = true)}
						class="mt-2 text-blue-600 hover:text-blue-800"
					>
						Add your first section
					</button>
				</div>
			{/each}
		</div>
	</div>

	<!-- Available Components Reference -->
	{#if data.components.length > 0}
		<div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
			<h3 class="text-sm font-medium text-blue-900 mb-2">📦 Available Components (Partials)</h3>
			<div class="flex flex-wrap gap-2">
				{#each data.components as component}
					<code
						class="inline-flex items-center px-2 py-1 rounded text-xs font-mono bg-blue-100 text-blue-800"
					>
						{'{{> ' + component.slug + '}}'}
					</code>
				{/each}
			</div>
		</div>
	{/if}
</div>

<!-- Add Section Modal -->
{#if showAddSection}
	<div class="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
		<div class="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
			<form method="POST" action="?/addSection" use:enhance>
				<div class="px-6 py-4 border-b border-gray-200">
					<h3 class="text-lg font-medium text-gray-900">Add New Section</h3>
				</div>
				<div class="px-6 py-4 space-y-4">
					<div class="grid grid-cols-2 gap-4">
						<div>
							<label class="block text-sm font-medium text-gray-700">Section Name</label>
							<input
								type="text"
								name="name"
								required
								class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm"
							/>
						</div>
						<div>
							<label class="block text-sm font-medium text-gray-700">Weight (Priority)</label>
							<select
								name="weight"
								required
								class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm"
							>
								{#each Object.entries(weightLabels) as [value, label]}
									<option {value}>{label}</option>
								{/each}
							</select>
						</div>
					</div>

					<div>
						<label class="block text-sm font-medium text-gray-700">Content (Handlebars)</label>
						<textarea
							name="content"
							rows="8"
							required
							placeholder="{'{{'}entity.species{'}}'}, {'{{'}entity.age{'}}'}  years old..."
							class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm font-mono"
						></textarea>
					</div>

					<div>
						<label class="block text-sm font-medium text-gray-700">Condition (optional)</label>
						<input
							type="text"
							name="condition"
							placeholder="e.g., entity.species"
							class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm font-mono"
						/>
					</div>
				</div>
				<div class="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
					<button
						type="button"
						onclick={() => (showAddSection = false)}
						class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
					>
						Cancel
					</button>
					<button
						type="submit"
						class="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
					>
						Add Section
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Delete Confirmation Modal -->
{#if showDeleteConfirm}
	<div class="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
		<div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
			<div class="px-6 py-4">
				<h3 class="text-lg font-medium text-gray-900">Delete Template</h3>
				<p class="mt-2 text-sm text-gray-500">
					Are you sure you want to delete this template? This action cannot be undone and will
					also delete all associated sections.
				</p>
			</div>
			<div class="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
				<button
					onclick={() => (showDeleteConfirm = false)}
					class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
				>
					Cancel
				</button>
				<form method="POST" action="?/deleteTemplate" use:enhance>
					<button
						type="submit"
						class="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700"
					>
						Delete Template
					</button>
				</form>
			</div>
		</div>
	</div>
{/if}
