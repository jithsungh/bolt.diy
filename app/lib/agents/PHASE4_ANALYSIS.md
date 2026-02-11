# Phase 4: Memory System - Analysis & Implementation Plan

**Date:** February 11, 2026  
**Status:** Starting Phase 4 Implementation  
**Prerequisites:** Phase 1-3 Complete ✅

---

## 🎯 Goals (from plan.md)

Build **persistent intelligence** with two layers:

### 1. Short-term Working Memory
- Conversation compression
- Rolling summaries  
- Active task state

### 2. Long-term Architectural Memory
- Module summaries
- Design decisions
- Historical fixes

**Storage:** Structured documents + embeddings

---

## 🏗️ Browser-First Architecture

### Stack Adaptation for bolt.diy

| Component | plan.md Suggestion | Our Browser Implementation |
|-----------|-------------------|---------------------------|
| Vector DB | LanceDB or Chroma | **ChromaDB JS** (browser-compatible) |
| Persistence | SQLite | **IndexedDB** (browser native) |
| Embeddings | External service | **User's LLM** (already selected) |
| Orchestration | Python + asyncio | **TypeScript** (existing) |

---

## 📐 Detailed Architecture

```typescript
┌──────────────────────────────────────────────────────┐
│              User's Browser (localhost)               │
│                                                       │
│  ┌────────────────────────────────────────────────┐  │
│  │         Memory System (Phase 4)                │  │
│  │                                                 │  │
│  │  ┌──────────────────────────────────────────┐  │  │
│  │  │  Short-Term Memory Manager               │  │  │
│  │  │  • Conversation compression              │  │  │
│  │  │  • Rolling window (last N messages)      │  │  │
│  │  │  • Active task state                     │  │  │
│  │  │  Storage: IndexedDB (session data)       │  │  │
│  │  └──────────────────────────────────────────┘  │  │
│  │                                                 │  │
│  │  ┌──────────────────────────────────────────┐  │  │
│  │  │  Long-Term Memory Store                  │  │  │
│  │  │  • Module summaries                      │  │  │
│  │  │  • Design decisions                      │  │  │
│  │  │  • Historical fixes (successful tasks)   │  │  │
│  │  │  Storage: ChromaDB → IndexedDB           │  │  │
│  │  └──────────────────────────────────────────┘  │  │
│  │                                                 │  │
│  │  ┌──────────────────────────────────────────┐  │  │
│  │  │  Embedding Generator                     │  │  │
│  │  │  • Uses user's selected LLM              │  │  │
│  │  │  • Caches embeddings locally             │  │  │
│  │  └──────────────────────────────────────────┘  │  │
│  │                                                 │  │
│  │  ┌──────────────────────────────────────────┐  │  │
│  │  │  Memory Retrieval Engine                 │  │  │
│  │  │  • Semantic search via ChromaDB          │  │  │
│  │  │  • Relevance scoring                     │  │  │
│  │  │  • Context assembly                      │  │  │
│  │  └──────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────┘  │
│                                                       │
│  ┌────────────────────────────────────────────────┐  │
│  │  Integration with Existing Agents              │  │
│  │  • PlannerAgent gets historical context        │  │
│  │  • ExecutorAgent recalls similar fixes         │  │
│  │  • ReviewerAgent checks past decisions         │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

---

## 🔧 Components to Build

### 1. **ShortTermMemory.ts** (~300 lines)

```typescript
class ShortTermMemory {
  // Conversation management
  addMessage(message: Message): void
  compressHistory(threshold: number): CompressedHistory
  getActiveContext(): ConversationContext
  
  // Task state tracking
  setActiveTask(task: Task): void
  updateTaskProgress(taskId: string, progress: number): void
  
  // Rolling window
  getRecentMessages(count: number): Message[]
  
  // Storage: IndexedDB
  private storage: IDBWrapper
}
```

**Features:**
- Keep last N messages (configurable, default: 20)
- Compress older messages via LLM summarization
- Track current task state
- Fast retrieval (in-memory + IndexedDB backup)

---

### 2. **LongTermMemory.ts** (~400 lines)

```typescript
class LongTermMemory {
  // Module summaries
  storeModuleSummary(filePath: string, summary: ModuleSummary): void
  getModuleSummary(filePath: string): ModuleSummary | null
  
  // Design decisions
  recordDecision(decision: DesignDecision): void
  searchDecisions(query: string): DesignDecision[]
  
  // Historical fixes
  storeSuccessfulFix(task: Task, result: TaskResult): void
  findSimilarFixes(task: Task): HistoricalFix[]
  
  // ChromaDB integration
  private vectorStore: ChromaDBWrapper
  private embedder: EmbeddingGenerator
}
```

**Features:**
- Store file/module summaries (architecture knowledge)
- Record design decisions (why certain approaches were chosen)
- Save successful task executions (learn from history)
- Semantic search via ChromaDB
- Embedding caching

---

### 3. **ChromaDBWrapper.ts** (~250 lines)

```typescript
class ChromaDBWrapper {
  // Collection management
  async createCollection(name: string): Promise<Collection>
  async getCollection(name: string): Promise<Collection>
  
  // Document operations
  async add(
    collection: string,
    documents: string[],
    embeddings: number[][],
    metadata: Record<string, any>[]
  ): Promise<void>
  
  // Search
  async query(
    collection: string,
    queryEmbedding: number[],
    k: number
  ): Promise<SearchResult[]>
  
  // Persistence (IndexedDB)
  private client: ChromaClient
}
```

**Features:**
- Wraps ChromaDB JS client for browser
- Manages collections (modules, decisions, fixes)
- Handles persistence via IndexedDB
- Type-safe interfaces

---

### 4. **EmbeddingGenerator.ts** (~200 lines)

```typescript
class EmbeddingGenerator {
  // Generate embeddings using user's LLM
  async generateEmbedding(text: string): Promise<number[]>
  async generateBatch(texts: string[]): Promise<number[][]>
  
  // Caching
  private cache: Map<string, number[]>
  
  // Integration with LLM system
  private llmProvider: LLMProvider
}
```

**Features:**
- Uses user's selected model for embeddings
- Falls back to local embedding models if available
- Caches embeddings (reduce API calls)
- Batching for efficiency

---

### 5. **MemoryRetrieval.ts** (~300 lines)

```typescript
class MemoryRetrieval {
  // High-level search interface
  async searchRelevantContext(
    task: Task,
    options?: SearchOptions
  ): Promise<RelevantContext>
  
  // Specific retrievers
  async findSimilarTasks(task: Task): Promise<HistoricalTask[]>
  async getModuleContext(files: string[]): Promise<ModuleSummary[]>
  async findRelatedDecisions(topic: string): Promise<DesignDecision[]>
  
  // Relevance scoring
  private scoreRelevance(result: SearchResult, task: Task): number
}
```

**Features:**
- Unified search interface
- Multi-source retrieval (short-term + long-term)
- Relevance scoring and ranking
- Context assembly for agent consumption

---

### 6. **MemoryManager.ts** (~350 lines)

```typescript
class MemoryManager {
  private shortTerm: ShortTermMemory
  private longTerm: LongTermMemory
  private retrieval: MemoryRetrieval
  
  // Main interface for agents
  async augmentTaskContext(task: Task): Promise<EnhancedTask>
  async recordTaskCompletion(task: Task, result: TaskResult): Promise<void>
  
  // Lifecycle
  async initialize(): Promise<void>
  async cleanup(): Promise<void>
  
  // Stats
  getMemoryStats(): MemoryStats
}
```

**Main orchestrator** for the memory system.

---

## 📊 Data Models

### Message Types

```typescript
interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  metadata?: Record<string, any>
}

interface CompressedHistory {
  summary: string
  messageCount: number
  timeRange: [number, number]
  keyPoints: string[]
}
```

### Memory Types

```typescript
interface ModuleSummary {
  filePath: string
  summary: string
  exports: string[]
  dependencies: string[]
  lastUpdated: number
  embedding?: number[]
}

interface DesignDecision {
  id: string
  title: string
  description: string
  rationale: string
  alternatives: string[]
  timestamp: number
  relatedFiles: string[]
  tags: string[]
  embedding?: number[]
}

interface HistoricalFix {
  taskId: string
  description: string
  errorType: string
  solution: string
  filesChanged: string[]
  successRate: number
  timestamp: number
  embedding?: number[]
}
```

---

## 🔗 Integration Points

### With Phase 1 (Repo Intelligence)

```typescript
// MemoryManager uses SemanticRepoIndex for file analysis
const repoIndex = await SemanticRepoIndex.getInstance()
const symbols = await repoIndex.getSymbols(filePath)

// Store summary in long-term memory
await longTermMemory.storeModuleSummary(filePath, {
  summary: symbols.summary,
  exports: symbols.exports,
  // ...
})
```

### With Phase 2 (Multi-Agent Pipeline)

```typescript
// PlannerAgent
class PlannerAgent {
  async execute(task: Task, context: ExecutionContext) {
    // Augment context with memory
    const enhancedTask = await memoryManager.augmentTaskContext(task)
    
    // Historical context now available
    const similarTasks = enhancedTask.memory.similarTasks
    const decisions = enhancedTask.memory.decisions
    
    // Generate better plan with memory
    const plan = await this.generatePlan(enhancedTask)
    return plan
  }
}

// ExecutorAgent
class ExecutorAgent {
  async execute(task: Task, context: ExecutionContext) {
    // Recall similar fixes
    const pastFixes = await memoryManager.findSimilarFixes(task)
    
    // Use past solutions as reference
    const code = await this.generateCode(task, pastFixes)
    return code
  }
}
```

### With Phase 3 (Execution Feedback)

```typescript
// After successful execution, store in memory
const result = await feedbackLoop.executeWithFeedback(...)

if (result.success) {
  await memoryManager.recordTaskCompletion(task, result)
  // Now future tasks can learn from this success!
}
```

---

## 🎯 Implementation Priorities

### Phase 4.1: Core Memory Infrastructure (Must Have)
1. ✅ `ChromaDBWrapper.ts` - Vector storage foundation
2. ✅ `EmbeddingGenerator.ts` - Embedding pipeline
3. ✅ `ShortTermMemory.ts` - Conversation tracking
4. ✅ `LongTermMemory.ts` - Persistent knowledge

**Estimated:** ~800 lines

### Phase 4.2: Retrieval & Integration (High Priority)
5. ✅ `MemoryRetrieval.ts` - Search interface
6. ✅ `MemoryManager.ts` - Main orchestrator
7. ✅ Agent integration updates

**Estimated:** ~500 lines

### Phase 4.3: Advanced Features (Medium Priority)
8. ✅ Automatic summarization
9. ✅ Memory pruning/cleanup
10. ✅ Analytics & insights

**Estimated:** ~300 lines

---

## 📦 Dependencies

```json
{
  "dependencies": {
    "chromadb": "^1.8.1",  // Browser-compatible JS client
    "idb": "^8.0.0"         // IndexedDB wrapper (if needed)
  }
}
```

**Note:** ChromaDB JS client includes IndexedDB persistence built-in!

---

## 🔒 Privacy & Storage Considerations

### Browser Storage Limits
- **IndexedDB:** ~50MB - 1GB+ (depending on browser)
- **ChromaDB collections:** Stored in IndexedDB
- **Automatic pruning:** Keep most relevant data

### Data Privacy
- ✅ All data stays in user's browser
- ✅ No external services (except user's LLM API)
- ✅ User controls retention policies
- ✅ Clear data option in settings

---

## 📊 Success Metrics

### Phase 4 Goals

| Metric | Target |
|--------|--------|
| **Context Retrieval Speed** | <100ms for memory lookup |
| **Embedding Cache Hit Rate** | >80% (reduce API calls) |
| **Memory-Augmented Tasks** | 100% of agent executions |
| **Historical Fix Reuse** | >40% similar tasks benefit |
| **Storage Efficiency** | <100MB for typical project |

---

## 🚀 Next Steps

1. **Install ChromaDB:** `pnpm add chromadb`
2. **Create core components:** Start with ChromaDBWrapper
3. **Build memory managers:** Short-term + Long-term
4. **Integrate with agents:** Update Phase 2 agents
5. **Test & validate:** Memory retrieval accuracy
6. **Document usage:** Update integration guides

---

## 🎓 Expected Impact

### Before Phase 4
```typescript
// Agent has no memory of past work
PlannerAgent.execute(task)
  → Generates plan from scratch
  → May repeat past mistakes
  → No architectural knowledge
```

### After Phase 4
```typescript
// Agent learns from history
PlannerAgent.execute(task)
  → Retrieves similar past tasks
  → Recalls design decisions
  → References module summaries
  → Generates informed plan
  → 🚀 Better results, faster!
```

---

**Analysis Complete. Ready to implement Phase 4! 🚀**

**Estimated Total:**
- Code: ~1,600 lines
- Time: 4-6 hours
- Complexity: Medium-High (ChromaDB + LLM integration)

**Let's build persistent intelligence! 🧠**
