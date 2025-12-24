<script lang="ts">
	import { onMount } from 'svelte';
	import ResponsiveImage from '$lib/components/ResponsiveImage.svelte';

	interface ChapterImage {
		src: string;
		alt: string;
		caption?: string | null;
		lqip?: string | null;
		sceneId?: string | null;
		role?: string;
	}

	interface Props {
		images: ChapterImage[];
		currentSceneId?: string | null;
		onImageClick?: (src: string) => void;
	}

	let { images, currentSceneId = null, onImageClick }: Props = $props();

	// Preload state
	let preloadedImages = $state(new Set<string>());
	let isPreloading = $state(true);

	// Get images for the current scene (or all scene images if no current scene)
	const currentImages = $derived.by(() => {
		if (!currentSceneId) {
			// Show first image as default when no scene is active
			const firstSceneImage = images.find(img => img.sceneId);
			return firstSceneImage ? [firstSceneImage] : [];
		}

		const sceneImages = images.filter(img => img.sceneId === currentSceneId);
		if (sceneImages.length > 0) return sceneImages;

		// Fallback: find the nearest previous scene with images
		// This requires scene ordering info - for now just show any scene image
		const anySceneImage = images.find(img => img.sceneId);
		return anySceneImage ? [anySceneImage] : [];
	});

	// Track which image to display (for single-image view with transitions)
	const displayImage = $derived(currentImages[0] || null);

	// Previous image for crossfade
	let previousImage = $state<ChapterImage | null>(null);
	let isTransitioning = $state(false);

	// Handle image transitions
	$effect(() => {
		if (displayImage && displayImage.src !== previousImage?.src) {
			isTransitioning = true;
			// After transition, update previous
			setTimeout(() => {
				previousImage = displayImage;
				isTransitioning = false;
			}, 300);
		}
	});

	// Preload all chapter images on mount
	onMount(() => {
		const imageUrls = images.map(img => img.src).filter(Boolean);

		if (imageUrls.length === 0) {
			isPreloading = false;
			return;
		}

		let loadedCount = 0;
		const totalImages = imageUrls.length;

		imageUrls.forEach(url => {
			const img = new Image();
			img.onload = () => {
				preloadedImages.add(url);
				preloadedImages = new Set(preloadedImages); // Trigger reactivity
				loadedCount++;
				if (loadedCount >= totalImages) {
					isPreloading = false;
				}
			};
			img.onerror = () => {
				loadedCount++;
				if (loadedCount >= totalImages) {
					isPreloading = false;
				}
			};
			img.src = url;
		});

		// Timeout fallback
		const timeout = setTimeout(() => {
			isPreloading = false;
		}, 10000);

		return () => clearTimeout(timeout);
	});

	function handleClick() {
		if (displayImage && onImageClick) {
			onImageClick(displayImage.src);
		}
	}

	// Loading progress for visual feedback
	const loadProgress = $derived(
		images.length > 0 ? Math.round((preloadedImages.size / images.length) * 100) : 100
	);
</script>

<div class="scene-image-margin">
	<!-- Preload indicator -->
	{#if isPreloading && images.length > 0}
		<div class="preload-indicator">
			<div class="preload-bar" style="width: {loadProgress}%"></div>
		</div>
	{/if}

	<!-- Main image display area -->
	<div class="image-container" class:has-image={displayImage}>
		{#if displayImage}
			<!-- Current image with fade transition -->
			<figure
				class="scene-image"
				class:cursor-pointer={onImageClick}
				class:transitioning={isTransitioning}
				onclick={handleClick}
				onkeydown={(e) => e.key === 'Enter' && handleClick()}
				tabindex={onImageClick ? 0 : -1}
				role={onImageClick ? 'button' : undefined}
			>
				<div class="image-wrapper">
					<ResponsiveImage
						src={displayImage.src}
						alt={displayImage.alt}
						lqip={displayImage.lqip}
						aspectRatio="portrait"
						class="w-full rounded-lg shadow-lg"
					/>
				</div>

				{#if displayImage.caption || displayImage.alt}
					{@const displayText = displayImage.caption || displayImage.alt}
					<figcaption class="image-caption">
						{displayText}
					</figcaption>
				{/if}
			</figure>

			<!-- Additional images in current scene (thumbnail strip) -->
			{#if currentImages.length > 1}
				<div class="thumbnail-strip">
					{#each currentImages as img, i}
						<button
							class="thumbnail"
							class:active={img.src === displayImage?.src}
							onclick={() => onImageClick?.(img.src)}
							aria-label={img.alt}
						>
							<img src={img.src} alt="" loading="lazy" />
						</button>
					{/each}
				</div>
			{/if}
		{:else if !isPreloading}
			<!-- Empty state -->
			<div class="empty-state">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="empty-icon"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="1.5"
						d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
					/>
				</svg>
			</div>
		{/if}
	</div>

	<!-- Scene indicator -->
	{#if currentSceneId && displayImage}
		<div class="scene-indicator">
			<span class="scene-dot"></span>
			<span class="scene-label">Scene image</span>
		</div>
	{/if}
</div>

<style>
	.scene-image-margin {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.preload-indicator {
		height: 2px;
		background: hsl(var(--muted));
		border-radius: 1px;
		overflow: hidden;
	}

	.preload-bar {
		height: 100%;
		background: hsl(var(--primary));
		transition: width 0.3s ease-out;
	}

	.image-container {
		min-height: 200px;
		display: flex;
		flex-direction: column;
	}

	.scene-image {
		position: relative;
		transition: opacity 0.3s ease-out, transform 0.3s ease-out;
	}

	.scene-image.transitioning {
		opacity: 0.7;
		transform: scale(0.98);
	}

	.scene-image:not(.transitioning) {
		opacity: 1;
		transform: scale(1);
	}

	.image-wrapper {
		overflow: hidden;
		border-radius: 0.5rem;
		box-shadow:
			0 4px 6px -1px rgb(0 0 0 / 0.1),
			0 2px 4px -2px rgb(0 0 0 / 0.1);
		transition: box-shadow 0.2s ease;
	}

	.scene-image:hover .image-wrapper {
		box-shadow:
			0 10px 15px -3px rgb(0 0 0 / 0.1),
			0 4px 6px -4px rgb(0 0 0 / 0.1);
	}

	.scene-image.cursor-pointer {
		cursor: pointer;
	}

	.scene-image:focus-visible {
		outline: 2px solid hsl(var(--primary));
		outline-offset: 2px;
		border-radius: 0.5rem;
	}

	.image-caption {
		margin-top: 0.5rem;
		font-size: 0.75rem;
		line-height: 1.4;
		color: hsl(var(--muted-foreground));
		font-style: italic;
	}

	.thumbnail-strip {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.75rem;
		overflow-x: auto;
		padding-bottom: 0.25rem;
	}

	.thumbnail {
		flex-shrink: 0;
		width: 3rem;
		height: 3rem;
		border-radius: 0.375rem;
		overflow: hidden;
		border: 2px solid transparent;
		opacity: 0.6;
		transition:
			opacity 0.2s,
			border-color 0.2s;
		cursor: pointer;
		padding: 0;
		background: none;
	}

	.thumbnail:hover {
		opacity: 0.9;
	}

	.thumbnail.active {
		opacity: 1;
		border-color: hsl(var(--primary));
	}

	.thumbnail img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 150px;
		background: hsl(var(--muted) / 0.3);
		border-radius: 0.5rem;
		border: 1px dashed hsl(var(--border));
	}

	.empty-icon {
		width: 2.5rem;
		height: 2.5rem;
		color: hsl(var(--muted-foreground) / 0.4);
	}

	.scene-indicator {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.7rem;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.scene-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: hsl(var(--primary));
		animation: pulse 2s infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}
</style>
