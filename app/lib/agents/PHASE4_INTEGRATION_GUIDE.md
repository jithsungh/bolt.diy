# Phase 4 — Quick Integration Guide

**Last Updated:** February 11, 2026  
**Version:** 4.0.0-phase4

---

## 🚀 Quick Start (5 Minutes)

### Step 1: Install ChromaDB

```bash
cd /home/jithsungh/projects/custom/bolt.diy
pnpm add chromadb
```

### Step 2: Enable Memory in Your Code

```typescript
import { AgentOrchestrator } from '~/lib/agents';

// Create orchestrator with memory enabled
const orchestrator = new AgentOrchestrator({
  enableMemory: true,
  memoryConfig: {
    modelProvider: yourLLMProvider, // Your bolt.diy LLM instance
    embeddingDimensions: 384,       // Or 1536 for OpenAI
    shortTermWindow: 20,             // Keep last 20 messages
    cacheSize: 1000,                 // Cache 1000 embeddings
    persistencePrefix: 'boltdiy',    // IndexedDB prefix
  },
  // ... other config
});

// Initialize (async)
await orchestrator.initialize();
```

### Step 3: Use Memory-Augmented Tasks

```typescript
// Memory system will automatically:
// 1. Augment tasks with relevant context
// 2. Record successful completions
// 3. Learn from patterns

const result = await orchestrator.executeRequest(
  "Implement user authentication",
  executionContext
);

// Memory system has now:
// - Stored the conversation
// - Learned from the execution
// - Made context available for future tasks
```

---

## 📖 Usage Examples

### Example 1: Manual Memory Operations

```typescript
import { MemoryManager } from '~/lib/agents';

// Create memory manager directly
const memory = new MemoryManager({
  modelProvider: llmProvider,
  embeddingDimensions: 384,
  shortTermWindow: 20,
});

await memory.initialize();

// Record a message
await memory.recordMessage('user', 'How do I implement auth?');
await memory.recordMessage('assistant', 'Here is how...');

// Search memory
const results = await memory.search('authentication patterns', 5);

// Get statistics
const stats = await memory.getStats();
console.log(stats);
// {
//   shortTerm: { messageCount: 2, activeTask: false, ... },
//   longTerm: { modules: 0, decisions: 0, fixes: 0 },
//   cache: { embeddingCacheSize: 2, hitRate: 0 }
// }
```

### Example 2: Store Module Knowledge

```typescript
// After analyzing a file
const moduleSummary = {
  filePath: 'app/lib/auth/AuthService.ts',
  summary: 'Authentication service with JWT support',
  exports: ['AuthService', 'login', 'logout', 'verify'],
  dependencies: ['jsonwebtoken', 'bcrypt'],
  lastUpdated: Date.now(),
  tags: ['auth', 'security', 'jwt'],
};

await memory.storeModuleSummary(moduleSummary);

// Later, search for auth modules
const authModules = await memory.search('authentication', 10);
```

### Example 3: Record Design Decisions

```typescript
// When making an architectural choice
const decision = {
  id: `decision-${Date.now()}`,
  title: 'Use JWT for Authentication',
  description: 'Implement stateless auth with JWT tokens',
  rationale: 'Scalable, no server-side session storage needed',
  alternatives: ['Sessions', 'OAuth only', 'Magic links'],
  timestamp: Date.now(),
  relatedFiles: ['app/lib/auth/AuthService.ts'],
  tags: ['auth', 'architecture'],
  status: 'active' as const,
};

await memory.storeDesignDecision(decision);
```

### Example 4: Augment Task with Context

```typescript
// Before executing a task
const task = {
  id: 'task-123',
  type: 'feature',
  description: 'Add password reset functionality',
  priority: 'high' as const,
  // ... other fields
};

// Augment with memory context
const enhancedTask = await memory.augmentTaskContext(task);

console.log(enhancedTask.contextSummary);
// "## Recent Conversation
// - User: How to implement auth?
// - Assistant: Use JWT tokens...
//
// ## Relevant Modules
// - app/lib/auth/AuthService.ts: Authentication service...
//
// ## Design Decisions
// - Use JWT for Authentication: Scalable approach...
//
// ## Similar Past Fixes
// - auth: Fixed password validation bug..."
```

---

## 🔧 Configuration Options

### MemoryConfig Interface

```typescript
interface MemoryConfig {
  modelProvider: any;              // REQUIRED: Your LLM provider
  embeddingDimensions?: number;    // Default: 384
  shortTermWindow?: number;        // Default: 20 messages
  compressionThreshold?: number;   // Default: 50 messages
  cacheSize?: number;              // Default: 1000 embeddings
  persistencePrefix?: string;      // Default: 'boltdiy'
}
```

### OrchestratorConfig Extension

```typescript
interface OrchestratorConfig {
  // ... existing config
  enableMemory?: boolean;          // Default: false
  memoryConfig?: Partial<MemoryConfig>;
}
```

---

## 🎯 Common Patterns

### Pattern 1: Learning from Successful Tasks

```typescript
// Automatically done by AgentOrchestrator
async function executeTaskWithLearning(task: Task) {
  const result = await executor.execute(task);
  
  if (result.success) {
    // Memory system learns automatically
    await memory.recordTaskResult(task, result);
    // Now stored:
    // - Module summaries from changed files
    // - Successful fix pattern
    // - Design decisions (if any)
  }
  
  return result;
}
```

### Pattern 2: Contextual Task Planning

```typescript
// Planner agent uses memory for context
async function planWithContext(userRequest: string) {
  // Get recent conversation
  const context = memory.getActiveContext();
  
  // Search for relevant past work
  const similar = await memory.search(userRequest, 5);
  
  // Plan with full context
  const plan = await planner.plan({
    request: userRequest,
    conversationContext: context,
    similarWork: similar,
  });
  
  return plan;
}
```

### Pattern 3: Error Recovery with History

```typescript
// Executor uses past fixes for errors
async function executeWithHistory(task: Task) {
  const result = await executor.execute(task);
  
  if (!result.success && result.validationErrors) {
    const errorType = result.validationErrors[0].type;
    
    // Find similar past fixes
    const fixes = await memory.findSimilarFixes(task, 5);
    
    if (fixes.length > 0) {
      // Retry with historical knowledge
      task.metadata = { ...task.metadata, pastFixes: fixes };
      return executor.execute(task);
    }
  }
  
  return result;
}
```

---

## 🔌 API Reference

### MemoryManager

#### Core Methods

```typescript
// Lifecycle
await memory.initialize()
await memory.cleanup()

// Task operations
const enhanced = await memory.augmentTaskContext(task)
await memory.recordTaskResult(task, result)
await memory.updateActiveTask(task, progress)

// Message operations
await memory.recordMessage('user', 'Hello')
await memory.recordMessage('assistant', 'Hi there')

// Knowledge storage
await memory.storeModuleSummary(summary)
await memory.storeDesignDecision(decision)

// Search
const results = await memory.search(query, maxResults)

// Statistics
const stats = await memory.getStats()

// Maintenance
await memory.clearShortTermMemory()
const exported = await memory.exportMemory()
```

### ShortTermMemory

```typescript
// Message management
await shortTerm.addMessage(message)
const recent = shortTerm.getRecentMessages(10)
const all = shortTerm.getAllMessages()
shortTerm.clearMessages()

// Task tracking
shortTerm.setActiveTask(task)
shortTerm.updateTaskProgress(taskId, 50)
shortTerm.clearActiveTask()
const active = shortTerm.getActiveTask()

// Context
const context = shortTerm.getActiveContext()

// Statistics
const stats = shortTerm.getStats()
```

### LongTermMemory

```typescript
// Modules
await longTerm.storeModuleSummary(summary)
const module = await longTerm.getModuleSummary(filePath)
const modules = await longTerm.searchModules(query, k)

// Decisions
await longTerm.recordDecision(decision)
const decisions = await longTerm.searchDecisions(query, k)
const active = await longTerm.getActiveDecisions()

// Fixes
await longTerm.storeSuccessfulFix(task, result)
const similar = await longTerm.findSimilarFixes(task, k)
const byType = await longTerm.getFixesByErrorType(errorType, k)

// Statistics
const stats = await longTerm.getStats()
```

---

## 📊 Monitoring

### Get Memory Statistics

```typescript
const stats = await memory.getStats();

console.log(`Short-term memory:
  Messages: ${stats.shortTerm.messageCount}
  Active task: ${stats.shortTerm.activeTask}
  Compressed: ${stats.shortTerm.compressedHistories}

Long-term memory:
  Modules: ${stats.longTerm.modules}
  Decisions: ${stats.longTerm.decisions}
  Fixes: ${stats.longTerm.fixes}

Cache:
  Size: ${stats.cache.embeddingCacheSize}
  Hit rate: ${(stats.cache.hitRate * 100).toFixed(1)}%
`);
```

### Export Memory Data

```typescript
// Export for backup or analysis
const exported = await memory.exportMemory();

// Save to file
fs.writeFileSync(
  'memory-backup.json',
  JSON.stringify(exported, null, 2)
);
```

---

## 🐛 Troubleshooting

### Issue: Memory not persisting

**Problem:** Data lost after page refresh

**Solution:** Check IndexedDB is enabled
```typescript
// Check browser support
if (!window.indexedDB) {
  console.error('IndexedDB not supported');
}

// Check storage quota
const estimate = await navigator.storage.estimate();
console.log(`Storage: ${estimate.usage} / ${estimate.quota}`);
```

### Issue: Embeddings not working

**Problem:** Search returns no results

**Solution:** Verify embedding generation
```typescript
// Test embedding generation
const result = await embeddingGen.generateEmbedding('test');
console.log('Embedding:', result.embedding.slice(0, 5), '...');
console.log('Cached:', result.cached);
console.log('Model:', result.model);
```

### Issue: Memory system not initialized

**Problem:** "MemoryManager not initialized" error

**Solution:** Call initialize() first
```typescript
const memory = new MemoryManager(config);
await memory.initialize(); // Don't forget this!
```

---

## 🔒 Best Practices

### 1. Always Initialize Async

```typescript
// ❌ Wrong
const memory = new MemoryManager(config);
memory.search('query'); // Error!

// ✅ Correct
const memory = new MemoryManager(config);
await memory.initialize();
await memory.search('query'); // Works!
```

### 2. Handle Memory Failures Gracefully

```typescript
try {
  const enhanced = await memory.augmentTaskContext(task);
  return await execute(enhanced);
} catch (error) {
  // Fallback to execution without memory
  console.warn('Memory unavailable, continuing without context');
  return await execute(task);
}
```

### 3. Clean Up on Shutdown

```typescript
// Before app closes
window.addEventListener('beforeunload', async () => {
  await memory.cleanup();
});
```

### 4. Monitor Memory Usage

```typescript
// Periodic monitoring
setInterval(async () => {
  const stats = await memory.getStats();
  if (stats.longTerm.modules > 10000) {
    console.warn('Large memory footprint, consider pruning');
  }
}, 60000); // Every minute
```

---

## 🎓 Advanced Usage

### Custom Relevance Scoring

```typescript
import { MemoryRetrieval } from '~/lib/agents';

// Extend MemoryRetrieval for custom scoring
class CustomRetrieval extends MemoryRetrieval {
  private scoreModule(module: ModuleSummary, query: string): number {
    // Your custom scoring logic
    return score;
  }
}
```

### Filtered Search

```typescript
// Search with filters
const results = await memory.search('authentication', 10, {
  timeRange: [Date.now() - 7*24*60*60*1000, Date.now()], // Last 7 days
  tags: ['auth', 'security'],
  filePatterns: ['app/lib/auth/'],
});
```

---

## 📚 Next Steps

1. ✅ Read the [Phase 4 Completion Report](./PHASE4_COMPLETION_REPORT.md)
2. ✅ Review the [Quality Analysis](./PHASE4_QUALITY_ANALYSIS.md)
3. 🔧 Install ChromaDB: `pnpm add chromadb`
4. 🔌 Wire up your LLM API for embeddings
5. 🧪 Test with a simple workflow
6. 📖 Read the API documentation (coming soon)
7. 🚀 Deploy to production!

---

## 💡 Tips

- Start with `enableMemory: false` and gradually enable
- Monitor memory stats in development
- Use memory export for debugging
- Clear short-term memory when starting new conversations
- Let the system learn over time (better results with more data)

---

**Happy Coding! 🎉**

For issues or questions, refer to:
- Phase 4 Completion Report
- Quality Analysis Document
- Main project documentation
