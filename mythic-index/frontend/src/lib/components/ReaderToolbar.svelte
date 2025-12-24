<script lang="ts">
	import { List, Type, ALargeSmall } from 'lucide-svelte';
	import { readingSettings, type FontSize, type FontFamily } from '$lib/stores/reading-settings';
	import { cn } from '$lib/utils/cn';

	interface Props {
		/** Current scroll progress (0-100) */
		progress: number;
		/** Whether TOC drawer is open */
		tocOpen?: boolean;
		/** Callback when TOC toggle is clicked */
		onTocToggle?: () => void;
		/** Whether to show TOC button (only if there are headings) */
		showToc?: boolean;
	}

	let { progress, tocOpen = false, onTocToggle, showToc = false }: Props = $props();

	const fontSizes: FontSize[] = ['small', 'medium', 'large'];
	const fontSizeLabels: Record<FontSize, string> = {
		small: 'S',
		medium: 'M',
		large: 'L'
	};

	function cycleFontSize() {
		const currentIndex = fontSizes.indexOf($readingSettings.fontSize);
		const nextIndex = (currentIndex + 1) % fontSizes.length;
		readingSettings.setFontSize(fontSizes[nextIndex]);
	}

	function toggleFontFamily() {
		const newFamily: FontFamily = $readingSettings.fontFamily === 'sans' ? 'serif' : 'sans';
		readingSettings.setFontFamily(newFamily);
	}
</script>

<!-- Sticky Reader Toolbar -->
<div class="fixed top-0 left-0 right-0 z-50">
	<!-- Progress Bar -->
	<div
		class="h-1 bg-muted"
		role="progressbar"
		aria-valuenow={Math.round(progress)}
		aria-valuemin={0}
		aria-valuemax={100}
		aria-label="Reading progress"
	>
		<div
			class="h-full bg-primary transition-[width] duration-150 ease-out"
			style="width: {progress}%"
		></div>
	</div>

	<!-- Toolbar Controls -->
	<div class="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
		<div class="container flex items-center justify-between h-10 px-4 max-w-3xl mx-auto">
			<!-- Left: TOC Toggle (if available) -->
			<div class="flex items-center gap-1">
				{#if showToc && onTocToggle}
					<button
						onclick={onTocToggle}
						class={cn(
							'inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
							tocOpen
								? 'bg-primary/10 text-primary'
								: 'hover:bg-accent hover:text-accent-foreground text-muted-foreground'
						)}
						aria-label="Toggle table of contents"
						aria-expanded={tocOpen}
					>
						<List class="h-4 w-4" aria-hidden="true" />
						<span class="hidden sm:inline">Contents</span>
					</button>
				{/if}
			</div>

			<!-- Right: Reading Controls -->
			<div class="flex items-center gap-1">
				<!-- Font Size Selector -->
				<button
					onclick={cycleFontSize}
					class="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md hover:bg-accent hover:text-accent-foreground text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
					aria-label="Change font size (current: {$readingSettings.fontSize})"
					title="Font size: {$readingSettings.fontSize}"
				>
					<ALargeSmall class="h-4 w-4" aria-hidden="true" />
					<span class="w-4 text-center">{fontSizeLabels[$readingSettings.fontSize]}</span>
				</button>

				<!-- Font Family Toggle -->
				<button
					onclick={toggleFontFamily}
					class={cn(
						'inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
						$readingSettings.fontFamily === 'serif'
							? 'bg-primary/10 text-primary'
							: 'hover:bg-accent hover:text-accent-foreground text-muted-foreground'
					)}
					aria-label="Toggle font family (current: {$readingSettings.fontFamily})"
					title="Font: {$readingSettings.fontFamily}"
				>
					<Type class="h-4 w-4" aria-hidden="true" />
					<span class="hidden sm:inline capitalize">{$readingSettings.fontFamily}</span>
				</button>

			</div>
		</div>
	</div>
</div>

<!-- Spacer to prevent content from being hidden behind fixed toolbar -->
<div class="h-11" aria-hidden="true"></div>
