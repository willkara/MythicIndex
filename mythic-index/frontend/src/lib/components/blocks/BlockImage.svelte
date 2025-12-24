<script lang="ts">
	import ResponsiveImage from '$lib/components/ResponsiveImage.svelte';

	interface Props {
		src: string;
		alt: string;
		lqip?: string | null;
	}

	let { src, alt, lqip }: Props = $props();
</script>

<figure class="my-6">
	<ResponsiveImage
		{src}
		{alt}
		{lqip}
		aspectRatio="auto"
		class="rounded-xl shadow-lg"
	/>
	{#if alt}
		<figcaption class="text-center text-sm text-muted-foreground mt-2">
			{alt}
		</figcaption>
	{/if}
</figure>
