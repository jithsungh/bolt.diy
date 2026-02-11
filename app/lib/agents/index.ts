// Agent System Index
// Main exports for the multi-agent autonomous coding system

export * from './types';
export { BaseAgent } from './BaseAgent';
export { PlannerAgent } from './PlannerAgent';
export { ExecutorAgent } from './ExecutorAgent';
export { ReviewerAgent } from './ReviewerAgent';
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

// Version
export const AGENT_SYSTEM_VERSION = '3.0.0-phase3';

// System description
export const SYSTEM_DESCRIPTION = 
  'Multi-Agent Autonomous Coding System v' + AGENT_SYSTEM_VERSION +
  '\n\nPhase 1: Repo Intelligence Layer (AST parsing, semantic search, context building)' +
  '\nPhase 2: Task Queue, Execution Feedback Loop, Agent Evaluation System' +
  '\nPhase 3: Iterative Execution, Rollback, Resource Limits, Smart Testing, Build Validation' +
  '\n\nIntegration Points: WebContainer, ActionRunner, LLM system, MCP service';

