<script lang="ts">
	import { BookOpen, Home } from 'lucide-svelte';
	import { readingSettings, getFontSizeClass, getFontFamilyClass } from '$lib/stores/reading-settings';
	import CommandPalette from '$lib/components/CommandPalette.svelte';
	import type { Snippet } from 'svelte';

	interface SearchItem {
		id: string;
		title: string;
		slug: string;
		kind: 'chapter' | 'character' | 'location';
		summary?: string | null;
	}

	interface Props {
		children: Snippet;
		searchItems?: SearchItem[];
	}

	let { children, searchItems = [] }: Props = $props();

	// Get current font classes from settings
	const fontSizeClass = $derived(getFontSizeClass($readingSettings.fontSize));
	const fontFamilyClass = $derived(getFontFamilyClass($readingSettings.fontFamily));
</script>

<div class="min-h-screen flex flex-col bg-background text-foreground">
	<!-- Header -->
	<header class="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
		<div class="container flex h-14 items-center px-4">
			<!-- Logo -->
			<a href="/" class="flex items-center gap-2 font-semibold mr-6">
				<BookOpen class="h-5 w-5 text-primary" aria-hidden="true" />
				<span class="hidden sm:inline">Mythic Index</span>
			</a>

			<!-- Navigation -->
			<nav class="flex items-center gap-1 flex-1" aria-label="Main navigation">
				<a
					href="/"
					class="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
				>
					<Home class="h-4 w-4" aria-hidden="true" />
					<span class="hidden sm:inline">Home</span>
				</a>
				<a
					href="/canon"
					class="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
				>
					<BookOpen class="h-4 w-4" aria-hidden="true" />
					<span class="hidden sm:inline">Canon</span>
				</a>
			</nav>

			<!-- Command Palette / Quick Search -->
			<CommandPalette items={searchItems} />

		</div>
	</header>

	<!-- Main Content -->
	<main class="flex-1 {fontSizeClass} {fontFamilyClass}">
		{@render children()}
	</main>

	<!-- Footer -->
	<footer class="border-t py-6 text-center text-sm text-muted-foreground">
		<div class="container px-4">
			<p>Mythic Index &copy; {new Date().getFullYear()}</p>
		</div>
	</footer>
</div>
