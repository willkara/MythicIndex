<script lang="ts">
	import { cn } from '$lib/utils/cn';
	import ResponsiveImage from './ResponsiveImage.svelte';

	interface Image {
		src: string;
		alt: string;
		caption?: string | null;
		lqip?: string | null;
		role?: string;
	}

	interface Props {
		images: Image[];
		onImageClick?: (src: string, index: number) => void;
		aspectRatio?: 'portrait' | 'landscape' | 'mixed';
		class?: string;
	}

	let { images, onImageClick, aspectRatio = 'mixed', class: className }: Props = $props();

	// Generate a pseudo-random but stable pattern for image sizing
	function getImageSize(index: number, role?: string): { cols: number; rows: number; aspect: string } {
		// Hero/profile images are always large
		if (role === 'hero' || role === 'profile') {
			return { cols: 2, rows: 3, aspect: 'aspect-[3/4]' };
		}

		// Create variety in the masonry layout
		const patterns = aspectRatio === 'portrait'
			? [
				{ cols: 2, rows: 3, aspect: 'aspect-[3/4]' },   // Tall portrait
				{ cols: 1, rows: 2, aspect: 'aspect-[3/4]' },   // Small portrait
				{ cols: 2, rows: 2, aspect: 'aspect-square' },  // Medium square
				{ cols: 1, rows: 1, aspect: 'aspect-square' },  // Small square
				{ cols: 2, rows: 2, aspect: 'aspect-[4/3]' },   // Wide
			]
			: aspectRatio === 'landscape'
			? [
				{ cols: 2, rows: 2, aspect: 'aspect-video' },   // Wide landscape
				{ cols: 1, rows: 1, aspect: 'aspect-square' },  // Small square
				{ cols: 2, rows: 1, aspect: 'aspect-[21/9]' },  // Ultra wide
				{ cols: 1, rows: 2, aspect: 'aspect-[3/4]' },   // Tall detail
				{ cols: 2, rows: 2, aspect: 'aspect-[4/3]' },   // Medium landscape
			]
			: [
				{ cols: 2, rows: 2, aspect: 'aspect-square' },
				{ cols: 1, rows: 1, aspect: 'aspect-square' },
				{ cols: 2, rows: 3, aspect: 'aspect-[3/4]' },
				{ cols: 1, rows: 2, aspect: 'aspect-[3/4]' },
				{ cols: 2, rows: 1, aspect: 'aspect-video' },
			];

		return patterns[index % patterns.length];
	}
</script>

<div
	class={cn(
		'grid grid-cols-2 auto-rows-[minmax(80px,auto)] gap-3',
		className
	)}
>
	{#each images as image, i}
		{@const size = getImageSize(i, image.role)}
		{@const displayText = image.caption || image.alt}
		<button
			class={cn(
				'relative overflow-hidden rounded-lg shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer group',
				'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
				size.aspect
			)}
			style={`grid-column: span ${size.cols}; grid-row: span ${size.rows};`}
			onclick={() => onImageClick?.(image.src, i)}
			type="button"
		>
			<ResponsiveImage
				src={image.src}
				alt={image.alt}
				lqip={image.lqip}
				aspectRatio="auto"
				class="w-full h-full"
			/>

			<!-- Hover overlay with caption or alt text -->
			{#if displayText}
				<div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3">
					<p class="text-white text-xs leading-snug line-clamp-3">{displayText}</p>
				</div>
			{/if}

			<!-- Zoom indicator -->
			<div class="absolute top-2 right-2 bg-black/50 rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
				<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7"></path>
				</svg>
			</div>
		</button>
	{/each}
</div>
