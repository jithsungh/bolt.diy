/**
 * Memory Retrieval System — Phase 4
 *
 * Unified search interface across all memory stores. Combines short-term
 * conversation context with long-term knowledge retrieval.
 *
 * Features:
 *  - Multi-source retrieval (short-term + long-term)
 *  - Relevance scoring and ranking
 *  - Context assembly for agent tasks
 *  - Smart result deduplication
 */

import { createScopedLogger } from '~/utils/logger';
import { ShortTermMemory, type Message, type ConversationContext } from './ShortTermMemory';
import {
  LongTermMemory,
  type ModuleSummary,
  type DesignDecision,
  type HistoricalFix,
} from './LongTermMemory';
import type { Task } from '../agents/types';

const logger = createScopedLogger('MemoryRetrieval');

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RetrievalQuery {
  query: string;
  taskContext?: Task;
  includeConversation?: boolean;
  includeLongTerm?: boolean;
  maxResults?: number;
  minRelevanceScore?: number;
  filters?: {
    timeRange?: [number, number];
    tags?: string[];
    filePatterns?: string[];
  };
}

export interface RelevantContext {
  conversation: ConversationContext;
  moduleSummaries: ModuleSummary[];
  designDecisions: DesignDecision[];
  historicalFixes: HistoricalFix[];
  relevanceScores: Map<string, number>;
}

export interface ScoredItem<T> {
  item: T;
  score: number;
  source: 'conversation' | 'modules' | 'decisions' | 'fixes';
  matchReason: string;
}

// ---------------------------------------------------------------------------
// Memory Retrieval System
// ---------------------------------------------------------------------------

export class MemoryRetrieval {
  private shortTermMemory: ShortTermMemory;
  private longTermMemory: LongTermMemory;

  constructor(shortTermMemory: ShortTermMemory, longTermMemory: LongTermMemory) {
    this.shortTermMemory = shortTermMemory;
    this.longTermMemory = longTermMemory;
  }

  /**
   * Retrieve relevant context for a task
   */
  async retrieveForTask(task: Task, maxResults: number = 10): Promise<RelevantContext> {
    logger.info('Retrieving context for task', { taskId: task.id, type: task.type });

    const query: RetrievalQuery = {
      query: task.description,
      taskContext: task,
      includeConversation: true,
      includeLongTerm: true,
      maxResults,
      minRelevanceScore: 0.3,
    };

    return this.retrieve(query);
  }

  /**
   * Main retrieval method combining all sources
   */
  async retrieve(query: RetrievalQuery): Promise<RelevantContext> {
    const startTime = Date.now();

    try {
      // Parallel retrieval from all sources
      const [conversation, modules, decisions, fixes] = await Promise.all([
        query.includeConversation !== false
          ? Promise.resolve(this.shortTermMemory.getActiveContext())
          : Promise.resolve({
              recentMessages: [],
              messageCount: 0,
            } as ConversationContext),
        query.includeLongTerm !== false
          ? this.longTermMemory.searchModules(query.query, query.maxResults || 5)
          : Promise.resolve([]),
        query.includeLongTerm !== false
          ? this.longTermMemory.searchDecisions(query.query, query.maxResults || 5)
          : Promise.resolve([]),
        query.includeLongTerm !== false
          ? this.longTermMemory.findSimilarFixes({ description: query.query } as Task, query.maxResults || 5)
          : Promise.resolve([]),
      ]);

      // Apply filters
      const filteredModules = this.applyFilters(modules, query);
      const filteredDecisions = this.applyFilters(decisions, query);
      const filteredFixes = this.applyFilters(fixes, query);

      // Calculate relevance scores
      const relevanceScores = this.calculateRelevanceScores(
        query,
        filteredModules,
        filteredDecisions,
        filteredFixes,
      );

      const duration = Date.now() - startTime;
      logger.info('Context retrieved', {
        conversationMessages: conversation.recentMessages.length,
        modules: filteredModules.length,
        decisions: filteredDecisions.length,
        fixes: filteredFixes.length,
        duration,
      });

      return {
        conversation,
        moduleSummaries: filteredModules,
        designDecisions: filteredDecisions,
        historicalFixes: filteredFixes,
        relevanceScores,
      };
    } catch (error) {
      logger.error('Failed to retrieve context', { error });
      throw error;
    }
  }

  /**
   * Search across all memory stores with unified scoring
   */
  async search(
    query: string,
    maxResults: number = 20,
  ): Promise<Array<ScoredItem<any>>> {
    logger.debug('Unified search', { query, maxResults });

    try {
      const [modules, decisions, fixes] = await Promise.all([
        this.longTermMemory.searchModules(query, maxResults),
        this.longTermMemory.searchDecisions(query, maxResults),
        this.longTermMemory.findSimilarFixes({ description: query } as Task, maxResults),
      ]);

      // Score and combine results
      const scoredResults: Array<ScoredItem<ModuleSummary | DesignDecision | HistoricalFix>> = [
        ...modules.map((item: ModuleSummary) => ({
          item,
          score: this.scoreModule(item, query),
          source: 'modules' as const,
          matchReason: `Module: ${item.filePath}`,
        })),
        ...decisions.map((item: DesignDecision) => ({
          item,
          score: this.scoreDesignDecision(item, query),
          source: 'decisions' as const,
          matchReason: `Decision: ${item.title}`,
        })),
        ...fixes.map((item: HistoricalFix) => ({
          item,
          score: this.scoreHistoricalFix(item, query),
          source: 'fixes' as const,
          matchReason: `Fix: ${item.errorType}`,
        })),
      ];

      // Sort by score and take top results
      scoredResults.sort((a, b) => b.score - a.score);
      return scoredResults.slice(0, maxResults);
    } catch (error) {
      logger.error('Search failed', { error });
      return [];
    }
  }

  /**
   * Assemble context for agent consumption
   */
  assembleContextForAgent(context: RelevantContext, maxTokens: number = 4000): string {
    const sections: string[] = [];

    // Conversation context
    if (context.conversation.recentMessages.length > 0) {
      sections.push('## Recent Conversation');
      if (context.conversation.compressedHistory) {
        sections.push(`**Previous Context**: ${context.conversation.compressedHistory.summary}`);
      }
      sections.push(
        context.conversation.recentMessages
          .slice(-5)
          .map((msg) => `- **${msg.role}**: ${msg.content}`)
          .join('\n'),
      );
    }

    // Module summaries
    if (context.moduleSummaries.length > 0) {
      sections.push('\n## Relevant Modules');
      sections.push(
        context.moduleSummaries
          .slice(0, 3)
          .map(
            (mod) =>
              `- **${mod.filePath}**: ${mod.summary}\n  Exports: ${mod.exports.join(', ')}`,
          )
          .join('\n'),
      );
    }

    // Design decisions
    if (context.designDecisions.length > 0) {
      sections.push('\n## Design Decisions');
      sections.push(
        context.designDecisions
          .slice(0, 2)
          .map((dec) => `- **${dec.title}**: ${dec.rationale}`)
          .join('\n'),
      );
    }

    // Historical fixes
    if (context.historicalFixes.length > 0) {
      sections.push('\n## Similar Past Fixes');
      sections.push(
        context.historicalFixes
          .slice(0, 3)
          .map(
            (fix) =>
              `- **${fix.errorType}**: ${fix.solution.substring(0, 100)}...`,
          )
          .join('\n'),
      );
    }

    const assembled = sections.join('\n');

    // Truncate if needed (rough estimate: ~4 chars per token)
    if (assembled.length > maxTokens * 4) {
      return assembled.substring(0, maxTokens * 4) + '\n\n... (truncated)';
    }

    return assembled;
  }

  // ---------------------------------------------------------------------------
  // Private methods
  // ---------------------------------------------------------------------------

  private applyFilters<T extends { timestamp?: number; tags?: string[] }>(
    items: T[],
    query: RetrievalQuery,
  ): T[] {
    let filtered = items;

    // Time range filter
    if (query.filters?.timeRange) {
      const [start, end] = query.filters.timeRange;
      filtered = filtered.filter((item) => {
        if (!item.timestamp) return true;
        return item.timestamp >= start && item.timestamp <= end;
      });
    }

    // Tags filter
    if (query.filters?.tags && query.filters.tags.length > 0) {
      filtered = filtered.filter((item) => {
        if (!item.tags) return false;
        return query.filters!.tags!.some((tag) => item.tags!.includes(tag));
      });
    }

    // File patterns filter (for modules)
    if (query.filters?.filePatterns && query.filters.filePatterns.length > 0) {
      filtered = filtered.filter((item: any) => {
        if (!item.filePath && !item.relatedFiles) return true;
        const paths = item.filePath ? [item.filePath] : item.relatedFiles || [];
        return query.filters!.filePatterns!.some((pattern) =>
          paths.some((path: string) => path.includes(pattern)),
        );
      });
    }

    return filtered;
  }

  private calculateRelevanceScores(
    query: RetrievalQuery,
    modules: ModuleSummary[],
    decisions: DesignDecision[],
    fixes: HistoricalFix[],
  ): Map<string, number> {
    const scores = new Map<string, number>();

    modules.forEach((mod) => {
      scores.set(`module:${mod.filePath}`, this.scoreModule(mod, query.query));
    });

    decisions.forEach((dec) => {
      scores.set(`decision:${dec.id}`, this.scoreDesignDecision(dec, query.query));
    });

    fixes.forEach((fix) => {
      scores.set(`fix:${fix.id}`, this.scoreHistoricalFix(fix, query.query));
    });

    return scores;
  }

  private scoreModule(module: ModuleSummary, query: string): number {
    let score = 0;

    // Exact file path match
    if (query.toLowerCase().includes(module.filePath.toLowerCase())) {
      score += 0.5;
    }

    // Tag matching
    const queryLower = query.toLowerCase();
    module.tags.forEach((tag) => {
      if (queryLower.includes(tag.toLowerCase())) {
        score += 0.2;
      }
    });

    // Recency boost
    const age = Date.now() - module.lastUpdated;
    const daysSinceUpdate = age / (1000 * 60 * 60 * 24);
    if (daysSinceUpdate < 7) {
      score += 0.3;
    } else if (daysSinceUpdate < 30) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  private scoreDesignDecision(decision: DesignDecision, query: string): number {
    let score = 0;

    const queryLower = query.toLowerCase();

    // Title match
    if (queryLower.includes(decision.title.toLowerCase())) {
      score += 0.5;
    }

    // Tag matching
    decision.tags.forEach((tag) => {
      if (queryLower.includes(tag.toLowerCase())) {
        score += 0.2;
      }
    });

    // Status bonus
    if (decision.status === 'active') {
      score += 0.2;
    }

    return Math.min(score, 1.0);
  }

  private scoreHistoricalFix(fix: HistoricalFix, query: string): number {
    let score = 0;

    const queryLower = query.toLowerCase();

    // Error type match
    if (queryLower.includes(fix.errorType.toLowerCase())) {
      score += 0.5;
    }

    // Success rate boost
    if (fix.successRate && fix.successRate > 0.8) {
      score += 0.3;
    } else if (fix.successRate && fix.successRate > 0.5) {
      score += 0.1;
    }

    // Recency boost
    const age = Date.now() - fix.timestamp;
    const daysSinceFix = age / (1000 * 60 * 60 * 24);
    if (daysSinceFix < 30) {
      score += 0.2;
    }

    return Math.min(score, 1.0);
  }
}
