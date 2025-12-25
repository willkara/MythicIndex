/**
 * Vectorize Service - Vector database operations via REST API
 *
 * Provides access to Cloudflare Vectorize for storing and querying
 * vector embeddings of content entities (chapters, characters, locations).
 */

import { getIngestionConfig } from '../config.js';

/**
 * Vector record for upserting into Vectorize
 */
export interface VectorRecord {
	/** Unique identifier (typically content_item.id or character.id) */
	id: string;
	/** 1024-dimensional embedding vector from BGE-M3 */
	values: number[];
	/** Metadata for filtering and display */
	metadata: {
		/** Content type: chapter, character, or location */
		kind: 'chapter' | 'character' | 'location';
		/** Content slug (URL-friendly identifier) */
		slug: string;
		/** Display title */
		title: string;
		/** First 100 characters for search result preview */
		textPreview: string;
	};
}

/**
 * Cloudflare Vectorize REST API client
 *
 * Manages vector embeddings for semantic search across narrative content.
 * Uses entity-level chunking: entire chapters/characters/locations embedded
 * as single vectors, taking advantage of BGE-M3's 8,192 token context window.
 */
export class VectorizeService {
	private accountId: string;
	private indexId: string;
	private apiToken: string;
	private baseUrl: string;

	/**
	 * Create a new Vectorize service instance
	 *
	 * @param accountId - Cloudflare account ID
	 * @param indexId - Vectorize index ID (from wrangler vectorize create)
	 * @param apiToken - Cloudflare API token with Vectorize permissions
	 */
	constructor(accountId: string, indexId: string, apiToken: string) {
		this.accountId = accountId;
		this.indexId = indexId;
		this.apiToken = apiToken;
		this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/indexes/${indexId}`;
	}

	/**
	 * Upsert vectors into Vectorize index
	 *
	 * Supports batching up to 1,000 vectors per request. For entity-level
	 * chunking, typical batches will be much smaller (10-50 entities).
	 *
	 * @param vectors - Array of vector records to insert/update
	 * @throws Error if API request fails
	 *
	 * @example
	 * ```typescript
	 * await vectorize.upsertBatch([{
	 *   id: 'chapter-ch01-ash-and-compass',
	 *   values: [0.123, 0.456, ...], // 1024 dimensions
	 *   metadata: {
	 *     kind: 'chapter',
	 *     slug: 'ch01-ash-and-compass',
	 *     title: 'Ash and Compass',
	 *     textPreview: 'The day's last gleam pooled...'
	 *   }
	 * }]);
	 * ```
	 */
	async upsertBatch(vectors: VectorRecord[]): Promise<void> {
		const response = await fetch(`${this.baseUrl}/upsert`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.apiToken}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ vectors }),
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Vectorize upsert failed: ${error}`);
		}
	}

	/**
	 * Delete vectors by ID
	 *
	 * Useful for re-ingestion workflows where content needs to be
	 * removed before re-embedding with updated text.
	 *
	 * @param ids - Array of vector IDs to delete
	 * @throws Error if API request fails
	 *
	 * @example
	 * ```typescript
	 * // Delete before re-ingesting
	 * await vectorize.deleteByIds(['chapter-ch01-ash-and-compass']);
	 * ```
	 */
	async deleteByIds(ids: string[]): Promise<void> {
		const response = await fetch(`${this.baseUrl}/delete`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.apiToken}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ ids }),
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Vectorize delete failed: ${error}`);
		}
	}

	/**
	 * Query vectors for similarity search
	 *
	 * Note: This is primarily used by the frontend. The chargen CLI
	 * uses this service mainly for ingestion (upsert/delete).
	 *
	 * @param queryVector - 1024-dimensional query embedding
	 * @param topK - Number of results to return (default: 10)
	 * @returns Array of matching vector IDs and scores
	 */
	async query(
		queryVector: number[],
		options?: { topK?: number; filter?: Record<string, unknown> }
	): Promise<{ id: string; score: number; metadata: Record<string, unknown> }[]> {
		const response = await fetch(`${this.baseUrl}/query`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.apiToken}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				vector: queryVector,
				topK: options?.topK || 10,
				filter: options?.filter,
				returnMetadata: true,
			}),
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Vectorize query failed: ${error}`);
		}

		const result = await response.json();
		return result.result.matches || [];
	}
}

// ============================================================================
// Singleton Instance Management
// ============================================================================

let vectorizeInstance: VectorizeService | null = null;

/**
 * Initialize the global Vectorize service instance
 *
 * Call this once during chargen startup, typically in the ingestion menu.
 *
 * @param config - Vectorize connection configuration
 *
 * @example
 * ```typescript
 * initVectorize({
 *   accountId: config.cloudflareAccountId,
 *   indexId: config.cloudflareVectorizeIndexId,
 *   apiToken: config.cloudflareApiToken,
 * });
 * ```
 */
export function initVectorize(config: {
	accountId: string;
	indexId: string;
	apiToken: string;
}): void {
	vectorizeInstance = new VectorizeService(config.accountId, config.indexId, config.apiToken);
}

/**
 * Reset the Vectorize service instance
 *
 * Useful for testing or reconfiguration scenarios.
 */
export function resetVectorize(): void {
	vectorizeInstance = null;
}

/**
 * Get the global Vectorize service instance
 *
 * @throws Error if Vectorize hasn't been initialized
 * @returns The singleton Vectorize service
 */
export function getVectorize(): VectorizeService {
	if (!vectorizeInstance) {
		throw new Error('Vectorize not initialized. Call initVectorize() first.');
	}
	return vectorizeInstance;
}

/**
 * Check if Vectorize is available and initialized
 *
 * @returns True if Vectorize service is ready to use
 */
export function isVectorizeAvailable(): boolean {
	return vectorizeInstance !== null;
}

/**
 * Test connection to Vectorize index
 *
 * Verifies that the API token is valid and the index exists.
 *
 * @returns True if connection successful, false otherwise
 *
 * @example
 * ```typescript
 * const connected = await testConnection();
 * if (!connected) {
 *   console.error('Vectorize connection failed');
 * }
 * ```
 */
export async function testConnection(): Promise<boolean> {
	try {
		const config = getIngestionConfig();
		const response = await fetch(
			`https://api.cloudflare.com/client/v4/accounts/${config.cloudflareAccountId}/vectorize/indexes/${config.cloudflareVectorizeIndexId}`,
			{
				headers: { Authorization: `Bearer ${config.cloudflareApiToken}` },
			}
		);
		return response.ok;
	} catch {
		return false;
	}
}
