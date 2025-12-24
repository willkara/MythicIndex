/**
 * Search and discovery tools
 * Semantic search across your story content using Vectorize
 * Falls back to D1 LIKE search when Vectorize is not available
 */

import { z } from 'zod';
import { getRemote } from '../services/remote.js';
import * as d1 from '../services/d1.js';

// Tool schemas
export const searchSchema = z.object({
  query: z.string().describe('Natural language search query'),
  type: z.enum(['all', 'character', 'location', 'chapter', 'lore']).optional()
    .default('all')
    .describe('Filter by content type'),
  limit: z.number().optional().default(10).describe('Maximum results'),
});

export const findMentionsSchema = z.object({
  name: z.string().describe('Character or location name to find mentions of'),
  inChapters: z.array(z.string()).optional().describe('Limit to specific chapters'),
});

// Tool implementations
export async function search(input: z.infer<typeof searchSchema>): Promise<Array<{
  type: string;
  title: string;
  slug: string;
  preview: string;
  score: number;
}>> {
  // Try D1 search first if available (simple LIKE-based search)
  if (d1.isD1Available()) {
    const kind = input.type === 'all' ? undefined : input.type;
    const rows = await d1.searchContent(input.query, { kind, limit: input.limit });

    return rows.map((r, idx) => ({
      type: r.kind,
      title: r.title,
      slug: r.slug,
      preview: r.summary || '(No summary)',
      score: 1 - (idx * 0.1), // Simple score based on result order
    }));
  }

  // Fall back to remote semantic search
  const remote = getRemote();

  const results = await remote.semanticSearch(input.query, {
    topK: input.limit,
    type: input.type === 'all' ? undefined : input.type,
  });

  return results.map(r => ({
    type: r.type,
    title: r.title,
    slug: r.slug,
    preview: r.preview,
    score: r.score,
  }));
}

export async function findMentions(input: z.infer<typeof findMentionsSchema>): Promise<Array<{
  chapter: string;
  chapterNumber?: number;
  context: string;
}>> {
  const remote = getRemote();

  // Use semantic search to find mentions
  const results = await remote.semanticSearch(`mentions of ${input.name}`, {
    topK: 20,
    type: 'chapter',
  });

  // Filter by specific chapters if provided
  let filtered = results;
  if (input.inChapters?.length) {
    filtered = results.filter(r => input.inChapters!.includes(r.slug));
  }

  return filtered.map(r => ({
    chapter: r.title,
    chapterNumber: undefined, // Would need to fetch chapter details
    context: r.preview,
  }));
}
