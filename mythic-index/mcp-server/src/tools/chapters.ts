/**
 * Chapter management tools
 * Create, edit, and manage story chapters
 */

import { z } from 'zod';
import { getStorage } from '../services/storage.js';
import { getConfig } from '../services/config.js';
import { getRemote } from '../services/remote.js';
import * as d1 from '../services/d1.js';
import type { Chapter, Scene } from '../types/index.js';
import { getLogger } from '../services/logger.js';
import { elicitEntitySelection, formatCandidatesForGuidance } from '../services/elicitation.js';
import type { MatchType, MatchInfo } from './characters.js';

// Helper to transform D1 ContentItemRow to Chapter type
function contentItemToChapter(row: d1.ContentItemRow): Chapter {
  const metadata = row.metadata_json ? JSON.parse(row.metadata_json) : {};
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    slug: row.slug,
    title: row.title,
    summary: row.summary || undefined,
    status: row.status as Chapter['status'],
    wordCount: row.word_count || 0,
    number: metadata.number,
    arc: metadata.arc,
    povCharacter: metadata.povCharacter,
    povType: metadata.povType,
    featuredCharacters: metadata.featuredCharacters,
    featuredLocations: metadata.featuredLocations,
    content: metadata.content,
    scenes: metadata.scenes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface GetChapterResult {
  chapter: Chapter | null;
  candidates?: Chapter[];
  matchInfo?: MatchInfo;
  guidanceMessage?: string;
}

/**
 * Format a chapter for elicitation display
 */
function formatChapterOption(chapter: Chapter): string {
  const parts: string[] = [];
  if (chapter.number) parts.push(`Ch ${chapter.number}`);
  if (chapter.arc) parts.push(chapter.arc);
  if (chapter.status) parts.push(`[${chapter.status}]`);
  return parts.length > 0 ? parts.join(' - ') : 'no details';
}

// Tool schemas
export const getChapterSchema = z.object({
  identifier: z.union([z.string(), z.number()])
    .describe('Chapter slug or number'),
  includeContent: z.boolean().optional().default(true)
    .describe('Include full chapter content'),
});

export const listChaptersSchema = z.object({
  status: z.enum(['outline', 'draft', 'revision', 'final', 'published']).optional(),
  arc: z.string().optional().describe('Filter by story arc'),
});

export const createChapterSchema = z.object({
  title: z.string().describe('Chapter title'),
  number: z.number().optional().describe('Chapter number (auto-assigned if not provided)'),
  arc: z.string().optional().describe('Story arc this chapter belongs to'),
  summary: z.string().optional().describe('Brief chapter summary'),
  content: z.string().optional().describe('Initial chapter content (markdown)'),
  povCharacter: z.string().optional().describe('POV character name'),
  povType: z.enum(['first', 'third-limited', 'third-omniscient']).optional(),
  featuredCharacters: z.array(z.string()).optional(),
  featuredLocations: z.array(z.string()).optional(),
});

export const editChapterSchema = z.object({
  identifier: z.union([z.string(), z.number()]).describe('Chapter slug or number'),
  updates: z.object({
    title: z.string().optional(),
    summary: z.string().optional(),
    content: z.string().optional(),
    status: z.enum(['outline', 'draft', 'revision', 'final', 'published']).optional(),
    povCharacter: z.string().optional(),
    featuredCharacters: z.array(z.string()).optional(),
    featuredLocations: z.array(z.string()).optional(),
  }),
});

export const appendToChapterSchema = z.object({
  identifier: z.union([z.string(), z.number()]).describe('Chapter slug or number'),
  content: z.string().describe('Content to append'),
  addSceneSeparator: z.boolean().optional().default(false)
    .describe('Add scene separator before content'),
});

export const addSceneSchema = z.object({
  chapterIdentifier: z.union([z.string(), z.number()]),
  title: z.string().optional(),
  summary: z.string().optional(),
  content: z.string().optional(),
  location: z.string().optional(),
  timeOfDay: z.string().optional(),
  povCharacter: z.string().optional(),
  charactersPresent: z.array(z.string()).optional(),
  mood: z.string().optional(),
  tension: z.enum(['low', 'medium', 'high', 'climax']).optional(),
  purpose: z.string().optional().describe('What this scene accomplishes'),
});

export const getChapterOutlineSchema = z.object({
  identifier: z.union([z.string(), z.number()]).describe('Chapter slug or number'),
});

// Tool implementations
export async function getChapter(input: z.infer<typeof getChapterSchema>): Promise<GetChapterResult> {
  const logger = getLogger();
  const searchTerm = String(input.identifier).trim();

  // Helper to strip content if not requested
  const stripContent = (chapter: Chapter): Chapter => {
    if (!input.includeContent) {
      const { content, ...summary } = chapter;
      return summary as Chapter;
    }
    return chapter;
  };

  // Try D1 first if available
  if (d1.isD1Available()) {
    try {
      // Step 1: Try exact slug match first (fast path)
      const exactMatch = await d1.getChapter(searchTerm);
      if (exactMatch) {
        return {
          chapter: stripContent(contentItemToChapter(exactMatch)),
          matchInfo: { type: 'exact', originalQuery: searchTerm, matchCount: 1 }
        };
      }

      // Step 2: Fuzzy search
      const fuzzyResults = await d1.searchContentItems('chapter', searchTerm, { limit: 5 });

      if (fuzzyResults.length === 0) {
        // No matches at all
        return {
          chapter: null,
          matchInfo: { type: 'fuzzy', originalQuery: searchTerm, matchCount: 0 }
        };
      }

      if (fuzzyResults.length === 1) {
        // Single match - return it
        logger.debug('Single fuzzy match found for chapter', {
          module: 'chapters',
          query: searchTerm,
          matchedSlug: fuzzyResults[0].slug,
          matchType: fuzzyResults[0].matchType,
          matchScore: fuzzyResults[0].matchScore
        });
        return {
          chapter: stripContent(contentItemToChapter(fuzzyResults[0])),
          matchInfo: { type: 'fuzzy', originalQuery: searchTerm, matchCount: 1 }
        };
      }

      // Step 3: Multiple matches - try elicitation
      const candidates = fuzzyResults.map(contentItemToChapter);
      const elicitResult = await elicitEntitySelection(
        'chapter',
        candidates.map(c => ({ ...c, name: c.title })),
        searchTerm,
        (c: Chapter & { name: string }) => formatChapterOption(c)
      );

      if (elicitResult.success && elicitResult.selected) {
        return {
          chapter: stripContent(elicitResult.selected as unknown as Chapter),
          matchInfo: { type: 'elicited', originalQuery: searchTerm, matchCount: fuzzyResults.length }
        };
      }

      // Elicitation declined or not supported - return ambiguous result with guidance
      const guidanceMessage = formatCandidatesForGuidance(
        'chapter',
        candidates.map(c => ({ ...c, name: c.title })),
        searchTerm,
        (c: Chapter & { name: string }) => formatChapterOption(c)
      );

      return {
        chapter: null,
        candidates,
        matchInfo: { type: 'ambiguous', originalQuery: searchTerm, matchCount: fuzzyResults.length },
        guidanceMessage
      };

    } catch (error) {
      logger.warn('D1 fuzzy search failed for chapter, falling back to remote', {
        module: 'chapters',
        error: (error as Error).message
      });
      // Fall through to remote
    }
  }

  // Fall back to remote API (existing exact-match logic)
  const remote = getRemote();
  const chapter = await remote.getChapter(input.identifier);

  if (chapter) {
    return {
      chapter: stripContent(chapter),
      matchInfo: { type: 'exact', originalQuery: searchTerm, matchCount: 1 }
    };
  }

  return {
    chapter: null,
    matchInfo: { type: 'exact', originalQuery: searchTerm, matchCount: 0 }
  };
}

export async function listChapters(input: z.infer<typeof listChaptersSchema>): Promise<Chapter[]> {
  // Try D1 first if available
  if (d1.isD1Available()) {
    const rows = await d1.listChapters({ status: input.status });
    const chapters = rows.map(contentItemToChapter);
    // Return summaries without full content
    return chapters.map(({ content, ...summary }) => summary as Chapter);
  }

  // Fall back to remote API
  const remote = getRemote();
  const chapters = await remote.listChapters(input);

  // Return summaries without full content
  return chapters.map(({ content, ...summary }) => summary as Chapter);
}

export async function createChapter(input: z.infer<typeof createChapterSchema>): Promise<Chapter> {
  const config = getConfig();
  const remote = getRemote();

  // Auto-assign chapter number if not provided
  let number = input.number;
  if (!number) {
    const existing = await remote.listChapters();
    number = existing.length + 1;
  }

  const slug = input.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  const chapter = await remote.createChapter({
    workspaceId: config.workspace.id,
    slug,
    title: input.title,
    number,
    arc: input.arc,
    summary: input.summary,
    content: input.content || '',
    status: 'draft',
    povCharacter: input.povCharacter,
    povType: input.povType || config.writing.defaultPov,
    featuredCharacters: input.featuredCharacters,
    featuredLocations: input.featuredLocations,
    wordCount: input.content ? countWords(input.content) : 0,
  });

  return chapter;
}

export async function editChapter(input: z.infer<typeof editChapterSchema>): Promise<Chapter> {
  const remote = getRemote();

  const existing = await remote.getChapter(input.identifier);
  if (!existing) {
    throw new Error(`Chapter not found: ${input.identifier}`);
  }

  const updates = { ...input.updates };

  // Recalculate word count if content changed
  if (updates.content) {
    (updates as any).wordCount = countWords(updates.content);
  }

  return remote.updateChapter(existing.slug, updates);
}

export async function appendToChapter(input: z.infer<typeof appendToChapterSchema>): Promise<Chapter> {
  const config = getConfig();
  const remote = getRemote();

  const existing = await remote.getChapter(input.identifier);
  if (!existing) {
    throw new Error(`Chapter not found: ${input.identifier}`);
  }

  let newContent = existing.content || '';

  if (input.addSceneSeparator) {
    newContent += `\n\n${config.writing.sceneSeparator}\n\n`;
  } else if (newContent) {
    newContent += '\n\n';
  }

  newContent += input.content;

  return remote.updateChapter(existing.slug, {
    content: newContent,
    wordCount: countWords(newContent),
  });
}

export async function addScene(input: z.infer<typeof addSceneSchema>): Promise<{ chapter: Chapter; scene: Scene }> {
  const remote = getRemote();

  const chapter = await remote.getChapter(input.chapterIdentifier);
  if (!chapter) {
    throw new Error(`Chapter not found: ${input.chapterIdentifier}`);
  }

  const scenes = chapter.scenes || [];
  const sceneId = `scene_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const newScene: Scene = {
    id: sceneId,
    chapterId: chapter.id,
    sequence: scenes.length + 1,
    title: input.title,
    summary: input.summary,
    content: input.content,
    location: input.location,
    timeOfDay: input.timeOfDay,
    povCharacter: input.povCharacter,
    charactersPresent: input.charactersPresent,
    mood: input.mood,
    tension: input.tension,
    purpose: input.purpose,
  };

  scenes.push(newScene);

  const updatedChapter = await remote.updateChapter(chapter.slug, { scenes });

  return { chapter: updatedChapter, scene: newScene };
}

export async function getChapterOutline(input: z.infer<typeof getChapterOutlineSchema>): Promise<{
  title: string;
  number?: number;
  summary?: string;
  wordCount: number;
  status: string;
  scenes: Array<{
    sequence: number;
    title?: string;
    summary?: string;
    location?: string;
    tension?: string;
  }>;
}> {
  const remote = getRemote();
  const chapter = await remote.getChapter(input.identifier);

  if (!chapter) {
    throw new Error(`Chapter not found: ${input.identifier}`);
  }

  return {
    title: chapter.title,
    number: chapter.number,
    summary: chapter.summary,
    wordCount: chapter.wordCount || 0,
    status: chapter.status,
    scenes: (chapter.scenes || []).map(s => ({
      sequence: s.sequence,
      title: s.title,
      summary: s.summary,
      location: s.location,
      tension: s.tension,
    })),
  };
}

// Utility functions
function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 0).length;
}

export function formatChapterSummary(chapter: Chapter): string {
  const lines: string[] = [];

  lines.push(`# Chapter ${chapter.number || '?'}: ${chapter.title}`);
  lines.push(`**Status:** ${chapter.status}`);
  if (chapter.arc) lines.push(`**Arc:** ${chapter.arc}`);
  if (chapter.wordCount) lines.push(`**Words:** ${chapter.wordCount.toLocaleString()}`);
  if (chapter.povCharacter) lines.push(`**POV:** ${chapter.povCharacter}`);

  if (chapter.summary) {
    lines.push(`\n## Summary\n${chapter.summary}`);
  }

  if (chapter.featuredCharacters?.length) {
    lines.push(`\n## Characters\n${chapter.featuredCharacters.join(', ')}`);
  }

  if (chapter.featuredLocations?.length) {
    lines.push(`\n## Locations\n${chapter.featuredLocations.join(', ')}`);
  }

  if (chapter.scenes?.length) {
    lines.push('\n## Scenes');
    chapter.scenes.forEach((scene, i) => {
      const parts = [`${i + 1}.`];
      if (scene.title) parts.push(`**${scene.title}**`);
      if (scene.location) parts.push(`@ ${scene.location}`);
      if (scene.tension) parts.push(`[${scene.tension}]`);
      lines.push(parts.join(' '));
      if (scene.summary) lines.push(`   ${scene.summary}`);
    });
  }

  return lines.join('\n');
}
