/**
 * Cloudflare Workers AI Service - Embedding generation via REST API
 *
 * Provides text embedding generation using the BGE-M3 model
 * for entity-level semantic search across narrative content.
 */

/**
 * Workers AI embedding response structure
 */
interface EmbeddingResponse {
	result: {
		/** Array of embedding vectors (typically contains one vector per input text) */
		data: number[][];
		/** Shape of the result: [batch_size, dimensions] */
		shape: number[];
	};
	success: boolean;
	errors: unknown[];
	messages: unknown[];
}

/**
 * Cloudflare Workers AI REST API client
 *
 * Generates vector embeddings using the BGE-M3 model, which produces
 * 1024-dimensional vectors with support for up to 8,192 input tokens.
 * Perfect for entity-level chunking of entire chapters, characters, and locations.
 */
export class WorkersAIService {
	private accountId: string;
	private apiToken: string;
	private baseUrl: string;
	private model: string;

	/**
	 * Create a new Workers AI service instance
	 *
	 * @param accountId - Cloudflare account ID
	 * @param apiToken - Cloudflare API token with Workers AI permissions
	 * @param model - Embedding model to use (default: @cf/baai/bge-m3)
	 */
	constructor(accountId: string, apiToken: string, model: string = '@cf/baai/bge-m3') {
		this.accountId = accountId;
		this.apiToken = apiToken;
		this.model = model;
		this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run`;
	}

	/**
	 * Generate embedding vector for text using BGE-M3
	 *
	 * BGE-M3 specs:
	 * - Output dimensions: 1024
	 * - Max context: 8,192 tokens (~32,768 characters)
	 * - Language support: 100+ languages
	 * - Multi-functionality: dense, multi-vector, and sparse retrieval
	 *
	 * Entity-level chunking strategy:
	 * - Average chapter: ~3,700 words (~18,500 chars) ✓ fits comfortably
	 * - Average character profile: ~800 words (~4,000 chars) ✓ fits easily
	 * - Average location: ~600 words (~3,000 chars) ✓ fits easily
	 *
	 * @param text - Text content to embed (entire chapter/character/location)
	 * @returns 1024-dimensional embedding vector
	 * @throws Error if API request fails or text exceeds model limits
	 *
	 * @example
	 * ```typescript
	 * const ai = new WorkersAIService(accountId, apiToken);
	 *
	 * // Embed entire chapter (18,500 characters)
	 * const chapterText = buildChapterText(parsedChapter);
	 * const embedding = await ai.generateEmbedding(chapterText);
	 * console.log(embedding.length); // 1024
	 * ```
	 */
	async generateEmbedding(text: string): Promise<number[]> {
		const response = await fetch(`${this.baseUrl}/${this.model}`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.apiToken}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				text: [text], // API expects array of strings
			}),
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Workers AI embedding generation failed: ${error}`);
		}

		const result: EmbeddingResponse = await response.json();

		if (!result.success || !result.result?.data?.[0]) {
			throw new Error(
				`Workers AI returned unsuccessful response: ${JSON.stringify(result.errors)}`
			);
		}

		// Return first (and only) embedding vector
		return result.result.data[0];
	}

	/**
	 * Generate embeddings for multiple texts in a batch
	 *
	 * More efficient than individual calls when embedding multiple entities.
	 * Note: Workers AI has rate limits, so batch size should be kept reasonable.
	 *
	 * @param texts - Array of text strings to embed
	 * @returns Array of embedding vectors, same order as input
	 * @throws Error if API request fails
	 *
	 * @example
	 * ```typescript
	 * const texts = [chapterText1, chapterText2, chapterText3];
	 * const embeddings = await ai.generateEmbeddingBatch(texts);
	 * // embeddings.length === 3, each is 1024-dimensional
	 * ```
	 */
	async generateEmbeddingBatch(texts: string[]): Promise<number[][]> {
		const response = await fetch(`${this.baseUrl}/${this.model}`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.apiToken}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				text: texts,
			}),
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Workers AI batch embedding failed: ${error}`);
		}

		const result: EmbeddingResponse = await response.json();

		if (!result.success || !result.result?.data) {
			throw new Error(
				`Workers AI returned unsuccessful response: ${JSON.stringify(result.errors)}`
			);
		}

		return result.result.data;
	}

	/**
	 * Get the current model being used
	 *
	 * @returns Model identifier (e.g., '@cf/baai/bge-m3')
	 */
	getModel(): string {
		return this.model;
	}
}

// ============================================================================
// Singleton Instance Management
// ============================================================================

let aiInstance: WorkersAIService | null = null;

/**
 * Initialize the global Workers AI service instance
 *
 * Call this once during chargen startup, typically in the ingestion menu.
 *
 * @param config - Workers AI connection configuration
 *
 * @example
 * ```typescript
 * initWorkersAI({
 *   accountId: config.cloudflareAccountId,
 *   apiToken: config.cloudflareApiToken,
 * });
 * ```
 */
export function initWorkersAI(config: { accountId: string; apiToken: string }): void {
	aiInstance = new WorkersAIService(config.accountId, config.apiToken);
}

/**
 * Reset the Workers AI service instance
 *
 * Useful for testing or reconfiguration scenarios.
 */
export function resetWorkersAI(): void {
	aiInstance = null;
}

/**
 * Get the global Workers AI service instance
 *
 * @throws Error if Workers AI hasn't been initialized
 * @returns The singleton Workers AI service
 */
export function getWorkersAI(): WorkersAIService {
	if (!aiInstance) {
		throw new Error('Workers AI not initialized. Call initWorkersAI() first.');
	}
	return aiInstance;
}

/**
 * Check if Workers AI is available and initialized
 *
 * @returns True if Workers AI service is ready to use
 */
export function isWorkersAIAvailable(): boolean {
	return aiInstance !== null;
}

/**
 * Test connection to Workers AI
 *
 * Verifies that the API token is valid by generating a test embedding.
 *
 * @returns True if connection successful, false otherwise
 *
 * @example
 * ```typescript
 * const connected = await testConnection();
 * if (!connected) {
 *   console.error('Workers AI connection failed');
 * }
 * ```
 */
export async function testConnection(): Promise<boolean> {
	if (!aiInstance) return false;

	try {
		const testEmbedding = await aiInstance.generateEmbedding('test');
		return testEmbedding.length === 1024; // BGE-M3 outputs 1024 dimensions
	} catch {
		return false;
	}
}
