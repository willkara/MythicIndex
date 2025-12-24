import { EmbeddingService } from '$lib/server/ai/embedding';
import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';

/**
 * Server actions for search page
 * Handles vector search queries using Cloudflare Vectorize and Workers AI
 */
export const actions = {
  /**
   * Default search action
   * Generates embeddings for the query and searches the vector database
   * @param request - Form request with query parameter
   * @param platform - SvelteKit platform with VECTORIZE and AI bindings
   * @returns Search results with matching content blocks
   */
  default: async ({ request, platform }) => {
    if (!platform?.env?.VECTORIZE || !platform?.env?.AI) {
      // Mock response for dev without bindings
      return fail(500, {
        results: [] as any[], // Typing bypass for PoC
        error: 'Vector Search bindings not available',
      });
    }

    const formData = await request.formData();
    const query = formData.get('query') as string;

    if (!query) {
      return fail(400, { results: [], error: 'Missing query' });
    }

    try {
      const embeddingService = new EmbeddingService(platform.env.AI);
      const queryVector = await embeddingService.generateEmbedding(query);

      if (queryVector.length === 0) {
        return { results: [] };
      }

      const matches = await platform.env.VECTORIZE.query(queryVector, {
        topK: 5,
        returnMetadata: true,
      });

      const results = matches.matches.map(match => ({
        id: match.id,
        score: match.score,
        slug: match.metadata?.slug as string,
        title: match.metadata?.title as string,
        textPreview: match.metadata?.textPreview as string,
        blockType: match.metadata?.blockType as string,
      }));

      return { results };
    } catch (e) {
      console.error('Search failed:', e);
      return fail(500, { results: [], error: 'Search operation failed' });
    }
  },
} satisfies Actions;
