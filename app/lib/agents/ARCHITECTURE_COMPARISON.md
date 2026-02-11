# Phase 1-4 vs Existing bolt.diy: Feature Comparison

**Purpose:** Visual map showing overlap, gaps, and integration opportunities

---

## 🗺️ Feature Matrix

| Feature | Existing bolt.diy | Phase 1-4 | Integration Strategy |
|---------|------------------|-----------|---------------------|
| **Action Execution** | ✅ `ActionRunner` (full) | ❌ `ExecutorAgent` (duplicate) | ✅ **Wrap** - Make ExecutorAgent use ActionRunner |
| **LLM Provider Management** | ✅ `LLMManager` (25+ providers) | ❌ Custom LLM calls | ✅ **Reuse** - Use LLMManager everywhere |
| **State Management** | ✅ `WorkbenchStore` + 20 stores | ❌ Custom state maps | ✅ **Integrate** - Use nanostores |
| **Message Parsing** | ✅ `StreamingMessageParser` | ❌ Custom parsing | ✅ **Reuse** - Use existing parser |
| **Chat Persistence** | ✅ IndexedDB (`boltHistory`) | ⚠️ Separate namespace | ✅ **Coexist** - Different namespaces |
| **Task Planning** | ❌ None | ✅ `PlannerAgent` | ✨ **Add** - New capability |
| **Semantic Analysis** | ❌ None | ✅ `ASTParser`, `SemanticRepoIndex` | ✨ **Add** - New capability |
| **Vector Search** | ❌ None | ✅ `ChromaDBWrapper`, embeddings | ✨ **Add** - New capability |
| **Long-Term Memory** | ❌ None | ✅ `LongTermMemory` | ✨ **Add** - New capability |
| **Multi-Agent System** | ❌ Single LLM call | ✅ Planner/Executor/Reviewer | ✨ **Add** - New capability |
| **Rollback/Safety** | ❌ None | ✅ `RollbackManager`, limits | ✨ **Add** - New capability |
| **Code Review** | ❌ None | ✅ `ReviewerAgent` | ✨ **Add** - New capability |

**Legend:**
- ✅ Fully implemented
- ⚠️ Partial/different implementation
- ❌ Missing
- ✨ New capability to add

---

## 📊 Component Mapping

### **Execution Layer**

```
┌─────────────────────────────────────────────────────────────┐
│                     EXECUTION LAYER                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  EXISTING bolt.diy:                                          │
│  ┌──────────────┐                                           │
│  │ ActionRunner │ ← WebContainer, Shell, FileSystem         │
│  └──────────────┘                                           │
│        ↓                                                     │
│   Execute actions (file ops, shell commands)                │
│                                                              │
│  Phase 1-4 (WRONG):                                          │
│  ┌───────────────┐                                          │
│  │ ExecutorAgent │ ← Custom execution logic ❌               │
│  └───────────────┘                                          │
│                                                              │
│  INTEGRATED (RIGHT):                                         │
│  ┌───────────────┐    wraps    ┌──────────────┐            │
│  │ ExecutorAgent │ ──────────► │ ActionRunner │            │
│  └───────────────┘              └──────────────┘            │
│       ↑                              ↓                       │
│   Planning + validation     Actual execution                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Status:** ⚠️ Must refactor ExecutorAgent to wrap ActionRunner

---

### **LLM Layer**

```
┌─────────────────────────────────────────────────────────────┐
│                       LLM LAYER                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  EXISTING bolt.diy:                                          │
│  ┌────────────┐                                             │
│  │ LLMManager │ ← 25+ providers (OpenAI, Anthropic, etc.)   │
│  └────────────┘                                             │
│       ↓                                                      │
│  streamText() ← System prompts, context, streaming          │
│                                                              │
│  Phase 4 (WRONG):                                            │
│  ┌────────────────────┐                                     │
│  │ EmbeddingGenerator │ ← TODO: Custom LLM calls ❌          │
│  └────────────────────┘                                     │
│                                                              │
│  INTEGRATED (RIGHT):                                         │
│  ┌────────────────────┐    uses    ┌────────────┐          │
│  │ EmbeddingGenerator │ ─────────► │ LLMManager │          │
│  └────────────────────┘             └────────────┘          │
│                                          ↓                   │
│                                  provider.getEmbeddings()    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Status:** ⚠️ Must connect EmbeddingGenerator to LLMManager

---

### **State Management Layer**

```
┌─────────────────────────────────────────────────────────────┐
│                  STATE MANAGEMENT LAYER                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  EXISTING bolt.diy:                                          │
│  ┌────────────────┐                                         │
│  │ WorkbenchStore │ ← Artifacts, Files, Editor, Terminals   │
│  └────────────────┘                                         │
│         ↓                                                    │
│    Nanostores (reactive state)                              │
│                                                              │
│  Phase 1-2 (WRONG):                                          │
│  ┌────────────────────┐                                     │
│  │ AgentOrchestrator  │ ← Custom Map<string, Task> ❌        │
│  └────────────────────┘                                     │
│                                                              │
│  INTEGRATED (RIGHT):                                         │
│  ┌────────────────────┐    uses    ┌────────────────┐      │
│  │ AgentOrchestrator  │ ─────────► │ WorkbenchStore │      │
│  └────────────────────┘             └────────────────┘      │
│          ↑                               ↓                  │
│    Coordinates agents           Manages all state           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Status:** ⚠️ Must connect AgentOrchestrator to WorkbenchStore

---

### **Memory Layer** (NEW)

```
┌─────────────────────────────────────────────────────────────┐
│                      MEMORY LAYER (NEW)                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  EXISTING bolt.diy:                                          │
│  ┌──────────────┐                                           │
│  │ Chat History │ ← IndexedDB: boltHistory                  │
│  └──────────────┘                                           │
│         ↓                                                    │
│    Simple storage, no search                                │
│                                                              │
│  Phase 4 (ADDS NEW CAPABILITY):                              │
│  ┌────────────────┐                                         │
│  │ MemoryManager  │ ← ChromaDB, Embeddings, Semantic Search │
│  └────────────────┘                                         │
│         ↓                                                    │
│  ┌──────────────────┬──────────────────┐                   │
│  │ ShortTermMemory  │ LongTermMemory   │                    │
│  │ (conversations)  │ (knowledge base) │                    │
│  └──────────────────┴──────────────────┘                   │
│                                                              │
│  INTEGRATED:                                                 │
│  Chat History (existing) + Memory System (new)              │
│  ↓                        ↓                                  │
│  Stores raw messages     Stores semantic meaning            │
│  boltHistory DB          bolt_memory_* DBs                  │
│  No conflicts ✅                                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Status:** ✅ No conflicts, separate namespaces

---

### **Analysis Layer** (NEW)

```
┌─────────────────────────────────────────────────────────────┐
│                    ANALYSIS LAYER (NEW)                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  EXISTING bolt.diy:                                          │
│  ❌ No code analysis                                          │
│  ❌ No dependency tracking                                    │
│  ❌ No semantic understanding                                 │
│                                                              │
│  Phase 1 (ADDS NEW CAPABILITY):                              │
│  ┌────────────┐   ┌───────────────────┐   ┌──────────────┐ │
│  │ ASTParser  │ → │ SemanticRepoIndex │ → │ ContextBuilder│ │
│  └────────────┘   └───────────────────┘   └──────────────┘ │
│       ↓                    ↓                      ↓          │
│   Parse files      Build symbol graph      Smart context    │
│                                                              │
│  INTEGRATION:                                                │
│  Feed into existing streamText() context parameter          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Status:** ✅ New capability, no conflicts

---

## 🔄 Data Flow Comparison

### **Current bolt.diy Flow**

```
User Message
     ↓
streamText() (LLM call)
     ↓
StreamingMessageParser (extract <boltAction>)
     ↓
ActionRunner.runAction()
     ↓
WorkbenchStore.updateAction()
     ↓
UI Update
```

**Characteristics:**
- Simple, linear flow
- Single LLM call per turn
- No planning or validation
- No learning from past work

---

### **Integrated Flow (with Phases 1-4)**

```
User Message
     ↓
AgentOrchestrator.handleMessage()
     ↓
┌─────────────────────────────────────┐
│ 1. PlannerAgent                     │  ← NEW
│    - Decompose task                 │
│    - Identify subtasks              │
└─────────────────────────────────────┘
     ↓
┌─────────────────────────────────────┐
│ 2. ContextBuilder                   │  ← NEW
│    - Semantic analysis (ASTParser)  │
│    - Find relevant files            │
│    - Build dependency graph         │
└─────────────────────────────────────┘
     ↓
┌─────────────────────────────────────┐
│ 3. MemoryRetrieval                  │  ← NEW
│    - Search past work               │
│    - Find similar patterns          │
│    - Augment context                │
└─────────────────────────────────────┘
     ↓
streamText() (EXISTING)
  ↑ Enhanced with memory context
     ↓
StreamingMessageParser (EXISTING)
     ↓
┌─────────────────────────────────────┐
│ 4. ExecutorAgent                    │  ← WRAPS EXISTING
│    → ActionRunner.runAction()       │
└─────────────────────────────────────┘
     ↓
┌─────────────────────────────────────┐
│ 5. ReviewerAgent                    │  ← NEW
│    - Validate output                │
│    - Check for errors               │
│    - Suggest improvements           │
└─────────────────────────────────────┘
     ↓
┌─────────────────────────────────────┐
│ 6. MemoryManager.recordTaskResult() │  ← NEW
│    - Store successful patterns      │
│    - Learn from failures            │
└─────────────────────────────────────┘
     ↓
WorkbenchStore.updateAction() (EXISTING)
     ↓
UI Update (EXISTING)
```

**Characteristics:**
- Multi-stage pipeline
- Planning before execution
- Memory-augmented context
- Validation after execution
- Continuous learning

---

## 🎯 Integration Principles

### ✅ DO: Extend Existing Systems

```typescript
// GOOD: Wrap existing functionality
class ExecutorAgent {
  constructor(private actionRunner: ActionRunner) {}
  
  async execute(task: Task) {
    // Add planning layer
    const plan = this.createPlan(task);
    
    // Use existing execution
    return this.actionRunner.runAction(plan);
  }
}
```

### ❌ DON'T: Replace Existing Systems

```typescript
// BAD: Duplicate existing functionality
class ExecutorAgent {
  async execute(task: Task) {
    // Custom execution logic ❌
    await this.customFileOperation(task.files);
    await this.customShellCommand(task.command);
  }
}
```

---

### ✅ DO: Use Dependency Injection

```typescript
// GOOD: Inject existing stores
class AgentOrchestrator {
  constructor(
    private workbench: WorkbenchStore,
    private llmManager: LLMManager
  ) {}
}
```

### ❌ DON'T: Create Parallel State

```typescript
// BAD: Create separate state management ❌
class AgentOrchestrator {
  private tasks = new Map<string, Task>();
  private files = new Map<string, File>();
}
```

---

## 📦 Package Dependency Map

### Existing Dependencies (Keep)
```json
{
  "@webcontainer/api": "^1.1.6",
  "nanostores": "^0.9.5",
  "ai": "^3.0.0",
  "remix": "^2.0.0",
  // ... 50+ more
}
```

### New Dependencies (Phase 4 Adds)
```json
{
  "chromadb": "^1.8.1",  // ⚠️ Not yet installed!
  "@types/node": "^20.0.0"  // ✅ Already added
}
```

---

## 🚦 Risk Assessment by Component

| Component | Risk Level | Reason | Mitigation |
|-----------|-----------|--------|------------|
| `ExecutorAgent` | 🔴 HIGH | Duplicates ActionRunner | Refactor to wrap |
| `AgentOrchestrator` | 🔴 HIGH | Bypasses WorkbenchStore | Inject store |
| `EmbeddingGenerator` | 🟡 MEDIUM | TODO not implemented | Wire to LLMManager |
| `ShortTermMemory` | 🟡 MEDIUM | TODO not implemented | Wire to LLMManager |
| `MemoryManager` | 🟢 LOW | Separate namespace | No changes needed |
| `PlannerAgent` | 🟢 LOW | New capability | No conflicts |
| `ReviewerAgent` | 🟢 LOW | New capability | No conflicts |
| `SemanticRepoIndex` | 🟢 LOW | New capability | No conflicts |

---

## 🎉 Success Criteria

### Technical Success
- [ ] No duplicate execution paths
- [ ] All state flows through nanostores
- [ ] All LLM calls use LLMManager
- [ ] Zero TypeScript errors
- [ ] All integration tests pass

### User Experience Success
- [ ] Faster task completion
- [ ] Fewer errors
- [ ] Better code quality
- [ ] Transparent operation (no confusion)
- [ ] Opt-in (no forced changes)

### Code Quality Success
- [ ] No circular dependencies
- [ ] Clear separation of concerns
- [ ] Consistent error handling
- [ ] Comprehensive logging
- [ ] Well-documented APIs

---

## 📚 Related Documents

1. **`EXISTING_BOLT_ARCHITECTURE.md`** — Detailed analysis of existing systems
2. **`INTEGRATION_ROADMAP.md`** — Step-by-step integration plan
3. **`PHASE4_COMPLETION_REPORT.md`** — Phase 4 implementation details
4. **`plan.md`** — Original master plan

---

## 🔧 Quick Reference: Files to Modify

### High Priority (MUST FIX)
1. `/app/lib/agents/ExecutorAgent.ts` — Wrap ActionRunner
2. `/app/lib/agents/AgentOrchestrator.ts` — Inject WorkbenchStore
3. `/app/lib/memory/EmbeddingGenerator.ts` — Wire LLMManager
4. `/app/lib/memory/ShortTermMemory.ts` — Wire LLMManager

### Medium Priority (SHOULD FIX)
5. `/app/lib/.server/llm/stream-text.ts` — Add memory context
6. `/app/lib/runtime/action-runner.ts` — Add memory recording
7. `/app/lib/common/prompts/prompts.ts` — Support memory context

### Low Priority (NICE TO HAVE)
8. `/app/components/workbench/Workbench.tsx` — Add memory stats UI
9. `/app/routes/api.memory.search.ts` — Add search endpoint
10. `/README.md` — Document new features

---

**Conclusion:** Phases 1-4 provide significant value but must be properly integrated with existing bolt.diy infrastructure. The integration is straightforward: wrap don't replace, inject don't duplicate, extend don't rebuild.
