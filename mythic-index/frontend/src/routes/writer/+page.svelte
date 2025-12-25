<script lang="ts">
	import { Button } from '$lib/components/ui';
</script>

<div class="container mx-auto px-4 py-8 max-w-6xl">
	<h1 class="text-4xl font-bold mb-2">Story Content Writer</h1>
	<p class="text-gray-600 dark:text-gray-400 mb-8">
		Create and edit chapters, characters, locations, scenes, and zones
	</p>

	<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
		<!-- Characters -->
		<a
			href="/writer/characters/new"
			class="block p-6 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-lg transition-shadow bg-white dark:bg-gray-800"
		>
			<div class="flex items-start justify-between mb-4">
				<h2 class="text-2xl font-semibold">Characters</h2>
				<span class="text-3xl">👤</span>
			</div>
			<p class="text-gray-600 dark:text-gray-400 mb-4">
				Create detailed character profiles with appearance, personality, relationships, and more
			</p>
			<Button variant="outline" class="w-full">Create Character</Button>
		</a>

		<!-- Locations -->
		<a
			href="/writer/locations/new"
			class="block p-6 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-lg transition-shadow bg-white dark:bg-gray-800"
		>
			<div class="flex items-start justify-between mb-4">
				<h2 class="text-2xl font-semibold">Locations</h2>
				<span class="text-3xl">🏛️</span>
			</div>
			<p class="text-gray-600 dark:text-gray-400 mb-4">
				Design locations with atmosphere, history, zones, and narrative significance
			</p>
			<Button variant="outline" class="w-full">Create Location</Button>
		</a>

		<!-- Chapters -->
		<a
			href="/writer/chapters/new"
			class="block p-6 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-lg transition-shadow bg-white dark:bg-gray-800"
		>
			<div class="flex items-start justify-between mb-4">
				<h2 class="text-2xl font-semibold">Chapters</h2>
				<span class="text-3xl">📖</span>
			</div>
			<p class="text-gray-600 dark:text-gray-400 mb-4">
				Write chapters with structured sections, blocks, and scene organization
			</p>
			<Button variant="outline" class="w-full">Create Chapter</Button>
		</a>

		<!-- Scenes -->
		<a
			href="/writer/scenes/new"
			class="block p-6 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-lg transition-shadow bg-white dark:bg-gray-800"
		>
			<div class="flex items-start justify-between mb-4">
				<h2 class="text-2xl font-semibold">Scenes</h2>
				<span class="text-3xl">🎬</span>
			</div>
			<p class="text-gray-600 dark:text-gray-400 mb-4">
				Manage scene metadata, character appearances, locations, and narrative tags
			</p>
			<Button variant="outline" class="w-full">Create Scene</Button>
		</a>

		<!-- Zones -->
		<a
			href="/writer/zones/new"
			class="block p-6 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-lg transition-shadow bg-white dark:bg-gray-800"
		>
			<div class="flex items-start justify-between mb-4">
				<h2 class="text-2xl font-semibold">Zones</h2>
				<span class="text-3xl">📍</span>
			</div>
			<p class="text-gray-600 dark:text-gray-400 mb-4">
				Define zones within locations with physical descriptions and narrative functions
			</p>
			<Button variant="outline" class="w-full">Create Zone</Button>
		</a>

		<!-- Browse Existing -->
		<a
			href="/canon"
			class="block p-6 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-lg transition-shadow bg-white dark:bg-gray-800"
		>
			<div class="flex items-start justify-between mb-4">
				<h2 class="text-2xl font-semibold">Browse Content</h2>
				<span class="text-3xl">📚</span>
			</div>
			<p class="text-gray-600 dark:text-gray-400 mb-4">
				View and edit existing chapters, characters, locations, and more
			</p>
			<Button variant="outline" class="w-full">Browse Canon</Button>
		</a>
	</div>
</div>
