# 🚀 Quick Start Guide - Multi-Agent System

## Get Started in 5 Minutes

### 1. Initialize the System

```typescript
import { createAgentSystem } from '~/lib/agents';

const agentSystem = await createAgentSystem({
  skillsPath: '.agent/skills',        // Load your 38 skills
  safetyMode: 'moderate',             // Balance safety & autonomy
  autoLoadSkills: true,               // Auto-load on init
});
```

### 2. Index Your Codebase

```typescript
// Index individual files
await agentSystem.indexFile(
  'app/components/Button.tsx',
  buttonCode
);

// Or batch index
await agentSystem.indexFiles([
  { path: 'app/components/Button.tsx', content: buttonCode },
  { path: 'app/utils/helpers.ts', content: helpersCode },
  { path: 'app/routes/api.auth.ts', content: authCode },
]);
```

### 3. Make a Request

```typescript
const result = await agentSystem.processRequest({
  userRequest: 'Add authentication to the API routes',
  files: ['app/routes/api.auth.ts'],
  context: 'Use JWT tokens and bcrypt for passwords',
});

if (result.success) {
  console.log(`✅ Modified ${result.metrics.filesModified} files`);
  console.log(`📝 Changed ${result.metrics.linesChanged} lines`);
} else {
  console.log(`❌ Failed:`, result.errors);
}
```

---

## Common Tasks

### Search Code

```typescript
// Semantic search
const results = await agentSystem.searchCode(
  'React hook for authentication',
  10  // limit
);

results.forEach(r => {
  console.log(`${r.chunk.file}: ${r.chunk.symbolName}`);
  console.log(`Similarity: ${(r.similarity * 100).toFixed(0)}%`);
});
```

### Find Symbols

```typescript
// Find functions/classes by name
const useAuthHooks = agentSystem.findSymbol('useAuth');
const loginComponents = agentSystem.findSymbol('Login');

useAuthHooks.forEach(symbol => {
  console.log(`Found in: ${symbol.file}`);
  console.log(`Lines ${symbol.startLine}-${symbol.endLine}`);
});
```

### Get Statistics

```typescript
// Repository stats
const repoStats = agentSystem.getRepoStats();
console.log('Files indexed:', repoStats.totalFiles);
console.log('Total symbols:', repoStats.totalSymbols);
console.log('Languages:', Object.keys(repoStats.languages));

// Memory stats
const memoryStats = agentSystem.getMemoryStats();
console.log('Total memories:', memoryStats.totalMemories);

// Skills stats
const skillsStats = agentSystem.getSkillsStats();
console.log('Skills loaded:', skillsStats.totalSkills);
console.log('Most used:', skillsStats.mostUsedSkill);
```

---

## Advanced Usage

### Custom Context

```typescript
import { ContextBuilder } from '~/lib/agents';

const contextBuilder = new ContextBuilder(
  agentSystem.getASTParser(),
  agentSystem.getMemoryStore()
);

const context = await contextBuilder.buildContext(
  ['app/components/Form.tsx'],
  'Add form validation',
  {
    includeDependencies: true,    // Include imports
    includeDependents: true,      // Include files that import this
    includeTests: true,           // Include test files
    includeRelated: true,         // Semantic search for related code
    maxTokens: 100000,            // Token budget
  }
);

console.log('Context assembled:');
console.log(`- Primary files: ${context.primary.length}`);
console.log(`- Dependencies: ${context.dependencies.length}`);
console.log(`- Tests: ${context.tests.length}`);
console.log(`- Total tokens: ${context.totalTokens}`);
```

### Direct AST Parsing

```typescript
import { ASTParser } from '~/lib/agents';

const parser = new ASTParser();

// Parse a file
const symbols = parser.parseFile('app/utils/helpers.ts', code);

console.log('Functions found:', 
  symbols.symbols.filter(s => s.type === 'function').length
);

console.log('Classes found:',
  symbols.symbols.filter(s => s.type === 'class').length
);

// Get dependencies
const deps = parser.getDependencies('app/utils/helpers.ts');
console.log('Depends on:', deps);

// Get dependents (reverse)
const dependents = parser.getDependents('app/utils/helpers.ts');
console.log('Used by:', dependents);
```

### Semantic Search

```typescript
import { SemanticRepoIndex } from '~/lib/agents';

const repoIndex = new SemanticRepoIndex();

// Index files
await repoIndex.indexFile('app/hooks/useAuth.ts', authHookCode);
await repoIndex.indexFile('app/hooks/useData.ts', dataHookCode);

// Search with filters
const results = await repoIndex.search(
  'React hook with error handling',
  10,
  {
    types: ['function'],           // Only functions
    tags: ['react', 'exported'],   // Must have these tags
    minSimilarity: 0.7,            // 70% similarity threshold
  }
);

// Find by tags
const reactComponents = repoIndex.findByTags(['react', 'component']);
const exportedFunctions = repoIndex.findByTags(['exported', 'function']);
```

---

## Integration Patterns

### With Existing Agents

```typescript
import { 
  PlannerAgent,
  ExecutorAgent,
  ReviewerAgent,
  AgentOrchestrator
} from '~/lib/agents';

const planner = new PlannerAgent();
const executor = new ExecutorAgent();
const reviewer = new ReviewerAgent();

const orchestrator = new AgentOrchestrator({
  maxConcurrentTasks: 3,
  safetyMode: 'moderate',
});

// Use orchestrator directly
await orchestrator.orchestrateExecution(/* ... */);
```

### With Memory Store

```typescript
import { VectorMemoryStore } from '~/lib/agents';

const memoryStore = new VectorMemoryStore();

// Store memories
await memoryStore.store({
  content: 'User prefers TypeScript strict mode',
  metadata: {
    type: 'decision',
    timestamp: Date.now(),
    tags: ['preference', 'typescript'],
    importance: 0.8,
  },
});

// Search memories
const memories = await memoryStore.search(
  'TypeScript configuration',
  {
    limit: 5,
    threshold: 0.7,
    filter: {
      type: 'decision',
      tags: ['typescript'],
    },
  }
);
```

### With Skills Manager

```typescript
import { SkillsManager } from '~/lib/agents';

const skillsManager = new SkillsManager();

// Add skills
skillsManager.addSkill({
  name: 'react-best-practices',
  description: 'React performance optimization patterns',
  context: '/* skill content */',
  examples: ['/* example code */'],
  tags: ['react', 'performance'],
  priority: 8,
  applicableAgents: ['executor', 'reviewer'],
});

// Get relevant skills
const skills = skillsManager.getRelevantSkills(
  'optimize React component rendering',
  'executor'
);

// Get top skills
const topSkills = skillsManager.getTopSkills(5);
```

---

## Configuration Options

```typescript
interface IntegrationConfig {
  skillsPath?: string;              // Default: '.agent/skills'
  maxTokens?: number;               // Default: 100000
  safetyMode?: 'strict' | 'moderate' | 'permissive';  // Default: 'moderate'
  enableSemanticSearch?: boolean;   // Default: true
  autoLoadSkills?: boolean;         // Default: true
}
```

### Safety Modes

- **`strict`** - Maximum safety, minimal autonomy, requires approval
- **`moderate`** - Balanced (recommended for most use cases)
- **`permissive`** - More autonomous, fewer restrictions

---

## Troubleshooting

### Skills Not Loading

```typescript
// Check if skills directory exists
const skillsLoader = new SkillsLoader('.agent/skills');
const result = await skillsLoader.loadSkills();

if (!result.success) {
  console.log('Failed skills:', result.failed);
}

console.log('Loaded:', result.loaded.length);
console.log('Stats:', result.stats);
```

### Memory Issues

```typescript
// Check memory stats
const stats = agentSystem.getMemoryStats();
console.log('Memory usage:', stats);

// Reset if needed
agentSystem.reset();
```

### Debug Mode

```typescript
// Export system state
const state = agentSystem.exportSystemState();
console.log(JSON.parse(state));

// Or save to file (Node.js environment)
require('fs').writeFileSync('debug.json', state);
```

---

## Best Practices

### 1. Index Before Requesting

Always index relevant files before making requests:

```typescript
// ✅ Good
await agentSystem.indexFile('app/utils/helpers.ts', code);
await agentSystem.processRequest({
  userRequest: 'Refactor helper functions',
  files: ['app/utils/helpers.ts'],
});

// ❌ Bad
await agentSystem.processRequest({
  userRequest: 'Refactor helper functions',
  files: ['app/utils/helpers.ts'],  // Not indexed yet!
});
```

### 2. Batch Index for Performance

```typescript
// ✅ Good - batch indexing
await agentSystem.indexFiles([...allFiles]);

// ❌ Less efficient - one at a time
for (const file of allFiles) {
  await agentSystem.indexFile(file.path, file.content);
}
```

### 3. Use Specific Requests

```typescript
// ✅ Good - specific
await agentSystem.processRequest({
  userRequest: 'Add input validation using Zod schema',
  files: ['app/components/LoginForm.tsx'],
  context: 'Validate email format and password strength',
});

// ❌ Vague
await agentSystem.processRequest({
  userRequest: 'Make it better',  // Too vague!
  files: ['app/components/LoginForm.tsx'],
});
```

### 4. Check Results

```typescript
const result = await agentSystem.processRequest({...});

if (result.success) {
  // Review changes
  result.changes.forEach(change => {
    console.log(`Modified: ${change.filePath}`);
    console.log(`Diff:\n${change.diff}`);
  });
} else {
  // Handle errors
  console.error('Errors:', result.errors);
  console.warn('Warnings:', result.warnings);
}
```

---

## Next Steps

1. ✅ Read the [Full API Reference](./README.md)
2. ✅ Explore [Usage Examples](./examples.ts)
3. ✅ Run [Unit Tests](./test.ts)
4. ✅ Check [Phase 1 Completion](./PHASE1_COMPLETE.md)
5. 🔄 Plan Phase 2 Integration

---

**Happy Coding! 🚀**
