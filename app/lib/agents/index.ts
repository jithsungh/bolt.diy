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
export const AGENT_SYSTEM_VERSION = '2.0.0';

// System description
export const SYSTEM_DESCRIPTION = `
Multi-Agent Autonomous Coding System v${AGENT_SYSTEM_VERSION}

A sophisticated multi-agent system for autonomous code generation and modification:

## Agents:
- 🧠 **Planner Agent**: Breaks down requests into executable tasks with dependency analysis
- ⚡ **Executor Agent**: Executes code modifications with safety checks and validation
- 🔍 **Reviewer Agent**: Reviews changes for quality, security, and performance
- 📊 **Validator Agent**: Validates syntax, logic, and execution results

## Core Features:
- Multi-stage planning with dependency management
- Patch validation and diff-aware editing
- Safety checks and guardrails
- Internal evaluation passes
- Vector-based memory storage and retrieval
- Automatic error detection and fixing
- Context-aware code understanding

## Repo Intelligence Layer (NEW):
- 🔍 **AST Parser**: Extracts symbols, functions, classes from code
- 🗺️ **Symbol Graph**: Tracks dependencies and reverse dependencies
- 🧠 **Semantic Index**: Vector-based code search and understanding
- 📦 **Context Builder**: Automatically assembles relevant context
- 📚 **Skills System**: Loads domain-specific knowledge from .agent/skills/

## Safety:
- File locking support
- Rollback capability
- Safety scoring for all changes
- Pre and post-execution validation
- Forbidden operation detection
- Security vulnerability scanning

## Memory & Learning:
- Vector-based semantic search
- Skill effectiveness tracking
- Agent execution history
- Context-aware retrieval
`;
