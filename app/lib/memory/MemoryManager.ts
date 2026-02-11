/**
 * Memory Manager — Phase 4
 *
 * Main orchestrator for the memory system. Integrates short-term and long-term
 * memory with agent workflows.
 *
 * Responsibilities:
 *  - Initialize and coordinate all memory components
 *  - Augment agent tasks with relevant context
 *  - Record task results and learnings
 *  - Manage memory lifecycle and cleanup
 */

import { createScopedLogger } from '~/utils/logger';
import { ChromaDBWrapper } from './ChromaDBWrapper';
import { EmbeddingGenerator } from './EmbeddingGenerator';
import { ShortTermMemory, type Message } from './ShortTermMemory';
import { LongTermMemory, type ModuleSummary, type DesignDecision, type HistoricalFix } from './LongTermMemory';
import { MemoryRetrieval, type RelevantContext } from './MemoryRetrieval';
import type { Task, TaskResult, FileChange } from '../agents/types';

const logger = createScopedLogger('MemoryManager');

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MemoryConfig {
  modelProvider: any; // BaseLLMProvider from bolt.diy
  embeddingDimensions?: number;
  shortTermWindow?: number;
  compressionThreshold?: number;
  cacheSize?: number;
  persistencePrefix?: string;
}

export interface AugmentedTask extends Task {
  memoryContext?: RelevantContext;
  contextSummary?: string;
}

export interface MemoryStats {
  shortTerm: {
    messageCount: number;
    activeTask: boolean;
    compressedHistories: number;
  };
  longTerm: {
    modules: number;
    decisions: number;
    fixes: number;
  };
  cache: {
    embeddingCacheSize: number;
    hitRate: number;
  };
}

// ---------------------------------------------------------------------------
// Memory Manager
// ---------------------------------------------------------------------------

export class MemoryManager {
  private chromaDB: ChromaDBWrapper;
  private embeddingGen: EmbeddingGenerator;
  private shortTermMemory: ShortTermMemory;
  private longTermMemory: LongTermMemory;
  private retrieval: MemoryRetrieval;
  private initialized: boolean = false;

  constructor(private config: MemoryConfig) {
    this.chromaDB = new ChromaDBWrapper({
      collections: {
        modules: `${config.persistencePrefix || 'boltdiy'}_modules`,
        decisions: `${config.persistencePrefix || 'boltdiy'}_decisions`,
        fixes: `${config.persistencePrefix || 'boltdiy'}_fixes`,
      },
    });

    this.embeddingGen = new EmbeddingGenerator({
      maxCacheSize: config.cacheSize || 1000,
      dimension: config.embeddingDimensions || 384,
    });

    this.shortTermMemory = new ShortTermMemory({
      maxActiveMessages: config.shortTermWindow || 20,
      compressionThreshold: config.compressionThreshold || 50,
    });

    this.longTermMemory = new LongTermMemory(this.chromaDB, this.embeddingGen);

    this.retrieval = new MemoryRetrieval(this.shortTermMemory, this.longTermMemory);
  }

  /**
   * Initialize the memory system
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('Memory system already initialized');
      return;
    }

    logger.info('Initializing memory system');

    try {
      await Promise.all([
        this.chromaDB.initialize(),
        this.shortTermMemory.initialize(),
        this.longTermMemory.initialize(),
      ]);

      this.initialized = true;
      logger.info('Memory system initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize memory system', { error });
      throw error;
    }
  }

  /**
   * Augment a task with relevant memory context
   */
  async augmentTaskContext(task: Task): Promise<AugmentedTask> {
    this.ensureInitialized();

    logger.debug('Augmenting task with memory context', { taskId: task.id });

    try {
      const memoryContext = await this.retrieval.retrieveForTask(task, 10);
      const contextSummary = this.retrieval.assembleContextForAgent(memoryContext, 3000);

      return {
        ...task,
        memoryContext,
        contextSummary,
      };
    } catch (error) {
      logger.error('Failed to augment task context', { taskId: task.id, error });
      // Return task without augmentation on error
      return task;
    }
  }

  /**
   * Record task completion and extract learnings
   */
  async recordTaskResult(task: Task, result: TaskResult): Promise<void> {
    this.ensureInitialized();

    logger.debug('Recording task result', { taskId: task.id, success: result.success });

    try {
      // Record in short-term memory
      await this.shortTermMemory.addMessage({
        id: `task-${task.id}-result`,
        role: 'system',
        content: `Task ${task.id} completed. Success: ${result.success}. ${result.validationErrors?.[0]?.message || ''}`,
        timestamp: Date.now(),
        metadata: { taskId: task.id, result },
      });

      // If task was successful, extract learnings for long-term memory
      if (result.success && result.output) {
        await this.extractLearnings(task, result);
      }

      // Update active task state
      await this.shortTermMemory.clearActiveTask();
    } catch (error) {
      logger.error('Failed to record task result', { taskId: task.id, error });
    }
  }

  /**
   * Record a user or assistant message
   */
  async recordMessage(role: 'user' | 'assistant' | 'system', content: string, metadata?: Record<string, any>): Promise<void> {
    this.ensureInitialized();

    await this.shortTermMemory.addMessage({
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      role,
      content,
      timestamp: Date.now(),
      metadata,
    });
  }

  /**
   * Update active task state
   */
  async updateActiveTask(task: Task, progress: number): Promise<void> {
    this.ensureInitialized();

    this.shortTermMemory.setActiveTask(task);
    this.shortTermMemory.updateTaskProgress(task.id, progress);
  }

  /**
   * Store a module summary in long-term memory
   */
  async storeModuleSummary(summary: ModuleSummary): Promise<void> {
    this.ensureInitialized();
    await this.longTermMemory.storeModuleSummary(summary);
  }

  /**
   * Store a design decision in long-term memory
   */
  async storeDesignDecision(decision: DesignDecision): Promise<void> {
    this.ensureInitialized();
    await this.longTermMemory.recordDecision(decision);
  }

  /**
   * Store a historical fix in long-term memory
   */
  async storeHistoricalFix(fix: HistoricalFix): Promise<void> {
    this.ensureInitialized();
    // HistoricalFix will be stored via storeSuccessfulFix when task completes
    // This is a placeholder for manual fix storage
    logger.warn('Manual fix storage not yet implemented');
  }

  /**
   * Search across all memory
   */
  async search(query: string, maxResults: number = 20): Promise<any[]> {
    this.ensureInitialized();
    const results = await this.retrieval.search(query, maxResults);
    return results.map((r) => r.item);
  }

  /**
   * Get memory statistics
   */
  async getStats(): Promise<MemoryStats> {
    this.ensureInitialized();

    const [shortTermStats, longTermStats] = await Promise.all([
      Promise.resolve(this.shortTermMemory.getStats()),
      this.longTermMemory.getStats(),
    ]);

    const cacheStats = this.embeddingGen.getCacheStats();

    return {
      shortTerm: {
        messageCount: shortTermStats.activeMessages,
        activeTask: shortTermStats.activeTask,
        compressedHistories: shortTermStats.compressedMessages > 0 ? 1 : 0,
      },
      longTerm: {
        modules: longTermStats.modules,
        decisions: longTermStats.decisions,
        fixes: longTermStats.fixes,
      },
      cache: {
        embeddingCacheSize: cacheStats.size,
        hitRate: cacheStats.hitRate,
      },
    };
  }

  /**
   * Clear short-term memory (conversation history)
   */
  async clearShortTermMemory(): Promise<void> {
    this.ensureInitialized();
    this.shortTermMemory.clearMessages();
    logger.info('Short-term memory cleared');
  }

  /**
   * Export all memory data
   */
  async exportMemory(): Promise<any> {
    this.ensureInitialized();

    const conversation = this.shortTermMemory.getActiveContext();
    const longTermStats = await this.longTermMemory.getStats();

    return {
      exportedAt: Date.now(),
      version: '4.0.0',
      shortTerm: conversation,
      longTerm: {
        modules: longTermStats.modules,
        decisions: longTermStats.decisions,
        fixes: longTermStats.fixes,
      },
    };
  }

  /**
   * Cleanup and close connections
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up memory system');

    try {
      await Promise.all([
        this.chromaDB.cleanup(),
        this.shortTermMemory.cleanup(),
        this.longTermMemory.cleanup(),
      ]);

      this.initialized = false;
      logger.info('Memory system cleaned up');
    } catch (error) {
      logger.error('Error during memory cleanup', { error });
    }
  }

  // ---------------------------------------------------------------------------
  // Private methods
  // ---------------------------------------------------------------------------

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('MemoryManager not initialized. Call initialize() first.');
    }
  }

  /**
   * Extract learnings from successful task execution
   */
  private async extractLearnings(task: Task, result: TaskResult): Promise<void> {
    try {
      // If task modified files, create/update module summaries
      if (result.output?.files && Array.isArray(result.output.files)) {
        for (const file of result.output.files) {
          if (file.path && file.content) {
            await this.updateModuleSummaryFromFile(file);
          }
        }
      }

      // If task fixed an error, record as historical fix
      if (task.metadata?.error && result.success) {
        await this.recordSuccessfulFix(task, result);
      }

      // If task made architectural decisions, record them
      if (task.metadata?.designDecision) {
        await this.recordDesignDecision(task, result);
      }
    } catch (error) {
      logger.error('Failed to extract learnings', { taskId: task.id, error });
    }
  }

  /**
   * Update or create module summary from file change
   */
  private async updateModuleSummaryFromFile(file: FileChange): Promise<void> {
    try {
      const summary: ModuleSummary = {
        filePath: file.path,
        summary: this.generateFileSummary(file),
        exports: this.extractExports(file.newContent || ''),
        dependencies: this.extractImports(file.newContent || ''),
        lastUpdated: Date.now(),
        tags: this.generateFileTags(file.path),
      };

      await this.longTermMemory.storeModuleSummary(summary);
    } catch (error) {
      logger.error('Failed to update module summary', { path: file.path, error });
    }
  }

  /**
   * Record a successful fix in long-term memory
   */
  private async recordSuccessfulFix(task: Task, result: TaskResult): Promise<void> {
    await this.longTermMemory.storeSuccessfulFix(task, result);
  }

  /**
   * Record a design decision from task metadata
   */
  private async recordDesignDecision(task: Task, result: TaskResult): Promise<void> {
    const decision: DesignDecision = {
      id: `decision-${Date.now()}-${task.id}`,
      title: task.metadata?.designDecision?.title || task.description,
      description: task.metadata?.designDecision?.description || task.description,
      rationale: task.metadata?.designDecision?.rationale || result.output?.summary || '',
      alternatives: task.metadata?.designDecision?.alternatives || [],
      timestamp: Date.now(),
      relatedFiles: result.output?.files?.map((f: any) => f.path) || [],
      tags: [task.type, 'architecture'],
      status: 'active',
    };

    await this.longTermMemory.recordDecision(decision);
  }

  /**
   * Generate a brief summary of file changes
   */
  private generateFileSummary(file: FileChange): string {
    const lines = file.newContent?.split('\n').length || 0;
    const extension = file.path.split('.').pop() || '';
    return `${extension} file with ~${lines} lines`;
  }

  /**
   * Extract exported symbols from file content
   */
  private extractExports(content: string): string[] {
    const exports: string[] = [];
    const exportRegex = /export\s+(const|function|class|interface|type)\s+(\w+)/g;
    let match;

    while ((match = exportRegex.exec(content)) !== null) {
      exports.push(match[2]);
    }

    return exports;
  }

  /**
   * Extract imported modules from file content
   */
  private extractImports(content: string): string[] {
    const imports: string[] = [];
    const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    return imports;
  }

  /**
   * Generate tags based on file path
   */
  private generateFileTags(filePath: string): string[] {
    const tags: string[] = [];

    if (filePath.includes('/agents/')) tags.push('agent');
    if (filePath.includes('/memory/')) tags.push('memory');
    if (filePath.includes('/lib/')) tags.push('library');
    if (filePath.includes('/app/')) tags.push('application');
    if (filePath.includes('test') || filePath.includes('spec')) tags.push('test');

    const extension = filePath.split('.').pop();
    if (extension) tags.push(extension);

    return tags;
  }
}
