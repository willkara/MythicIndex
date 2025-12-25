<script lang="ts">
	import { BookOpen, Users, MapPin, Scroll, Globe, ArrowRight, X, Clock, ArrowUpAZ, Sparkles, Search, LayoutGrid, List, CheckCircle, BookMarked, Circle, BarChart3 } from 'lucide-svelte';
	import ContentCard from '$lib/components/ContentCard.svelte';
	import { readingProgress, type ReadingProgress } from '$lib/stores/reading-progress';
	import { Button } from '$lib/components/ui/button';

	let { data } = $props();

	// Search/filter state
	let searchQuery = $state('');
	let searchInputEl = $state<HTMLInputElement | null>(null);

	// Reading status filter
	type ReadingStatusFilter = 'all' | 'read' | 'in-progress' | 'unread';
	let readingStatusFilter = $state<ReadingStatusFilter>('all');

	// View mode (grid/list)
	let viewMode = $state<'grid' | 'list'>('grid');

	// Filter items by search query
	function filterItems<T extends { title: string; summary?: string | null }>(items: T[]): T[] {
		if (!searchQuery.trim()) return items;
		const query = searchQuery.toLowerCase();
		return items.filter(item =>
			item.title.toLowerCase().includes(query) ||
			(item.summary && item.summary.toLowerCase().includes(query))
		);
	}

	// Clear search
	function clearSearch() {
		searchQuery = '';
		searchInputEl?.focus();
	}

	// Sort options per section
	type SortMode = 'alpha' | 'recent';
	let sortModes = $state<Record<string, SortMode>>({
		chapters: 'alpha', // chapters keep their natural order (chapter number)
		characters: 'alpha',
		locations: 'alpha',
		lore: 'alpha',
		worldbuilding: 'alpha'
	});

	function toggleSort(sectionId: string) {
		sortModes[sectionId] = sortModes[sectionId] === 'alpha' ? 'recent' : 'alpha';
	}

	// Sort items based on current mode
	function sortItems<T extends { title: string; updatedAt: string }>(items: T[], sectionId: string): T[] {
		if (sectionId === 'chapters') return items; // chapters have special ordering from server
		if (sortModes[sectionId] === 'recent') {
			return [...items].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
		}
		return items; // already sorted alphabetically from server
	}

	// Filter items by reading status (only applies to chapters)
	function filterByReadingStatus<T extends { slug: string }>(items: T[], sectionId: string): T[] {
		if (sectionId !== 'chapters' || readingStatusFilter === 'all') return items;

		return items.filter(item => {
			const isRead = progress.readChapters.includes(item.slug);
			const isInProgress = progress.lastChapter?.slug === item.slug && !isRead;

			switch (readingStatusFilter) {
				case 'read':
					return isRead;
				case 'in-progress':
					return isInProgress;
				case 'unread':
					return !isRead && !isInProgress;
				default:
					return true;
			}
		});
	}

	// Combined filter and sort
	function processItems<T extends { title: string; updatedAt: string; summary?: string | null; slug: string }>(items: T[], sectionId: string): T[] {
		return sortItems(filterByReadingStatus(filterItems(items), sectionId), sectionId);
	}

	// Reading stats derived from progress
	const readingStats = $derived.by(() => {
		const totalChapters = data.chapters.length;
		const readCount = progress.readChapters.length;
		const inProgressCount = progress.lastChapter && !progress.readChapters.includes(progress.lastChapter.slug) ? 1 : 0;
		const unreadCount = Math.max(0, totalChapters - readCount - inProgressCount);
		const percentComplete = totalChapters > 0 ? Math.round((readCount / totalChapters) * 100) : 0;

		return {
			totalChapters,
			readCount,
			inProgressCount,
			unreadCount,
			percentComplete
		};
	});

	// Subscribe to reading progress
	let progress = $state<ReadingProgress>({ lastChapter: null, readChapters: [] });
	$effect(() => {
		const unsubscribe = readingProgress.subscribe(value => {
			progress = value;
		});
		return unsubscribe;
	});

	function dismissContinueReading() {
		readingProgress.clearLastChapter();
	}

	// Map content types to their route paths
	const typeRoutes: Record<string, string> = {
		'chapter': 'chapters',
		'character': 'characters',
		'location': 'locations',
		'lore': 'lore',
		'worldbuilding': 'worldbuilding'
	};

	// Format relative time
	function formatRelativeTime(dateStr: string): string {
		const date = new Date(dateStr);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

		if (diffDays === 0) return 'Today';
		if (diffDays === 1) return 'Yesterday';
		if (diffDays < 7) return `${diffDays} days ago`;
		if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	const sections = $derived([
		{
			id: 'chapters',
			title: 'Chapters',
			icon: BookOpen,
			items: data.chapters,
			type: 'chapter' as const,
			route: 'chapters',
			emptyMessage: 'No chapters have been added yet.'
		},
		{
			id: 'characters',
			title: 'Characters',
			icon: Users,
			items: data.characters,
			type: 'character' as const,
			route: 'characters',
			emptyMessage: 'No characters have been created yet.'
		},
		{
			id: 'locations',
			title: 'Locations',
			icon: MapPin,
			items: data.locations,
			type: 'location' as const,
			route: 'locations',
			emptyMessage: 'No locations have been added yet.'
		},
		{
			id: 'lore',
			title: 'Lore',
			icon: Scroll,
			items: data.lore,
			type: 'lore' as const,
			route: 'lore',
			emptyMessage: 'No lore entries have been added yet.'
		},
		{
			id: 'worldbuilding',
			title: 'Worldbuilding',
			icon: Globe,
			items: data.worldbuilding,
			type: 'worldbuilding' as const,
			route: 'worldbuilding',
			emptyMessage: 'No worldbuilding entries have been added yet.'
		}
	]);

	const totalItems = $derived(
		data.chapters.length + data.characters.length + data.locations.length + data.lore.length + data.worldbuilding.length
	);
</script>

<svelte:head>
	<title>Canon Browser | Mythic Index</title>
	<meta name="description" content="Browse your story's chapters, characters, and locations" />
</svelte:head>

<div class="container py-8 px-4">
	<!-- Header -->
	<div class="mb-8">
		<h1 class="text-4xl font-bold tracking-tight mb-2">Canon Browser</h1>
		<p class="text-muted-foreground text-lg">
			Explore your world's lore, characters, and storylines
		</p>
		{#if !data.dbAvailable}
			<div class="mt-4 p-4 rounded-lg border border-amber-500/50 bg-amber-500/10">
				<p class="text-amber-600 dark:text-amber-400 text-sm">
					<strong>Database not connected.</strong> Run with <code class="bg-muted px-1 rounded">npm run dev</code> (uses wrangler) to enable D1 bindings.
				</p>
			</div>
		{:else if totalItems > 0}
			<p class="text-sm text-muted-foreground mt-2">
				{totalItems} item{totalItems !== 1 ? 's' : ''} in your canon
			</p>
		{/if}

		<!-- Search and Filter Row -->
		<div class="mt-6 flex flex-col sm:flex-row gap-4">
			<!-- Search Input -->
			<div class="relative flex-1 max-w-md">
				<Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
				<input
					bind:this={searchInputEl}
					bind:value={searchQuery}
					type="text"
					placeholder="Search canon..."
					class="w-full pl-10 pr-10 py-2.5 text-sm bg-muted/50 border border-transparent rounded-full focus:border-primary focus:bg-background focus:outline-none transition-all placeholder:text-muted-foreground"
					aria-label="Search canon content"
				/>
				{#if searchQuery}
					<button
						onclick={clearSearch}
						class="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted transition-colors"
						aria-label="Clear search"
					>
						<X class="h-4 w-4 text-muted-foreground" />
					</button>
				{/if}
			</div>

			<!-- View Toggle -->
			<div class="flex items-center gap-1 p-1 bg-muted/50 rounded-lg">
				<button
					onclick={() => viewMode = 'grid'}
					class="p-2 rounded-md transition-colors {viewMode === 'grid' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}"
					aria-label="Grid view"
					aria-pressed={viewMode === 'grid'}
				>
					<LayoutGrid class="h-4 w-4" />
				</button>
				<button
					onclick={() => viewMode = 'list'}
					class="p-2 rounded-md transition-colors {viewMode === 'list' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}"
					aria-label="List view"
					aria-pressed={viewMode === 'list'}
				>
					<List class="h-4 w-4" />
				</button>
			</div>
		</div>
	</div>

	<!-- Reading Stats Dashboard -->
	{#if data.chapters.length > 0 && data.dbAvailable}
		<div class="container px-4 mb-8">
			<div class="bg-gradient-to-br from-primary/5 via-primary/10 to-transparent rounded-xl border p-6">
				<div class="flex items-center gap-3 mb-4">
					<div class="p-2 rounded-lg bg-primary/20">
						<BarChart3 class="h-5 w-5 text-primary" />
					</div>
					<h2 class="text-lg font-semibold">Reading Progress</h2>
				</div>

				<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
					<!-- Total Progress -->
					<div class="bg-background/50 rounded-lg p-4 text-center">
						<div class="text-3xl font-bold text-primary">{readingStats.percentComplete}%</div>
						<div class="text-xs text-muted-foreground mt-1">Complete</div>
					</div>

					<!-- Read -->
					<button
						onclick={() => readingStatusFilter = readingStatusFilter === 'read' ? 'all' : 'read'}
						class="bg-background/50 rounded-lg p-4 text-center hover:bg-background/80 transition-colors {readingStatusFilter === 'read' ? 'ring-2 ring-green-500' : ''}"
					>
						<div class="flex items-center justify-center gap-1.5">
							<CheckCircle class="h-4 w-4 text-green-500" />
							<span class="text-2xl font-bold">{readingStats.readCount}</span>
						</div>
						<div class="text-xs text-muted-foreground mt-1">Read</div>
					</button>

					<!-- In Progress -->
					<button
						onclick={() => readingStatusFilter = readingStatusFilter === 'in-progress' ? 'all' : 'in-progress'}
						class="bg-background/50 rounded-lg p-4 text-center hover:bg-background/80 transition-colors {readingStatusFilter === 'in-progress' ? 'ring-2 ring-primary' : ''}"
					>
						<div class="flex items-center justify-center gap-1.5">
							<BookMarked class="h-4 w-4 text-primary" />
							<span class="text-2xl font-bold">{readingStats.inProgressCount}</span>
						</div>
						<div class="text-xs text-muted-foreground mt-1">In Progress</div>
					</button>

					<!-- Unread -->
					<button
						onclick={() => readingStatusFilter = readingStatusFilter === 'unread' ? 'all' : 'unread'}
						class="bg-background/50 rounded-lg p-4 text-center hover:bg-background/80 transition-colors {readingStatusFilter === 'unread' ? 'ring-2 ring-muted-foreground' : ''}"
					>
						<div class="flex items-center justify-center gap-1.5">
							<Circle class="h-4 w-4 text-muted-foreground" />
							<span class="text-2xl font-bold">{readingStats.unreadCount}</span>
						</div>
						<div class="text-xs text-muted-foreground mt-1">Unread</div>
					</button>
				</div>

				<!-- Progress Bar -->
				<div class="h-2 bg-muted rounded-full overflow-hidden">
					<div
						class="h-full bg-gradient-to-r from-green-500 to-primary rounded-full transition-all duration-500"
						style="width: {readingStats.percentComplete}%"
					></div>
				</div>

				<!-- Active Filter Indicator -->
				{#if readingStatusFilter !== 'all'}
					<div class="mt-3 flex items-center gap-2">
						<span class="text-xs text-muted-foreground">Filtering chapters by:</span>
						<span class="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded-full">
							{readingStatusFilter === 'read' ? 'Read' : readingStatusFilter === 'in-progress' ? 'In Progress' : 'Unread'}
							<button
								onclick={() => readingStatusFilter = 'all'}
								class="ml-0.5 hover:bg-primary/20 rounded-full p-0.5"
								aria-label="Clear filter"
							>
								<X class="h-3 w-3" />
							</button>
						</span>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Continue Reading Card -->
	{#if progress.lastChapter}
		<div class="mb-8">
			<div class="relative bg-gradient-to-r from-primary/10 via-primary/5 to-transparent rounded-xl border border-primary/20 p-6">
				<!-- Dismiss button -->
				<button
					onclick={dismissContinueReading}
					class="absolute top-3 right-3 p-1.5 rounded-full hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground"
					aria-label="Dismiss continue reading"
				>
					<X class="h-4 w-4" />
				</button>

				<div class="flex flex-col sm:flex-row sm:items-center gap-4">
					<div class="flex items-center gap-3">
						<div class="p-2.5 rounded-lg bg-primary/20">
							<BookOpen class="h-5 w-5 text-primary" />
						</div>
						<div>
							<p class="text-sm text-muted-foreground">Continue Reading</p>
							<h3 class="font-semibold text-lg">{progress.lastChapter.title}</h3>
						</div>
					</div>

					<div class="flex items-center gap-4 sm:ml-auto">
						<!-- Progress indicator -->
						<div class="flex items-center gap-2">
							<div class="w-24 h-2 bg-muted rounded-full overflow-hidden">
								<div
									class="h-full bg-primary rounded-full transition-all"
									style="width: {Math.round(progress.lastChapter.scrollPercent)}%"
								></div>
							</div>
							<span class="text-sm text-muted-foreground">
								{Math.round(progress.lastChapter.scrollPercent)}%
							</span>
						</div>

						<a
							href="/chapters/{progress.lastChapter.slug}"
							class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
						>
							Continue
							<ArrowRight class="h-4 w-4" />
						</a>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Latest Updates Section (hidden when searching) -->
	{#if data.recentItems.length > 0 && !searchQuery}
		<section class="mb-10" aria-labelledby="latest-updates-heading">
			<div class="flex items-center gap-3 mb-4">
				<div class="p-2 rounded-lg bg-amber-500/10">
					<Sparkles class="h-5 w-5 text-amber-500" aria-hidden="true" />
				</div>
				<h2 id="latest-updates-heading" class="text-xl font-semibold">Latest Updates</h2>
			</div>
			<div class="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
				{#each data.recentItems as item}
					<a
						href="/{typeRoutes[item.kind]}/{item.slug}"
						class="flex-shrink-0 w-64 group relative bg-card rounded-xl border hover:border-primary/50 hover:shadow-lg transition-all overflow-hidden"
					>
						{#if item.thumbnail}
							<div class="aspect-video relative overflow-hidden">
								<img
									src={item.thumbnail.src}
									alt={item.thumbnail.alt || item.title}
									class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
									loading="lazy"
								/>
								<div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
							</div>
						{:else}
							<div class="aspect-video bg-muted flex items-center justify-center">
								{#if item.kind === 'chapter'}
									<BookOpen class="h-8 w-8 text-muted-foreground/30" />
								{:else if item.kind === 'character'}
									<Users class="h-8 w-8 text-muted-foreground/30" />
								{:else if item.kind === 'location'}
									<MapPin class="h-8 w-8 text-muted-foreground/30" />
								{:else}
									<Scroll class="h-8 w-8 text-muted-foreground/30" />
								{/if}
							</div>
						{/if}
						<div class="p-3">
							<p class="text-xs text-muted-foreground capitalize mb-1">{item.kind}</p>
							<h3 class="font-medium line-clamp-1 group-hover:text-primary transition-colors">{item.title}</h3>
							<p class="text-xs text-muted-foreground mt-1 flex items-center gap-1">
								<Clock class="h-3 w-3" />
								{formatRelativeTime(item.updatedAt)}
							</p>
						</div>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Quick Navigation Tabs -->
	<nav class="flex gap-2 mb-8 overflow-x-auto pb-2" aria-label="Content sections">
		{#each sections as section}
			<a
				href="#{section.id}"
				class="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors whitespace-nowrap"
			>
				<section.icon class="h-4 w-4" aria-hidden="true" />
				{section.title}
				<span class="bg-background text-foreground px-2 py-0.5 rounded-full text-xs">
					{section.items.length}
				</span>
			</a>
		{/each}
	</nav>

	<!-- Content Sections -->
	<div class="space-y-12">
		{#each sections as section}
			{@const filteredItems = processItems(section.items, section.id)}
			<section id={section.id} class="scroll-mt-20" aria-labelledby="{section.id}-heading">
				<div class="flex items-center justify-between gap-3 mb-6">
					<div class="flex items-center gap-3">
						<div class="p-2 rounded-lg bg-primary/10">
							<section.icon class="h-5 w-5 text-primary" aria-hidden="true" />
						</div>
						<h2 id="{section.id}-heading" class="text-2xl font-semibold">
							{section.title}
						</h2>
					</div>
					{#if section.id !== 'chapters' && section.items.length > 1}
						<button
							onclick={() => toggleSort(section.id)}
							class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
							aria-label="Toggle sort order"
						>
							{#if sortModes[section.id] === 'alpha'}
								<ArrowUpAZ class="h-3.5 w-3.5" />
								A-Z
							{:else}
								<Clock class="h-3.5 w-3.5" />
								Recent
							{/if}
						</button>
					{/if}
				</div>

				{#if filteredItems.length > 0}
					{#if viewMode === 'grid'}
						<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
							{#each filteredItems as item (item.id)}
								<ContentCard
									title={item.title}
									slug={item.slug}
									type={section.type}
									wordCount={item.wordCount ?? undefined}
									href="/{section.route}/{item.slug}"
									thumbnail={item.thumbnail}
									summary={item.summary}
								/>
							{/each}
						</div>
					{:else}
						<!-- List View -->
						<div class="flex flex-col gap-2">
							{#each filteredItems as item (item.id)}
								<a
									href="/{section.route}/{item.slug}"
									class="group flex items-center gap-4 p-3 rounded-lg bg-card border hover:border-primary/50 hover:shadow-md transition-all"
								>
									{#if item.thumbnail}
										<div class="flex-shrink-0 w-16 h-16 rounded-md overflow-hidden bg-muted">
											<img
												src={item.thumbnail.src}
												alt={item.thumbnail.alt || item.title}
												class="w-full h-full object-cover group-hover:scale-105 transition-transform"
												loading="lazy"
											/>
										</div>
									{:else}
										<div class="flex-shrink-0 w-16 h-16 rounded-md bg-muted flex items-center justify-center">
											<section.icon class="h-6 w-6 text-muted-foreground/40" />
										</div>
									{/if}
									<div class="flex-1 min-w-0">
										<h3 class="font-medium group-hover:text-primary transition-colors truncate">{item.title}</h3>
										{#if item.summary}
											<p class="text-sm text-muted-foreground line-clamp-1 mt-0.5">{item.summary}</p>
										{/if}
									</div>
									{#if item.wordCount}
										<div class="flex-shrink-0 text-xs text-muted-foreground">
											{(item.wordCount / 1000).toFixed(1)}k words
										</div>
									{/if}
									<ArrowRight class="flex-shrink-0 h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
								</a>
							{/each}
						</div>
					{/if}
				{:else if searchQuery}
					<!-- No search results -->
					<div class="flex flex-col items-center justify-center py-8 px-4 rounded-xl bg-muted/30">
						<Search class="h-8 w-8 text-muted-foreground/50 mb-2" aria-hidden="true" />
						<p class="text-muted-foreground text-sm">No {section.title.toLowerCase()} match "{searchQuery}"</p>
					</div>
				{:else}
					<!-- No content at all -->
					<div class="flex flex-col items-center justify-center py-12 px-4 rounded-xl border border-dashed bg-muted/30">
						<section.icon class="h-12 w-12 text-muted-foreground/50 mb-4" aria-hidden="true" />
						<p class="text-muted-foreground text-center">{section.emptyMessage}</p>
						<a
							href="/admin/upload"
							class="mt-4 text-sm text-primary hover:underline"
						>
							Upload content to get started
						</a>
					</div>
				{/if}
			</section>
		{/each}
	</div>
</div>
