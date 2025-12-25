/**
 * Represents a single parsed content block from markdown
 */
export interface ParsedBlock {
  /** Block type (e.g., 'paragraph', 'dialogue', 'heading', 'scene_marker') */
  type: string;
  /** Text content of the block */
  text: string;
  /** Optional metadata specific to the block type */
  metadata?: Record<string, unknown>;
}

/**
 * Represents a parsed scene identifier
 */
export interface ParsedScene {
  /** Unique scene identifier */
  id: string;
  /** Scene title */
  title: string;
}

/**
 * Result of parsing markdown content into structured blocks
 */
export interface ParsedContent {
  /** Content title extracted from first heading */
  title: string;
  /** Content type (e.g., 'chapter', 'character', 'location') */
  type: string;
  /** Summary text extracted from first paragraph */
  summary: string | null;
  /** Array of parsed content blocks */
  blocks: ParsedBlock[];
  /** Array of scene markers found in content */
  scenes: ParsedScene[];
  /** Entity slugs mentioned in [[wiki-style]] links */
  mentions: string[];
  /** Total word count of content */
  wordCount: number;
}

/**
 * Parser for converting markdown content into structured blocks
 *
 * Handles various markdown elements:
 * - YAML frontmatter (stripped)
 * - Headings (# - ######)
 * - Paragraphs
 * - Dialogue (lines starting with quotes)
 * - Scene markers (----)
 * - Images (![alt](src))
 * - List items
 * - Entity mentions ([[entity-name]])
 */
export class MarkdownBlockParser {
  /**
   * Parse markdown content into structured blocks with scene detection
   *
   * @param content - Raw markdown content to parse
   * @returns Parsed content with blocks, scenes, mentions, and word count
   */
  static parse(content: string): ParsedContent {
    // Strip YAML front-matter first (delimited by --- at start)
    let processedContent = content;
    if (content.startsWith('---')) {
      const endIndex = content.indexOf('---', 3);
      if (endIndex !== -1) {
        processedContent = content.slice(endIndex + 3).trim();
      }
    }

    const lines = processedContent.split('\n');
    const blocks: ParsedBlock[] = [];
    const scenes: ParsedScene[] = [];
    const mentions: string[] = [];

    let title = '';
    let type = 'chapter';
    let summary: string | null = null;
    let currentParagraph = '';
    let totalWordCount = 0;
    let sceneCount = 0;

    // Extract front matter or title
    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines at the start
      if (!trimmed && !title) continue;

      // First heading becomes title
      const titleMatch = trimmed.match(/^#\s+(.+)$/);
      if (titleMatch && titleMatch[1] && !title) {
        title = titleMatch[1];
        continue;
      }

      // Type detection from content
      if (trimmed.toLowerCase().includes('chapter')) {
        type = 'chapter';
      } else if (trimmed.toLowerCase().includes('character')) {
        type = 'character';
      } else if (trimmed.toLowerCase().includes('location')) {
        type = 'location';
      }

      // Empty line - flush paragraph
      if (!trimmed) {
        if (currentParagraph) {
          const words = countWords(currentParagraph);
          totalWordCount += words;
          blocks.push({
            type: 'paragraph',
            text: currentParagraph.trim(),
          });
          currentParagraph = '';
        }
        continue;
      }

      // Heading
      const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch && headingMatch[1] && headingMatch[2]) {
        if (currentParagraph) {
          const words = countWords(currentParagraph);
          totalWordCount += words;
          blocks.push({
            type: 'paragraph',
            text: currentParagraph.trim(),
          });
          currentParagraph = '';
        }
        const words = countWords(headingMatch[2]);
        totalWordCount += words;
        blocks.push({
          type: 'heading',
          text: headingMatch[2],
          metadata: { level: headingMatch[1].length },
        });
        continue;
      }

      // Scene marker (----)
      if (trimmed.match(/^-{3,}$/)) {
        if (currentParagraph) {
          const words = countWords(currentParagraph);
          totalWordCount += words;
          blocks.push({
            type: 'paragraph',
            text: currentParagraph.trim(),
          });
          currentParagraph = '';
        }
        sceneCount++;
        const sceneId = `scene-${sceneCount}`;
        scenes.push({ id: sceneId, title: `Scene ${sceneCount}` });
        blocks.push({
          type: 'scene_marker',
          text: '',
          metadata: { role: 'start', title: 'Scene Break' },
        });
        continue;
      }

      // Dialogue (lines starting with quotes)
      if (trimmed.startsWith('"') || trimmed.startsWith("'") || trimmed.startsWith('\u201c')) {
        if (currentParagraph) {
          const words = countWords(currentParagraph);
          totalWordCount += words;
          blocks.push({
            type: 'paragraph',
            text: currentParagraph.trim(),
          });
          currentParagraph = '';
        }
        const words = countWords(trimmed);
        totalWordCount += words;
        blocks.push({
          type: 'dialogue',
          text: trimmed,
        });
        continue;
      }

      // Image
      const imageMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (imageMatch && imageMatch[1] !== undefined && imageMatch[2]) {
        if (currentParagraph) {
          const words = countWords(currentParagraph);
          totalWordCount += words;
          blocks.push({
            type: 'paragraph',
            text: currentParagraph.trim(),
          });
          currentParagraph = '';
        }
        blocks.push({
          type: 'image',
          text: imageMatch[1],
          metadata: { src: imageMatch[2], alt: imageMatch[1] },
        });
        continue;
      }

      // List item
      if (trimmed.match(/^[-*]\s/)) {
        if (currentParagraph) {
          const words = countWords(currentParagraph);
          totalWordCount += words;
          blocks.push({
            type: 'paragraph',
            text: currentParagraph.trim(),
          });
          currentParagraph = '';
        }
        const words = countWords(trimmed);
        totalWordCount += words;
        blocks.push({
          type: 'list',
          text: trimmed,
        });
        continue;
      }

      // Extract mentions (e.g., [[character-name]])
      const mentionMatches = trimmed.matchAll(/\[\[([^\]]+)\]\]/g);
      for (const match of mentionMatches) {
        if (match[1]) {
          const slug = match[1].toLowerCase().replace(/\s+/g, '-');
          if (!mentions.includes(slug)) {
            mentions.push(slug);
          }
        }
      }

      // Regular text - accumulate into paragraph
      currentParagraph += (currentParagraph ? ' ' : '') + trimmed;
    }

    // Flush remaining paragraph
    if (currentParagraph) {
      const words = countWords(currentParagraph);
      totalWordCount += words;
      blocks.push({
        type: 'paragraph',
        text: currentParagraph.trim(),
      });
    }

    // First paragraph can be summary
    if (blocks.length > 0 && blocks[0] && blocks[0].type === 'paragraph' && blocks[0].text) {
      summary = blocks[0].text.substring(0, 200);
    }

    return {
      title: title || 'Untitled',
      type,
      summary,
      blocks,
      scenes,
      mentions,
      wordCount: totalWordCount,
    };
  }
}

/**
 * Count words in a text string
 *
 * @param text - Text to count words in
 * @returns Number of words (whitespace-separated tokens)
 */
function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 0).length;
}
