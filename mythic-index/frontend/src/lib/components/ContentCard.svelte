<script lang="ts">
	import { BookOpen, Users, MapPin, Scroll, Globe, FileText, Check, BookMarked } from 'lucide-svelte';
	import { cn } from '$lib/utils/cn';
	import { readingProgress, type ReadingProgress } from '$lib/stores/reading-progress';

	interface Thumbnail {
		src: string;
		alt: string;
	}

	interface Props {
		title: string;
		slug: string;
		type: 'chapter' | 'character' | 'location' | 'lore' | 'worldbuilding';
		wordCount?: number;
		href: string;
		thumbnail?: Thumbnail | null;
		summary?: string | null;
		class?: string;
	}

	let { title, slug, type, wordCount, href, thumbnail, summary, class: className }: Props = $props();

	const icons = {
		chapter: BookOpen,
		character: Users,
		location: MapPin,
		lore: Scroll,
		worldbuilding: Globe
	};

	const Icon = $derived(icons[type] || FileText);

	let imgError = $state(false);

	// Reading progress state for chapters
	let progress = $state<ReadingProgress>({ lastChapter: null, readChapters: [] });
	$effect(() => {
		const unsubscribe = readingProgress.subscribe(value => {
			progress = value;
		});
		return unsubscribe;
	});

	// Determine reading status for chapters
	const isRead = $derived(type === 'chapter' && progress.readChapters.includes(slug));
	const isInProgress = $derived(
		type === 'chapter' &&
		progress.lastChapter?.slug === slug &&
		!isRead
	);
	const progressPercent = $derived(
		isInProgress && progress.lastChapter ? progress.lastChapter.scrollPercent : 0
	);
</script>

<a
	{href}
	class={cn(
		'group block rounded-xl border bg-card transition-all duration-200 overflow-hidden',
		'hover:border-primary/50 hover:shadow-lg hover:-translate-y-1',
		'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
		className
	)}
>
	{#if thumbnail && !imgError}
		<div class="aspect-video w-full overflow-hidden bg-muted relative">
			<img
				src={thumbnail.src}
				alt={thumbnail.alt}
				class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
				loading="lazy"
				onerror={() => imgError = true}
			/>
			<!-- Reading status badge for chapters -->
			{#if isRead}
				<div class="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/90 text-white text-xs font-medium shadow-sm">
					<Check class="h-3 w-3" />
					<span>Read</span>
				</div>
			{:else if isInProgress}
				<div class="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full bg-primary/90 text-primary-foreground text-xs font-medium shadow-sm">
					<BookMarked class="h-3 w-3" />
					<span>{Math.round(progressPercent)}%</span>
				</div>
			{/if}
			<!-- Progress bar overlay for in-progress chapters -->
			{#if isInProgress}
				<div class="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
					<div class="h-full bg-primary transition-all" style="width: {progressPercent}%"></div>
				</div>
			{/if}
		</div>
	{:else if type === 'chapter' && (isRead || isInProgress)}
		<!-- Show badge even without thumbnail -->
		<div class="relative">
			{#if isRead}
				<div class="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/90 text-white text-xs font-medium shadow-sm z-10">
					<Check class="h-3 w-3" />
					<span>Read</span>
				</div>
			{:else if isInProgress}
				<div class="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full bg-primary/90 text-primary-foreground text-xs font-medium shadow-sm z-10">
					<BookMarked class="h-3 w-3" />
					<span>{Math.round(progressPercent)}%</span>
				</div>
			{/if}
		</div>
	{/if}
	<div class="p-4">
		<div class="flex items-start gap-3">
			<div class="p-2 rounded-lg bg-primary/10 shrink-0">
				<Icon class="h-4 w-4 text-primary" aria-hidden="true" />
			</div>
			<div class="min-w-0 flex-1">
				<h3 class="font-medium truncate group-hover:text-primary transition-colors">
					{title}
				</h3>
				<div class="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
					<span class="capitalize">{type}</span>
					{#if wordCount}
						<span class="text-muted-foreground/50">•</span>
						<span>{wordCount.toLocaleString()} words</span>
					{/if}
				</div>
			</div>
		</div>
		{#if summary}
			<p class="text-sm text-muted-foreground mt-2 line-clamp-2
				opacity-0 max-h-0 group-hover:opacity-100 group-hover:max-h-12 group-focus-visible:opacity-100 group-focus-visible:max-h-12
				transition-all duration-200 overflow-hidden">
				{summary}
			</p>
		{/if}
	</div>
</a>
