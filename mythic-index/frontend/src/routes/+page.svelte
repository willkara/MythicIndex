<script lang="ts">
	import { BookOpen, Users, MapPin, Scroll, Globe, Search, Library, ArrowRight, FileText } from 'lucide-svelte';

	let { data } = $props();

	function formatNumber(num: number): string {
		if (num >= 1000) {
			return (num / 1000).toFixed(1) + 'k';
		}
		return num.toString();
	}

	interface StatCard {
		label: string;
		value: number;
		icon: typeof BookOpen;
		href: string | null;
		format?: boolean;
	}

	const statCards = $derived<StatCard[]>(
		data.stats
			? [
					{ label: 'Chapters', value: data.stats.chapters, icon: BookOpen, href: '/canon#chapters' },
					{ label: 'Characters', value: data.stats.characters, icon: Users, href: '/canon#characters' },
					{ label: 'Locations', value: data.stats.locations, icon: MapPin, href: '/canon#locations' },
					{ label: 'Lore Entries', value: data.stats.lore, icon: Scroll, href: '/canon#lore' },
					{ label: 'Worldbuilding', value: data.stats.worldbuilding, icon: Globe, href: '/canon#worldbuilding' },
					{ label: 'Total Words', value: data.stats.totalWords, icon: FileText, format: true, href: null }
				]
			: []
	);

	const quickActions = [
		{
			title: 'Browse Canon',
			description: 'Explore chapters, characters, and locations',
			href: '/canon',
			icon: Library,
			primary: true
		},
		{
			title: 'Search',
			description: 'Find specific content in your world',
			href: '/search',
			icon: Search,
			primary: false
		}
	];
</script>

<svelte:head>
	<title>MemoryQuill | Mythic Index</title>
	<meta name="description" content="Your AI-powered companion for epic storytelling" />
</svelte:head>

<div class="min-h-screen">
	<!-- Hero Section -->
	<header class="border-b bg-gradient-to-b from-background to-muted/30">
		<div class="container py-12 px-4">
			<h1 class="text-4xl md:text-5xl font-bold tracking-tight mb-3">
				Welcome to MemoryQuill
			</h1>
			<p class="text-xl text-muted-foreground max-w-2xl">
				Your AI-powered companion for epic storytelling. Explore your world's lore, characters, and storylines.
			</p>
		</div>
	</header>

	<main class="container py-8 px-4 space-y-12">
		<!-- Database Warning -->
		{#if !data.dbAvailable}
			<div class="p-4 rounded-lg border border-amber-500/50 bg-amber-500/10">
				<p class="text-amber-600 dark:text-amber-400">
					<strong>Database not connected.</strong> Run with <code class="bg-muted px-1.5 py-0.5 rounded text-sm">npm run dev</code> (uses wrangler) to enable D1 bindings and see your content.
				</p>
			</div>
		{/if}

		<!-- Quick Actions -->
		<section>
			<h2 class="text-2xl font-semibold mb-6">Get Started</h2>
			<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
				{#each quickActions as action}
					<a
						href={action.href}
						class="group relative flex items-center gap-4 p-6 rounded-xl border bg-card hover:bg-accent/50 transition-colors"
						class:ring-2={action.primary}
						class:ring-primary={action.primary}
					>
						<div class="p-3 rounded-lg bg-primary/10 text-primary">
							<action.icon class="h-6 w-6" />
						</div>
						<div class="flex-1">
							<h3 class="font-semibold text-lg">{action.title}</h3>
							<p class="text-sm text-muted-foreground">{action.description}</p>
						</div>
						<ArrowRight class="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
					</a>
				{/each}
			</div>
		</section>

		<!-- Statistics -->
		{#if data.stats}
			<section>
				<h2 class="text-2xl font-semibold mb-6">Your World at a Glance</h2>
				<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
					{#each statCards as card}
						{#if card.href}
							<a href={card.href} class="p-4 rounded-xl border bg-card hover:bg-accent/50 transition-colors">
								<div class="flex items-center gap-2 text-muted-foreground mb-2">
									<card.icon class="h-4 w-4" />
									<span class="text-sm">{card.label}</span>
								</div>
								<p class="text-2xl font-bold">
									{card.format ? formatNumber(card.value) : card.value}
								</p>
							</a>
						{:else}
							<div class="p-4 rounded-xl border bg-card">
								<div class="flex items-center gap-2 text-muted-foreground mb-2">
									<card.icon class="h-4 w-4" />
									<span class="text-sm">{card.label}</span>
								</div>
								<p class="text-2xl font-bold">
									{card.format ? formatNumber(card.value) : card.value}
								</p>
							</div>
						{/if}
					{/each}
				</div>
			</section>
		{/if}

		<!-- Recent Chapters -->
		{#if data.recentChapters.length > 0}
			<section>
				<div class="flex items-center justify-between mb-6">
					<h2 class="text-2xl font-semibold">Recent Chapters</h2>
					<a href="/canon#chapters" class="text-sm text-primary hover:underline">
						View all
					</a>
				</div>
				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					{#each data.recentChapters as chapter}
						<a
							href="/chapters/{chapter.slug}"
							class="group flex items-center gap-3 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
						>
							<BookOpen class="h-5 w-5 text-muted-foreground" />
							<span class="flex-1 font-medium truncate">{chapter.title}</span>
							<ArrowRight class="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
						</a>
					{/each}
				</div>
			</section>
		{/if}

		<!-- Empty State when no content -->
		{#if data.dbAvailable && data.stats && data.stats.chapters === 0 && data.stats.characters === 0}
			<section class="text-center py-12">
				<div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
					<Library class="h-8 w-8 text-muted-foreground" />
				</div>
				<h2 class="text-xl font-semibold mb-2">No Content Yet</h2>
				<p class="text-muted-foreground mb-4">
					Your world is waiting to be created. Upload your first chapter or character to get started.
				</p>
				<a
					href="/admin/upload"
					class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
				>
					Upload Content
					<ArrowRight class="h-4 w-4" />
				</a>
			</section>
		{/if}
	</main>
</div>
