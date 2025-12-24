import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

/**
 * Parses inline Markdown formatting to HTML without block-level wrapping.
 *
 * Converts inline Markdown syntax to HTML while preventing XSS through
 * DOMPurify sanitization. Supports bold, italic, code, links, and other
 * inline formatting without adding block-level elements like <p> tags.
 *
 * Supported formats:
 * - **bold** or __bold__
 * - *italic* or _italic_
 * - `code`
 * - [link text](url)
 * - And other inline Markdown features
 *
 * @param text - The Markdown text to parse
 * @returns Sanitized HTML string with inline formatting
 *
 * @example
 * ```typescript
 * parseInlineMarkdown('**Bold** and *italic* text')
 * // Returns: "<strong>Bold</strong> and <em>italic</em> text"
 * ```
 */
export function parseInlineMarkdown(text: string): string {
  if (!text) return '';
  const rawHtml = marked.parseInline(text) as string;
  return DOMPurify.sanitize(rawHtml);
}
