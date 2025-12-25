<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page as pageStore } from '$app/stores';
	import { ChevronLeft, ChevronRight, Calendar, ArrowUp, User } from 'lucide-svelte';
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

	// All images for masonry gallery (keep original order, profile/hero first)
	const allImages = $derived(() => {
		if (data.images.length === 0) return [];

		const profileImg = data.images.find(i => i.role === 'hero' || i.role === 'profile');
		const otherImages = data.images.filter(i => i !== profileImg);

		return profileImg ? [profileImg, ...otherImages] : data.images;
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
	<meta name="description" content="Learn about {data.item.title} on Mythic Index" />
</svelte:head>

<article class="container py-8 px-4 max-w-4xl">
	<!-- Header -->
	<header class="mb-8">
		<!-- Breadcrumb -->
		<nav class="flex items-center gap-2 text-sm text-muted-foreground mb-6" aria-label="Breadcrumb">
			<a href="/canon" class="hover:text-foreground transition-colors">Canon</a>
			<ChevronRight class="h-4 w-4" aria-hidden="true" />
			<a href="/canon#characters" class="hover:text-foreground transition-colors">Characters</a>
		</nav>
	</header>

	<!-- Character Profile Section with color bleed effect -->
	<div class="character-profile-section relative grid md:grid-cols-[360px_1fr] gap-8 mb-12">
		<!-- Masonry Image Gallery & Quick Facts -->
		<aside class="md:sticky md:top-8 h-fit space-y-4">
			{#if allImages().length > 0}
				<!-- Scrollable Masonry Gallery -->
				<div class="max-h-[600px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent hover:scrollbar-thumb-muted-foreground/40 transition-colors">
					<MasonryGallery
						images={allImages()}
						onImageClick={openLightboxForImage}
						aspectRatio="portrait"
					/>
				</div>
			{:else}
				<!-- Placeholder when no images -->
				<div class="w-full rounded-2xl bg-muted aspect-[3/4] flex items-center justify-center">
					<User class="h-24 w-24 text-muted-foreground/30" />
				</div>
			{/if}

			<!-- Quick Facts Card -->
			<QuickFactsCard metadata={data.metadata ?? {}} kind="character" />
		</aside>

		<!-- Character Info -->
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
					<User class="h-4 w-4" aria-hidden="true" />
					Character
				</span>
				<span class="inline-flex items-center gap-1.5">
					<span class="text-muted-foreground/50" aria-hidden="true">•</span>
					<Calendar class="h-4 w-4" aria-hidden="true" />
					Updated {formattedDate}
				</span>
			</div>

			<!-- Content -->
			<div class="space-y-8">
				{#if data.mode === 'entity' && data.character}
					<!-- Structured Profile Sections -->

					<!-- Background -->
					{#if data.character.background}
						<section>
							<h2 class="text-xl font-semibold mb-3 text-foreground">Background</h2>
							<MarkdownContent content={data.character.background} class="text-muted-foreground leading-relaxed" />
						</section>
					{/if}

					<!-- Personality -->
					{#if data.character.personality.archetype || data.character.personality.temperament || data.character.personality.positiveTraits.length > 0 || data.character.personality.negativeTraits.length > 0}
						<section>
							<h2 class="text-xl font-semibold mb-3 text-foreground">Personality</h2>
							<div class="space-y-3">
								{#if data.character.personality.archetype}
									<p class="text-muted-foreground"><span class="font-medium text-foreground">Archetype:</span> {data.character.personality.archetype}</p>
								{/if}
								{#if data.character.personality.temperament}
									<p class="text-muted-foreground"><span class="font-medium text-foreground">Temperament:</span> {data.character.personality.temperament}</p>
								{/if}
								{#if data.character.personality.moralAlignment}
									<p class="text-muted-foreground"><span class="font-medium text-foreground">Alignment:</span> {data.character.personality.moralAlignment}</p>
								{/if}
								{#if data.character.personality.positiveTraits.length > 0}
									<div>
										<span class="font-medium text-foreground">Positive Traits:</span>
										<div class="flex flex-wrap gap-2 mt-1">
											{#each data.character.personality.positiveTraits as trait}
												<span class="px-2 py-1 text-sm bg-green-500/10 text-green-600 dark:text-green-400 rounded-full">{trait}</span>
											{/each}
										</div>
									</div>
								{/if}
								{#if data.character.personality.negativeTraits.length > 0}
									<div>
										<span class="font-medium text-foreground">Negative Traits:</span>
										<div class="flex flex-wrap gap-2 mt-1">
											{#each data.character.personality.negativeTraits as trait}
												<span class="px-2 py-1 text-sm bg-red-500/10 text-red-600 dark:text-red-400 rounded-full">{trait}</span>
											{/each}
										</div>
									</div>
								{/if}
							</div>
						</section>
					{/if}

					<!-- Motivations & Fears -->
					{#if data.character.motivations.length > 0 || data.character.fears.length > 0}
						<section>
							<h2 class="text-xl font-semibold mb-3 text-foreground">Motivations & Fears</h2>
							<div class="space-y-3">
								{#if data.character.motivations.length > 0}
									<div>
										<span class="font-medium text-foreground">Motivations:</span>
										<div class="flex flex-wrap gap-2 mt-1">
											{#each data.character.motivations as motivation}
												<span class="px-2 py-1 text-sm bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full">{motivation}</span>
											{/each}
										</div>
									</div>
								{/if}
								{#if data.character.fears.length > 0}
									<div>
										<span class="font-medium text-foreground">Fears:</span>
										<div class="flex flex-wrap gap-2 mt-1">
											{#each data.character.fears as fear}
												<span class="px-2 py-1 text-sm bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-full">{fear}</span>
											{/each}
										</div>
									</div>
								{/if}
							</div>
						</section>
					{/if}

					<!-- Combat -->
					{#if data.character.combat.primaryWeapons || data.character.combat.fightingStyle || data.character.combat.tacticalRole}
						<section>
							<h2 class="text-xl font-semibold mb-3 text-foreground">Combat</h2>
							<div class="space-y-2">
								{#if data.character.combat.primaryWeapons}
									<p class="text-muted-foreground"><span class="font-medium text-foreground">Primary Weapons:</span> {data.character.combat.primaryWeapons}</p>
								{/if}
								{#if data.character.combat.fightingStyle}
									<p class="text-muted-foreground"><span class="font-medium text-foreground">Fighting Style:</span> {data.character.combat.fightingStyle}</p>
								{/if}
								{#if data.character.combat.tacticalRole}
									<p class="text-muted-foreground"><span class="font-medium text-foreground">Tactical Role:</span> {data.character.combat.tacticalRole}</p>
								{/if}
							</div>
						</section>
					{/if}

					<!-- Voice -->
					{#if data.character.voice.speechStyle || data.character.voice.signaturePhrases.length > 0}
						<section>
							<h2 class="text-xl font-semibold mb-3 text-foreground">Voice & Speech</h2>
							<div class="space-y-3">
								{#if data.character.voice.speechStyle}
									<p class="text-muted-foreground"><span class="font-medium text-foreground">Speech Style:</span> {data.character.voice.speechStyle}</p>
								{/if}
								{#if data.character.voice.signaturePhrases.length > 0}
									<div>
										<span class="font-medium text-foreground">Signature Phrases:</span>
										<ul class="mt-1 space-y-1">
											{#each data.character.voice.signaturePhrases as phrase}
												<li class="text-muted-foreground italic">"{phrase}"</li>
											{/each}
										</ul>
									</div>
								{/if}
							</div>
						</section>
					{/if}

					<!-- Relationships -->
					{#if data.relationships && data.relationships.length > 0}
						<section>
							<h2 class="text-xl font-semibold mb-3 text-foreground">Relationships</h2>
							<div class="grid gap-3">
								{#each data.relationships as rel}
									<a href="/characters/{rel.targetSlug}" class="flex items-center justify-between p-3 rounded-lg border hover:border-primary/50 hover:bg-muted/50 transition-all group">
										<div>
											<span class="font-medium group-hover:text-primary transition-colors">{rel.targetName}</span>
											{#if rel.description}
												<p class="text-sm text-muted-foreground">{rel.description}</p>
											{/if}
										</div>
										<span class="px-2 py-1 text-xs bg-muted rounded-full capitalize">{rel.type}</span>
									</a>
								{/each}
							</div>
						</section>
					{/if}

					<!-- Additional Info -->
					{#if data.character.faction || data.character.occupation}
						<section>
							<h2 class="text-xl font-semibold mb-3 text-foreground">Affiliations</h2>
							<div class="space-y-2">
								{#if data.character.faction}
									<p class="text-muted-foreground"><span class="font-medium text-foreground">Faction:</span> {data.character.faction}</p>
								{/if}
								{#if data.character.occupation}
									<p class="text-muted-foreground"><span class="font-medium text-foreground">Occupation:</span> {data.character.occupation}</p>
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

	<!-- Navigation Footer -->
	<footer class="mt-16 pt-8 border-t">
		<nav class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4" aria-label="Character navigation">
			{#if data.navigation?.prev}
				<a
					href="/characters/{data.navigation.prev.slug}"
					class="group flex items-center gap-3 p-4 rounded-xl border hover:border-primary/50 hover:bg-muted/50 transition-all flex-1"
				>
					<ChevronLeft class="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" aria-hidden="true" />
					<div class="min-w-0">
						<p class="text-xs text-muted-foreground mb-1">Previous Character</p>
						<p class="font-medium truncate group-hover:text-primary transition-colors">{data.navigation.prev.title}</p>
					</div>
				</a>
			{:else}
				<div class="flex-1"></div>
			{/if}

			{#if data.navigation?.next}
				<a
					href="/characters/{data.navigation.next.slug}"
					class="group flex items-center justify-end gap-3 p-4 rounded-xl border hover:border-primary/50 hover:bg-muted/50 transition-all flex-1 text-right"
				>
					<div class="min-w-0">
						<p class="text-xs text-muted-foreground mb-1">Next Character</p>
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
				href="/canon#characters"
				class="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
			>
				<ChevronLeft class="h-4 w-4" aria-hidden="true" />
				Back to Characters
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

<style>
	/* Portrait color bleed effect - subtle gradient accent behind the profile section */
	.character-profile-section::before {
		content: '';
		position: absolute;
		top: -2rem;
		left: -2rem;
		right: 50%;
		bottom: 50%;
		background: radial-gradient(
			ellipse at top left,
			hsl(var(--primary) / 0.08) 0%,
			hsl(var(--primary) / 0.03) 40%,
			transparent 70%
		);
		pointer-events: none;
		border-radius: 2rem;
		z-index: -1;
	}

	/* Dark mode: slightly more prominent for visibility */
	:global(.dark) .character-profile-section::before {
		background: radial-gradient(
			ellipse at top left,
			hsl(var(--primary) / 0.12) 0%,
			hsl(var(--primary) / 0.05) 40%,
			transparent 70%
		);
	}
</style>
