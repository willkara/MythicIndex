export interface ParsedBlock {
  type: string;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface ParsedScene {
  id: string;
  title: string;
}

export interface ParsedContent {
  title: string;
  type: string;
  summary: string | null;
  blocks: ParsedBlock[];
  scenes: ParsedScene[];
  mentions: string[];
  wordCount: number;
}

export class MarkdownBlockParser {
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
      if (titleMatch && !title) {
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
      if (headingMatch) {
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
      if (imageMatch) {
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
        const slug = match[1].toLowerCase().replace(/\s+/g, '-');
        if (!mentions.includes(slug)) {
          mentions.push(slug);
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
    if (blocks.length > 0 && blocks[0].type === 'paragraph') {
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

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}
