<script lang="ts">
	interface Props {
		text: string;
		sceneId?: string | null;
	}

	let { text, sceneId = null }: Props = $props();
</script>

<div
	id={sceneId ? `scene-${sceneId}` : undefined}
	class="my-8 flex items-center gap-4 scroll-mt-16"
	role="separator"
>
	<div class="flex-1 h-px bg-border"></div>
	<span class="text-sm font-medium text-muted-foreground px-2">{text}</span>
	<div class="flex-1 h-px bg-border"></div>
</div>
