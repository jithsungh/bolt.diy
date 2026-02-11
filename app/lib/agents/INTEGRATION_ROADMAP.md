# Phase 1-4 Integration Roadmap

**Date:** 2025-01-27  
**Goal:** Properly integrate Phases 1-4 with existing bolt.diy infrastructure

---

## 🎯 Executive Summary

**Problem:** Phases 1-4 were built in isolation without examining existing bolt.diy code.  
**Solution:** Refactor to **extend** existing systems rather than replace them.  
**Timeline:** 3-4 days of focused integration work.

---

## 📋 Integration Checklist

### ✅ Phase 0: Analysis (COMPLETE)
- [x] Map existing bolt.diy architecture
- [x] Identify overlaps and conflicts
- [x] Document integration points
- [x] Create this roadmap

### 🔄 Phase A: Critical Infrastructure Connections (HIGH PRIORITY)

#### A1: Connect `ExecutorAgent` to `ActionRunner` ⚠️ CRITICAL
**Problem:** `ExecutorAgent` duplicates action execution logic  
**Solution:** Make it a wrapper around `ActionRunner`

**Files to modify:**
- `/app/lib/agents/ExecutorAgent.ts`

**Changes:**
```typescript
// BEFORE (Wrong):
class ExecutorAgent {
  async execute(task: Task) {
    // Custom execution logic ❌
  }
}

// AFTER (Right):
class ExecutorAgent {
  constructor(
    private actionRunner: ActionRunner,  // Inject!
    private messageParser: StreamingMessageParser
  ) {}
  
  async execute(task: Task) {
    // 1. Convert task to actions using existing parser
    const actions = this.taskToActions(task);
    
    // 2. Use existing ActionRunner!
    for (const action of actions) {
      const data: ActionCallbackData = {
        artifactId: task.artifactId,
        messageId: task.id,
        actionId: action.id,
        action: action
      };
      
      await this.actionRunner.runAction(data, false);
    }
    
    // 3. Wait for completion
    return this.actionRunner.actions.get()[action.id];
  }
}
```

**Validation:**
```bash
# Test that actions execute through existing system
pnpm test -- ExecutorAgent.spec.ts
```

---

#### A2: Connect `AgentOrchestrator` to `WorkbenchStore` ⚠️ CRITICAL
**Problem:** `AgentOrchestrator` bypasses state management  
**Solution:** Integrate with `WorkbenchStore` for all state updates

**Files to modify:**
- `/app/lib/agents/AgentOrchestrator.ts`

**Changes:**
```typescript
// BEFORE (Wrong):
class AgentOrchestrator {
  private tasks: Map<string, Task> = new Map();  // ❌ Custom state
}

// AFTER (Right):
class AgentOrchestrator {
  constructor(
    private workbench: WorkbenchStore,  // Inject!
    config: OrchestratorConfig
  ) {
    // Use existing stores!
    this.executor = new ExecutorAgent(
      this.getCurrentActionRunner(),  // From workbench
      new StreamingMessageParser()
    );
  }
  
  private getCurrentActionRunner(): ActionRunner {
    const artifacts = this.workbench.artifacts.get();
    const currentArtifact = Object.values(artifacts)[0];
    return currentArtifact.runner;
  }
  
  async handleMessage(message: string) {
    // 1. Create artifact via workbench
    this.workbench.addArtifact({
      messageId: generateId(),
      title: this.extractTitle(message),
      // ...
    });
    
    // 2. Execute via agents
    const result = await this.executor.execute(task);
    
    // 3. Update state via workbench
    this.workbench.updateAction(actionId, { status: 'complete' });
  }
}
```

**Validation:**
```bash
# Test that state updates flow through WorkbenchStore
# Check that UI reacts to agent operations
```

---

#### A3: Connect `EmbeddingGenerator` to `LLMManager` ⚠️ CRITICAL
**Problem:** Phase 4 has TODO for LLM embedding generation  
**Solution:** Use existing `LLMManager` infrastructure

**Files to modify:**
- `/app/lib/memory/EmbeddingGenerator.ts`

**Changes:**
```typescript
// BEFORE (Wrong - TODO):
private async generateLLMEmbedding(text: string): Promise<number[]> {
  // TODO: Implement LLM API call for embeddings
  throw new Error('Not implemented');
}

// AFTER (Right):
import { LLMManager } from '~/lib/modules/llm/manager';

private async generateLLMEmbedding(text: string): Promise<number[]> {
  const manager = LLMManager.getInstance();
  const provider = manager.getProvider(this.modelProvider);
  
  if (!provider) {
    throw new Error(`Provider ${this.modelProvider} not found`);
  }
  
  // Check if provider supports embeddings
  if (!provider.getEmbeddings) {
    throw new Error(`Provider ${this.modelProvider} doesn't support embeddings`);
  }
  
  // Use existing provider API
  return await provider.getEmbeddings(text, {
    model: this.modelName,
    apiKey: this.getApiKey()
  });
}

private getApiKey(): string {
  // Get from existing settings store
  const settings = import('~/lib/stores/settings');
  return settings.apiKeys.get()[this.modelProvider];
}
```

**Validation:**
```bash
# Test embedding generation with real LLM provider
pnpm test -- EmbeddingGenerator.spec.ts
```

---

#### A4: Connect `ShortTermMemory` to `LLMManager` (Summary Generation)
**Problem:** Second TODO for LLM summary generation  
**Solution:** Use `LLMManager` for summarization

**Files to modify:**
- `/app/lib/memory/ShortTermMemory.ts`

**Changes:**
```typescript
// BEFORE (Wrong - TODO):
private async generateSummary(messages: ChatMessage[]): Promise<string> {
  // TODO: Implement LLM API call for summarization
  return '';
}

// AFTER (Right):
import { LLMManager } from '~/lib/modules/llm/manager';
import { streamText } from '~/lib/.server/llm/stream-text';

private async generateSummary(messages: ChatMessage[]): Promise<string> {
  const prompt = `Summarize the following conversation in 2-3 sentences:\n\n${
    messages.map(m => `${m.role}: ${m.content}`).join('\n')
  }`;
  
  // Use existing streamText infrastructure
  const stream = await streamText({
    messages: [
      { role: 'system', content: 'You are a helpful assistant that summarizes conversations.' },
      { role: 'user', content: prompt }
    ],
    apiKeys: this.getApiKeys(),
    providerSettings: this.getProviderSettings()
  });
  
  let summary = '';
  for await (const chunk of stream.textStream) {
    summary += chunk;
  }
  
  return summary;
}
```

**Validation:**
```bash
# Test summary generation
pnpm test -- ShortTermMemory.spec.ts
```

---

### 🔌 Phase B: Add Memory Hooks to Existing Flow (MEDIUM PRIORITY)

#### B1: Augment `streamText()` with Memory Context
**Goal:** Inject memory-retrieved context into LLM prompts

**Files to modify:**
- `/app/lib/.server/llm/stream-text.ts`
- `/app/lib/common/prompts/prompts.ts`

**Changes:**
```typescript
// In stream-text.ts:
export async function streamText(props: {
  messages: Message[];
  // ... existing params
  memoryManager?: MemoryManager;  // NEW
}) {
  const { memoryManager, ... } = props;
  
  // Augment context with memory if available
  if (memoryManager) {
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    if (lastUserMessage) {
      const memoryContext = await memoryManager.augmentTaskContext({
        description: lastUserMessage.content,
        // ...
      });
      
      // Inject memory into system prompt
      processedMessages[0].content = getSystemPrompt(
        files,
        memoryContext  // NEW
      );
    }
  }
  
  // ... rest of existing logic
}

// In prompts.ts:
export function getSystemPrompt(
  files?: FileMap,
  memoryContext?: any  // NEW
): string {
  let prompt = baseSystemPrompt;
  
  if (files) {
    prompt += createFilesContext(files);
  }
  
  if (memoryContext) {
    prompt += '\n\n<RelevantPastWork>\n';
    prompt += memoryContext.relevantModules.map(m => 
      `Module: ${m.moduleName}\n${m.summary}`
    ).join('\n\n');
    prompt += '\n</RelevantPastWork>';
  }
  
  return prompt;
}
```

**Validation:**
```bash
# Test that memory context appears in LLM prompts
# Check that relevant past work improves code quality
```

---

#### B2: Record Learning After Action Completion
**Goal:** Store successful patterns in long-term memory

**Files to modify:**
- `/app/lib/runtime/action-runner.ts`

**Changes:**
```typescript
export class ActionRunner {
  #memoryManager?: MemoryManager;  // NEW
  
  constructor(
    // ... existing params
    memoryManager?: MemoryManager  // NEW
  ) {
    this.#memoryManager = memoryManager;
  }
  
  async runAction(data: ActionCallbackData, isStreaming: boolean) {
    // ... existing execution logic
    
    try {
      // Execute action
      const result = await this.executeAction(action);
      
      // Record success in memory
      if (this.#memoryManager && result.status === 'complete') {
        await this.#memoryManager.recordTaskResult({
          description: action.content,
          // ...
        }, {
          success: true,
          output: result.output
        });
      }
      
    } catch (error) {
      // Record failure for learning
      if (this.#memoryManager) {
        await this.#memoryManager.recordTaskResult(task, {
          success: false,
          error: error.message
        });
      }
    }
  }
}
```

**Validation:**
```bash
# Test that successful actions are stored in long-term memory
# Test that failures are categorized properly
```

---

### 🎨 Phase C: UI Integration (MEDIUM PRIORITY)

#### C1: Add Memory Stats to Workbench
**Goal:** Show memory usage in UI

**Files to create:**
- `/app/components/workbench/MemoryStats.tsx`

**Files to modify:**
- `/app/components/workbench/Workbench.tsx`

**Changes:**
```tsx
// MemoryStats.tsx (NEW):
import { useEffect, useState } from 'react';
import { memoryManager } from '~/lib/memory';

export function MemoryStats() {
  const [stats, setStats] = useState<MemoryStats | null>(null);
  
  useEffect(() => {
    async function loadStats() {
      const data = await memoryManager.getStats();
      setStats(data);
    }
    loadStats();
  }, []);
  
  if (!stats) return null;
  
  return (
    <div className="memory-stats">
      <div>Conversations: {stats.conversationCount}</div>
      <div>Knowledge Entries: {stats.knowledgeEntryCount}</div>
      <div>Cache Hit Rate: {(stats.cacheHitRate * 100).toFixed(1)}%</div>
    </div>
  );
}

// In Workbench.tsx:
import { MemoryStats } from './MemoryStats';

export function Workbench() {
  return (
    <div>
      {/* Existing workbench UI */}
      <MemoryStats />  {/* NEW */}
    </div>
  );
}
```

---

#### C2: Add "Search Memory" Command
**Goal:** Let users search past work

**Files to create:**
- `/app/routes/api.memory.search.ts`

**Changes:**
```typescript
// api.memory.search.ts (NEW):
import { json } from '@remix-run/cloudflare';
import type { ActionFunctionArgs } from '@remix-run/cloudflare';
import { memoryManager } from '~/lib/memory';

export async function action({ request }: ActionFunctionArgs) {
  const { query, maxResults } = await request.json();
  
  const results = await memoryManager.search(query, maxResults);
  
  return json({ results });
}
```

---

### 🧪 Phase D: Testing & Validation (HIGH PRIORITY)

#### D1: Integration Tests
**Files to create:**
- `/app/lib/agents/__tests__/integration.spec.ts`

**Test cases:**
```typescript
describe('Agent Integration', () => {
  it('should execute actions through ActionRunner', async () => {
    const workbench = new WorkbenchStore();
    const orchestrator = new AgentOrchestrator(workbench, {
      enableMemory: true
    });
    
    const result = await orchestrator.handleMessage(
      'Create a React component'
    );
    
    // Verify action was executed via ActionRunner
    const actions = workbench.artifacts.get()[0].runner.actions.get();
    expect(Object.keys(actions).length).toBeGreaterThan(0);
  });
  
  it('should augment context with memory', async () => {
    // Test that memory retrieval works end-to-end
  });
  
  it('should learn from successful tasks', async () => {
    // Test that long-term memory stores patterns
  });
});
```

---

#### D2: Fix Pre-Existing TypeScript Errors
**Problem:** 53 TS errors blocking commits

**Priority errors to fix:**
1. `date-binning.ts` — `toSorted()` not available
2. LLM providers — Missing `Env` type
3. API routes — Type mismatches

**Commands:**
```bash
# Show all errors
pnpm run typecheck

# Fix most common issues
# 1. Add polyfill for toSorted()
# 2. Import Env type from proper location
# 3. Fix API route types
```

---

### 📦 Phase E: Dependency Installation (QUICK WIN)

#### E1: Install ChromaDB
```bash
pnpm add chromadb
```

#### E2: Verify All Dependencies
```bash
# Check that all Phase 4 dependencies are installed
pnpm install

# Run build to catch missing deps
pnpm run build
```

---

### 📚 Phase F: Documentation Updates (MEDIUM PRIORITY)

#### F1: Update README with New Features
**Files to modify:**
- `/README.md`

**Additions:**
```markdown
## 🧠 Memory & Learning (NEW)

bolt.diy now includes an autonomous agent system with persistent memory:

- **Semantic Search**: Find relevant past work automatically
- **Long-Term Learning**: System remembers successful patterns
- **Multi-Agent Planning**: Tasks are decomposed and validated
- **Context Optimization**: Only relevant code is sent to LLM

Enable in Settings → Advanced → Enable Memory System
```

---

#### F2: Create Migration Guide
**Files to create:**
- `/docs/MIGRATION_TO_AGENTS.md`

**Content:**
```markdown
# Migrating to Agent System

## For End Users

The agent system is opt-in via feature flag:

1. Go to Settings → Advanced
2. Enable "Memory System"
3. Select embedding model (same as chat model recommended)
4. Restart chat

## For Contributors

The agent system extends existing bolt.diy infrastructure:

- `ActionRunner` — Still handles all action execution
- `WorkbenchStore` — Still manages all state
- `LLMManager` — Still provides LLM access

New components:
- `AgentOrchestrator` — Wraps workbench with planning
- `MemoryManager` — Adds semantic search and learning
- `SemanticRepoIndex` — Adds code analysis
```

---

## 🗓️ Recommended Timeline

### Week 1: Critical Integrations
- **Day 1-2:** Phase A (Infrastructure connections)
  - A1: Connect `ExecutorAgent` to `ActionRunner`
  - A2: Connect `AgentOrchestrator` to `WorkbenchStore`
  - A3: Connect `EmbeddingGenerator` to `LLMManager`
  - A4: Connect `ShortTermMemory` to `LLMManager`

- **Day 3:** Phase B (Memory hooks)
  - B1: Augment `streamText()` with memory
  - B2: Record learning after actions

- **Day 4:** Phase D (Testing)
  - D1: Integration tests
  - D2: Fix TS errors

### Week 2: Polish & Release
- **Day 5:** Phase E (Dependencies)
  - E1: Install ChromaDB
  - E2: Verify all deps

- **Day 6:** Phase C (UI)
  - C1: Memory stats
  - C2: Search command

- **Day 7:** Phase F (Docs)
  - F1: Update README
  - F2: Migration guide

---

## 🚀 Quick Start (For Impatient Developers)

If you want to get memory working ASAP:

```bash
# 1. Install missing dependency
pnpm add chromadb

# 2. Fix the 2 critical TODOs
# - EmbeddingGenerator.ts line 145
# - ShortTermMemory.ts line 110

# 3. Connect orchestrator to workbench
# - AgentOrchestrator.ts constructor

# 4. Test it!
pnpm run dev
```

---

## ⚠️ Risks & Mitigation

### Risk 1: Breaking Existing Functionality
**Mitigation:** 
- Feature flag for gradual rollout
- Extensive integration tests
- Backward compatibility maintained

### Risk 2: Performance Impact
**Mitigation:**
- Memory system is opt-in
- Embedding cache reduces LLM calls
- IndexedDB for fast local queries

### Risk 3: User Confusion
**Mitigation:**
- Clear documentation
- Sensible defaults (memory off by default)
- UI feedback for memory operations

---

## 📊 Success Metrics

### Technical Metrics
- [ ] All integration tests passing
- [ ] Zero TypeScript compilation errors
- [ ] No regressions in existing features
- [ ] Memory system works with all LLM providers

### User Experience Metrics
- [ ] Context relevance improved (measure via user feedback)
- [ ] Faster task completion (measure via timing)
- [ ] Fewer failed actions (measure via error rate)
- [ ] Higher code quality (measure via linter scores)

---

## 🎉 Completion Checklist

### Phase A: Critical Infrastructure ✅/❌
- [ ] A1: ExecutorAgent uses ActionRunner
- [ ] A2: AgentOrchestrator uses WorkbenchStore
- [ ] A3: EmbeddingGenerator uses LLMManager
- [ ] A4: ShortTermMemory uses LLMManager

### Phase B: Memory Hooks ✅/❌
- [ ] B1: Memory context in streamText()
- [ ] B2: Learning recorded after actions

### Phase C: UI Integration ✅/❌
- [ ] C1: Memory stats displayed
- [ ] C2: Search memory command

### Phase D: Testing ✅/❌
- [ ] D1: Integration tests written and passing
- [ ] D2: All TS errors fixed

### Phase E: Dependencies ✅/❌
- [ ] E1: ChromaDB installed
- [ ] E2: All deps verified

### Phase F: Documentation ✅/❌
- [ ] F1: README updated
- [ ] F2: Migration guide created

---

**Next Action:** Start with Phase A1 (Connect ExecutorAgent to ActionRunner)

This is the highest priority fix that unblocks everything else!
