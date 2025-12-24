<script lang="ts">
	import ResponsiveImage from '$lib/components/ResponsiveImage.svelte';

	interface Props {
		src: string;
		alt: string;
		caption?: string | null;
		lqip?: string | null;
		side: 'left' | 'right';
		onclick?: () => void;
	}

	let { src, alt, caption, lqip, side, onclick }: Props = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<figure class="float-image float-image-{side}" class:cursor-pointer={onclick} {onclick}>
	<div class="story-image-blend">
		<ResponsiveImage
			{src}
			{alt}
			{lqip}
			aspectRatio="square"
			class="w-full rounded-lg shadow-lg"
		/>
	</div>
	{#if caption}
		<figcaption class="text-xs text-muted-foreground mt-2 italic text-center">
			{caption}
		</figcaption>
	{/if}
</figure>
