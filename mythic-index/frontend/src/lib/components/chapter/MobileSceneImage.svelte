<script lang="ts">
	import ResponsiveImage from '$lib/components/ResponsiveImage.svelte';

	interface Props {
		src: string;
		alt: string;
		caption?: string | null;
		lqip?: string | null;
		sceneTitle?: string | null;
		onclick?: () => void;
	}

	let { src, alt, caption, lqip, sceneTitle, onclick }: Props = $props();
</script>

<!-- Full-width scene image for mobile, shown before scene content -->
<figure
	class="mobile-scene-image"
	class:cursor-pointer={onclick}
	onclick={onclick}
	onkeydown={(e) => e.key === 'Enter' && onclick?.()}
	tabindex={onclick ? 0 : -1}
	role={onclick ? 'button' : undefined}
>
	<div class="image-wrapper">
		<ResponsiveImage
			{src}
			{alt}
			{lqip}
			aspectRatio="video"
			class="w-full"
		/>
	</div>

	{#if caption || sceneTitle}
		<figcaption class="image-caption">
			{#if sceneTitle}
				<span class="scene-title">{sceneTitle}</span>
			{/if}
			{#if caption}
				<span class="caption-text">{caption}</span>
			{/if}
		</figcaption>
	{/if}
</figure>

<style>
	.mobile-scene-image {
		margin: 1.5rem -1rem;
		background: hsl(var(--muted) / 0.3);
	}

	.mobile-scene-image.cursor-pointer {
		cursor: pointer;
	}

	.mobile-scene-image:focus-visible {
		outline: 2px solid hsl(var(--primary));
		outline-offset: -2px;
	}

	.image-wrapper {
		position: relative;
	}

	.image-caption {
		padding: 0.75rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.scene-title {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(var(--muted-foreground));
	}

	.caption-text {
		font-size: 0.875rem;
		color: hsl(var(--foreground) / 0.8);
		font-style: italic;
		line-height: 1.5;
	}
</style>
