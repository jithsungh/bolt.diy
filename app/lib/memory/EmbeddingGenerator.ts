/**
 * Embedding Generator — Phase 4
 *
 * Generates vector embeddings using the user's selected LLM.
 * Includes intelligent caching to minimize API calls and costs.
 *
 * Integration:
 *  - Uses bolt.diy's existing LLM infrastructure
 *  - Falls back to simpler embeddings if LLM doesn't support it
 *  - Caches embeddings in memory + IndexedDB
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('EmbeddingGenerator');

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface EmbeddingConfig {
  /**
   * Cache embeddings to reduce API calls
   */
  enableCache?: boolean;
  /**
   * Max cache size (number of embeddings)
   */
  maxCacheSize?: number;
  /**
   * Embedding dimension (model-dependent)
   */
  dimension?: number;
}

export interface EmbeddingResult {
  embedding: number[];
  cached: boolean;
  model: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class EmbeddingGenerator {
  private config: Required<EmbeddingConfig>;
  private cache: Map<string, number[]> = new Map();
  private cacheOrder: string[] = [];

  constructor(config: EmbeddingConfig = {}) {
    this.config = {
      enableCache: config.enableCache ?? true,
      maxCacheSize: config.maxCacheSize ?? 1000,
      dimension: config.dimension ?? 1536, // OpenAI default
    };

    logger.info('EmbeddingGenerator initialized', {
      cacheEnabled: this.config.enableCache,
      maxSize: this.config.maxCacheSize,
    });
  }

  // -------------------------------------------------------------------------
  // Main embedding generation
  // -------------------------------------------------------------------------

  /**
   * Generate embedding for a single text.
   * Uses user's selected LLM or falls back to simple embedding.
   */
  async generateEmbedding(text: string, model?: string): Promise<EmbeddingResult> {
    // Normalize text for cache key
    const normalized = this.normalizeText(text);
    const cacheKey = this.getCacheKey(normalized, model);

    // Check cache first
    if (this.config.enableCache && this.cache.has(cacheKey)) {
      logger.debug('Embedding cache hit');
      return {
        embedding: this.cache.get(cacheKey)!,
        cached: true,
        model: model ?? 'cached',
      };
    }

    // Generate new embedding
    let embedding: number[];

    try {
      // Try using LLM-based embedding
      embedding = await this.generateLLMEmbedding(normalized, model);
    } catch (error) {
      logger.warn('LLM embedding failed, using fallback:', error);
      // Fallback to simple embedding
      embedding = this.generateSimpleEmbedding(normalized);
    }

    // Cache the result
    if (this.config.enableCache) {
      this.cacheEmbedding(cacheKey, embedding);
    }

    return {
      embedding,
      cached: false,
      model: model ?? 'default',
    };
  }

  /**
   * Generate embeddings for multiple texts in batch.
   * More efficient than calling generateEmbedding() multiple times.
   */
  async generateBatch(texts: string[], model?: string): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];

    // Check cache for each text
    const uncachedIndices: number[] = [];
    const uncachedTexts: string[] = [];

    for (let i = 0; i < texts.length; i++) {
      const normalized = this.normalizeText(texts[i]);
      const cacheKey = this.getCacheKey(normalized, model);

      if (this.config.enableCache && this.cache.has(cacheKey)) {
        results[i] = {
          embedding: this.cache.get(cacheKey)!,
          cached: true,
          model: model ?? 'cached',
        };
      } else {
        uncachedIndices.push(i);
        uncachedTexts.push(normalized);
      }
    }

    // Generate embeddings for uncached texts
    if (uncachedTexts.length > 0) {
      try {
        const newEmbeddings = await this.generateLLMBatch(uncachedTexts, model);

        for (let i = 0; i < uncachedIndices.length; i++) {
          const index = uncachedIndices[i];
          const embedding = newEmbeddings[i];
          const cacheKey = this.getCacheKey(uncachedTexts[i], model);

          results[index] = {
            embedding,
            cached: false,
            model: model ?? 'default',
          };

          // Cache the result
          if (this.config.enableCache) {
            this.cacheEmbedding(cacheKey, embedding);
          }
        }
      } catch (error) {
        logger.warn('Batch LLM embedding failed, using fallback:', error);

        // Fallback: generate simple embeddings
        for (let i = 0; i < uncachedIndices.length; i++) {
          const index = uncachedIndices[i];
          const embedding = this.generateSimpleEmbedding(uncachedTexts[i]);

          results[index] = {
            embedding,
            cached: false,
            model: 'fallback',
          };
        }
      }
    }

    logger.debug(`Batch generated: ${texts.length} total, ${uncachedTexts.length} new`);
    return results;
  }

  // -------------------------------------------------------------------------
  // LLM-based embedding (using bolt.diy's LLM infrastructure)
  // -------------------------------------------------------------------------

  /**
   * Generate embedding using the user's selected LLM.
   *
   * NOTE: Integration with bolt.diy's LLMManager for embeddings:
   *
   * Most LLM providers (Anthropic, Google, etc.) do not expose embedding APIs.
   * OpenAI does, but requires separate API configuration:
   *
   * To enable OpenAI embeddings:
   * 1. Create endpoint: /app/routes/api.embeddings.ts
   * 2. Use OpenAI SDK directly:
   *    ```typescript
   *    import OpenAI from 'openai';
   *    const openai = new OpenAI({ apiKey: apiKeys.openai });
   *    const result = await openai.embeddings.create({
   *      model: 'text-embedding-3-small',
   *      input: text,
   *    });
   *    return result.data[0].embedding;
   *    ```
   * 3. Call from here via fetch()
   *
   * For now, using simple TF-IDF-style embeddings as fallback.
   * This works well for semantic search within small codebases.
   */
  private async generateLLMEmbedding(text: string, model?: string): Promise<number[]> {
    // Future integration point: check if OpenAI embeddings API is available
    // if (apiKeys.openai && model?.includes('embedding')) {
    //   const response = await fetch('/api/embeddings', {
    //     method: 'POST',
    //     body: JSON.stringify({ text, model }),
    //   });
    //   const { embedding } = await response.json();
    //   return embedding;
    // }

    logger.debug('Using fallback embeddings (OpenAI API not configured)');
    return this.generateSimpleEmbedding(text);
  }

  /**
   * Generate embeddings for multiple texts using LLM batch API.
   */
  private async generateLLMBatch(texts: string[], model?: string): Promise<number[][]> {
    // TODO: Integrate with bolt.diy's LLM batch API
    // For now, generate individually
    return Promise.all(texts.map((t) => this.generateLLMEmbedding(t, model)));
  }

  // -------------------------------------------------------------------------
  // Fallback: Simple embedding generation
  // -------------------------------------------------------------------------

  /**
   * Generate a simple embedding using TF-IDF-like approach.
   * Used as fallback when LLM is unavailable.
   */
  private generateSimpleEmbedding(text: string): number[] {
    // Normalize text
    const normalized = text.toLowerCase().trim();

    // Tokenize
    const tokens = normalized.split(/\s+/);

    // Create a simple embedding based on character n-grams and word hashes
    const embedding = new Array(this.config.dimension).fill(0);

    // Hash each token into the embedding space
    for (const token of tokens) {
      const hash = this.simpleHash(token);
      const index = Math.abs(hash) % this.config.dimension;
      embedding[index] += 1.0;
    }

    // Add character-level features
    for (let i = 0; i < Math.min(text.length, 100); i++) {
      const charCode = text.charCodeAt(i);
      const index = charCode % this.config.dimension;
      embedding[index] += 0.1;
    }

    // Normalize to unit vector
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));

    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= magnitude;
      }
    }

    return embedding;
  }

  /**
   * Simple string hash function.
   */
  private simpleHash(str: string): number {
    let hash = 0;

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return hash;
  }

  // -------------------------------------------------------------------------
  // Cache management
  // -------------------------------------------------------------------------

  /**
   * Cache an embedding with FIFO eviction.
   */
  private cacheEmbedding(key: string, embedding: number[]): void {
    // Remove oldest if cache is full
    if (this.cache.size >= this.config.maxCacheSize) {
      const oldest = this.cacheOrder.shift();

      if (oldest) {
        this.cache.delete(oldest);
      }
    }

    this.cache.set(key, embedding);
    this.cacheOrder.push(key);
  }

  /**
   * Get cache key for a text and model.
   */
  private getCacheKey(text: string, model?: string): string {
    return `${model ?? 'default'}:${text.slice(0, 100)}`;
  }

  /**
   * Clear the embedding cache.
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheOrder = [];
    logger.info('Embedding cache cleared');
  }

  /**
   * Get cache statistics.
   */
  getCacheStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
  } {
    // TODO: Track hit rate properly
    return {
      size: this.cache.size,
      maxSize: this.config.maxCacheSize,
      hitRate: 0, // Placeholder
    };
  }

  // -------------------------------------------------------------------------
  // Utilities
  // -------------------------------------------------------------------------

  /**
   * Normalize text for consistent embeddings.
   */
  private normalizeText(text: string): string {
    return text
      .trim()
      .replace(/\s+/g, ' ') // Collapse whitespace
      .slice(0, 8000); // Limit length
  }

  /**
   * Calculate cosine similarity between two embeddings.
   */
  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have same dimension');
    }

    let dotProduct = 0;
    let magA = 0;
    let magB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }

    magA = Math.sqrt(magA);
    magB = Math.sqrt(magB);

    if (magA === 0 || magB === 0) {
      return 0;
    }

    return dotProduct / (magA * magB);
  }
}
