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
  type ParsedError,
  type FeedbackSummary,
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

// Version
export const AGENT_SYSTEM_VERSION = '2.0.0-phase2';

// System description
export const SYSTEM_DESCRIPTION = 
  'Multi-Agent Autonomous Coding System v' + AGENT_SYSTEM_VERSION +
  '\n\nPhase 1: Repo Intelligence Layer (AST parsing, semantic search, context building)' +
  '\nPhase 2: Task Queue, Execution Feedback Loop, Agent Evaluation System' +
  '\n\nIntegration Points: WebContainer, ActionRunner, LLM system, MCP service';

