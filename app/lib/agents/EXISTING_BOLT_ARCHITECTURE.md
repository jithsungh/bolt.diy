# Existing bolt.diy Architecture Analysis

**Date:** 2025-01-27  
**Purpose:** Map existing bolt.diy functionality to identify what we've duplicated vs. what's missing

---

## 🔑 CRITICAL DISCOVERY

**Phases 1-4 were built WITHOUT examining existing bolt.diy infrastructure!**

This document maps what already exists so we can properly integrate instead of replace.

---

## 📁 Existing Infrastructure Overview

### 1. **Runtime Execution System** (`/app/lib/runtime/`)

#### **`ActionRunner`** (`action-runner.ts`)
- **What it does:** Executes actions from LLM responses (file operations, shell commands)
- **Key features:**
  - WebContainer integration for sandboxed execution
  - Action queue with status tracking (`pending`, `running`, `complete`, `aborted`, `failed`)
  - Shell command execution with error handling
  - File modification tracking
  - Alert system for action feedback
  
```typescript
export class ActionRunner {
  #webcontainer: Promise<WebContainer>;
  actions: MapStore<Record<string, ActionState>>;
  
  addAction(data: ActionCallbackData)
  updateAction(actionId: string, update: ActionStateUpdate)
  runAction(data: ActionCallbackData, isStreaming: boolean)
}
```

**🚨 OVERLAP:** Our `ExecutorAgent` (Phase 1) duplicates this!

#### **`StreamingMessageParser`** (`message-parser.ts`)
- **What it does:** Parses LLM streaming responses, extracts `<boltArtifact>` and `<boltAction>` tags
- **Key features:**
  - Incremental parsing of streaming text
  - Artifact detection and extraction
  - Action callback system
  - Markdown syntax cleaning

**🚨 OVERLAP:** Our message parsing in Phase 1-2 duplicates this!

---

### 2. **LLM Provider System** (`/app/lib/modules/llm/`)

#### **`LLMManager`** (`manager.ts`)
- **What it does:** Central registry for all LLM providers (OpenAI, Anthropic, Google, etc.)
- **Key features:**
  - Dynamic provider registration from `providers/` directory
  - Model list aggregation (static + dynamic models)
  - API key management
  - Provider settings (enable/disable, base URLs)

```typescript
export class LLMManager {
  registerProvider(provider: BaseProvider)
  getProvider(name: string): BaseProvider | undefined
  getAllProviders(): BaseProvider[]
  getModelList(): ModelInfo[]
  updateModelList(options: {...}): Promise<ModelInfo[]>
}
```

**✅ EXISTING:** 25+ LLM providers already integrated!
- OpenAI, Anthropic, Google, Cohere, Mistral, Groq, DeepSeek, etc.
- All use `BaseProvider` interface with consistent API

#### **`streamText()`** (`.server/llm/stream-text.ts`)
- **What it does:** Main function for LLM streaming with context optimization
- **Key features:**
  - Message preprocessing and sanitization
  - System prompt injection
  - File context inclusion
  - Token limit management per provider
  - Chat mode switching (`discuss` vs `build`)
  - Design scheme support

**🚨 CRITICAL:** This is how bolt.diy talks to LLMs!

---

### 3. **State Management** (`/app/lib/stores/`)

#### **Nanostores Architecture**
Bolt.diy uses **nanostores** (atomic state management) with 20+ stores:

```typescript
// Core stores:
workbench.ts     // Files, editor, previews, terminals, artifacts
chat.ts          // Chat state (started, aborted, showChat)
editor.ts        // Current document, selection, scroll position
files.ts         // File tree, file operations
terminal.ts      // Terminal instances and output
settings.ts      // User preferences, API keys, provider settings
streaming.ts     // LLM streaming state
```

#### **`WorkbenchStore`** (`stores/workbench.ts`)
- **What it does:** Central orchestrator for the entire coding workspace
- **Key features:**
  - Artifact management (multiple concurrent tasks)
  - File operations (save, reset, download as zip)
  - Preview management
  - Terminal management
  - GitHub/GitLab integration
  - Action execution queueing

```typescript
export class WorkbenchStore {
  artifacts: MapStore<Record<string, ArtifactState>>;
  files: MapStore<FileMap>;
  currentDocument: ReadableAtom<EditorDocument>;
  
  addArtifact(data: ArtifactCallbackData)
  runAction(data: ActionCallbackData)
  downloadZip()
  pushToGitHub(repoName: string, ...)
}
```

**🚨 MASSIVE OVERLAP:** This already orchestrates tasks! Our `AgentOrchestrator` may be redundant!

---

### 4. **Persistence Layer** (`/app/lib/persistence/`)

#### **`db.ts`** - IndexedDB Management
- **What it does:** Core database operations for chat history
- **Database:** `boltHistory` (version 3)
- **Object stores:** 
  - `chats` — Full chat conversations with messages
  - `urlId` index for URL-based lookup

```typescript
export async function openDatabase(): Promise<IDBDatabase>
export async function setMessages(...)
export async function getMessages(...)
export async function deleteById(...)
```

#### **`chats.ts`** - Chat Data Management
```typescript
export interface Chat {
  id: string;
  description?: string;
  messages: Message[];  // ai SDK Message type
  timestamp: string;
  urlId?: string;
  metadata?: IChatMetadata;
}

export async function getAllChats(db: IDBDatabase): Promise<Chat[]>
export async function getChatById(db: IDBDatabase, id: string)
export async function saveChat(db: IDBDatabase, chat: Chat)
```

**✅ GOOD NEWS:** Our Phase 4 memory system uses DIFFERENT IndexedDB namespaces (`bolt_memory_*`), so no conflicts!

---

### 5. **What bolt.diy DOESN'T Have** ❌

#### Missing Components (Our Phases Add Value Here!)

1. **Semantic Code Analysis**
   - No AST parsing
   - No semantic repo indexing
   - No cross-file dependency tracking
   - ✅ **Phase 1 adds:** `ASTParser`, `SemanticRepoIndex`

2. **Vector Embeddings & Semantic Search**
   - No vector database
   - No embedding generation
   - No similarity search
   - ✅ **Phase 4 adds:** ChromaDB, embedding cache, semantic retrieval

3. **Long-Term Knowledge Storage**
   - Chats are stored, but not analyzed
   - No module summaries
   - No design decision tracking
   - No historical fix database
   - ✅ **Phase 4 adds:** `LongTermMemory` with categorized knowledge

4. **Multi-Agent Architecture**
   - Single LLM call per response
   - No planner/executor/reviewer split
   - No iterative refinement loop
   - ✅ **Phase 1-2 adds:** Specialized agents, feedback loops

5. **Task Planning & Decomposition**
   - User provides full instructions
   - No automatic task breakdown
   - No dependency analysis
   - ✅ **Phase 1 adds:** `PlannerAgent` with task decomposition

6. **Safety Guardrails**
   - Action execution is all-or-nothing
   - No step budgets
   - No rollback on failure
   - ✅ **Phase 3 adds:** `RollbackManager`, resource limits

7. **Evaluation & Learning**
   - No success metrics
   - No failure categorization
   - No automated testing of outputs
   - ✅ **Phase 6 planned:** Evaluation system

---

## 🔗 Integration Strategy

### ✅ **Keep & Extend**
These existing systems should be **wrapped, not replaced**:

1. **`ActionRunner`** — Use for all action execution
   - Our `ExecutorAgent` should CALL `ActionRunner.runAction()`
   - Don't duplicate action queue logic

2. **`LLMManager`** — Use for all LLM calls
   - Our agents should use `LLMManager.getProvider()`
   - Don't create separate LLM client code

3. **`WorkbenchStore`** — Use for state management
   - Our `AgentOrchestrator` should interact via stores
   - Don't duplicate artifact/file management

4. **`StreamingMessageParser`** — Use for response parsing
   - Our agents should use existing callbacks
   - Don't create new parsing logic

5. **Persistence (`chats.ts`)** — Use for conversation storage
   - Our memory system AUGMENTS (doesn't replace) chat history
   - Use `Chat.metadata` to store memory references

### ✨ **Add New Capabilities**
These Phase 1-4 components fill gaps:

1. **Phase 1: Semantic Analysis** (NEW)
   - `ASTParser` — Parse code structure
   - `SemanticRepoIndex` — Build cross-file understanding
   - `ContextBuilder` — Smart context selection

2. **Phase 1: Multi-Agent System** (NEW)
   - `PlannerAgent` — Task decomposition
   - `ExecutorAgent` — Wraps `ActionRunner` with planning
   - `ReviewerAgent` — Validates outputs

3. **Phase 2: Task Queue** (NEW)
   - Priority-based execution
   - Dependency tracking
   - Replaces simple action queue

4. **Phase 3: Safety** (NEW)
   - `RollbackManager` — Undo failed changes
   - `ResourceLimiter` — Prevent runaway execution

5. **Phase 4: Memory & Learning** (NEW)
   - `MemoryManager` — Semantic search across past work
   - `LongTermMemory` — Knowledge accumulation
   - `EmbeddingGenerator` — Wraps `LLMManager` for embeddings

### 🔌 **Integration Points**

#### Example: Agent-Enhanced Action Execution

**Before (Current bolt.diy):**
```typescript
// User message → LLM → Parse actions → Execute
streamText(messages) 
  → StreamingMessageParser 
  → onActionOpen(data)
  → ActionRunner.runAction(data)
```

**After (With Phases 1-4):**
```typescript
// User message → Planner → Semantic context → LLM → Execute with safety
AgentOrchestrator.handleMessage(message)
  → PlannerAgent.plan(message)  // NEW: Task decomposition
  → ContextBuilder.build(task)  // NEW: Semantic context
  → LLMManager.streamText()     // EXISTING
  → StreamingMessageParser      // EXISTING
  → ExecutorAgent.execute()     // NEW: Wraps ActionRunner
  → ActionRunner.runAction()    // EXISTING
  → ReviewerAgent.review()      // NEW: Validation
  → MemoryManager.record()      // NEW: Learning
```

---

## 🎯 Next Steps

### 1. **Refactor `ExecutorAgent`** (Phase 1)
```typescript
// Current (WRONG):
class ExecutorAgent extends BaseAgent {
  async execute(task: Task) {
    // Custom execution logic ❌
  }
}

// Fixed (RIGHT):
class ExecutorAgent extends BaseAgent {
  constructor(
    private actionRunner: ActionRunner,  // Inject existing!
    private workbench: WorkbenchStore
  ) {}
  
  async execute(task: Task) {
    const actions = this.parseActions(task);
    
    // Use existing action runner!
    for (const action of actions) {
      await this.actionRunner.runAction(action, false);
    }
  }
}
```

### 2. **Connect `AgentOrchestrator` to `WorkbenchStore`**
```typescript
class AgentOrchestrator {
  constructor(
    private workbench: WorkbenchStore,  // NEW
    config: OrchestratorConfig
  ) {
    // Reuse existing infrastructure!
    this.planner = new PlannerAgent(workbench.files.get());
    this.executor = new ExecutorAgent(
      workbench.artifacts.get()[0].runner,  // Use existing ActionRunner!
      workbench
    );
  }
}
```

### 3. **Wire `MemoryManager` to `LLMManager`**
```typescript
// In EmbeddingGenerator.ts (Phase 4 TODO):
async generateLLMEmbedding(text: string): Promise<number[]> {
  const provider = LLMManager.getInstance().getProvider(this.modelProvider);  // Use existing!
  
  if (!provider || !provider.getEmbeddings) {
    throw new Error(`Provider ${this.modelProvider} doesn't support embeddings`);
  }
  
  return provider.getEmbeddings(text);  // Use existing API!
}
```

### 4. **Update System Prompts** (`common/prompts/`)
Add memory context to existing prompt system:
```typescript
// In prompts.ts:
export function getSystemPrompt(files?: FileMap, memory?: MemoryContext) {
  let prompt = baseSystemPrompt;
  
  if (files) {
    prompt += createFilesContext(files);  // EXISTING
  }
  
  if (memory) {
    prompt += createMemoryContext(memory);  // NEW
  }
  
  return prompt;
}
```

---

## 📊 Architecture Comparison

### Current bolt.diy (Simplified)
```
User Input
  ↓
LLM (streamText)
  ↓
Message Parser (extract <boltAction>)
  ↓
ActionRunner (execute in WebContainer)
  ↓
WorkbenchStore (update UI)
```

### With Phases 1-4 Integrated
```
User Input
  ↓
PlannerAgent (decompose task)
  ↓
ContextBuilder (semantic analysis)  ← SemanticRepoIndex, ASTParser
  ↓
MemoryRetrieval (augment context)   ← Phase 4 NEW
  ↓
LLM (existing streamText)
  ↓
Message Parser (existing)
  ↓
ExecutorAgent (wraps ActionRunner)  ← Adds planning
  ↓
ActionRunner (existing)
  ↓
ReviewerAgent (validate output)     ← NEW
  ↓
MemoryManager (learn from result)   ← Phase 4 NEW
  ↓
WorkbenchStore (existing)
```

---

## ⚠️ Risk Assessment

### High Risk (Must Fix)
1. ❌ `ExecutorAgent` duplicates `ActionRunner` — **Must refactor to wrap it**
2. ❌ `AgentOrchestrator` bypasses `WorkbenchStore` — **Must integrate**
3. ❌ Custom LLM calls in agents — **Must use `LLMManager`**

### Medium Risk (Should Fix)
4. ⚠️ `TaskQueue` might conflict with `ActionRunner.actions` — **Evaluate if needed**
5. ⚠️ `SkillsManager` not connected to existing actions — **Wire up or remove**

### Low Risk (Nice to Have)
6. ✅ `MemoryManager` uses separate IndexedDB namespace — **No conflicts**
7. ✅ `SemanticRepoIndex` adds new capability — **No conflicts**
8. ✅ `ReviewerAgent` adds validation layer — **No conflicts**

---

## 🏗️ Recommended Refactor Plan

### Phase A: Connect to Existing Infrastructure (1-2 days)
1. Inject `ActionRunner` into `ExecutorAgent`
2. Inject `LLMManager` into all agents
3. Connect `AgentOrchestrator` to `WorkbenchStore`
4. Update `EmbeddingGenerator` to use `LLMManager`

### Phase B: Remove Duplications (1 day)
1. Remove custom action execution in `ExecutorAgent`
2. Remove custom LLM client code
3. Evaluate if `TaskQueue` is still needed

### Phase C: Integration Testing (1 day)
1. Test memory-augmented workflow end-to-end
2. Verify no regressions in existing bolt.diy features
3. Validate IndexedDB persistence

### Phase D: Documentation & Deployment (0.5 days)
1. Update architecture docs
2. Create migration guide for existing users
3. Add feature flags for gradual rollout

---

## 📚 Key Files to Study

### Must Understand (Core Integration Points)
1. `/app/lib/runtime/action-runner.ts` — Action execution
2. `/app/lib/modules/llm/manager.ts` — LLM provider system
3. `/app/lib/stores/workbench.ts` — State orchestration
4. `/app/lib/.server/llm/stream-text.ts` — LLM streaming
5. `/app/lib/runtime/message-parser.ts` — Response parsing

### Nice to Understand (Extended Features)
6. `/app/lib/persistence/chats.ts` — Chat storage
7. `/app/lib/common/prompts/prompts.ts` — System prompts
8. `/app/lib/stores/files.ts` — File operations
9. `/app/lib/webcontainer/index.ts` — Sandboxed execution

---

**Conclusion:** Phases 1-4 add valuable capabilities, but must integrate with (not replace) existing bolt.diy infrastructure. Priority: Refactor `ExecutorAgent` and `AgentOrchestrator` to use `ActionRunner`, `LLMManager`, and `WorkbenchStore`.
