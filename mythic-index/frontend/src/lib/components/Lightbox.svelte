<script lang="ts">
	import { X, ChevronLeft, ChevronRight } from 'lucide-svelte';

	interface ImageItem {
		src: string;
		alt: string;
		caption?: string | null;
	}

	interface Props {
		images: ImageItem[];
		initialIndex?: number;
		onclose: () => void;
	}

	let { images, initialIndex = 0, onclose }: Props = $props();

	let currentIndex = $state(initialIndex);

	const currentImage = $derived(images[currentIndex]);
	const hasPrev = $derived(currentIndex > 0);
	const hasNext = $derived(currentIndex < images.length - 1);

	function prev() {
		if (hasPrev) currentIndex--;
	}

	function next() {
		if (hasNext) currentIndex++;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
		if (e.key === 'ArrowLeft') prev();
		if (e.key === 'ArrowRight') next();
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) onclose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
	onclick={handleBackdropClick}
	role="dialog"
	aria-modal="true"
	aria-label="Image lightbox"
>
	<!-- Close Button -->
	<button
		onclick={onclose}
		class="absolute top-4 right-4 p-2 text-white/80 hover:text-white transition-colors z-10 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
		aria-label="Close lightbox"
	>
		<X class="h-8 w-8" />
	</button>

	<!-- Navigation Buttons -->
	{#if hasPrev}
		<button
			onclick={prev}
			class="absolute left-4 top-1/2 -translate-y-1/2 p-2 text-white/80 hover:text-white transition-colors rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
			aria-label="Previous image"
		>
			<ChevronLeft class="h-10 w-10" />
		</button>
	{/if}

	{#if hasNext}
		<button
			onclick={next}
			class="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-white/80 hover:text-white transition-colors rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
			aria-label="Next image"
		>
			<ChevronRight class="h-10 w-10" />
		</button>
	{/if}

	<!-- Image -->
	<figure class="max-w-[90vw] max-h-[90vh] flex flex-col items-center px-16">
		<img
			src={currentImage.src}
			alt={currentImage.alt}
			class="max-w-full max-h-[80vh] object-contain rounded-lg"
		/>
		{#if currentImage.caption || images.length > 1}
			<figcaption class="mt-4 text-white/80 text-center">
				{#if currentImage.caption}
					<p>{currentImage.caption}</p>
				{/if}
				{#if images.length > 1}
					<p class="text-sm mt-1 text-white/60">{currentIndex + 1} / {images.length}</p>
				{/if}
			</figcaption>
		{/if}
	</figure>
</div>
