<script lang="ts">
	import ResponsiveImage from '$lib/components/ResponsiveImage.svelte';

	interface Props {
		src: string;
		alt: string;
		caption?: string | null;
		lqip?: string | null;
		onclick?: () => void;
	}

	let { src, alt, caption, lqip, onclick }: Props = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<figure class="my-8 -mx-4 md:mx-0" class:cursor-pointer={onclick} {onclick}>
	<div class="story-image-blend">
		<ResponsiveImage
			{src}
			{alt}
			{lqip}
			aspectRatio="video"
			class="w-full md:rounded-xl shadow-lg"
		/>
	</div>
	{#if caption}
		<figcaption class="text-center text-sm text-muted-foreground mt-3 px-4 italic">
			{caption}
		</figcaption>
	{/if}
</figure>
