// Agent System Index
// Main exports for the multi-agent autonomous coding system

export * from './types';
export { BaseAgent } from './BaseAgent';
export { PlannerAgent } from './PlannerAgent';
export { ExecutorAgent } from './ExecutorAgent';
export { ReviewerAgent } from './ReviewerAgent';

// Integrated Orchestrator (uses bolt.diy infrastructure)
export {
  IntegratedOrchestrator,
  type OrchestratorConfig as IntegratedOrchestratorConfig,
  type OrchestratorResult,
} from './IntegratedOrchestrator';

// Legacy standalone orchestrator (for reference)
export {
  AgentOrchestrator,
  type OrchestratorConfig,
  type ExecutionResult,
  type TaskExecutionRecord,
} from './AgentOrchestrator';

// Phase 2: Task Queue and Systems
export {
  TaskQueue,
  type QueuedTask,
  type QueueStats,
  type TaskQueueConfig,
} from './TaskQueue';
export {
  ExecutionFeedbackLoop,
  type ExecutionContext as FeedbackExecutionContext,
  type ExecutionResult as FeedbackExecutionResult,
  type IterativeExecutionResult,
  type PhaseResult,
  type FixAttempt,
  type ParsedError,
  type FeedbackSummary,
  type ExecutionFeedbackConfig,
} from './ExecutionFeedbackLoop';
export {
  AgentEvaluationSystem,
  type EvaluationMetrics,
  type AgentPerformance,
  type FailureCategory,
} from './AgentEvaluationSystem';

export {
  VectorMemoryStore,
  getMemoryStore,
  type MemoryEntry,
  type SearchOptions,
} from './VectorMemoryStore';
export { SkillsManager, type Skill } from './SkillsManager';
export { SkillsLoader, type LoadedSkill, type SkillLoadResult } from './SkillsLoader';
export { ASTParser, type Symbol, type FileSymbols, type SymbolGraph } from './ASTParser';
export {
  ContextBuilder,
  type ContextItem,
  type ContextBundle,
  type ContextBuilderOptions,
} from './ContextBuilder';
export {
  SemanticRepoIndex,
  type CodeChunk,
  type SearchResult,
  type IndexStats,
} from './SemanticRepoIndex';
export {
  AgentSystemIntegration,
  createAgentSystem,
  type IntegrationConfig,
  type ProcessRequestOptions,
  type ProcessResult,
} from './AgentSystemIntegration';

// Phase 3: Execution Feedback Loop Components
export {
  RollbackManager,
  type Checkpoint,
  type CheckpointFile,
  type RollbackResult,
  type RollbackManagerConfig,
} from './RollbackManager';
export {
  ResourceLimiter,
  ResourceLimitError,
  type ResourceLimits,
  type ResourceBudget,
  type ResourceLimiterConfig,
} from './ResourceLimiter';
export {
  TestRunner,
  type TestCase,
  type TestRunResult,
  type CoverageSummary,
  type TestRunnerConfig,
} from './TestRunner';
export {
  BuildValidator,
  type BuildArtifact,
  type BundleSizeReport,
  type BuildValidationResult,
  type BuildIssue,
  type BuildBaseline,
  type BuildValidatorConfig,
} from './BuildValidator';

// Phase 4: Memory System
export {
  MemoryManager,
  type MemoryConfig,
  type AugmentedTask,
  type MemoryStats,
} from '../memory/MemoryManager';
export {
  MemoryRetrieval,
  type RetrievalQuery,
  type RelevantContext,
  type ScoredItem,
} from '../memory/MemoryRetrieval';
export {
  ShortTermMemory,
  type Message,
  type CompressedHistory,
  type ConversationContext,
  type ActiveTaskState,
} from '../memory/ShortTermMemory';
export {
  LongTermMemory,
  type ModuleSummary,
  type DesignDecision,
  type HistoricalFix,
} from '../memory/LongTermMemory';
export {
  ChromaDBWrapper,
  type ChromaDBConfig,
  type ChromaDocument,
  type SearchResult as ChromaSearchResult,
} from '../memory/ChromaDBWrapper';
export {
  EmbeddingGenerator,
  type EmbeddingConfig,
  type EmbeddingResult,
} from '../memory/EmbeddingGenerator';

// Version
export const AGENT_SYSTEM_VERSION = '4.0.0-phase4';

// System description
export const SYSTEM_DESCRIPTION = 
  'Multi-Agent Autonomous Coding System v' + AGENT_SYSTEM_VERSION +
  '\n\nPhase 1: Repo Intelligence Layer (AST parsing, semantic search, context building)' +
  '\nPhase 2: Task Queue, Execution Feedback Loop, Agent Evaluation System' +
  '\nPhase 3: Iterative Execution, Rollback, Resource Limits, Smart Testing, Build Validation' +
  '\nPhase 4: Memory System (short-term conversation, long-term knowledge, semantic search)' +
  '\n\nIntegration Points: WebContainer, ActionRunner, LLM system, MCP service, ChromaDB';

