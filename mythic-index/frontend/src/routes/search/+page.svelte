<script lang="ts">
	import { enhance } from '$app/forms';
	import { Search, Sparkles, ExternalLink, FileText, User, MapPin, BookOpen } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import type { ActionData } from './$types';

	interface Props {
		form: ActionData;
	}

	let { form }: Props = $props();
	let searching = $state(false);
	let query = $state('');
	let kindFilter = $state<'chapter' | 'character' | 'location' | ''>('');

	const kindLabels: Record<string, string> = {
		chapter: 'Chapter',
		character: 'Character',
		location: 'Location'
	};

	const kindIcons = {
		chapter: BookOpen,
		character: User,
		location: MapPin
	};

	function getEntityRoute(kind: string, slug: string): string {
		if (kind === 'chapter') return `/chapters/${slug}`;
		if (kind === 'character') return `/characters/${slug}`;
		if (kind === 'location') return `/locations/${slug}`;
		return `/canon/${slug}`;
	}
</script>

<svelte:head>
	<title>Semantic Search | Mythic Index</title>
	<meta name="description" content="Search your story using AI-powered semantic search" />
</svelte:head>

<div class="container py-8 px-4 max-w-4xl">
	<!-- Header -->
	<div class="text-center mb-8">
		<div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
			<Sparkles class="h-4 w-4" aria-hidden="true" />
			AI-Powered
		</div>
		<h1 class="text-4xl font-bold tracking-tight mb-3">Semantic Search</h1>
		<p class="text-muted-foreground text-lg max-w-2xl mx-auto">
			Ask questions about your story or search for concepts, themes, and connections
		</p>
	</div>

	<!-- Search Form -->
	<form
		method="POST"
		use:enhance={() => {
			searching = true;
			return async ({ update }) => {
				searching = false;
				await update();
			};
		}}
		class="mb-8"
	>
		<div class="flex gap-3">
			<div class="relative flex-1">
				<Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
				<Input
					type="text"
					name="query"
					bind:value={query}
					placeholder="Search for chapters, characters, or locations..."
					class="pl-10 h-12 text-base"
					required
					aria-label="Search query"
				/>
			</div>
			<Button type="submit" disabled={searching} size="lg" class="h-12 px-6">
				{#if searching}
					<span class="flex items-center gap-2">
						<span class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true"></span>
						Searching...
					</span>
				{:else}
					Search
				{/if}
			</Button>
		</div>

		<!-- Filter Buttons -->
		<div class="flex gap-2 mt-3">
			<input type="hidden" name="kind" bind:value={kindFilter} />
			<button
				type="button"
				onclick={() => kindFilter = ''}
				class="px-3 py-1 rounded-full text-sm transition-colors {kindFilter === '' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}"
			>
				All
			</button>
			<button
				type="button"
				onclick={() => kindFilter = 'chapter'}
				class="px-3 py-1 rounded-full text-sm transition-colors {kindFilter === 'chapter' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}"
			>
				Chapters
			</button>
			<button
				type="button"
				onclick={() => kindFilter = 'character'}
				class="px-3 py-1 rounded-full text-sm transition-colors {kindFilter === 'character' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}"
			>
				Characters
			</button>
			<button
				type="button"
				onclick={() => kindFilter = 'location'}
				class="px-3 py-1 rounded-full text-sm transition-colors {kindFilter === 'location' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}"
			>
				Locations
			</button>
		</div>

		<p class="text-sm text-muted-foreground mt-2">
			Try: "dragon battle", "character development", or "mysterious locations"
		</p>
	</form>

	<!-- Loading State -->
	{#if searching}
		<div class="space-y-4" aria-busy="true" aria-label="Loading search results">
			{#each Array(3) as _}
				<div class="p-6 rounded-xl border bg-card">
					<div class="flex justify-between items-start mb-3">
						<Skeleton class="h-6 w-48" />
						<Skeleton class="h-5 w-16 rounded-full" />
					</div>
					<Skeleton class="h-4 w-full mb-2" />
					<Skeleton class="h-4 w-3/4" />
				</div>
			{/each}
		</div>
	{/if}

	<!-- Results -->
	{#if form?.results && !searching}
		<div class="space-y-4" role="region" aria-label="Search results">
			<p class="text-sm text-muted-foreground mb-4">
				Found {form.results.length} result{form.results.length !== 1 ? 's' : ''}
			</p>

			{#each form.results as result, i}
				{@const Icon = kindIcons[result.contentKind as keyof typeof kindIcons] || FileText}
				<article class="group p-6 rounded-xl border bg-card hover:border-primary/50 hover:shadow-md transition-all">
					<div class="flex justify-between items-start gap-4 mb-3">
						<a
							href={getEntityRoute(result.contentKind, result.contentSlug)}
							class="text-xl font-semibold hover:text-primary transition-colors flex items-center gap-2"
						>
							{result.contentTitle}
							<ExternalLink class="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
						</a>
						<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary whitespace-nowrap">
							{(result.score * 100).toFixed(0)}% match
						</span>
					</div>

					<p class="text-muted-foreground leading-relaxed mb-3">
						{result.text}
					</p>

					<div class="flex items-center gap-3 text-xs text-muted-foreground">
						<span class="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-muted">
							<Icon class="h-3 w-3" aria-hidden="true" />
							{kindLabels[result.contentKind] || result.contentKind}
						</span>
					</div>
				</article>
			{/each}

			{#if form.results.length === 0}
				<div class="flex flex-col items-center justify-center py-16 px-4 rounded-xl border border-dashed bg-muted/30">
					<Search class="h-12 w-12 text-muted-foreground/50 mb-4" aria-hidden="true" />
					<p class="text-lg font-medium mb-2">No results found</p>
					<p class="text-muted-foreground text-center max-w-md">
						Try different keywords or phrases. Semantic search works best with natural language questions.
					</p>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Initial State -->
	{#if !form?.results && !searching}
		<div class="flex flex-col items-center justify-center py-16 px-4 rounded-xl border border-dashed bg-muted/30">
			<Search class="h-12 w-12 text-muted-foreground/50 mb-4" aria-hidden="true" />
			<p class="text-lg font-medium mb-2">Start exploring your story</p>
			<p class="text-muted-foreground text-center max-w-md">
				Enter a question or concept above to discover relevant passages, characters, and scenes.
			</p>
		</div>
	{/if}
</div>
