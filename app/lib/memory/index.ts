/**
 * Memory System — Phase 4
 *
 * Persistent memory for the multi-agent autonomous coding system.
 * Combines short-term conversation context with long-term knowledge storage.
 *
 * Features:
 *  - Short-term memory: conversation history, active task state
 *  - Long-term memory: module summaries, design decisions, historical fixes
 *  - Semantic search: ChromaDB-powered vector retrieval
 *  - Browser-first: IndexedDB persistence, no server required
 *  - Single LLM: uses user's selected model for embeddings
 *
 * @version 4.0.0-phase4
 * @package bolt.diy/memory
 */

// ---------------------------------------------------------------------------
// Core components
// ---------------------------------------------------------------------------

export { ChromaDBWrapper } from './ChromaDBWrapper';
export type { ChromaDBConfig, ChromaDocument, SearchResult, CollectionInfo } from './ChromaDBWrapper';

export { EmbeddingGenerator } from './EmbeddingGenerator';
export type {
  EmbeddingConfig,
  EmbeddingResult,
} from './EmbeddingGenerator';

export { ShortTermMemory } from './ShortTermMemory';
export type {
  Message,
  CompressedHistory,
  ConversationContext,
  ActiveTaskState,
  ShortTermMemoryConfig,
} from './ShortTermMemory';

export { LongTermMemory } from './LongTermMemory';
export type {
  ModuleSummary,
  DesignDecision,
  HistoricalFix,
  LongTermMemoryConfig,
} from './LongTermMemory';

export { MemoryRetrieval } from './MemoryRetrieval';
export type {
  RetrievalQuery,
  RelevantContext,
  ScoredItem,
} from './MemoryRetrieval';

export { MemoryManager } from './MemoryManager';
export type {
  MemoryConfig,
  AugmentedTask,
  MemoryStats,
} from './MemoryManager';

// ---------------------------------------------------------------------------
// Version and metadata
// ---------------------------------------------------------------------------

export const MEMORY_SYSTEM_VERSION = '4.0.0-phase4';

export const MEMORY_SYSTEM_INFO = {
  name: 'bolt.diy Memory System',
  version: MEMORY_SYSTEM_VERSION,
  phase: 4,
  description: 'Persistent memory for autonomous multi-agent coding system',
  features: [
    'Short-term conversation memory',
    'Long-term knowledge storage',
    'Semantic vector search',
    'Browser-based persistence',
    'Single LLM integration',
  ],
  components: [
    'ChromaDBWrapper',
    'EmbeddingGenerator',
    'ShortTermMemory',
    'LongTermMemory',
    'MemoryRetrieval',
    'MemoryManager',
  ],
};
