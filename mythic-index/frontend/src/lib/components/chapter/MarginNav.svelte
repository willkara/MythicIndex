<script lang="ts">
	import { Clapperboard, List, ChevronDown } from 'lucide-svelte';

	interface Scene {
		id: string;
		slug: string;
		title: string | null;
		sequenceOrder: number;
	}

	interface TOCItem {
		id: string;
		text: string;
		level: number;
	}

	interface Props {
		scenes?: Scene[];
		tocItems?: TOCItem[];
		currentSceneId?: string | null;
		currentHeadingId?: string | null;
		onSceneSelect?: (sceneId: string) => void;
		onHeadingSelect?: (headingId: string) => void;
	}

	let {
		scenes = [],
		tocItems = [],
		currentSceneId = null,
		currentHeadingId = null,
		onSceneSelect,
		onHeadingSelect
	}: Props = $props();

	// Collapse state
	let scenesExpanded = $state(true);
	let tocExpanded = $state(true);

	function handleSceneClick(sceneId: string) {
		onSceneSelect?.(sceneId);
	}

	function handleHeadingClick(headingId: string) {
		onHeadingSelect?.(headingId);
	}
</script>

<div class="margin-nav space-y-4">
	<!-- Scenes Section -->
	{#if scenes.length > 0}
		<nav class="nav-section" aria-label="Scene navigation">
			<button
				class="section-header"
				onclick={() => (scenesExpanded = !scenesExpanded)}
				aria-expanded={scenesExpanded}
			>
				<div class="header-label">
					<Clapperboard class="h-3.5 w-3.5" aria-hidden="true" />
					<span>Scenes</span>
				</div>
				<ChevronDown
					class="h-3.5 w-3.5 chevron {!scenesExpanded ? 'rotated' : ''}"
					aria-hidden="true"
				/>
			</button>

			{#if scenesExpanded}
				<ul class="nav-list">
					{#each scenes as scene, i}
						{@const isCurrent = currentSceneId === scene.id}
						<li>
							<button
								onclick={() => handleSceneClick(scene.id)}
								class="nav-item"
								class:active={isCurrent}
								aria-current={isCurrent ? 'location' : undefined}
							>
								<span class="item-number">{i + 1}</span>
								<span class="item-text">{scene.title || `Scene ${i + 1}`}</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</nav>
	{/if}

	<!-- TOC Section -->
	{#if tocItems.length > 0}
		<nav class="nav-section" aria-label="Table of contents">
			<button
				class="section-header"
				onclick={() => (tocExpanded = !tocExpanded)}
				aria-expanded={tocExpanded}
			>
				<div class="header-label">
					<List class="h-3.5 w-3.5" aria-hidden="true" />
					<span>Contents</span>
				</div>
				<ChevronDown
					class="h-3.5 w-3.5 chevron {!tocExpanded ? 'rotated' : ''}"
					aria-hidden="true"
				/>
			</button>

			{#if tocExpanded}
				<ul class="nav-list">
					{#each tocItems as item}
						{@const isCurrent = currentHeadingId === item.id}
						<li>
							<button
								onclick={() => handleHeadingClick(item.id)}
								class="nav-item"
								class:active={isCurrent}
								class:indent-1={item.level === 3}
								class:indent-2={item.level >= 4}
								aria-current={isCurrent ? 'location' : undefined}
							>
								<span class="item-text">{item.text}</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</nav>
	{/if}

	<!-- Keyboard hint -->
	{#if scenes.length > 0}
		<div class="keyboard-hint">
			<kbd>Shift</kbd>+<kbd>S</kbd> scenes
		</div>
	{/if}
</div>

<style>
	.margin-nav {
		font-size: 0.8125rem;
	}

	.nav-section {
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: 0.5rem;
		overflow: hidden;
	}

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0.625rem 0.75rem;
		background: hsl(var(--muted) / 0.3);
		border: none;
		cursor: pointer;
		transition: background 0.15s;
	}

	.section-header:hover {
		background: hsl(var(--muted) / 0.5);
	}

	.header-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 500;
		color: hsl(var(--foreground));
		text-transform: uppercase;
		letter-spacing: 0.03em;
		font-size: 0.6875rem;
	}

	.chevron {
		color: hsl(var(--muted-foreground));
		transition: transform 0.2s;
	}

	.chevron.rotated {
		transform: rotate(-90deg);
	}

	.nav-list {
		list-style: none;
		padding: 0.375rem;
		margin: 0;
	}

	.nav-item {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		width: 100%;
		padding: 0.375rem 0.5rem;
		border: none;
		background: transparent;
		border-radius: 0.25rem;
		cursor: pointer;
		text-align: left;
		color: hsl(var(--muted-foreground));
		transition:
			background 0.15s,
			color 0.15s;
		line-height: 1.4;
	}

	.nav-item:hover {
		background: hsl(var(--muted) / 0.5);
		color: hsl(var(--foreground));
	}

	.nav-item.active {
		background: hsl(var(--primary) / 0.1);
		color: hsl(var(--primary));
	}

	.nav-item.indent-1 {
		padding-left: 1.25rem;
	}

	.nav-item.indent-2 {
		padding-left: 1.75rem;
	}

	.item-number {
		flex-shrink: 0;
		width: 1.25rem;
		height: 1.25rem;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.625rem;
		font-weight: 600;
		background: hsl(var(--muted));
		border-radius: 50%;
	}

	.nav-item.active .item-number {
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
	}

	.item-text {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		line-clamp: 2;
	}

	.keyboard-hint {
		font-size: 0.625rem;
		color: hsl(var(--muted-foreground) / 0.7);
		text-align: center;
		padding-top: 0.25rem;
	}

	.keyboard-hint kbd {
		display: inline-block;
		padding: 0.125rem 0.25rem;
		font-family: var(--font-mono, monospace);
		font-size: 0.5625rem;
		background: hsl(var(--muted));
		border-radius: 0.25rem;
		border: 1px solid hsl(var(--border));
	}
</style>
