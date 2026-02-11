# Multi-Agent Autonomous Coding System

A sophisticated multi-agent system for autonomous code generation, modification, and analysis with repository intelligence.

## 🎯 Overview

This system transforms bolt.diy from a single-agent loop into a sophisticated multi-agent pipeline that rivals Claude Code's capabilities. It includes:

- **Multi-stage planning** with dependency-aware task decomposition
- **Intelligent execution** with safety checks and validation
- **Comprehensive review** for code quality, security, and performance
- **Repository intelligence** with AST parsing and semantic search
- **Skills system** with automatic loading from `.agent/skills/`
- **Vector-based memory** for learning and context retrieval

## 🏗️ Architecture

```
User Request
    ↓
┌─────────────────────────────────────────────────────┐
│           Agent System Integration                  │
│                                                     │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    │
│  │ Skills   │────│  Memory  │────│   Repo   │    │
│  │ Loader   │    │  Store   │    │  Index   │    │
│  └──────────┘    └──────────┘    └──────────┘    │
│                         ↓                          │
│               ┌─────────────────┐                 │
│               │  Orchestrator   │                 │
│               └─────────────────┘                 │
│                         ↓                          │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    │
│  │ Planner  │ ─> │ Executor │ ─> │ Reviewer │    │
│  │  Agent   │    │  Agent   │    │  Agent   │    │
│  └──────────┘    └──────────┘    └──────────┘    │
│         ↓                                          │
│  ┌──────────────────────────────────────────┐    │
│  │        Context Builder                    │    │
│  │  - Dependency Analysis                    │    │
│  │  - Test File Discovery                    │    │
│  │  - Semantic Search                        │    │
│  └──────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
    ↓
Results (Tasks, Changes, Metrics)
```

## 📦 Components

### Core Agents

- **`PlannerAgent`** - Breaks down complex requests into executable tasks with dependency management
- **`ExecutorAgent`** - Executes tasks with pre/post safety checks and validation
- **`ReviewerAgent`** - Reviews code for quality, security, performance, and best practices

### Repository Intelligence

- **`ASTParser`** - Extracts symbols, functions, classes, and dependencies from code
- **`SymbolGraph`** - Tracks relationships between code entities
- **`SemanticRepoIndex`** - Vector-based code search and understanding
- **`ContextBuilder`** - Automatically assembles relevant context for tasks

### Memory & Skills

- **`VectorMemoryStore`** - Semantic memory with vector search capabilities
- **`SkillsManager`** - Manages and retrieves domain-specific knowledge
- **`SkillsLoader`** - Dynamically loads skills from `.agent/skills/`

### Orchestration

- **`AgentOrchestrator`** - Coordinates multi-agent workflows
- **`AgentSystemIntegration`** - Complete system integration

## 🚀 Quick Start

### Basic Usage

```typescript
import { createAgentSystem } from './lib/agents/AgentSystemIntegration';

// Create and initialize the system
const agentSystem = await createAgentSystem({
  skillsPath: '.agent/skills',
  safetyMode: 'moderate',
});

// Process a request
const result = await agentSystem.processRequest({
  userRequest: 'Add authentication to the API routes',
  files: ['app/routes/api.auth.ts'],
  context: 'Use JWT tokens and secure password hashing',
});

console.log('Success:', result.success);
console.log('Files modified:', result.metrics.filesModified);
```

### Index Files

```typescript
// Index files for semantic search
await agentSystem.indexFiles([
  { path: 'app/components/Button.tsx', content: buttonCode },
  { path: 'app/components/Input.tsx', content: inputCode },
]);

// Search the codebase
const results = await agentSystem.searchCode('React component with form validation', 5);
```

### Find Symbols

```typescript
// Find specific functions or classes
const symbols = agentSystem.findSymbol('handleSubmit');
console.log('Found in:', symbols.map(s => s.file));
```

## 🎓 Skills System

Skills are loaded from `.agent/skills/` directory. Each skill is a directory with:

```
skill-name/
├── SKILL.md        # Metadata and instructions (required)
├── scripts/        # Helper scripts (optional)
├── references/     # Documentation (optional)
└── assets/         # Images, etc. (optional)
```

### SKILL.md Format

```markdown
---
name: react-best-practices
description: React and Next.js performance optimization from Vercel Engineering
allowed-tools: Read, Write, Edit, Glob, Grep
tags: frontend, react, performance
priority: 8
applicable-agents: executor, reviewer
---

# Skill Content

Your skill instructions and examples here...
```

### Available Skills

The system automatically loads all skills from `.agent/skills/`:

- `nextjs-react-expert` - React/Next.js performance optimization
- `systematic-debugging` - 4-phase debugging methodology
- `testing-patterns` - TDD and testing best practices
- `api-patterns` - REST API design patterns
- `clean-code` - Code quality and maintainability
- `security-patterns` - Security best practices
- And 30+ more...

## 🔍 Repository Intelligence

### AST Parsing

```typescript
const astParser = agentSystem.getASTParser();

// Parse a file
const symbols = astParser.parseFile('app/utils/helpers.ts', code);

// Find dependencies
const deps = astParser.getDependencies('app/utils/helpers.ts');

// Find dependents
const dependents = astParser.getDependents('app/utils/helpers.ts');
```

### Context Building

```typescript
const contextBuilder = new ContextBuilder(astParser, memoryStore);

// Build context for a task
const context = await contextBuilder.buildContext(
  ['app/components/Form.tsx'],
  'Add form validation',
  {
    includeDependencies: true,
    includeDependents: true,
    includeTests: true,
    maxTokens: 100000,
  }
);

// Context includes:
// - Primary files
// - Dependencies (imports)
// - Dependents (files that import these)
// - Related files (semantic search)
// - Test files
// - Documentation
```

### Semantic Search

```typescript
const repoIndex = agentSystem.getRepoIndex();

// Search by natural language
const results = await repoIndex.search('function that validates email addresses', 10);

// Find by tags
const components = repoIndex.findByTags(['react', 'component']);

// Find similar code
const similar = await repoIndex.findSimilar(myCodeSnippet, 5);
```

## 📊 Monitoring & Metrics

```typescript
// Repository statistics
const repoStats = agentSystem.getRepoStats();
console.log('Files indexed:', repoStats.totalFiles);
console.log('Total symbols:', repoStats.totalSymbols);

// Memory statistics
const memoryStats = agentSystem.getMemoryStats();
console.log('Total memories:', memoryStats.totalMemories);

// Skills statistics
const skillsStats = agentSystem.getSkillsStats();
console.log('Skills loaded:', skillsStats.totalSkills);
console.log('Most used:', skillsStats.mostUsedSkill);

// Orchestrator metrics
const metrics = agentSystem.getOrchestratorMetrics();
console.log('Tasks completed:', metrics.tasksCompleted);
console.log('Success rate:', metrics.successRate);
```

## 🛡️ Safety Features

### Safety Modes

- **`strict`** - Maximum safety, minimal changes, requires approval
- **`moderate`** - Balanced safety and autonomy (default)
- **`permissive`** - More autonomous, fewer restrictions

### Safety Checks

- Pre-execution validation (file count, locked files, forbidden operations)
- Post-execution validation (syntax, safety scores, logic checks)
- Security scanning (eval, exec, hardcoded secrets)
- Quality checks (code smells, best practices)

### Rollback Support

```typescript
// All changes are tracked and can be rolled back
const changes = result.changes;

// Each change includes:
// - Original content
// - New content
// - Diff
// - Validation results
```

## 🔧 Configuration

```typescript
const agentSystem = await createAgentSystem({
  skillsPath: '.agent/skills',          // Skills directory
  maxTokens: 100000,                    // Max context size
  safetyMode: 'moderate',               // Safety level
  enableSemanticSearch: true,           // Enable vector search
  autoLoadSkills: true,                 // Auto-load skills on init
});
```

## 📈 Performance

- **Smart Context Assembly**: Only loads relevant files, dependencies, and tests
- **Token Budget Management**: Automatically trims context to fit limits
- **Parallel Execution**: Runs independent tasks concurrently
- **Caching**: Files and symbols are cached for fast access
- **Incremental Indexing**: Only re-indexes changed files

## 🧪 Testing

See `examples.ts` for comprehensive usage examples:

```bash
# Run all examples
npm run agents:examples

# Or in TypeScript
import { runAllExamples } from './lib/agents/examples';
await runAllExamples();
```

## 📚 API Reference

### AgentSystemIntegration

```typescript
class AgentSystemIntegration {
  constructor(config?: IntegrationConfig)
  
  // Initialization
  async initialize(): Promise<void>
  
  // Indexing
  async indexFile(filePath: string, content: string): Promise<void>
  async indexFiles(files: Array<{path: string, content: string}>): Promise<void>
  
  // Processing
  async processRequest(options: ProcessRequestOptions): Promise<ProcessResult>
  
  // Search
  async searchCode(query: string, limit?: number): Promise<SearchResult[]>
  findSymbol(symbolName: string): CodeChunk[]
  
  // Statistics
  getRepoStats(): IndexStats
  getMemoryStats(): MemoryStats
  getSkillsStats(): SkillsStats
  getOrchestratorMetrics(): OrchestratorMetrics
  
  // Utilities
  exportSystemState(): string
  reset(): void
}
```

## 🗺️ Roadmap

### ✅ Phase 1: Repo Intelligence Layer (COMPLETE)
- [x] AST Parser with symbol extraction
- [x] Symbol graph with dependency tracking
- [x] Context builder with automatic context assembly
- [x] Semantic repo index with vector search
- [x] Skills loader from `.agent/skills/`

### 🔄 Phase 2: Enhanced Integration (IN PROGRESS)
- [ ] LLM integration (connect to actual models)
- [ ] Execution feedback loop (build/compile/lint/test)
- [ ] Error capture and summarization
- [ ] Feedback loop implementation

### 📋 Phase 3: Advanced Features (PLANNED)
- [ ] Memory persistence (save/load to disk)
- [ ] Real vector embeddings (OpenAI/sentence-transformers)
- [ ] Git rollback system
- [ ] Evaluation metrics and agent tuning

### 🔌 Phase 4: Integration with Existing Systems (PLANNED)
- [ ] Connect to workbenchStore
- [ ] Connect to stream-text for LLM calls
- [ ] Connect to action-runner
- [ ] UI components (agent status, progress, memory viewer)

## 🤝 Contributing

See `CONTRIBUTING.md` for guidelines.

## 📄 License

MIT License - see `LICENSE` for details.

## 🙏 Credits

- Inspired by Claude Code's multi-agent approach
- Skills structure from Antigravity Kit
- Performance patterns from Vercel Engineering
