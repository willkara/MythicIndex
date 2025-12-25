<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Placeholder from '@tiptap/extension-placeholder';

	/**
	 * Rich text editor component using Tiptap
	 * Supports bold, italic, quotes, headings, lists, and more
	 */
	interface Props {
		content?: string;
		placeholder?: string;
		label?: string;
		required?: boolean;
	}

	let {
		content = $bindable(''),
		placeholder = 'Start writing your chapter...',
		label = '',
		required = false
	}: Props = $props();

	let editorElement: HTMLDivElement;
	let editor: Editor | null = null;

	onMount(() => {
		editor = new Editor({
			element: editorElement,
			extensions: [
				StarterKit.configure({
					heading: {
						levels: [1, 2, 3]
					}
				}),
				Placeholder.configure({
					placeholder
				})
			],
			content: content || '',
			editorProps: {
				attributes: {
					class:
						'prose prose-sm sm:prose lg:prose-lg xl:prose-xl max-w-none focus:outline-none min-h-[400px] px-4 py-3'
				}
			},
			onUpdate: ({ editor }) => {
				content = editor.getHTML();
			}
		});
	});

	onDestroy(() => {
		if (editor) {
			editor.destroy();
		}
	});

	// Update editor content when prop changes externally
	$effect(() => {
		if (editor && content !== editor.getHTML()) {
			editor.commands.setContent(content);
		}
	});

	// Toolbar button actions
	function toggleBold() {
		editor?.chain().focus().toggleBold().run();
	}

	function toggleItalic() {
		editor?.chain().focus().toggleItalic().run();
	}

	function toggleStrike() {
		editor?.chain().focus().toggleStrike().run();
	}

	function toggleBlockquote() {
		editor?.chain().focus().toggleBlockquote().run();
	}

	function toggleBulletList() {
		editor?.chain().focus().toggleBulletList().run();
	}

	function toggleOrderedList() {
		editor?.chain().focus().toggleOrderedList().run();
	}

	function setHeading(level: 1 | 2 | 3) {
		editor?.chain().focus().toggleHeading({ level }).run();
	}

	function setParagraph() {
		editor?.chain().focus().setParagraph().run();
	}

	function undo() {
		editor?.chain().focus().undo().run();
	}

	function redo() {
		editor?.chain().focus().redo().run();
	}
</script>

{#if label}
	<label class="block text-sm font-medium mb-2">
		{label}
		{#if required}
			<span class="text-red-500">*</span>
		{/if}
	</label>
{/if}

<div class="border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800">
	<!-- Toolbar -->
	<div
		class="border-b border-gray-300 dark:border-gray-700 p-2 flex flex-wrap gap-1 bg-gray-50 dark:bg-gray-900/50"
	>
		<!-- Text formatting -->
		<button
			type="button"
			onclick={toggleBold}
			class="px-3 py-1 text-sm font-semibold rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
			title="Bold (Ctrl+B)"
		>
			B
		</button>
		<button
			type="button"
			onclick={toggleItalic}
			class="px-3 py-1 text-sm italic rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
			title="Italic (Ctrl+I)"
		>
			I
		</button>
		<button
			type="button"
			onclick={toggleStrike}
			class="px-3 py-1 text-sm line-through rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
			title="Strikethrough"
		>
			S
		</button>

		<div class="w-px h-6 bg-gray-300 dark:bg-gray-700 mx-1"></div>

		<!-- Headings -->
		<button
			type="button"
			onclick={() => setHeading(1)}
			class="px-3 py-1 text-sm font-bold rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
			title="Heading 1"
		>
			H1
		</button>
		<button
			type="button"
			onclick={() => setHeading(2)}
			class="px-3 py-1 text-sm font-bold rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
			title="Heading 2"
		>
			H2
		</button>
		<button
			type="button"
			onclick={() => setHeading(3)}
			class="px-3 py-1 text-sm font-bold rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
			title="Heading 3"
		>
			H3
		</button>
		<button
			type="button"
			onclick={setParagraph}
			class="px-3 py-1 text-sm rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
			title="Paragraph"
		>
			P
		</button>

		<div class="w-px h-6 bg-gray-300 dark:bg-gray-700 mx-1"></div>

		<!-- Block types -->
		<button
			type="button"
			onclick={toggleBlockquote}
			class="px-3 py-1 text-sm rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
			title="Blockquote"
		>
			"
		</button>
		<button
			type="button"
			onclick={toggleBulletList}
			class="px-3 py-1 text-sm rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
			title="Bullet List"
		>
			•
		</button>
		<button
			type="button"
			onclick={toggleOrderedList}
			class="px-3 py-1 text-sm rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
			title="Ordered List"
		>
			1.
		</button>

		<div class="w-px h-6 bg-gray-300 dark:bg-gray-700 mx-1"></div>

		<!-- History -->
		<button
			type="button"
			onclick={undo}
			class="px-3 py-1 text-sm rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
			title="Undo (Ctrl+Z)"
		>
			↶
		</button>
		<button
			type="button"
			onclick={redo}
			class="px-3 py-1 text-sm rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
			title="Redo (Ctrl+Shift+Z)"
		>
			↷
		</button>
	</div>

	<!-- Editor -->
	<div bind:this={editorElement} class="min-h-[400px]"></div>
</div>

<style>
	/* Tiptap editor styles */
	:global(.ProseMirror) {
		outline: none;
	}

	:global(.ProseMirror p.is-editor-empty:first-child::before) {
		content: attr(data-placeholder);
		float: left;
		color: #adb5bd;
		pointer-events: none;
		height: 0;
	}

	:global(.ProseMirror blockquote) {
		border-left: 4px solid #e5e7eb;
		padding-left: 1rem;
		margin-left: 0;
		color: #6b7280;
	}

	:global(.dark .ProseMirror blockquote) {
		border-left-color: #4b5563;
		color: #9ca3af;
	}

	:global(.ProseMirror h1) {
		font-size: 2em;
		font-weight: bold;
		margin-top: 0.67em;
		margin-bottom: 0.67em;
	}

	:global(.ProseMirror h2) {
		font-size: 1.5em;
		font-weight: bold;
		margin-top: 0.83em;
		margin-bottom: 0.83em;
	}

	:global(.ProseMirror h3) {
		font-size: 1.17em;
		font-weight: bold;
		margin-top: 1em;
		margin-bottom: 1em;
	}

	:global(.ProseMirror ul),
	:global(.ProseMirror ol) {
		padding-left: 2rem;
		margin: 1em 0;
	}

	:global(.ProseMirror ul) {
		list-style-type: disc;
	}

	:global(.ProseMirror ol) {
		list-style-type: decimal;
	}

	:global(.ProseMirror li) {
		margin: 0.5em 0;
	}

	:global(.ProseMirror strong) {
		font-weight: bold;
	}

	:global(.ProseMirror em) {
		font-style: italic;
	}

	:global(.ProseMirror s) {
		text-decoration: line-through;
	}

	:global(.ProseMirror p) {
		margin: 1em 0;
	}

	:global(.ProseMirror p:first-child) {
		margin-top: 0;
	}

	:global(.ProseMirror p:last-child) {
		margin-bottom: 0;
	}
</style>
