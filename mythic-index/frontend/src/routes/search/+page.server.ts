import { EmbeddingService } from '$lib/server/ai/embedding';
import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';

/**
 * Server actions for search page
 * Handles semantic search queries using entity-level embeddings (chapters, characters, locations)
 */
export const actions = {
  /**
   * Default search action
   * Searches across entire chapters, characters, and locations using BGE-M3 embeddings
   * @param request - Form request with query and optional kind filter
   * @param platform - SvelteKit platform with VECTORIZE_INDEX and AI bindings
   * @returns Search results with matching entities
   */
  default: async ({ request, platform }) => {
    if (!platform?.env?.VECTORIZE_INDEX || !platform?.env?.AI) {
      return fail(500, {
        results: [],
        error: 'Semantic search not available (Vectorize or AI binding missing)',
      });
    }

    const formData = await request.formData();
    const query = formData.get('query') as string;
    const kindFilter = formData.get('kind') as 'chapter' | 'character' | 'location' | null;

    if (!query?.trim()) {
      return fail(400, { results: [], error: 'Search query is required' });
    }

    try {
      const embeddingService = new EmbeddingService(platform.env.AI);

      // Use the searchSimilar method which handles embedding generation + Vectorize query
      const results = await embeddingService.searchSimilar(
        query,
        platform.env.VECTORIZE_INDEX,
        {
          limit: 10,
          filter: kindFilter ? { kind: kindFilter } : undefined,
        }
      );

      return { results };
    } catch (e) {
      console.error('Semantic search failed:', e);
      return fail(500, { results: [], error: 'Search operation failed' });
    }
  },
} satisfies Actions;
