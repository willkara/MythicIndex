<script lang="ts">
	import { onMount } from 'svelte';
	import { ChevronLeft, ChevronRight, Calendar, ArrowUp, Scroll } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import BlockParagraph from '$lib/components/blocks/BlockParagraph.svelte';
	import BlockDialogue from '$lib/components/blocks/BlockDialogue.svelte';
	import BlockHeading from '$lib/components/blocks/BlockHeading.svelte';
	import BlockImage from '$lib/components/blocks/BlockImage.svelte';
	import MarkdownContent from '$lib/components/MarkdownContent.svelte';
	import Lightbox from '$lib/components/Lightbox.svelte';
	import { parseInlineMarkdown } from '$lib/utils/inline-markdown';
	import { sanitizeMarkdown, containsTBD, stripHeadingMarkers } from '$lib/utils/markdown-sanitizer';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
	let showBackToTop = $state(false);
	let markedHtml = $state<string | null>(null);
	let lightboxOpen = $state(false);
	let lightboxIndex = $state(0);

	function openLightbox(index: number) {
		lightboxIndex = index;
		lightboxOpen = true;
	}

	const formattedDate = $derived(
		new Date(data.item.updatedAt || Date.now()).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		})
	);

	const heroImage = $derived(
		data.images.find(i => i.role === 'hero' || i.role === 'profile') || data.images[0]
	);

	// Gallery images (excluding hero)
	const galleryImages = $derived(
		data.images.filter(i => i !== heroImage)
	);

	onMount(() => {
		const handleScroll = () => {
			showBackToTop = window.scrollY > 500;
		};
		window.addEventListener('scroll', handleScroll, { passive: true });

		if (data.mode === 'legacy' && data.item.markdownContent) {
			import('marked').then(({ marked }) => {
				const sanitized = sanitizeMarkdown(data.item.markdownContent!);
				markedHtml = marked(sanitized) as string;
			});
		}

		return () => window.removeEventListener('scroll', handleScroll);
	});

	function scrollToTop() {
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}
</script>

<svelte:head>
	<title>{data.item.title} | Mythic Index</title>
	<meta name="description" content="Lore: {data.item.title} on Mythic Index" />
</svelte:head>

<article class="container py-8 px-4 max-w-3xl">
	<header class="mb-8">
		<nav class="flex items-center gap-2 text-sm text-muted-foreground mb-6" aria-label="Breadcrumb">
			<a href="/canon" class="hover:text-foreground transition-colors">Canon</a>
			<ChevronRight class="h-4 w-4" aria-hidden="true" />
			<a href="/canon#lore" class="hover:text-foreground transition-colors">Lore</a>
		</nav>

		<h1 class="text-4xl md:text-5xl font-bold tracking-tight mb-4 leading-tight">
			{data.item.title}
		</h1>

		{#if data.item.summary}
			<MarkdownContent
				content={data.item.summary}
				class="text-lg text-muted-foreground mb-6 leading-relaxed prose prose-lg dark:prose-invert max-w-none"
			/>
		{/if}

		<div class="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-8">
			<span class="inline-flex items-center gap-1.5">
				<Scroll class="h-4 w-4" aria-hidden="true" />
				Lore
			</span>
			<span class="inline-flex items-center gap-1.5">
				<span class="text-muted-foreground/50" aria-hidden="true">•</span>
				<Calendar class="h-4 w-4" aria-hidden="true" />
				Updated {formattedDate}
			</span>
		</div>
	</header>

	{#if heroImage?.src}
		<figure class="mb-8">
			<img src={heroImage.src} alt={heroImage.alt || data.item.title} class="w-full rounded-xl shadow-lg" loading="eager" />
			{#if heroImage.caption}
				<figcaption class="text-center text-sm text-muted-foreground mt-3">{heroImage.caption}</figcaption>
			{/if}
		</figure>
	{/if}

	<div class="prose prose-lg dark:prose-invert max-w-none prose-headings:font-semibold prose-p:leading-relaxed prose-a:text-primary">
		{#if data.mode === 'blocks'}
			<div class="space-y-4">
				{#each data.blocks as block}
					{@const cleanText = sanitizeMarkdown(block.textPayload || '').trim()}
					{#if cleanText && !containsTBD(cleanText)}
						{#if block.blockType === 'heading'}
							<BlockHeading text={stripHeadingMarkers(cleanText)} level={block.richPayload?.level || 2} />
						{:else if block.blockType === 'dialogue'}
							<BlockDialogue text={cleanText} />
						{:else if block.blockType === 'paragraph'}
							<BlockParagraph text={cleanText} />
						{:else if block.blockType === 'image'}
							<BlockImage src={block.richPayload?.src || ''} alt={block.richPayload?.alt || cleanText || ''} />
						{:else if block.blockType === 'list'}
							<li class="ml-4">{@html parseInlineMarkdown(cleanText.replace(/^[*-]\s/, '') || '')}</li>
						{:else}
							<MarkdownContent content={cleanText} />
						{/if}
					{/if}
				{/each}
			</div>
		{:else if markedHtml}
			{@html markedHtml}
		{:else if data.item.markdownContent}
			<div class="animate-pulse space-y-4">
				<div class="h-4 bg-muted rounded w-full"></div>
				<div class="h-4 bg-muted rounded w-5/6"></div>
			</div>
		{:else}
			<p class="text-muted-foreground italic">No content available.</p>
		{/if}
	</div>

	<!-- Gallery Section -->
	{#if galleryImages.length > 0}
		<section class="mt-12 pt-8 border-t">
			<h2 class="text-2xl font-semibold mb-6">Gallery</h2>
			<div class="grid grid-cols-2 md:grid-cols-3 gap-4">
				{#each galleryImages as image, i}
					<button
						onclick={() => openLightbox(i)}
						class="text-left focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-xl"
					>
						<figure>
							<img
								src={image.src}
								alt={image.alt}
								class="w-full rounded-xl shadow-md object-cover aspect-square hover:opacity-90 transition-opacity cursor-pointer"
								loading="lazy"
							/>
							{#if image.caption}
								<figcaption class="text-center text-sm text-muted-foreground mt-2">{image.caption}</figcaption>
							{/if}
						</figure>
					</button>
				{/each}
			</div>
		</section>
	{/if}

	{#if lightboxOpen && galleryImages.length > 0}
		<Lightbox
			images={galleryImages}
			initialIndex={lightboxIndex}
			onclose={() => lightboxOpen = false}
		/>
	{/if}

	<footer class="mt-16 pt-8 border-t">
		<nav class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
			{#if data.navigation?.prev}
				<a href="/lore/{data.navigation.prev.slug}" class="group flex items-center gap-3 p-4 rounded-xl border hover:bg-muted/50 flex-1">
					<ChevronLeft class="h-5 w-5 text-muted-foreground group-hover:text-primary" />
					<div class="min-w-0">
						<p class="text-xs text-muted-foreground mb-1">Previous</p>
						<p class="font-medium truncate group-hover:text-primary">{data.navigation.prev.title}</p>
					</div>
				</a>
			{:else}
				<div class="flex-1"></div>
			{/if}

			{#if data.navigation?.next}
				<a href="/lore/{data.navigation.next.slug}" class="group flex items-center justify-end gap-3 p-4 rounded-xl border hover:bg-muted/50 flex-1 text-right">
					<div class="min-w-0">
						<p class="text-xs text-muted-foreground mb-1">Next</p>
						<p class="font-medium truncate group-hover:text-primary">{data.navigation.next.title}</p>
					</div>
					<ChevronRight class="h-5 w-5 text-muted-foreground group-hover:text-primary" />
				</a>
			{:else}
				<div class="flex-1"></div>
			{/if}
		</nav>

		<div class="mt-8 text-center">
			<a href="/canon#lore" class="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
				<ChevronLeft class="h-4 w-4" />
				Back to Lore
			</a>
		</div>
	</footer>
</article>

{#if showBackToTop}
	<Button onclick={scrollToTop} variant="secondary" size="icon" class="fixed bottom-6 right-6 rounded-full shadow-lg z-40" aria-label="Back to top">
		<ArrowUp class="h-4 w-4" />
	</Button>
{/if}
