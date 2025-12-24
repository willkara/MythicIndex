/**
 * Chapter parsing module
 * Parses chapter content.md files, extracting YAML frontmatter and scene markers
 */

import * as yaml from 'yaml';
import type { ParsedChapter, SceneMarker, ChapterFrontmatter } from './types.js';

// ============================================================================
// YAML Frontmatter Parsing
// ============================================================================

function extractFrontmatter(content: string): {
  frontmatter: ChapterFrontmatter | null;
  body: string;
} {
  if (!content.startsWith('---')) {
    return { frontmatter: null, body: content };
  }

  const endIndex = content.indexOf('---', 3);
  if (endIndex === -1) {
    return { frontmatter: null, body: content };
  }

  const yamlContent = content.slice(3, endIndex).trim();
  const body = content.slice(endIndex + 3).trim();

  try {
    const parsed = yaml.parse(yamlContent) as ChapterFrontmatter;
    return { frontmatter: parsed, body };
  } catch {
    return { frontmatter: null, body: content };
  }
}

// ============================================================================
// Scene Marker Parsing
// ============================================================================

interface RawSceneMarker {
  id: string;
  title: string;
  when?: string;
  location?: string;
  characters?: string[];
  tags?: string[];
  images?: string[];
  startIndex: number;
  endIndex: number;
}

/**
 * Parse scene markers from HTML comments
 * Format: <!-- SCENE-START id:xxx title:"xxx" location:"xxx" characters:["xxx"] tags:["xxx"] images:["xxx"] -->
 */
function parseSceneMarkers(content: string): RawSceneMarker[] {
  const markers: RawSceneMarker[] = [];

  // Match SCENE-START comments (may span multiple lines)
  const startRegex = /<!--\s*SCENE-START\s+([\s\S]*?)-->/g;
  const endRegex = /<!--\s*SCENE-END\s+id:([^\s]+)\s*-->/g;

  // Build map of start markers
  const startMarkers = new Map<string, { attrs: Record<string, unknown>; index: number }>();
  let startMatch;

  while ((startMatch = startRegex.exec(content)) !== null) {
    const attrString = startMatch[1];
    const attrs = parseSceneAttributes(attrString);
    const id = attrs.id as string;
    if (id) {
      startMarkers.set(id, {
        attrs,
        index: startMatch.index + startMatch[0].length,
      });
    }
  }

  // Match with end markers
  let endMatch;
  while ((endMatch = endRegex.exec(content)) !== null) {
    const id = endMatch[1];
    const startInfo = startMarkers.get(id);
    if (startInfo) {
      const attrs = startInfo.attrs;
      markers.push({
        id,
        title: (attrs.title as string) || `Scene ${markers.length + 1}`,
        when: attrs.when as string | undefined,
        location: attrs.location as string | undefined,
        characters: parseArrayAttr(attrs.characters),
        tags: parseArrayAttr(attrs.tags),
        images: parseArrayAttr(attrs.images),
        startIndex: startInfo.index,
        endIndex: endMatch.index,
      });
    }
  }

  return markers;
}

/**
 * Parse attribute string into key-value pairs
 * Handles: id:xxx title:"quoted value" array:["a","b"]
 */
function parseSceneAttributes(attrString: string): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};

  // Normalize whitespace (collapse newlines and multiple spaces)
  const normalized = attrString.replace(/\s+/g, ' ').trim();

  // Match patterns: key:value, key:"quoted value", key:["array"]
  const attrRegex = /(\w+):\s*(?:"([^"]+)"|'([^']+)'|\[([^\]]*)\]|([^\s]+))/g;
  let match;

  while ((match = attrRegex.exec(normalized)) !== null) {
    const key = match[1];
    const quotedValue = match[2] || match[3];
    const arrayValue = match[4];
    const plainValue = match[5];

    if (quotedValue !== undefined) {
      attrs[key] = quotedValue;
    } else if (arrayValue !== undefined) {
      // Parse array: ["a","b","c"]
      try {
        attrs[key] = JSON.parse(`[${arrayValue}]`);
      } catch {
        // Try without JSON parse
        attrs[key] = arrayValue
          .split(',')
          .map((s) => s.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
      }
    } else if (plainValue !== undefined) {
      attrs[key] = plainValue;
    }
  }

  return attrs;
}

function parseArrayAttr(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return [value];
  }
  return [];
}

// ============================================================================
// Word Count
// ============================================================================

function countWords(text: string): number {
  // Normalize line endings and remove HTML comments and scene markers
  const cleaned = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*>\s*\[.*?\].*$/gm, '') // Remove epigraphs like > [EPIGRAPH]
    .replace(/^#.*$/gm, '') // Remove headings
    .trim();

  return cleaned.split(/\s+/).filter((w) => w.length > 0).length;
}

// ============================================================================
// Content Extraction
// ============================================================================

function extractSceneContent(content: string, startIndex: number, endIndex: number): string {
  return content.slice(startIndex, endIndex).trim();
}

// ============================================================================
// Main Parser
// ============================================================================

export function parseChapterContent(slug: string, content: string): ParsedChapter {
  const { frontmatter, body } = extractFrontmatter(content);

  // Parse scene markers
  const rawMarkers = parseSceneMarkers(body);

  // Convert to SceneMarker with content
  const scenes: SceneMarker[] = rawMarkers.map((marker) => {
    const sceneContent = extractSceneContent(body, marker.startIndex, marker.endIndex);
    return {
      id: marker.id,
      title: marker.title,
      when: marker.when,
      location: marker.location,
      characters: marker.characters || [],
      tags: marker.tags || [],
      images: marker.images || [],
      content: sceneContent,
      wordCount: countWords(sceneContent),
    };
  });

  // Extract title from body if not in frontmatter
  let title = frontmatter?.title || '';
  if (!title) {
    const titleMatch = body.match(/^#\s+(?:Chapter\s+\d+\s*[-–—]\s*)?(.+)$/m);
    if (titleMatch) {
      title = titleMatch[1].trim();
    }
  }

  const totalWordCount = frontmatter?.word_count || countWords(body);

  return {
    slug,
    frontmatter: frontmatter || {
      title: title || slug,
      chapter_number: extractChapterNumber(slug),
    },
    title: title || slug,
    chapterNumber: frontmatter?.chapter_number || extractChapterNumber(slug),
    status: frontmatter?.status || 'draft',
    povCharacter: frontmatter?.pov_character,
    keyCharacters: frontmatter?.key_characters || [],
    keyLocations: frontmatter?.key_locations || [],
    timelineAnchor: frontmatter?.timeline_anchor,
    majorEvents: frontmatter?.major_events || [],
    motifs: frontmatter?.motifs || [],
    canonLevel: frontmatter?.canon_level,
    scenes,
    fullContent: body,
    wordCount: totalWordCount,
  };
}

function extractChapterNumber(slug: string): number {
  // Extract from slug like "ch01-ash-and-compass"
  const match = slug.match(/ch(\d+)/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  return 0;
}

// ============================================================================
// Batch Processing Helper
// ============================================================================

export function extractChapterMetadataJson(chapter: ParsedChapter): Record<string, unknown> {
  return {
    pov_character: chapter.povCharacter,
    key_characters: chapter.keyCharacters,
    key_locations: chapter.keyLocations,
    timeline_anchor: chapter.timelineAnchor,
    major_events: chapter.majorEvents,
    motifs: chapter.motifs,
    canon_level: chapter.canonLevel,
  };
}
