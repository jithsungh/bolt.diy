/**
 * ChromaDB Wrapper — Phase 4
 *
 * Browser-compatible wrapper for ChromaDB vector database.
 * Provides type-safe interface for storing and retrieving embeddings
 * with automatic IndexedDB persistence.
 *
 * Integration:
 *  - Used by LongTermMemory for persistent storage
 *  - Stores module summaries, design decisions, historical fixes
 *  - All data persists in browser's IndexedDB
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ChromaDBWrapper');

// Import ChromaDB client (will be installed)
type ChromaClient = any; // Typed at runtime
type Collection = any;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ChromaDocument {
  id: string;
  content: string;
  embedding?: number[];
  metadata: Record<string, any>;
}

export interface SearchResult {
  id: string;
  content: string;
  metadata: Record<string, any>;
  distance: number;
  score: number;
}

export interface CollectionInfo {
  name: string;
  count: number;
  metadata?: Record<string, any>;
}

export interface ChromaDBConfig {
  /**
   * Collection names for different memory types
   */
  collections?: {
    modules?: string;
    decisions?: string;
    fixes?: string;
    conversations?: string;
  };
  /**
   * Path for IndexedDB storage (browser default)
   */
  path?: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class ChromaDBWrapper {
  private client: ChromaClient | null = null;
  private collections: Map<string, Collection> = new Map();
  private config: Required<ChromaDBConfig>;
  private initialized = false;

  constructor(config: ChromaDBConfig = {}) {
    this.config = {
      collections: {
        modules: config.collections?.modules ?? 'memory_modules',
        decisions: config.collections?.decisions ?? 'memory_decisions',
        fixes: config.collections?.fixes ?? 'memory_fixes',
        conversations: config.collections?.conversations ?? 'memory_conversations',
      },
      path: config.path ?? 'bolt_memory',
    };

    logger.info('ChromaDBWrapper created', this.config);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Initialize ChromaDB client and create default collections.
   * Must be called before using any other methods.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('Already initialized');
      return;
    }

    // Check if we're in a browser environment
    if (typeof window === 'undefined') {
      logger.warn('ChromaDB requires browser environment (IndexedDB), skipping initialization on server');
      // Set as initialized but with no client, methods will need to handle this
      this.initialized = true;
      return;
    }

    try {
      // Dynamic import for browser compatibility
      const { ChromaClient } = await import('chromadb');

      this.client = new ChromaClient({
        path: this.config.path,
      });

      // Create default collections
      for (const [key, name] of Object.entries(this.config.collections)) {
        await this.getOrCreateCollection(name);
        logger.debug(`Collection ready: ${name}`);
      }

      this.initialized = true;
      logger.info('ChromaDB initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize ChromaDB:', error);
      // Don't throw - allow system to continue without ChromaDB
      logger.warn('Continuing without ChromaDB support');
      this.initialized = true;
    }
  }

  /**
   * Close connections and cleanup resources.
   */
  async cleanup(): Promise<void> {
    this.collections.clear();
    this.client = null;
    this.initialized = false;
    logger.info('ChromaDB cleaned up');
  }

  // -------------------------------------------------------------------------
  // Collection management
  // -------------------------------------------------------------------------

  /**
   * Get or create a collection by name.
   */
  async getOrCreateCollection(name: string, metadata?: Record<string, any>): Promise<Collection> {
    this.ensureInitialized();

    if (!this.client) {
      logger.warn('ChromaDB client not available, returning null collection');
      return null as any;
    }

    if (this.collections.has(name)) {
      return this.collections.get(name)!;
    }

    try {
      const collection = await this.client!.getOrCreateCollection({
        name,
        metadata: metadata ?? {},
      });

      this.collections.set(name, collection);
      logger.debug(`Collection ${name} ready`);

      return collection;
    } catch (error) {
      logger.error(`Failed to get/create collection ${name}:`, error);
      throw error;
    }
  }

  /**
   * Delete a collection.
   */
  async deleteCollection(name: string): Promise<void> {
    this.ensureInitialized();

    try {
      await this.client!.deleteCollection({ name });
      this.collections.delete(name);
      logger.info(`Collection ${name} deleted`);
    } catch (error) {
      logger.error(`Failed to delete collection ${name}:`, error);
      throw error;
    }
  }

  /**
   * List all collections.
   */
  async listCollections(): Promise<CollectionInfo[]> {
    this.ensureInitialized();

    try {
      const collections = await this.client!.listCollections();
      return collections.map((c: any) => ({
        name: c.name,
        count: c.count ?? 0,
        metadata: c.metadata,
      }));
    } catch (error) {
      logger.error('Failed to list collections:', error);
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // Document operations
  // -------------------------------------------------------------------------

  /**
   * Add documents to a collection.
   */
  async addDocuments(
    collectionName: string,
    documents: ChromaDocument[],
  ): Promise<void> {
    this.ensureInitialized();

    try {
      const collection = await this.getOrCreateCollection(collectionName);

      const ids = documents.map(d => d.id);
      const contents = documents.map(d => d.content);
      const embeddings = documents.map(d => d.embedding).filter(Boolean) as number[][];
      const metadatas = documents.map(d => d.metadata);

      await collection.add({
        ids,
        documents: contents,
        embeddings: embeddings.length > 0 ? embeddings : undefined,
        metadatas,
      });

      logger.debug(`Added ${documents.length} documents to ${collectionName}`);
    } catch (error) {
      logger.error(`Failed to add documents to ${collectionName}:`, error);
      throw error;
    }
  }

  /**
   * Update documents in a collection.
   */
  async updateDocuments(
    collectionName: string,
    documents: ChromaDocument[],
  ): Promise<void> {
    this.ensureInitialized();

    try {
      const collection = await this.getOrCreateCollection(collectionName);

      const ids = documents.map(d => d.id);
      const contents = documents.map(d => d.content);
      const embeddings = documents.map(d => d.embedding).filter(Boolean) as number[][];
      const metadatas = documents.map(d => d.metadata);

      await collection.update({
        ids,
        documents: contents,
        embeddings: embeddings.length > 0 ? embeddings : undefined,
        metadatas,
      });

      logger.debug(`Updated ${documents.length} documents in ${collectionName}`);
    } catch (error) {
      logger.error(`Failed to update documents in ${collectionName}:`, error);
      throw error;
    }
  }

  /**
   * Delete documents by IDs.
   */
  async deleteDocuments(collectionName: string, ids: string[]): Promise<void> {
    this.ensureInitialized();

    try {
      const collection = await this.getOrCreateCollection(collectionName);
      await collection.delete({ ids });
      logger.debug(`Deleted ${ids.length} documents from ${collectionName}`);
    } catch (error) {
      logger.error(`Failed to delete documents from ${collectionName}:`, error);
      throw error;
    }
  }

  /**
   * Get documents by IDs.
   */
  async getDocuments(collectionName: string, ids: string[]): Promise<ChromaDocument[]> {
    this.ensureInitialized();

    try {
      const collection = await this.getOrCreateCollection(collectionName);
      const result = await collection.get({ ids });

      return result.ids.map((id: string, index: number) => ({
        id,
        content: result.documents[index],
        embedding: result.embeddings?.[index],
        metadata: result.metadatas[index],
      }));
    } catch (error) {
      logger.error(`Failed to get documents from ${collectionName}:`, error);
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // Search operations
  // -------------------------------------------------------------------------

  /**
   * Query collection with embedding vector.
   */
  async query(
    collectionName: string,
    queryEmbedding: number[],
    k: number = 10,
    filter?: Record<string, any>,
  ): Promise<SearchResult[]> {
    this.ensureInitialized();

    try {
      const collection = await this.getOrCreateCollection(collectionName);

      const result = await collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: k,
        where: filter,
      });

      // Transform to our SearchResult format
      const results: SearchResult[] = [];

      if (result.ids && result.ids[0]) {
        for (let i = 0; i < result.ids[0].length; i++) {
          const distance = result.distances?.[0]?.[i] ?? 1.0;

          results.push({
            id: result.ids[0][i],
            content: result.documents[0][i],
            metadata: result.metadatas?.[0]?.[i] ?? {},
            distance,
            score: 1 - distance, // Convert distance to similarity score
          });
        }
      }

      logger.debug(`Query returned ${results.length} results from ${collectionName}`);
      return results;
    } catch (error) {
      logger.error(`Failed to query ${collectionName}:`, error);
      return [];
    }
  }

  /**
   * Query with text (requires embedding generation externally).
   */
  async queryWithText(
    collectionName: string,
    queryText: string,
    embedding: number[],
    k: number = 10,
  ): Promise<SearchResult[]> {
    return this.query(collectionName, embedding, k);
  }

  // -------------------------------------------------------------------------
  // Stats & utilities
  // -------------------------------------------------------------------------

  /**
   * Get collection statistics.
   */
  async getCollectionStats(collectionName: string): Promise<{
    name: string;
    count: number;
    metadata?: Record<string, any>;
  }> {
    this.ensureInitialized();

    try {
      const collection = await this.getOrCreateCollection(collectionName);
      const count = await collection.count();

      return {
        name: collectionName,
        count,
        metadata: collection.metadata,
      };
    } catch (error) {
      logger.error(`Failed to get stats for ${collectionName}:`, error);
      return { name: collectionName, count: 0 };
    }
  }

  /**
   * Get total memory usage stats.
   */
  async getMemoryStats(): Promise<{
    totalDocuments: number;
    collections: Array<{ name: string; count: number }>;
  }> {
    const collectionsList = await this.listCollections();
    const collectionsData = await Promise.all(
      collectionsList.map(c => this.getCollectionStats(c.name)),
    );

    const totalDocuments = collectionsData.reduce((sum, c) => sum + c.count, 0);

    return {
      totalDocuments,
      collections: collectionsData.map(c => ({ name: c.name, count: c.count })),
    };
  }

  // -------------------------------------------------------------------------
  // Helper methods
  // -------------------------------------------------------------------------

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('ChromaDBWrapper not initialized. Call initialize() first.');
    }
    // Allow continuing even if client is null (server-side mode)
    if (!this.client) {
      logger.debug('ChromaDB client not available (server-side), operation will be skipped');
    }
  }

  /**
   * Get default collection names.
   */
  getCollectionNames(): typeof this.config.collections {
    return this.config.collections;
  }
}
