<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let showCreateModal = $state(false);
	let editingPreset: any = $state(null);
	let deleteConfirmId: string | null = $state(null);

	const categoryColors = {
		character: 'bg-blue-100 text-blue-800',
		location: 'bg-green-100 text-green-800',
		scene: 'bg-purple-100 text-purple-800',
	};

	function startEdit(preset: any) {
		editingPreset = { ...preset };
		// Parse negative prompts for editing
		try {
			editingPreset.negativesArray = JSON.parse(preset.negativePrompts);
		} catch (e) {
			editingPreset.negativesArray = [];
		}
	}

	function cancelEdit() {
		editingPreset = null;
	}

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
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-2xl font-bold text-gray-900">Style Presets</h2>
			<p class="mt-1 text-sm text-gray-500">
				Master styles applied to all prompts in each category
			</p>
		</div>
		<button
			onclick={() => (showCreateModal = true)}
			class="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
		>
			<span class="mr-2">+</span>
			New Style Preset
		</button>
	</div>

	<!-- Presets List -->
	<div class="bg-white shadow overflow-hidden sm:rounded-md">
		<ul class="divide-y divide-gray-200">
			{#each data.presets as preset}
				<li class="px-6 py-4">
					{#if editingPreset?.id === preset.id}
						<!-- Edit Mode -->
						<form
							method="POST"
							action="?/updatePreset"
							use:enhance={() => {
								return async ({ update }) => {
									await update();
									editingPreset = null;
								};
							}}
						>
							<input type="hidden" name="id" value={preset.id} />
							<div class="space-y-4">
								<div class="grid grid-cols-2 gap-4">
									<div>
										<label class="block text-sm font-medium text-gray-700">Name</label>
										<input
											type="text"
											name="name"
											bind:value={editingPreset.name}
											required
											class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm"
										/>
									</div>
									<div>
										<label class="block text-sm font-medium text-gray-700">Priority</label>
										<input
											type="number"
											name="priority"
											bind:value={editingPreset.priority}
											min="1"
											required
											class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm"
										/>
									</div>
								</div>

								<div>
									<label class="block text-sm font-medium text-gray-700"
										>Style Description</label
									>
									<textarea
										name="styleDescription"
										rows="3"
										bind:value={editingPreset.styleDescription}
										required
										class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm"
									></textarea>
								</div>

								<div>
									<label class="block text-sm font-medium text-gray-700"
										>Negative Prompts (one per line)</label
									>
									<textarea
										name="negativePrompts"
										rows="4"
										value={editingPreset.negativesArray?.join('\n') || ''}
										placeholder="low quality&#10;blurry&#10;distorted"
										class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm font-mono"
									></textarea>
								</div>

								<div class="flex items-center space-x-6">
									<label class="flex items-center">
										<input
											type="checkbox"
											name="isMasterStyle"
											value="true"
											checked={editingPreset.isMasterStyle}
											class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
										/>
										<span class="ml-2 text-sm text-gray-700">Master Style</span>
									</label>

									<div>
										<label class="block text-sm font-medium text-gray-700">Status</label>
										<select
											name="status"
											bind:value={editingPreset.status}
											class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1 px-2 text-sm"
										>
											<option value="active">Active</option>
											<option value="draft">Draft</option>
											<option value="deprecated">Deprecated</option>
										</select>
									</div>
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
									<h3 class="text-lg font-medium text-gray-900">{preset.name}</h3>
									<span
										class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {categoryColors[
											preset.category
										] || 'bg-gray-100 text-gray-800'}"
									>
										{preset.category}
									</span>
									{#if preset.isMasterStyle}
										<span
											class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800"
										>
											⭐ Master
										</span>
									{/if}
									<span
										class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
									>
										Priority: {preset.priority}
									</span>
								</div>

								<p class="mt-2 text-sm text-gray-600">{preset.styleDescription}</p>

								{#if preset.negativePrompts && preset.negativePrompts !== '[]'}
									{@const negatives = JSON.parse(preset.negativePrompts)}
									<div class="mt-2">
										<p class="text-xs font-medium text-gray-500 mb-1">Negative Prompts:</p>
										<div class="flex flex-wrap gap-1">
											{#each negatives as negative}
												<span
													class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700"
												>
													{negative}
												</span>
											{/each}
										</div>
									</div>
								{/if}

								<div class="mt-2 flex items-center space-x-4 text-xs text-gray-500">
									<span>Slug: {preset.slug}</span>
									<span>•</span>
									<span>Status: {preset.status}</span>
									<span>•</span>
									<span>Updated {formatDate(preset.updatedAt)}</span>
								</div>
							</div>

							<div class="ml-4 flex space-x-2">
								<button
									onclick={() => startEdit(preset)}
									class="text-blue-600 hover:text-blue-800 text-sm"
								>
									Edit
								</button>
								<button
									onclick={() => (deleteConfirmId = preset.id)}
									class="text-red-600 hover:text-red-800 text-sm"
								>
									Delete
								</button>
							</div>
						</div>
					{/if}
				</li>
			{:else}
				<li class="px-6 py-12 text-center">
					<p class="text-gray-500">No style presets found</p>
					<button
						onclick={() => (showCreateModal = true)}
						class="mt-2 text-blue-600 hover:text-blue-800"
					>
						Create your first style preset
					</button>
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
						<span class="text-2xl">🎨</span>
					</div>
					<div class="ml-5 w-0 flex-1">
						<dl>
							<dt class="text-sm font-medium text-gray-500 truncate">Total Presets</dt>
							<dd class="text-3xl font-semibold text-gray-900">{data.presets.length}</dd>
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
							<dt class="text-sm font-medium text-gray-500 truncate">Master Styles</dt>
							<dd class="text-3xl font-semibold text-gray-900">
								{data.presets.filter((p) => p.isMasterStyle).length}
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
						<span class="text-2xl">✅</span>
					</div>
					<div class="ml-5 w-0 flex-1">
						<dl>
							<dt class="text-sm font-medium text-gray-500 truncate">Active</dt>
							<dd class="text-3xl font-semibold text-gray-900">
								{data.presets.filter((p) => p.status === 'active').length}
							</dd>
						</dl>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>

<!-- Create Modal -->
{#if showCreateModal}
	<div class="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
		<div class="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
			<form
				method="POST"
				action="?/createPreset"
				use:enhance={() => {
					return async ({ update }) => {
						await update();
						showCreateModal = false;
					};
				}}
			>
				<div class="px-6 py-4 border-b border-gray-200">
					<h3 class="text-lg font-medium text-gray-900">Create Style Preset</h3>
				</div>
				<div class="px-6 py-4 space-y-4">
					<div class="grid grid-cols-2 gap-4">
						<div>
							<label class="block text-sm font-medium text-gray-700">Name</label>
							<input
								type="text"
								name="name"
								required
								placeholder="Heroic Fantasy Character"
								class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm"
							/>
						</div>
						<div>
							<label class="block text-sm font-medium text-gray-700">Slug</label>
							<input
								type="text"
								name="slug"
								required
								placeholder="heroic-fantasy-character"
								class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm font-mono"
							/>
						</div>
					</div>

					<div class="grid grid-cols-2 gap-4">
						<div>
							<label class="block text-sm font-medium text-gray-700">Category</label>
							<select
								name="category"
								required
								class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm"
							>
								<option value="character">Character</option>
								<option value="location">Location</option>
								<option value="scene">Scene</option>
							</select>
						</div>
						<div>
							<label class="block text-sm font-medium text-gray-700">Priority</label>
							<input
								type="number"
								name="priority"
								value="1"
								min="1"
								required
								class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm"
							/>
						</div>
					</div>

					<div>
						<label class="block text-sm font-medium text-gray-700">Style Description</label>
						<textarea
							name="styleDescription"
							rows="4"
							required
							placeholder="heroic fantasy portrait, expressive face with distinct features, ornate attire with rich textures, painterly style, dramatic composition"
							class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm"
						></textarea>
					</div>

					<div>
						<label class="block text-sm font-medium text-gray-700"
							>Negative Prompts (one per line)</label
						>
						<textarea
							name="negativePrompts"
							rows="4"
							placeholder="low quality&#10;blurry&#10;distorted&#10;deformed"
							class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm font-mono"
						></textarea>
					</div>

					<div>
						<label class="flex items-center">
							<input
								type="checkbox"
								name="isMasterStyle"
								value="true"
								class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
							/>
							<span class="ml-2 text-sm text-gray-700"
								>Master Style (applied to all prompts in category)</span
							>
						</label>
					</div>
				</div>
				<div class="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
					<button
						type="button"
						onclick={() => (showCreateModal = false)}
						class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
					>
						Cancel
					</button>
					<button
						type="submit"
						class="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
					>
						Create Preset
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Delete Confirmation Modal -->
{#if deleteConfirmId}
	<div class="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
		<div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
			<div class="px-6 py-4">
				<h3 class="text-lg font-medium text-gray-900">Delete Style Preset</h3>
				<p class="mt-2 text-sm text-gray-500">
					Are you sure you want to delete this style preset? This action cannot be undone.
				</p>
			</div>
			<div class="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
				<button
					onclick={() => (deleteConfirmId = null)}
					class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
				>
					Cancel
				</button>
				<form method="POST" action="?/deletePreset" use:enhance>
					<input type="hidden" name="id" value={deleteConfirmId} />
					<button
						type="submit"
						onclick={() => (deleteConfirmId = null)}
						class="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700"
					>
						Delete
					</button>
				</form>
			</div>
		</div>
	</div>
{/if}
