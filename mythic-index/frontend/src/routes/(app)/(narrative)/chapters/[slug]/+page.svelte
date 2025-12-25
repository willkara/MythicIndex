<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page as pageStore } from '$app/stores';
	import { ChevronLeft, ChevronRight, Clock, Calendar, ArrowUp, BookOpen } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import BlockParagraph from '$lib/components/blocks/BlockParagraph.svelte';
	import BlockDialogue from '$lib/components/blocks/BlockDialogue.svelte';
	import BlockHeading from '$lib/components/blocks/BlockHeading.svelte';
	import BlockImage from '$lib/components/blocks/BlockImage.svelte';
	import BlockSceneMarker from '$lib/components/blocks/BlockSceneMarker.svelte';
	import MarkdownContent from '$lib/components/MarkdownContent.svelte';
	import Lightbox from '$lib/components/Lightbox.svelte';
	import SceneNavigator from '$lib/components/SceneNavigator.svelte';
	import ReaderToolbar from '$lib/components/ReaderToolbar.svelte';
	import TOCDrawer, { type TOCItem } from '$lib/components/TOCDrawer.svelte';
	import { ChapterLayout, SceneImageMargin, MarginNav, MobileSceneImage } from '$lib/components/chapter';
	import { parseInlineMarkdown } from '$lib/utils/inline-markdown';
	import { stripHeadingMarkers } from '$lib/utils/markdown-sanitizer';
	import { readingProgress, createDebouncedProgressUpdate } from '$lib/stores/reading-progress';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	// Responsive state
	let isMobile = $state(false);
	let isTablet = $state(false);

	// Reading progress
	let scrollProgress = $state(0);
	let showBackToTop = $state(false);

	// Scene navigation
	let sceneNavOpen = $state(false);
	let currentSceneId = $state<string | null>(null);

	// TOC state
	let tocOpen = $state(false);
	let currentHeadingId = $state<string | null>(null);

	// Extract headings for TOC
	function slugify(text: string): string {
		return text
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/(^-|-$)/g, '');
	}

	const tocItems = $derived.by<TOCItem[]>(() => {
		if (data.mode !== 'blocks') return [];
		let headingIndex = 0;
		return data.blocks
			.filter(b => b.blockType === 'heading')
			.map(block => {
				const text = stripHeadingMarkers(block.textPayload || '').trim();
				const level = block.richPayload?.level || 2;
				headingIndex++;
				return {
					id: `heading-${headingIndex}-${slugify(text)}`,
					text,
					level
				};
			});
	});

	const hasHeadings = $derived(tocItems.length > 0);

	// Map block indices to heading IDs for rendering
	const headingIdByBlockIndex = $derived.by(() => {
		const map = new Map<number, string>();
		if (data.mode !== 'blocks') return map;
		let headingIndex = 0;
		data.blocks.forEach((block, idx) => {
			if (block.blockType === 'heading') {
				headingIndex++;
				const text = stripHeadingMarkers(block.textPayload || '').trim();
				map.set(idx, `heading-${headingIndex}-${slugify(text)}`);
			}
		});
		return map;
	});

	// Lightbox state
	let lightboxOpen = $state(false);
	let lightboxIndex = $state(0);

	// Lazy load marked for legacy content
	let markedHtml = $state<string | null>(null);

	// Image categorization
	const sceneImages = $derived(data.images.filter(img => img.role === 'scene'));
	const actualHeroImages = $derived(data.images.filter(img => img.role === 'hero' || img.role === 'header'));
	const actualGalleryImages = $derived(data.images.filter(img => img.role === 'gallery'));

	// Hero images (displayed at top)
	const heroImages = $derived(
		actualHeroImages.length > 0 ? actualHeroImages : (sceneImages.length > 0 ? [sceneImages[0]] : [])
	);

	// All margin images (for the left sidebar) - scene images that aren't used as hero
	const marginImages = $derived(() => {
		const heroSrcs = new Set(heroImages.map(h => h.src));
		return data.images.filter(img =>
			(img.role === 'scene' || img.sceneId) && !heroSrcs.has(img.src)
		);
	});

	// Gallery images (displayed at bottom)
	const galleryImages = $derived(
		actualGalleryImages.length > 0
			? actualGalleryImages
			: (actualHeroImages.length === 0 && sceneImages.length > 1 ? sceneImages.slice(1) : [])
	);

	// All images for lightbox
	type ChapterImage = { src: string; alt: string; role: string; caption: string | null; sceneId: string | null; displayStyle: string; lqip: string | null };
	const lightboxImages = $derived(() => {
		const seen = new Set<string>();
		const result: ChapterImage[] = [];
		for (const img of data.images) {
			if (!seen.has(img.src)) {
				seen.add(img.src);
				result.push(img);
			}
		}
		return result;
	});

	// Group images by sceneId for mobile inline display
	const imagesByScene = $derived(() => {
		const map = new Map<string, typeof data.images>();
		for (const img of data.images) {
			if (img.sceneId) {
				const existing = map.get(img.sceneId) || [];
				map.set(img.sceneId, [...existing, img]);
			}
		}
		return map;
	});

	// Track which scene each block belongs to (for mobile inline images)
	const sceneStartBlocks = $derived.by(() => {
		const starts = new Map<number, string>();
		if (data.mode !== 'blocks') return starts;
		data.blocks.forEach((block, idx) => {
			if (block.blockType === 'scene_marker' && block.richPayload?.role === 'start' && block.richPayload?.sceneId) {
				starts.set(idx, block.richPayload.sceneId);
			}
		});
		return starts;
	});

	// Calculate reading time (avg 200 words per minute)
	const readingTime = $derived(
		data.item.wordCount ? Math.max(1, Math.ceil(data.item.wordCount / 200)) : null
	);

	// Format date
	const formattedDate = $derived(
		new Date(data.item.updatedAt || Date.now()).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		})
	);

	onMount(() => {
		// Check for image query parameter (shallow routing)
		const imageParam = $pageStore.url.searchParams.get('image');
		if (imageParam) {
			const imageIndex = parseInt(imageParam, 10);
			if (!isNaN(imageIndex) && imageIndex >= 0 && imageIndex < lightboxImages().length) {
				lightboxIndex = imageIndex;
				lightboxOpen = true;
			}
		}

		// Check responsive breakpoints
		const checkBreakpoints = () => {
			isMobile = window.innerWidth < 768;
			isTablet = window.innerWidth >= 768 && window.innerWidth < 1200;
		};
		checkBreakpoints();
		window.addEventListener('resize', checkBreakpoints);

		// Create debounced progress updater for localStorage
		const debouncedSaveProgress = createDebouncedProgressUpdate(1500);
		let hasMarkedAsRead = false;

		const handleScroll = () => {
			const windowHeight = window.innerHeight;
			const documentHeight = document.documentElement.scrollHeight - windowHeight;
			const scrollTop = window.scrollY;
			scrollProgress = documentHeight > 0 ? (scrollTop / documentHeight) * 100 : 0;
			showBackToTop = scrollTop > 500;

			// Save reading progress (debounced)
			debouncedSaveProgress(data.item.slug, data.item.title, scrollProgress);

			// Mark as read when reaching 80%+ (only once per session)
			if (!hasMarkedAsRead && scrollProgress >= 80) {
				readingProgress.markAsRead(data.item.slug);
				hasMarkedAsRead = true;
			}
		};

		window.addEventListener('scroll', handleScroll, { passive: true });

		// Lazy load marked for legacy content
		if (data.mode === 'legacy' && data.item.markdownContent) {
			import('marked').then(({ marked }) => {
				markedHtml = marked(data.item.markdownContent!) as string;
			});
		}

		// Set up scroll-spy for scene navigation
		let sceneObserver: IntersectionObserver | null = null;
		if (data.scenes.length > 0) {
			sceneObserver = new IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						if (entry.isIntersecting) {
							const sceneId = entry.target.id.replace('scene-', '');
							if (sceneId) {
								currentSceneId = sceneId;
							}
						}
					}
				},
				{
					rootMargin: '-10% 0px -70% 0px',
					threshold: 0
				}
			);

			setTimeout(() => {
				const sceneElements = document.querySelectorAll('[id^="scene-"]');
				sceneElements.forEach((el) => sceneObserver?.observe(el));
			}, 100);
		}

		// Set up scroll-spy for TOC headings
		let headingObserver: IntersectionObserver | null = null;
		if (hasHeadings) {
			headingObserver = new IntersectionObserver(
				(entries) => {
					const visibleEntries = entries.filter(e => e.isIntersecting);
					if (visibleEntries.length > 0) {
						visibleEntries.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
						currentHeadingId = visibleEntries[0].target.id;
					}
				},
				{
					rootMargin: '-10% 0px -60% 0px',
					threshold: 0
				}
			);

			setTimeout(() => {
				const headingElements = document.querySelectorAll('[id^="heading-"]');
				headingElements.forEach((el) => headingObserver?.observe(el));
			}, 100);
		}

		return () => {
			window.removeEventListener('scroll', handleScroll);
			window.removeEventListener('resize', checkBreakpoints);
			sceneObserver?.disconnect();
			headingObserver?.disconnect();
		};
	});

	function scrollToTop() {
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	function scrollToHeading(headingId: string) {
		const element = document.getElementById(headingId);
		if (element) {
			element.scrollIntoView({ behavior: 'smooth', block: 'start' });
			currentHeadingId = headingId;
		}
	}

	function scrollToScene(sceneId: string) {
		const element = document.getElementById(`scene-${sceneId}`);
		if (element) {
			element.scrollIntoView({ behavior: 'smooth', block: 'start' });
			currentSceneId = sceneId;
		}
	}

	function openLightboxForImage(imgSrc: string) {
		const images = lightboxImages();
		const idx = images.findIndex(img => img.src === imgSrc);
		if (idx >= 0) {
			lightboxIndex = idx;
			lightboxOpen = true;

			// Update URL with shallow routing
			const url = new URL($pageStore.url);
			url.searchParams.set('image', String(idx));
			goto(url.toString(), {
				replaceState: false,
				noScroll: true,
				keepFocus: true
			});
		}
	}

	function closeLightbox() {
		lightboxOpen = false;

		// Remove image param from URL
		const url = new URL($pageStore.url);
		url.searchParams.delete('image');
		goto(url.toString(), {
			replaceState: false,
			noScroll: true,
			keepFocus: true
		});
	}

	// Keyboard navigation
	function handleKeydown(event: KeyboardEvent) {
		// Don't trigger if user is typing in an input or lightbox is open
		const target = event.target as HTMLElement;
		if (['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable) return;
		if (lightboxOpen) return;

		switch (event.key) {
			case 'ArrowLeft':
				if (data.navigation?.prev) {
					event.preventDefault();
					goto(`/chapters/${data.navigation.prev.slug}`);
				}
				break;
			case 'ArrowRight':
				if (data.navigation?.next) {
					event.preventDefault();
					goto(`/chapters/${data.navigation.next.slug}`);
				}
				break;
			case 'Escape':
				if (tocOpen) {
					event.preventDefault();
					tocOpen = false;
				} else if (sceneNavOpen) {
					event.preventDefault();
					sceneNavOpen = false;
				}
				break;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
	<title>{data.item.title} | Mythic Index</title>
	<meta name="description" content="Read {data.item.title} on Mythic Index" />
</svelte:head>

<!-- Reader Toolbar with Progress Bar -->
<ReaderToolbar
	progress={scrollProgress}
	{tocOpen}
	onTocToggle={() => tocOpen = !tocOpen}
	showToc={hasHeadings}
/>

<ChapterLayout>
	<!-- Header snippet: Title, metadata, hero image -->
	{#snippet header()}
		<header class="mb-8 pt-8">
			<!-- Breadcrumb -->
			<nav class="flex items-center gap-2 text-sm text-muted-foreground mb-6" aria-label="Breadcrumb">
				<a href="/canon" class="hover:text-foreground transition-colors">Canon</a>
				<ChevronRight class="h-4 w-4" aria-hidden="true" />
				<a href="/canon#chapters" class="hover:text-foreground transition-colors">Chapters</a>
			</nav>

			<h1 class="text-4xl md:text-5xl font-bold tracking-tight mb-6 leading-tight">
				{data.item.title}
			</h1>

			<!-- Metadata -->
			<div class="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
				<span class="inline-flex items-center gap-1.5">
					<BookOpen class="h-4 w-4" aria-hidden="true" />
					Chapter
				</span>

				{#if data.item.wordCount}
					<span class="inline-flex items-center gap-1.5">
						<span class="text-muted-foreground/50" aria-hidden="true">•</span>
						{data.item.wordCount.toLocaleString()} words
					</span>
				{/if}

				{#if readingTime}
					<span class="inline-flex items-center gap-1.5">
						<span class="text-muted-foreground/50" aria-hidden="true">•</span>
						<Clock class="h-4 w-4" aria-hidden="true" />
						{readingTime} min read
					</span>
				{/if}

				<span class="inline-flex items-center gap-1.5">
					<span class="text-muted-foreground/50" aria-hidden="true">•</span>
					<Calendar class="h-4 w-4" aria-hidden="true" />
					{formattedDate}
				</span>
			</div>

			<!-- Hero Image - Cinematic Full-Bleed -->
			{#if heroImages.length > 0}
				<div class="mt-8 -mx-4 md:mx-0">
					{#each heroImages as img}
						<figure class="relative overflow-hidden md:rounded-xl">
							<img
								src={img.src}
								alt={img.alt}
								class="w-full aspect-[21/9] object-cover"
								loading="eager"
							/>
							{#if img.caption}
								<figcaption class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4 text-white text-sm text-center">
									{img.caption}
								</figcaption>
							{/if}
						</figure>
					{/each}
				</div>
			{/if}
		</header>
	{/snippet}

	<!-- Left margin: Scene-synced images -->
	{#snippet marginLeft()}
		<SceneImageMargin
			images={marginImages()}
			{currentSceneId}
			onImageClick={openLightboxForImage}
		/>
	{/snippet}

	<!-- Right margin: Navigation -->
	{#snippet marginRight()}
		<MarginNav
			scenes={data.scenes}
			{tocItems}
			{currentSceneId}
			{currentHeadingId}
			onSceneSelect={scrollToScene}
			onHeadingSelect={scrollToHeading}
		/>
	{/snippet}

	<!-- Main prose content -->
	<div class="reading-surface">
		<div class="prose prose-lg dark:prose-invert max-w-none
			prose-headings:font-semibold prose-headings:tracking-tight
			prose-p:leading-relaxed prose-p:text-foreground/90
			prose-a:text-primary prose-a:no-underline hover:prose-a:underline
			prose-blockquote:border-l-primary prose-blockquote:bg-muted/30 prose-blockquote:py-1 prose-blockquote:px-4 prose-blockquote:rounded-r
			prose-img:rounded-xl prose-img:shadow-lg
		">
		{#if data.mode === 'blocks'}
			{@const headingIds = headingIdByBlockIndex}
			{@const sceneStarts = sceneStartBlocks}
			{@const sceneImagesMap = imagesByScene()}
			<div class="space-y-4">
				{#each data.blocks as block, blockIndex}
					<!-- Mobile: Show scene image before scene starts -->
					{#if isMobile && sceneStarts.has(blockIndex)}
						{@const sceneId = sceneStarts.get(blockIndex)}
						{@const sceneImgs = sceneId ? sceneImagesMap.get(sceneId) : undefined}
						{#if sceneImgs && sceneImgs.length > 0}
							<MobileSceneImage
								src={sceneImgs[0].src}
								alt={sceneImgs[0].alt}
								caption={sceneImgs[0].caption}
								lqip={sceneImgs[0].lqip}
								sceneTitle={block.richPayload?.title}
								onclick={() => openLightboxForImage(sceneImgs[0].src)}
							/>
						{/if}
					{/if}

					<!-- Render the block content -->
					{#if block.blockType === 'heading'}
						<BlockHeading
							text={stripHeadingMarkers(block.textPayload || '')}
							level={block.richPayload?.level || 2}
							id={headingIds.get(blockIndex)}
						/>
					{:else if block.blockType === 'dialogue'}
						<BlockDialogue text={block.textPayload || ''} />
					{:else if block.blockType === 'paragraph'}
						<BlockParagraph text={block.textPayload || ''} />
					{:else if block.blockType === 'image'}
						<BlockImage
							src={block.richPayload?.src || ''}
							alt={block.richPayload?.alt || block.textPayload || ''}
						/>
					{:else if block.blockType === 'scene_marker' && block.richPayload?.role === 'start'}
						<BlockSceneMarker
							text={block.richPayload?.title || 'Scene Break'}
							sceneId={block.richPayload?.sceneId}
						/>
					{:else if block.blockType === 'list'}
						<li class="ml-4">{@html parseInlineMarkdown(block.textPayload?.replace(/^[*-]\s/, '') || '')}</li>
					{:else if block.textPayload}
						<MarkdownContent content={block.textPayload} />
					{/if}
				{/each}
			</div>
		{:else}
			<!-- Legacy Markdown -->
			{#if markedHtml}
				{@html markedHtml}
			{:else if data.item.markdownContent}
				<div class="animate-pulse space-y-4">
					<div class="h-4 bg-muted rounded w-full"></div>
					<div class="h-4 bg-muted rounded w-5/6"></div>
					<div class="h-4 bg-muted rounded w-4/6"></div>
				</div>
			{:else}
				<p class="text-muted-foreground italic">No content available.</p>
			{/if}
		{/if}
		</div>
	</div>

	<!-- Gallery Images -->
	{#if galleryImages.length > 0}
		<section class="mt-12 pt-8 border-t">
			<h2 class="text-xl font-semibold mb-6">Chapter Gallery</h2>
			<div class="grid grid-cols-2 md:grid-cols-3 gap-4">
				{#each galleryImages as img, i}
					<figure
						class="relative rounded-lg overflow-hidden shadow-md hover:shadow-lg transition-shadow cursor-pointer group"
						onclick={() => openLightboxForImage(img.src)}
						onkeydown={(e) => e.key === 'Enter' && openLightboxForImage(img.src)}
						tabindex="0"
						role="button"
					>
						<img
							src={img.src}
							alt={img.alt}
							class="w-full aspect-square object-cover group-hover:scale-105 transition-transform duration-300"
							loading="lazy"
						/>
						{#if img.caption}
							<figcaption class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity">
								{img.caption}
							</figcaption>
						{/if}
					</figure>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Navigation Footer -->
	<footer class="mt-16 pt-8 border-t">
		<nav class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4" aria-label="Chapter navigation">
			{#if data.navigation?.prev}
				<a
					href="/chapters/{data.navigation.prev.slug}"
					class="group flex items-center gap-3 p-4 rounded-xl border hover:border-primary/50 hover:bg-muted/50 transition-all flex-1"
				>
					<ChevronLeft class="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" aria-hidden="true" />
					<div class="min-w-0">
						<p class="text-xs text-muted-foreground mb-1">Previous Chapter</p>
						<p class="font-medium truncate group-hover:text-primary transition-colors">{data.navigation.prev.title}</p>
					</div>
				</a>
			{:else}
				<div class="flex-1"></div>
			{/if}

			{#if data.navigation?.next}
				<a
					href="/chapters/{data.navigation.next.slug}"
					class="group flex items-center justify-end gap-3 p-4 rounded-xl border hover:border-primary/50 hover:bg-muted/50 transition-all flex-1 text-right"
				>
					<div class="min-w-0">
						<p class="text-xs text-muted-foreground mb-1">Next Chapter</p>
						<p class="font-medium truncate group-hover:text-primary transition-colors">{data.navigation.next.title}</p>
					</div>
					<ChevronRight class="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" aria-hidden="true" />
				</a>
			{:else}
				<div class="flex-1"></div>
			{/if}
		</nav>

		<!-- Back to Canon -->
		<div class="mt-8 text-center">
			<a
				href="/canon#chapters"
				class="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
			>
				<ChevronLeft class="h-4 w-4" aria-hidden="true" />
				Back to Chapters
			</a>
		</div>
	</footer>
</ChapterLayout>

<!-- Back to Top Button -->
{#if showBackToTop}
	<Button
		onclick={scrollToTop}
		variant="secondary"
		size="icon"
		class="fixed bottom-6 right-6 rounded-full shadow-lg z-40"
		aria-label="Back to top"
	>
		<ArrowUp class="h-4 w-4" aria-hidden="true" />
	</Button>
{/if}

<!-- Scene Navigator (mobile/tablet drawer fallback) -->
{#if (isMobile || isTablet) && data.scenes.length > 0}
	<SceneNavigator
		scenes={data.scenes}
		{currentSceneId}
		onSceneSelect={scrollToScene}
		bind:isOpen={sceneNavOpen}
	/>
{/if}

<!-- TOC Drawer (mobile/tablet fallback) -->
{#if (isMobile || isTablet) && hasHeadings}
	<TOCDrawer
		items={tocItems}
		isOpen={tocOpen}
		activeId={currentHeadingId}
		onclose={() => tocOpen = false}
		onNavigate={scrollToHeading}
	/>
{/if}

<!-- Lightbox for all chapter images -->
{#if lightboxOpen}
	<Lightbox
		images={lightboxImages()}
		initialIndex={lightboxIndex}
		onclose={closeLightbox}
		shallowRouting={true}
	/>
{/if}
