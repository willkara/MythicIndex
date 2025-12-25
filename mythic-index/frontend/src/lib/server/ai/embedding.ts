import type { Ai, VectorizeIndex } from '@cloudflare/workers-types';

/**
 * Result of generating an embedding for a content block.
 *
 * Contains the block ID and its vector embedding representation
 * for semantic search and similarity matching.
 */
export interface EmbeddingResult {
  /** ID of the content block that was embedded */
  blockId: string;
  /** Vector embedding as an array of numbers */
  embedding: number[];
}

/**
 * Result of a semantic search query.
 *
 * Represents a search result with similarity score and metadata
 * about the matched content block.
 */
export interface SearchResult {
  /** ID of the matched content block */
  blockId: string;
  /** Similarity score (0-1, higher is more similar) */
  score: number;
  /** Text content of the matched block */
  text: string;
  /** Title of the content item containing this block */
  contentTitle: string;
  /** Slug of the content item */
  contentSlug: string;
  /** Kind of content (chapter, character, etc.) */
  contentKind: string;
}

/**
 * Service for generating and searching vector embeddings.
 *
 * Provides semantic search capabilities using Cloudflare Workers AI
 * and the BGE-M3 embedding model. Generates 1024-dimensional vector embeddings
 * from text for similarity matching and search. Supports up to 8,192 tokens
 * of context, enabling entity-level chunking (entire chapters/characters/locations).
 */
export class EmbeddingService {
  private ai: Ai | null;

  /**
   * Creates a new EmbeddingService instance.
   *
   * @param ai - Optional Cloudflare Workers AI binding. If not provided,
   *             embedding operations will return empty results with warnings.
   */
  constructor(ai?: Ai) {
    this.ai = ai ?? null;
  }

  /**
   * Generates a vector embedding for the given text.
   *
   * Uses Cloudflare Workers AI with the BGE-M3 model to generate
   * a 1024-dimensional semantic vector embedding of the input text.
   * Supports up to 8,192 tokens (~32,768 characters), allowing entire
   * chapters, character profiles, or locations to be embedded as single vectors.
   *
   * @param text - The text to generate an embedding for (max 8,192 tokens)
   * @returns 1024-dimensional vector embedding, or empty array on failure
   *
   * @example
   * ```typescript
   * const service = new EmbeddingService(platform.env.AI);
   * const embedding = await service.generateEmbedding('Sample text');
   * console.log(`Generated ${embedding.length}-dimensional embedding`); // 1024
   * ```
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.ai) {
      console.warn('AI binding not available, returning empty embedding');
      return [];
    }

    try {
      const response = (await this.ai.run('@cf/baai/bge-m3', {
        text: [text],
      })) as { data: number[][] };

      if (response.data && response.data.length > 0 && response.data[0]) {
        return response.data[0];
      }

      return [];
    } catch (error) {
      console.error('Failed to generate embedding:', error);
      return [];
    }
  }

  /**
   * Searches for content similar to the query text using Vectorize.
   *
   * Generates an embedding for the query text and searches the Vectorize
   * index for semantically similar content entities (chapters, characters, locations).
   * Returns results ranked by cosine similarity score.
   *
   * @param query - The search query text
   * @param vectorize - Cloudflare Vectorize index binding
   * @param options - Search options (limit, filter by kind)
   * @returns Array of search results with similarity scores
   *
   * @example
   * ```typescript
   * const results = await service.searchSimilar(
   *   'dragon battle aftermath',
   *   platform.env.VECTORIZE_INDEX,
   *   { limit: 10, filter: { kind: 'chapter' } }
   * );
   * results.forEach(r => console.log(`${r.contentTitle}: ${r.score.toFixed(3)}`));
   * ```
   */
  async searchSimilar(
    query: string,
    vectorize: VectorizeIndex,
    options?: {
      limit?: number;
      filter?: { kind?: 'chapter' | 'character' | 'location' };
    }
  ): Promise<SearchResult[]> {
    if (!this.ai) {
      console.warn('AI binding not available, cannot perform search');
      return [];
    }

    try {
      // Generate embedding for query
      const queryEmbedding = await this.generateEmbedding(query);

      if (queryEmbedding.length === 0) {
        console.warn('Failed to generate query embedding');
        return [];
      }

      // Query Vectorize index
      const matches = await vectorize.query(queryEmbedding, {
        topK: options?.limit || 10,
        returnMetadata: true,
        filter: options?.filter,
      });

      // Transform Vectorize results to SearchResult format
      return matches.matches.map((match) => ({
        blockId: match.id,
        score: match.score,
        text: (match.metadata?.textPreview as string) || '',
        contentTitle: (match.metadata?.title as string) || '',
        contentSlug: (match.metadata?.slug as string) || '',
        contentKind: (match.metadata?.kind as string) || '',
      }));
    } catch (error) {
      console.error('Failed to search similar content:', error);
      return [];
    }
  }

  /**
   * Checks if the AI embedding service is available.
   *
   * @returns True if AI binding is configured, false otherwise
   */
  isAvailable(): boolean {
    return this.ai !== null;
  }
}
