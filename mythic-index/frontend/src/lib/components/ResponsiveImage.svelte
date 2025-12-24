<script lang="ts">
	import { ImageOff } from 'lucide-svelte';
	import { cn } from '$lib/utils/cn';
	import { lazyLoad } from '$lib/utils/use-intersection-observer';

	interface Props {
		src: string;
		alt: string;
		class?: string;
		aspectRatio?: 'square' | 'video' | 'portrait' | 'hero' | 'auto';
		loading?: 'lazy' | 'eager';
		lqip?: string | null;
		objectFit?: 'cover' | 'contain';
		/** Custom object-position for focal point control (e.g., 'center top', '50% 20%') */
		objectPosition?: string;
		/** Use intersection observer for lazy loading (default: true for lazy, false for eager) */
		observeLazy?: boolean;
	}

	let {
		src,
		alt,
		class: className,
		aspectRatio = 'auto',
		loading = 'lazy',
		lqip,
		objectFit = 'cover',
		objectPosition,
		observeLazy
	}: Props = $props();

	// Default observeLazy based on loading prop
	const shouldObserve = $derived(observeLazy ?? loading === 'lazy');

	let hasError = $state(false);
	let isLoaded = $state(false);
	let isInViewport = $state(false);

	// If not observing, immediately mark as in viewport
	$effect(() => {
		if (!shouldObserve) {
			isInViewport = true;
		}
	});

	const aspectClasses: Record<string, string> = {
		square: 'aspect-square',
		video: 'aspect-video',
		portrait: 'aspect-[3/4]',
		hero: 'aspect-[21/9]',
		auto: ''
	};

	const objectFitClasses: Record<string, string> = {
		cover: 'object-cover',
		contain: 'object-contain'
	};

	function handleError() {
		hasError = true;
	}

	function handleLoad() {
		isLoaded = true;
	}

	function handleLazyLoad() {
		isInViewport = true;
	}
</script>

<div
	class={cn(
		'relative overflow-hidden bg-muted',
		aspectClasses[aspectRatio],
		className
	)}
	use:lazyLoad={handleLazyLoad}
>
	{#if hasError}
		<!-- Error Placeholder -->
		<div class="absolute inset-0 flex items-center justify-center">
			<ImageOff class="h-12 w-12 text-muted-foreground/30" />
		</div>
	{:else}
		<!-- LQIP Background (if provided) -->
		{#if lqip && !isLoaded}
			<img
				src={lqip}
				{alt}
				class={cn(
					'absolute inset-0 w-full h-full blur-lg scale-110',
					objectFitClasses[objectFit]
				)}
				style={objectPosition ? `object-position: ${objectPosition}` : undefined}
				aria-hidden="true"
			/>
		{/if}

		<!-- Loading skeleton (if no LQIP) -->
		{#if !lqip && !isLoaded}
			<div class="absolute inset-0 animate-pulse bg-muted" />
		{/if}

		<!-- Main Image (only load when in viewport) -->
		{#if isInViewport}
			<img
				{src}
				{alt}
				loading={loading}
				class={cn(
					'w-full h-full transition-opacity duration-300',
					objectFitClasses[objectFit],
					isLoaded ? 'opacity-100' : 'opacity-0',
					aspectRatio === 'auto' ? '' : 'absolute inset-0'
				)}
				style={objectPosition ? `object-position: ${objectPosition}` : undefined}
				onload={handleLoad}
				onerror={handleError}
			/>
		{/if}
	{/if}
</div>
