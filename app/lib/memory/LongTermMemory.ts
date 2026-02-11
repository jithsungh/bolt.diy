/**
 * Long-Term Memory Store — Phase 4
 *
 * Persistent knowledge storage for module summaries, design decisions,
 * and historical fixes. Uses ChromaDB for semantic search.
 *
 * Integration:
 *  - Stores architectural knowledge
 *  - Records successful task patterns
 *  - Enables learning from history
 *  - Provides semantic retrieval
 */

import { createScopedLogger } from '~/utils/logger';
import { ChromaDBWrapper, type ChromaDocument, type SearchResult } from './ChromaDBWrapper';
import { EmbeddingGenerator, type EmbeddingResult } from './EmbeddingGenerator';
import type { Task, TaskResult, FileChange } from '../agents/types';

const logger = createScopedLogger('LongTermMemory');

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ModuleSummary {
  filePath: string;
  summary: string;
  exports: string[];
  dependencies: string[];
  lastUpdated: number;
  tags: string[];
}

export interface DesignDecision {
  id: string;
  title: string;
  description: string;
  rationale: string;
  alternatives: string[];
  timestamp: number;
  relatedFiles: string[];
  tags: string[];
  status: 'active' | 'deprecated' | 'superseded';
}

export interface HistoricalFix {
  id: string;
  taskDescription: string;
  errorType: string;
  errorMessage: string;
  solution: string;
  filesChanged: string[];
  successRate: number;
  timestamp: number;
  tags: string[];
}

export interface LongTermMemoryConfig {
  /**
   * Enable automatic summarization
   */
  autoSummarize?: boolean;
  /**
   * Max historical fixes to keep
   */
  maxHistoricalFixes?: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class LongTermMemory {
  private chromaDB: ChromaDBWrapper;
  private embedder: EmbeddingGenerator;
  private config: Required<LongTermMemoryConfig>;
  private initialized = false;

  constructor(
    chromaDB: ChromaDBWrapper,
    embedder: EmbeddingGenerator,
    config: LongTermMemoryConfig = {},
  ) {
    this.chromaDB = chromaDB;
    this.embedder = embedder;
    this.config = {
      autoSummarize: config.autoSummarize ?? true,
      maxHistoricalFixes: config.maxHistoricalFixes ?? 1000,
    };

    logger.info('LongTermMemory initialized', this.config);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('Already initialized');
      return;
    }

    // ChromaDB should already be initialized by caller
    this.initialized = true;
    logger.info('LongTermMemory ready');
  }

  async cleanup(): Promise<void> {
    this.initialized = false;
    logger.info('LongTermMemory cleaned up');
  }

  // -------------------------------------------------------------------------
  // Module summaries
  // -------------------------------------------------------------------------

  /**
   * Store or update a module summary.
   */
  async storeModuleSummary(summary: ModuleSummary): Promise<void> {
    this.ensureInitialized();

    const collectionName = this.chromaDB.getCollectionNames().modules!;

    // Generate embedding for the summary
    const text = `${summary.filePath} ${summary.summary} ${summary.exports.join(' ')}`;
    const embeddingResult = await this.embedder.generateEmbedding(text);

    const doc: ChromaDocument = {
      id: `module:${summary.filePath}`,
      content: JSON.stringify(summary),
      embedding: embeddingResult.embedding,
      metadata: {
        type: 'module',
        filePath: summary.filePath,
        lastUpdated: summary.lastUpdated,
        tags: summary.tags,
      },
    };

    await this.chromaDB.addDocuments(collectionName, [doc]);

    logger.debug(`Module summary stored: ${summary.filePath}`);
  }

  /**
   * Get module summary by file path.
   */
  async getModuleSummary(filePath: string): Promise<ModuleSummary | null> {
    this.ensureInitialized();

    const collectionName = this.chromaDB.getCollectionNames().modules!;

    try {
      const docs = await this.chromaDB.getDocuments(collectionName, [`module:${filePath}`]);

      if (docs.length > 0) {
        return JSON.parse(docs[0].content) as ModuleSummary;
      }
    } catch (error) {
      logger.error(`Failed to get module summary for ${filePath}:`, error);
    }

    return null;
  }

  /**
   * Search for related modules.
   */
  async searchModules(query: string, k: number = 5): Promise<ModuleSummary[]> {
    this.ensureInitialized();

    const collectionName = this.chromaDB.getCollectionNames().modules!;

    // Generate query embedding
    const embeddingResult = await this.embedder.generateEmbedding(query);

    // Search
    const results = await this.chromaDB.query(collectionName, embeddingResult.embedding, k);

    return results.map(r => JSON.parse(r.content) as ModuleSummary);
  }

  // -------------------------------------------------------------------------
  // Design decisions
  // -------------------------------------------------------------------------

  /**
   * Record a design decision.
   */
  async recordDecision(decision: DesignDecision): Promise<void> {
    this.ensureInitialized();

    const collectionName = this.chromaDB.getCollectionNames().decisions!;

    // Generate embedding
    const text = `${decision.title} ${decision.description} ${decision.rationale}`;
    const embeddingResult = await this.embedder.generateEmbedding(text);

    const doc: ChromaDocument = {
      id: decision.id,
      content: JSON.stringify(decision),
      embedding: embeddingResult.embedding,
      metadata: {
        type: 'decision',
        title: decision.title,
        timestamp: decision.timestamp,
        status: decision.status,
        tags: decision.tags,
      },
    };

    await this.chromaDB.addDocuments(collectionName, [doc]);

    logger.info(`Design decision recorded: ${decision.title}`);
  }

  /**
   * Search for related design decisions.
   */
  async searchDecisions(query: string, k: number = 5): Promise<DesignDecision[]> {
    this.ensureInitialized();

    const collectionName = this.chromaDB.getCollectionNames().decisions!;

    // Generate query embedding
    const embeddingResult = await this.embedder.generateEmbedding(query);

    // Search
    const results = await this.chromaDB.query(collectionName, embeddingResult.embedding, k);

    return results.map(r => JSON.parse(r.content) as DesignDecision);
  }

  /**
   * Get all active design decisions.
   */
  async getActiveDecisions(): Promise<DesignDecision[]> {
    this.ensureInitialized();

    const collectionName = this.chromaDB.getCollectionNames().decisions!;

    try {
      const stats = await this.chromaDB.getCollectionStats(collectionName);
      // TODO: Filter by status='active' once we have proper querying
      // For now, return empty array
      return [];
    } catch (error) {
      logger.error('Failed to get active decisions:', error);
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // Historical fixes
  // -------------------------------------------------------------------------

  /**
   * Store a successful fix for future reference.
   */
  async storeSuccessfulFix(task: Task, result: TaskResult): Promise<void> {
    this.ensureInitialized();

    if (!result.success) {
      return; // Only store successful fixes
    }

    const collectionName = this.chromaDB.getCollectionNames().fixes!;

    // Create fix record
    const fix: HistoricalFix = {
      id: `fix:${task.id}:${Date.now()}`,
      taskDescription: task.description,
      errorType: this.inferErrorType(result),
      errorMessage: result.validationErrors?.[0]?.message ?? '',
      solution: this.generateSolutionSummary(result),
      filesChanged: result.changes?.map(c => c.filePath) ?? [],
      successRate: 1.0,
      timestamp: Date.now(),
      tags: this.generateTags(task, result),
    };

    // Generate embedding
    const text = `${fix.taskDescription} ${fix.errorType} ${fix.solution}`;
    const embeddingResult = await this.embedder.generateEmbedding(text);

    const doc: ChromaDocument = {
      id: fix.id,
      content: JSON.stringify(fix),
      embedding: embeddingResult.embedding,
      metadata: {
        type: 'fix',
        errorType: fix.errorType,
        timestamp: fix.timestamp,
        filesCount: fix.filesChanged.length,
        tags: fix.tags,
      },
    };

    await this.chromaDB.addDocuments(collectionName, [doc]);

    logger.info(`Historical fix stored: ${fix.taskDescription.slice(0, 50)}...`);

    // Cleanup old fixes if needed
    await this.pruneOldFixes();
  }

  /**
   * Find similar fixes from history.
   */
  async findSimilarFixes(task: Task, k: number = 5): Promise<HistoricalFix[]> {
    this.ensureInitialized();

    const collectionName = this.chromaDB.getCollectionNames().fixes!;

    // Generate query embedding
    const embeddingResult = await this.embedder.generateEmbedding(task.description);

    // Search
    const results = await this.chromaDB.query(collectionName, embeddingResult.embedding, k);

    return results.map(r => JSON.parse(r.content) as HistoricalFix);
  }

  /**
   * Get fixes by error type.
   */
  async getFixesByErrorType(errorType: string, k: number = 10): Promise<HistoricalFix[]> {
    this.ensureInitialized();

    const collectionName = this.chromaDB.getCollectionNames().fixes!;

    // Generate query
    const embeddingResult = await this.embedder.generateEmbedding(errorType);

    // Search with filter
    const results = await this.chromaDB.query(
      collectionName,
      embeddingResult.embedding,
      k,
      { errorType },
    );

    return results.map(r => JSON.parse(r.content) as HistoricalFix);
  }

  // -------------------------------------------------------------------------
  // Helper methods
  // -------------------------------------------------------------------------

  private inferErrorType(result: TaskResult): string {
    if (!result.validationErrors || result.validationErrors.length === 0) {
      return 'unknown';
    }

    const firstError = result.validationErrors[0];
    return firstError.type || 'unknown';
  }

  private generateSolutionSummary(result: TaskResult): string {
    if (!result.changes || result.changes.length === 0) {
      return 'No changes';
    }

    const changeTypes = result.changes.map(c => c.changeType);
    const files = result.changes.map(c => c.filePath);

    return `Applied ${changeTypes.join(', ')} to ${files.join(', ')}`;
  }

  private generateTags(task: Task, result: TaskResult): string[] {
    const tags: string[] = [];

    // Add task type
    tags.push(task.type);

    // Add priority
    tags.push(task.priority);

    // Add file extensions
    if (result.changes) {
      const extensions = new Set(
        result.changes.map(c => c.filePath.split('.').pop()).filter(Boolean),
      );
      tags.push(...Array.from(extensions).map(ext => `ext:${ext}`));
    }

    return tags;
  }

  private async pruneOldFixes(): Promise<void> {
    const collectionName = this.chromaDB.getCollectionNames().fixes!;

    try {
      const stats = await this.chromaDB.getCollectionStats(collectionName);

      if (stats.count > this.config.maxHistoricalFixes) {
        logger.info('Pruning old fixes', {
          current: stats.count,
          max: this.config.maxHistoricalFixes,
        });
        // TODO: Implement pruning logic (delete oldest fixes)
      }
    } catch (error) {
      logger.error('Failed to prune old fixes:', error);
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('LongTermMemory not initialized. Call initialize() first.');
    }
  }

  // -------------------------------------------------------------------------
  // Statistics
  // -------------------------------------------------------------------------

  async getStats(): Promise<{
    modules: number;
    decisions: number;
    fixes: number;
  }> {
    const names = this.chromaDB.getCollectionNames();

    const [modulesStats, decisionsStats, fixesStats] = await Promise.all([
      this.chromaDB.getCollectionStats(names.modules!),
      this.chromaDB.getCollectionStats(names.decisions!),
      this.chromaDB.getCollectionStats(names.fixes!),
    ]);

    return {
      modules: modulesStats.count,
      decisions: decisionsStats.count,
      fixes: fixesStats.count,
    };
  }
}
