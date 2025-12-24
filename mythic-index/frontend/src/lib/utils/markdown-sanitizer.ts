/**
 * Markdown content sanitization utilities.
 *
 * Provides functions for cleaning and validating Markdown content:
 * - Strips YAML front-matter
 * - Cleans escaped characters
 * - Detects TBD/placeholder content
 * - Removes heading markers
 */

/**
 * Strips YAML front-matter from Markdown content.
 *
 * Handles both standard YAML delimited by `---` markers and YAML-style
 * key: value lines at the start of content. This ensures clean content
 * for display without metadata.
 *
 * @param content - The Markdown content potentially containing YAML
 * @returns Content with YAML front-matter removed
 *
 * @example
 * ```typescript
 * const cleaned = stripFrontMatter('---\ntitle: Test\n---\n# Content');
 * // Returns: "# Content"
 * ```
 */
export function stripFrontMatter(content: string): string {
  if (!content) return content;

  // Handle YAML at the very start
  if (content.startsWith('---')) {
    const endIndex = content.indexOf('---', 3);
    if (endIndex !== -1) {
      return content.slice(endIndex + 3).trim();
    }
  }

  // Also strip YAML-like key: value lines at the start of content
  // Pattern: lines like "name: value" or "key: \"value\""
  const yamlLinePattern = /^[a-z_]+:\s*["'[]?.+["'\]]?\s*$/im;
  const lines = content.split('\n');
  let startIndex = 0;

  // Skip leading YAML-like lines
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      startIndex = i + 1;
      continue;
    }
    if (yamlLinePattern.test(line)) {
      startIndex = i + 1;
      continue;
    }
    break;
  }

  if (startIndex > 0) {
    return lines.slice(startIndex).join('\n').trim();
  }

  return content;
}

/**
 * Checks if text contains TBD or placeholder markers.
 *
 * Detects various placeholder patterns commonly used in draft content:
 * - TBD markers
 * - [placeholder] annotations
 * - "scratch workflow" notes
 * - [character name] / [location name] templates
 * - Development workflow notes
 *
 * @param text - The text to check for placeholders
 * @returns True if the text contains TBD/placeholder markers
 *
 * @example
 * ```typescript
 * containsTBD('[character name] walked into [location name]'); // true
 * containsTBD('Regular content'); // false
 * ```
 */
export function containsTBD(text: string): boolean {
  if (!text) return false;

  const tbdPatterns = [
    /\bTBD\b/i,
    /\[.*placeholder.*\]/i,
    /scratch\s*workflow/i,
    /\[character\s*name\]/i,
    /\[location\s*name\]/i,
    /unstructured\s*bullets.*half-ideas/i,
    /promoted\s*or\s*purged/i,
  ];
  return tbdPatterns.some(p => p.test(text));
}

/**
 * Cleans escaped characters from content.
 *
 * Handles JSON-style escape sequences and double-escaping that can occur
 * during data processing. Converts escape sequences like \n to actual
 * newlines and \" to quotes.
 *
 * @param text - The text containing escape sequences
 * @returns Text with escape sequences converted to actual characters
 *
 * @example
 * ```typescript
 * cleanEscapedChars('Line one\\nLine two'); // "Line one\nLine two"
 * cleanEscapedChars('\\"quoted\\"'); // '"quoted"'
 * ```
 */
export function cleanEscapedChars(text: string): string {
  if (!text) return text;

  return (
    text
      // JSON-style escapes
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\[/g, '[')
      .replace(/\\\]/g, ']')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\\\/g, '\\')
      // Handle double-escaped characters
      .replace(/\\\\"/g, '"')
      .replace(/\\\\'/g, "'")
  );
}

/**
 * Strips Markdown heading markers from text.
 *
 * Removes leading # symbols and whitespace from headings, leaving
 * just the heading text content.
 *
 * @param text - Text potentially containing heading markers
 * @returns Text without heading markers
 *
 * @example
 * ```typescript
 * stripHeadingMarkers('## Chapter Title'); // "Chapter Title"
 * stripHeadingMarkers('### Subsection'); // "Subsection"
 * ```
 */
export function stripHeadingMarkers(text: string): string {
  if (!text) return text;
  return text.replace(/^#+\s*/, '').trim();
}

/**
 * Applies full sanitization pipeline to Markdown content.
 *
 * Performs comprehensive cleaning:
 * 1. Cleans escaped characters (must be first so \n becomes newlines)
 * 2. Strips YAML front-matter
 *
 * @param content - Raw Markdown content
 * @returns Sanitized Markdown ready for display
 *
 * @example
 * ```typescript
 * const clean = sanitizeMarkdown('---\ntitle: Test\n---\n\\nContent here');
 * // Returns cleaned content without YAML and with proper newlines
 * ```
 */
export function sanitizeMarkdown(content: string): string {
  if (!content) return content;

  // Clean escaped chars FIRST so \n becomes actual newlines before YAML detection
  let sanitized = cleanEscapedChars(content);
  sanitized = stripFrontMatter(sanitized);
  return sanitized;
}

/**
 * Checks if content is empty or only contains placeholder text.
 *
 * Determines if content should be hidden from display because it's
 * either empty or consists only of TBD/placeholder markers. Short
 * content (< 100 chars) with TBD markers is considered empty.
 *
 * @param text - The text to check
 * @returns True if content is empty or TBD-only
 *
 * @example
 * ```typescript
 * isEmptyOrTBD(''); // true
 * isEmptyOrTBD('TBD - write this later'); // true
 * isEmptyOrTBD('Actual content here'); // false
 * ```
 */
export function isEmptyOrTBD(text: string): boolean {
  if (!text) return true;
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;
  if (trimmed.length < 100 && containsTBD(trimmed)) return true;
  return false;
}
