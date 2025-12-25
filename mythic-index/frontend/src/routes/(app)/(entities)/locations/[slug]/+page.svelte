<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page as pageStore } from '$app/stores';
	import { ChevronLeft, ChevronRight, Calendar, ArrowUp, MapPin } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import BlockParagraph from '$lib/components/blocks/BlockParagraph.svelte';
	import BlockDialogue from '$lib/components/blocks/BlockDialogue.svelte';
	import BlockHeading from '$lib/components/blocks/BlockHeading.svelte';
	import BlockImage from '$lib/components/blocks/BlockImage.svelte';
	import MarkdownContent from '$lib/components/MarkdownContent.svelte';
	import Lightbox from '$lib/components/Lightbox.svelte';
	import MasonryGallery from '$lib/components/MasonryGallery.svelte';
	import QuickFactsCard from '$lib/components/QuickFactsCard.svelte';
	import SectionNav, { type SectionItem } from '$lib/components/SectionNav.svelte';
	import { parseInlineMarkdown } from '$lib/utils/inline-markdown';
	import { sanitizeMarkdown, containsTBD, stripHeadingMarkers } from '$lib/utils/markdown-sanitizer';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	let showBackToTop = $state(false);
	let lightboxOpen = $state(false);
	let lightboxIndex = $state(0);

	function openLightbox(index: number) {
		lightboxIndex = index;
		lightboxOpen = true;

		// Update URL with shallow routing
		const url = new URL($pageStore.url);
		url.searchParams.set('image', String(index));
		goto(url.toString(), {
			replaceState: false,
			noScroll: true,
			keepFocus: true
		});
	}

	function openLightboxForImage(src: string, index: number) {
		lightboxIndex = index;
		lightboxOpen = true;

		// Update URL with shallow routing
		const url = new URL($pageStore.url);
		url.searchParams.set('image', String(index));
		goto(url.toString(), {
			replaceState: false,
			noScroll: true,
			keepFocus: true
		});
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

	// Lazy load marked for legacy content
	let markedHtml = $state<string | null>(null);

	// Format date
	const formattedDate = $derived(
		new Date(data.item.updatedAt || Date.now()).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		})
	);

	// All images for masonry gallery (keep original order, hero first)
	const allImages = $derived(() => {
		if (data.images.length === 0) return [];

		const heroImg = data.images.find(i => i.role === 'hero' || i.role === 'profile');
		const otherImages = data.images.filter(i => i !== heroImg);

		return heroImg ? [heroImg, ...otherImages] : data.images;
	});

	// Section navigation state
	let activeSectionId = $state<string | null>(null);

	// Slugify text for IDs
	function slugify(text: string): string {
		return text
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/(^-|-$)/g, '');
	}

	// Extract sections from headings
	const sections = $derived.by<SectionItem[]>(() => {
		if (data.mode !== 'blocks') return [];
		let headingIndex = 0;
		return data.blocks
			.filter(b => b.blockType === 'heading')
			.map(block => {
				const text = stripHeadingMarkers(block.textPayload || '').trim();
				const level = block.richPayload?.level || 2;
				headingIndex++;
				return {
					id: `section-${headingIndex}-${slugify(text)}`,
					text,
					level
				};
			})
			.filter(item => item.text.length > 0);
	});

	const hasSections = $derived(sections.length > 0);

	// Map block index to section ID for rendering
	const sectionIdByBlockIndex = $derived.by(() => {
		const map = new Map<number, string>();
		if (data.mode !== 'blocks') return map;
		let headingIndex = 0;
		data.blocks.forEach((block, idx) => {
			if (block.blockType === 'heading') {
				headingIndex++;
				const text = stripHeadingMarkers(block.textPayload || '').trim();
				map.set(idx, `section-${headingIndex}-${slugify(text)}`);
			}
		});
		return map;
	});

	onMount(() => {
		// Check for image query parameter (shallow routing)
		const imageParam = $pageStore.url.searchParams.get('image');
		if (imageParam) {
			const imageIndex = parseInt(imageParam, 10);
			if (!isNaN(imageIndex) && imageIndex >= 0 && imageIndex < allImages().length) {
				lightboxIndex = imageIndex;
				lightboxOpen = true;
			}
		}

		const handleScroll = () => {
			showBackToTop = window.scrollY > 500;
		};

		window.addEventListener('scroll', handleScroll, { passive: true });

		// Lazy load marked for legacy content with sanitization
		if (data.mode === 'legacy' && data.item.markdownContent) {
			import('marked').then(({ marked }) => {
				const sanitized = sanitizeMarkdown(data.item.markdownContent!);
				markedHtml = marked(sanitized) as string;
			});
		}

		// Set up IntersectionObserver for section tracking
		let sectionObserver: IntersectionObserver | null = null;
		if (hasSections) {
			sectionObserver = new IntersectionObserver(
				(entries) => {
					const visibleEntries = entries.filter(entry => entry.isIntersecting);
					if (visibleEntries.length > 0) {
						visibleEntries.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
						activeSectionId = visibleEntries[0].target.id;
					}
				},
				{
					rootMargin: '-10% 0px -60% 0px',
					threshold: 0
				}
			);

			// Observe sections after DOM is ready
			setTimeout(() => {
				const sectionElements = document.querySelectorAll('[id^="section-"]');
				sectionElements.forEach(el => sectionObserver?.observe(el));
			}, 100);
		}

		return () => {
			window.removeEventListener('scroll', handleScroll);
			sectionObserver?.disconnect();
		};
	});

	function scrollToTop() {
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}
</script>

<svelte:head>
	<title>{data.item.title} | Mythic Index</title>
	<meta name="description" content="Explore {data.item.title} on Mythic Index" />
</svelte:head>

<article class="container py-8 px-4 max-w-4xl">
	<!-- Header -->
	<header class="mb-8">
		<!-- Breadcrumb -->
		<nav class="flex items-center gap-2 text-sm text-muted-foreground mb-6" aria-label="Breadcrumb">
			<a href="/canon" class="hover:text-foreground transition-colors">Canon</a>
			<ChevronRight class="h-4 w-4" aria-hidden="true" />
			<a href="/canon#locations" class="hover:text-foreground transition-colors">Locations</a>
		</nav>
	</header>

	<!-- Location Layout with Masonry Gallery Sidebar -->
	<div class="grid md:grid-cols-[420px_1fr] gap-8 mb-12">
		<!-- Masonry Image Gallery & Quick Facts -->
		<aside class="md:sticky md:top-8 h-fit space-y-4">
			{#if allImages().length > 0}
				<!-- Scrollable Masonry Gallery -->
				<div class="max-h-[700px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent hover:scrollbar-thumb-muted-foreground/40 transition-colors">
					<MasonryGallery
						images={allImages()}
						onImageClick={openLightboxForImage}
						aspectRatio="landscape"
					/>
				</div>
			{:else}
				<!-- Placeholder when no images -->
				<div class="w-full rounded-2xl bg-muted aspect-video flex items-center justify-center">
					<MapPin class="h-24 w-24 text-muted-foreground/30" />
				</div>
			{/if}

			<!-- Quick Facts Card -->
			<QuickFactsCard metadata={data.metadata ?? {}} kind="location" />
		</aside>

		<!-- Location Info -->
		<div>
		<h1 class="text-4xl md:text-5xl font-bold tracking-tight mb-4 leading-tight">
			{data.item.title}
		</h1>

		{#if data.item.summary}
			<MarkdownContent
				content={data.item.summary}
				class="text-lg text-muted-foreground mb-6 leading-relaxed prose prose-lg dark:prose-invert max-w-none"
			/>
		{/if}

		<!-- Metadata -->
		<div class="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-8">
			<span class="inline-flex items-center gap-1.5">
				<MapPin class="h-4 w-4" aria-hidden="true" />
				Location
			</span>
			<span class="inline-flex items-center gap-1.5">
				<span class="text-muted-foreground/50" aria-hidden="true">•</span>
				<Calendar class="h-4 w-4" aria-hidden="true" />
				Updated {formattedDate}
			</span>
		</div>

		<!-- Content -->
		<div class="space-y-8">
			{#if data.mode === 'entity' && data.location}
				<!-- Structured Location Sections -->

				<!-- Visual Summary (architectural/visual breakdown) -->
				{#if data.location.visualSummary}
					<section>
						<h2 class="text-xl font-semibold mb-3 text-foreground">Visual Overview</h2>
						<div class="prose prose-sm dark:prose-invert max-w-none prose-p:text-muted-foreground prose-strong:text-foreground prose-li:text-muted-foreground">
							<MarkdownContent content={data.location.visualSummary} />
						</div>
					</section>
				{/if}

				<!-- Atmosphere -->
				{#if data.location.atmosphere}
					<section>
						<h2 class="text-xl font-semibold mb-3 text-foreground">Atmosphere</h2>
						<MarkdownContent content={data.location.atmosphere} class="text-muted-foreground leading-relaxed" />
					</section>
				{/if}

				<!-- History -->
				{#if data.location.history}
					<section>
						<h2 class="text-xl font-semibold mb-3 text-foreground">History</h2>
						<MarkdownContent content={data.location.history} class="text-muted-foreground leading-relaxed" />
					</section>
				{/if}

				<!-- Notable Landmarks -->
				{#if data.location.notableLandmarks && data.location.notableLandmarks.length > 0}
					<section>
						<h2 class="text-xl font-semibold mb-3 text-foreground">Notable Landmarks</h2>
						<ul class="space-y-2">
							{#each data.location.notableLandmarks as landmark}
								<li class="flex items-start gap-2 text-muted-foreground">
									<span class="text-primary mt-1">•</span>
									<span>{landmark}</span>
								</li>
							{/each}
						</ul>
					</section>
				{/if}

				<!-- Key Personnel -->
				{#if data.location.keyPersonnel && data.location.keyPersonnel.length > 0}
					<section>
						<h2 class="text-xl font-semibold mb-3 text-foreground">Key Personnel</h2>
						<div class="flex flex-wrap gap-2">
							{#each data.location.keyPersonnel as person}
								<a href="/characters/{person}" class="px-3 py-1.5 text-sm bg-muted hover:bg-muted/80 rounded-full transition-colors">
									{person}
								</a>
							{/each}
						</div>
					</section>
				{/if}

				<!-- Story Role -->
				{#if data.location.storyRole}
					<section>
						<h2 class="text-xl font-semibold mb-3 text-foreground">Story Role</h2>
						<div class="prose prose-sm dark:prose-invert max-w-none prose-p:text-muted-foreground prose-strong:text-foreground">
							<MarkdownContent content={data.location.storyRole} />
						</div>
					</section>
				{/if}

				<!-- Hazards & Dangers -->
				{#if data.location.hazardsDangers && data.location.hazardsDangers.length > 0}
					<section>
						<h2 class="text-xl font-semibold mb-3 text-foreground">Hazards & Dangers</h2>
						<ul class="space-y-2">
							{#each data.location.hazardsDangers as hazard}
								<li class="flex items-start gap-2 text-muted-foreground">
									<span class="text-amber-500 mt-1">⚠</span>
									<span>{hazard}</span>
								</li>
							{/each}
						</ul>
					</section>
				{/if}

				<!-- Connections -->
				{#if data.location.connections && data.location.connections.length > 0}
					<section>
						<h2 class="text-xl font-semibold mb-3 text-foreground">Connected Locations</h2>
						<div class="flex flex-wrap gap-2">
							{#each data.location.connections as connection}
								<span class="px-3 py-1.5 text-sm bg-muted rounded-full">
									{connection}
								</span>
							{/each}
						</div>
					</section>
				{/if}

				<!-- Accessibility -->
				{#if data.location.accessibility}
					<section>
						<h2 class="text-xl font-semibold mb-3 text-foreground">Accessibility</h2>
						<div class="prose prose-sm dark:prose-invert max-w-none prose-p:text-muted-foreground prose-strong:text-foreground">
							<MarkdownContent content={data.location.accessibility} />
						</div>
					</section>
				{/if}

				<!-- Child Locations -->
				{#if data.location.childLocations && data.location.childLocations.length > 0}
					<section>
						<h2 class="text-xl font-semibold mb-3 text-foreground">Sub-Locations</h2>
						<div class="grid gap-3">
							{#each data.location.childLocations as child}
								<a href="/locations/{child.slug}" class="flex items-center justify-between p-3 rounded-lg border hover:border-primary/50 hover:bg-muted/50 transition-all group">
									<span class="font-medium group-hover:text-primary transition-colors">{child.name}</span>
									{#if child.locationType}
										<span class="px-2 py-1 text-xs bg-muted rounded-full capitalize">{child.locationType}</span>
									{/if}
								</a>
							{/each}
						</div>
					</section>
				{/if}

				<!-- Zones -->
				{#if data.zones && data.zones.length > 0}
					<section>
						<h2 class="text-xl font-semibold mb-3 text-foreground">Zones</h2>
						<div class="space-y-4">
							{#each data.zones as zone}
								<div class="p-4 rounded-lg border bg-card">
									<div class="flex items-start justify-between mb-2">
										<div>
											<h3 class="font-medium text-foreground">{zone.name}</h3>
											{#if zone.locationWithin}
												<p class="text-sm text-muted-foreground mt-1">{zone.locationWithin}</p>
											{/if}
										</div>
										{#if zone.zoneType}
											<span class="px-2 py-1 text-xs bg-muted rounded-full capitalize shrink-0">
												{zone.zoneType}
											</span>
										{/if}
									</div>
									{#if zone.physicalDescription}
										<div class="mt-3 text-sm text-muted-foreground">
											<MarkdownContent content={zone.physicalDescription} />
										</div>
									{/if}
									{#if zone.narrativeFunction || zone.emotionalRegister}
										<div class="mt-3 flex flex-wrap gap-2 text-xs">
											{#if zone.narrativeFunction}
												<span class="px-2 py-1 bg-muted/50 rounded">
													<span class="font-medium text-foreground">Function:</span> {zone.narrativeFunction}
												</span>
											{/if}
											{#if zone.emotionalRegister}
												<span class="px-2 py-1 bg-muted/50 rounded">
													<span class="font-medium text-foreground">Register:</span> {zone.emotionalRegister}
												</span>
											{/if}
										</div>
									{/if}
									{#if zone.signatureDetails && zone.signatureDetails.length > 0}
										<div class="mt-3">
											<p class="text-xs font-medium text-foreground mb-1">Signature Details:</p>
											<div class="flex flex-wrap gap-1">
												{#each zone.signatureDetails as detail}
													<span class="px-2 py-0.5 text-xs bg-primary/10 text-primary rounded">{detail}</span>
												{/each}
											</div>
										</div>
									{/if}
									{#if zone.firstAppearance}
										<div class="mt-3 text-xs text-muted-foreground">
											<span class="font-medium text-foreground">First Appearance:</span>
											<a href="/chapters/{zone.firstAppearance.toLowerCase().replace(/[^a-z0-9]+/g, '-')}" class="text-primary hover:underline ml-1">
												{zone.firstAppearance}
											</a>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					</section>
				{/if}

				<!-- Parent Location -->
				{#if data.location.parentLocation}
					<section>
						<h2 class="text-xl font-semibold mb-3 text-foreground">Part Of</h2>
						<a href="/locations/{data.location.parentLocation.slug}" class="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-muted hover:bg-muted/80 rounded-full transition-colors">
							{data.location.parentLocation.name}
						</a>
					</section>
				{/if}

				<!-- Location Details -->
				{#if data.location.locationType || data.location.region || data.location.significanceLevel || data.location.firstAppearance}
					<section>
						<h2 class="text-xl font-semibold mb-3 text-foreground">Details</h2>
						<div class="space-y-2">
							{#if data.location.locationType}
								<p class="text-muted-foreground"><span class="font-medium text-foreground">Type:</span> <span class="capitalize">{data.location.locationType}</span></p>
							{/if}
							{#if data.location.region}
								<p class="text-muted-foreground"><span class="font-medium text-foreground">Region:</span> {data.location.region}</p>
							{/if}
							{#if data.location.significanceLevel}
								<p class="text-muted-foreground"><span class="font-medium text-foreground">Significance:</span> {data.location.significanceLevel}</p>
							{/if}
							{#if data.location.firstAppearance}
								<p class="text-muted-foreground">
									<span class="font-medium text-foreground">First Appearance:</span>
									<a href="/chapters/{data.location.firstAppearance.toLowerCase().replace(/[^a-z0-9]+/g, '-')}" class="text-primary hover:underline">{data.location.firstAppearance}</a>
								</p>
							{/if}
						</div>
					</section>
				{/if}

			{:else if data.mode === 'blocks'}
				<div class="prose prose-lg dark:prose-invert max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-p:leading-relaxed prose-p:text-foreground/90 prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-blockquote:border-l-primary prose-blockquote:bg-muted/30 prose-blockquote:py-1 prose-blockquote:px-4 prose-blockquote:rounded-r prose-img:rounded-xl prose-img:shadow-lg space-y-4">
					{#each data.blocks as block, blockIndex}
						{@const cleanText = sanitizeMarkdown(block.textPayload || '').trim()}
						{#if cleanText && !containsTBD(cleanText)}
							{#if block.blockType === 'heading'}
								<BlockHeading text={stripHeadingMarkers(cleanText)} level={block.richPayload?.level || 2} id={sectionIdByBlockIndex.get(blockIndex)} />
							{:else if block.blockType === 'dialogue'}
								<BlockDialogue text={cleanText} />
							{:else if block.blockType === 'paragraph'}
								<BlockParagraph text={cleanText} />
							{:else if block.blockType === 'image'}
								<BlockImage
									src={block.richPayload?.src || ''}
									alt={block.richPayload?.alt || cleanText || ''}
								/>
							{:else if block.blockType === 'list'}
								<li class="ml-4">{@html parseInlineMarkdown(cleanText.replace(/^[*-]\s/, '') || '')}</li>
							{:else}
								<MarkdownContent content={cleanText} />
							{/if}
						{/if}
					{/each}
				</div>
			{:else}
				<!-- Legacy Markdown -->
				<div class="prose prose-lg dark:prose-invert max-w-none">
					{#if markedHtml}
						{@html markedHtml}
					{:else if data.item.markdownContent}
						<div class="animate-pulse space-y-4">
							<div class="h-4 bg-muted rounded w-full"></div>
							<div class="h-4 bg-muted rounded w-5/6"></div>
							<div class="h-4 bg-muted rounded w-4/6"></div>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	<!-- Lightbox for all images -->
	{#if lightboxOpen && allImages().length > 0}
		<Lightbox
			images={allImages()}
			initialIndex={lightboxIndex}
			onclose={closeLightbox}
			shallowRouting={true}
		/>
	{/if}

	</div>

	<!-- Navigation Footer -->
	<footer class="mt-16 pt-8 border-t">
		<nav class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4" aria-label="Location navigation">
			{#if data.navigation?.prev}
				<a
					href="/locations/{data.navigation.prev.slug}"
					class="group flex items-center gap-3 p-4 rounded-xl border hover:border-primary/50 hover:bg-muted/50 transition-all flex-1"
				>
					<ChevronLeft class="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" aria-hidden="true" />
					<div class="min-w-0">
						<p class="text-xs text-muted-foreground mb-1">Previous Location</p>
						<p class="font-medium truncate group-hover:text-primary transition-colors">{data.navigation.prev.title}</p>
					</div>
				</a>
			{:else}
				<div class="flex-1"></div>
			{/if}

			{#if data.navigation?.next}
				<a
					href="/locations/{data.navigation.next.slug}"
					class="group flex items-center justify-end gap-3 p-4 rounded-xl border hover:border-primary/50 hover:bg-muted/50 transition-all flex-1 text-right"
				>
					<div class="min-w-0">
						<p class="text-xs text-muted-foreground mb-1">Next Location</p>
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
				href="/canon#locations"
				class="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
			>
				<ChevronLeft class="h-4 w-4" aria-hidden="true" />
				Back to Locations
			</a>
		</div>
	</footer>
</article>

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

<!-- Section Navigation -->
{#if hasSections}
	<SectionNav sections={sections} activeId={activeSectionId} />
{/if}
