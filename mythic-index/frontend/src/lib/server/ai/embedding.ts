import type { Ai } from '@cloudflare/workers-types';

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
 * and the BGE-base-en-v1.5 embedding model. Generates vector embeddings
 * from text for similarity matching and search.
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
   * Uses Cloudflare Workers AI with the BGE-base-en-v1.5 model to generate
   * a semantic vector embedding of the input text. Returns an empty array
   * if the AI binding is unavailable or if generation fails.
   *
   * @param text - The text to generate an embedding for
   * @returns Vector embedding as an array of numbers, or empty array on failure
   *
   * @example
   * ```typescript
   * const service = new EmbeddingService(platform.env.AI);
   * const embedding = await service.generateEmbedding('Sample text');
   * console.log(`Generated ${embedding.length}-dimensional embedding`);
   * ```
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.ai) {
      console.warn('AI binding not available, returning empty embedding');
      return [];
    }

    try {
      const response = (await this.ai.run('@cf/baai/bge-base-en-v1.5', {
        text: [text],
      })) as { data: number[][] };

      if (response.data && response.data.length > 0) {
        return response.data[0];
      }

      return [];
    } catch (error) {
      console.error('Failed to generate embedding:', error);
      return [];
    }
  }

  /**
   * Searches for content blocks similar to the query text.
   *
   * This is a placeholder implementation that would typically use a vector
   * database like Cloudflare Vectorize to find semantically similar content
   * blocks based on embedding similarity.
   *
   * @param query - The search query text
   * @param limit - Maximum number of results to return (default: 10)
   * @returns Array of search results (currently returns empty array)
   *
   * @example
   * ```typescript
   * const results = await service.searchSimilar('dragon battle', 5);
   * results.forEach(r => console.log(`${r.contentTitle}: ${r.score}`));
   * ```
   */
  async searchSimilar(query: string, limit: number = 10): Promise<SearchResult[]> {
    // This would normally use a vector database like Vectorize
    // For now, return empty results
    console.log('Search query:', query, 'limit:', limit);
    return [];
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
