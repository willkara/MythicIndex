## 2025-05-18 - Markdown XSS Vulnerability
**Vulnerability:** The utility function `parseInlineMarkdown` in `src/lib/utils/inline-markdown.ts` was returning raw HTML from `marked.parseInline` without sanitization. This allowed XSS attacks if user input contained `<script>` tags, which were then rendered via `{@html ...}` in Svelte components.
**Learning:** `marked` does not sanitize output by default. In Svelte, `{@html ...}` is a dangerous sink that requires explicit sanitization of the input.
**Prevention:** Always use `isomorphic-dompurify` (for SSR compatibility) to sanitize any HTML before rendering it with `{@html ...}`.

## 2025-05-18 - Stored XSS in MarkdownContent & Admin Auth
**Vulnerability:** `MarkdownContent.svelte` rendered `marked` output directly via `{@html}` without sanitization, allowing stored XSS from uploaded markdown. Additionally, `admin/upload` endpoint lacks authentication.
**Learning:** Security utilities (like the fixed `parseInlineMarkdown`) must be used consistently. Missing auth on "internal" tools often leads to compromise.
**Prevention:** Patched `MarkdownContent.svelte` to use `DOMPurify`. Added warning comment to admin upload route.
