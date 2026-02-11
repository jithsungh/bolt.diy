// Vector Memory Store
// Persistent memory system using embeddings for semantic search

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('VectorMemory');

export interface MemoryEntry {
  id: string;
  content: string;
  embedding?: number[];
  metadata: {
    type: 'conversation' | 'code' | 'decision' | 'error' | 'success';
    timestamp: number;
    tags?: string[];
    filePath?: string;
    agentRole?: string;
    importance?: number; // 0-1
  };
}

export interface SearchOptions {
  limit?: number;
  threshold?: number;
  filter?: {
    type?: MemoryEntry['metadata']['type'];
    tags?: string[];
    minImportance?: number;
    timeRange?: { start: number; end: number };
  };
}

/**
 * In-memory vector store with semantic search capabilities
 * In production, this would use a real vector database like LanceDB or Chroma
 */
export class VectorMemoryStore {
  private memories: Map<string, MemoryEntry> = new Map();
  private index: Map<string, Set<string>> = new Map(); // Simple inverted index

  constructor() {
    logger.info('Vector Memory Store initialized');
  }

  /**
   * Store a memory entry
   */
  async store(entry: Omit<MemoryEntry, 'id'>): Promise<string> {
    const id = this.generateId();
    
    const memoryEntry: MemoryEntry = {
      id,
      ...entry,
    };

    // Generate embedding if not provided
    if (!memoryEntry.embedding) {
      memoryEntry.embedding = await this.generateEmbedding(entry.content);
    }

    this.memories.set(id, memoryEntry);
    
    // Update inverted index
    this.indexEntry(memoryEntry);

    logger.debug(`Stored memory: ${id}`);
    
    return id;
  }

  /**
   * Search memories by semantic similarity
   */
  async search(query: string, options: SearchOptions = {}): Promise<MemoryEntry[]> {
    const {
      limit = 10,
      threshold = 0.7,
      filter,
    } = options;

    // Generate query embedding
    const queryEmbedding = await this.generateEmbedding(query);

    // Filter memories
    let candidates = Array.from(this.memories.values());

    if (filter) {
      candidates = this.applyFilters(candidates, filter);
    }

    // Calculate similarity scores
    const scored = candidates.map(memory => ({
      memory,
      score: this.cosineSimilarity(queryEmbedding, memory.embedding || []),
    }));

    // Filter by threshold and sort by score
    const results = scored
      .filter(item => item.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.memory);

    logger.debug(`Search returned ${results.length} results for query: "${query}"`);

    return results;
  }

  /**
   * Get memory by ID
   */
  get(id: string): MemoryEntry | undefined {
    return this.memories.get(id);
  }

  /**
   * Get recent memories
   */
  getRecent(limit: number = 20, type?: MemoryEntry['metadata']['type']): MemoryEntry[] {
    let memories = Array.from(this.memories.values());

    if (type) {
      memories = memories.filter(m => m.metadata.type === type);
    }

    return memories
      .sort((a, b) => b.metadata.timestamp - a.metadata.timestamp)
      .slice(0, limit);
  }

  /**
   * Get memories by tags
   */
  getByTags(tags: string[]): MemoryEntry[] {
    return Array.from(this.memories.values()).filter(memory =>
      memory.metadata.tags?.some(tag => tags.includes(tag))
    );
  }

  /**
   * Delete memory
   */
  delete(id: string): boolean {
    const memory = this.memories.get(id);
    if (!memory) {
      return false;
    }

    this.memories.delete(id);
    this.removeFromIndex(memory);

    logger.debug(`Deleted memory: ${id}`);
    return true;
  }

  /**
   * Clear all memories
   */
  clear(): void {
    this.memories.clear();
    this.index.clear();
    logger.info('Memory store cleared');
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalMemories: number;
    byType: Record<string, number>;
    oldestEntry?: number;
    newestEntry?: number;
  } {
    const memories = Array.from(this.memories.values());
    
    const byType = memories.reduce((acc, m) => {
      acc[m.metadata.type] = (acc[m.metadata.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const timestamps = memories.map(m => m.metadata.timestamp);

    return {
      totalMemories: memories.length,
      byType,
      oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : undefined,
      newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : undefined,
    };
  }

  /**
   * Generate simple embedding (in production, use actual embedding model)
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    // Simple bag-of-words embedding for demonstration
    // In production, use OpenAI embeddings, sentence-transformers, etc.
    const words = text.toLowerCase().split(/\W+/);
    const vocab = new Set(words);
    
    // Create a simple 128-dimensional embedding
    const embedding = new Array(128).fill(0);
    
    words.forEach((word, index) => {
      const hash = this.simpleHash(word);
      const pos = hash % 128;
      embedding[pos] += 1 / (index + 1); // Position-weighted
    });

    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => val / (magnitude || 1));
  }

  /**
   * Calculate cosine similarity between vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      return 0;
    }

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }

    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Apply filters to memory candidates
   */
  private applyFilters(
    memories: MemoryEntry[],
    filter: NonNullable<SearchOptions['filter']>
  ): MemoryEntry[] {
    let filtered = memories;

    if (filter.type) {
      filtered = filtered.filter(m => m.metadata.type === filter.type);
    }

    if (filter.tags && filter.tags.length > 0) {
      filtered = filtered.filter(m =>
        m.metadata.tags?.some(tag => filter.tags!.includes(tag))
      );
    }

    if (filter.minImportance !== undefined) {
      filtered = filtered.filter(m =>
        (m.metadata.importance || 0) >= filter.minImportance!
      );
    }

    if (filter.timeRange) {
      filtered = filtered.filter(m =>
        m.metadata.timestamp >= filter.timeRange!.start &&
        m.metadata.timestamp <= filter.timeRange!.end
      );
    }

    return filtered;
  }

  /**
   * Index entry for fast keyword lookup
   */
  private indexEntry(entry: MemoryEntry): void {
    const keywords = this.extractKeywords(entry.content);
    
    keywords.forEach(keyword => {
      if (!this.index.has(keyword)) {
        this.index.set(keyword, new Set());
      }
      this.index.get(keyword)!.add(entry.id);
    });
  }

  /**
   * Remove entry from index
   */
  private removeFromIndex(entry: MemoryEntry): void {
    const keywords = this.extractKeywords(entry.content);
    
    keywords.forEach(keyword => {
      const ids = this.index.get(keyword);
      if (ids) {
        ids.delete(entry.id);
        if (ids.size === 0) {
          this.index.delete(keyword);
        }
      }
    });
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    // Simple keyword extraction
    const words = text.toLowerCase().split(/\W+/);
    
    // Filter out common stop words
    const stopWords = new Set(['the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but']);
    
    return words.filter(word => 
      word.length > 2 && !stopWords.has(word)
    );
  }

  /**
   * Simple hash function for strings
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `mem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Export memories for persistence
   */
  export(): MemoryEntry[] {
    return Array.from(this.memories.values());
  }

  /**
   * Import memories from external source
   */
  import(memories: MemoryEntry[]): void {
    memories.forEach(memory => {
      this.memories.set(memory.id, memory);
      this.indexEntry(memory);
    });
    
    logger.info(`Imported ${memories.length} memories`);
  }
}

/**
 * Global memory store instance
 */
let globalMemoryStore: VectorMemoryStore | null = null;

export function getMemoryStore(): VectorMemoryStore {
  if (!globalMemoryStore) {
    globalMemoryStore = new VectorMemoryStore();
  }
  return globalMemoryStore;
}
