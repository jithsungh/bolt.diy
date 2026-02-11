# Quick Integration Guide - Phase 2

## How to Use Enhanced Agent System in bolt.diy

### Option 1: Drop-in Replacement (Recommended)

Replace existing orchestrator with enhanced version:

```typescript
// Before (Phase 1)
import { AgentOrchestrator } from '~/lib/agents';

// After (Phase 2)
import { EnhancedAgentOrchestrator } from '~/lib/agents';

const orchestrator = new EnhancedAgentOrchestrator({
  maxConcurrentTasks: 3,
  enableFeedbackLoop: true,
  enableEvaluation: true,
});

// Set WebContainer for execution feedback
orchestrator.setWebContainer(webcontainer, shell);
```

### Option 2: Gradual Migration

Use Phase 2 components individually:

```typescript
import { 
  TaskQueue,
  ExecutionFeedbackLoop,
  AgentEvaluationSystem
} from '~/lib/agents';

// Just use the queue
const queue = new TaskQueue({ maxConcurrent: 5 });

// Just use feedback loop
const feedback = new ExecutionFeedbackLoop();

// Just use evaluation
const eval = new AgentEvaluationSystem();
```

---

## Integration Points

### 1. In Chat Handler (`app/routes/api.chat.ts`)

```typescript
import { EnhancedAgentOrchestrator } from '~/lib/agents';

// Initialize once
const orchestrator = new EnhancedAgentOrchestrator({
  enableFeedbackLoop: true,
  enableEvaluation: true,
});

// In request handler
export async function POST({ request }) {
  const { messages, webcontainer, shell } = await request.json();
  
  // Set WebContainer context
  orchestrator.setWebContainer(webcontainer, shell);
  
  // Execute with full Phase 2 pipeline
  const result = await orchestrator.executeRequest(
    messages[messages.length - 1].content,
    { repoContext, files },
    {
      buildCommand: 'npm run build',
      testCommand: 'npm test',
    }
  );
  
  return json({
    success: result.success,
    changes: result.executedTasks,
    metrics: result.evaluation,
  });
}
```

### 2. In Workbench Store (`app/lib/stores/workbench.ts`)

```typescript
import { EnhancedAgentOrchestrator } from '~/lib/agents';

class WorkbenchStore {
  private orchestrator: EnhancedAgentOrchestrator;
  
  constructor() {
    this.orchestrator = new EnhancedAgentOrchestrator({
      maxConcurrentTasks: 3,
      enableFeedbackLoop: true,
      enableEvaluation: true,
    });
  }
  
  async processUserRequest(request: string, webcontainer: WebContainer) {
    // Set WebContainer
    this.orchestrator.setWebContainer(webcontainer, shell);
    
    // Execute
    const result = await this.orchestrator.executeRequest(request, context);
    
    // Update UI with progress
    this.updateProgress(this.orchestrator.getProgress());
    
    return result;
  }
  
  getMetrics() {
    return this.orchestrator.getEvaluationMetrics();
  }
}
```

### 3. Progress Monitoring Component

```typescript
// app/components/workbench/ProgressMonitor.tsx
import { useEffect, useState } from 'react';
import type { EnhancedAgentOrchestrator } from '~/lib/agents';

export function ProgressMonitor({ orchestrator }: { orchestrator: EnhancedAgentOrchestrator }) {
  const [progress, setProgress] = useState({ percentage: 0, completed: 0, total: 0 });
  const [stats, setStats] = useState({ pending: 0, running: 0, completed: 0, failed: 0 });
  
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(orchestrator.getProgress());
      setStats(orchestrator.getQueueStats());
    }, 500);
    
    return () => clearInterval(interval);
  }, [orchestrator]);
  
  return (
    <div className="progress-monitor">
      <div className="progress-bar" style={{ width: `${progress.percentage}%` }} />
      <div className="stats">
        <span>✅ Completed: {stats.completed}</span>
        <span>⚙️ Running: {stats.running}</span>
        <span>⏳ Pending: {stats.pending}</span>
        {stats.failed > 0 && <span>❌ Failed: {stats.failed}</span>}
      </div>
    </div>
  );
}
```

---

## Environment Variables

No additional environment variables required! Phase 2 uses existing bolt.diy infrastructure.

---

## Testing

### Unit Tests
```bash
# Test individual components
npm test -- TaskQueue.test.ts
npm test -- ExecutionFeedbackLoop.test.ts
npm test -- AgentEvaluationSystem.test.ts
```

### Integration Tests
```bash
# Test full pipeline
npm test -- EnhancedAgentOrchestrator.test.ts
```

### Manual Testing
```typescript
// app/lib/agents/test.ts already includes tests
import { runTests } from '~/lib/agents/test';

runTests().then(success => {
  console.log(success ? '✅ All tests passed' : '❌ Some tests failed');
});
```

---

## Performance Tuning

### For Large Projects (>1000 files)
```typescript
const orchestrator = new EnhancedAgentOrchestrator({
  maxConcurrentTasks: 5, // Increase parallelism
  maxExecutionTime: 600000, // 10 minutes
});
```

### For Safety-Critical Projects
```typescript
const orchestrator = new EnhancedAgentOrchestrator({
  safetyMode: 'strict',
  requireReview: true,
  enableFeedbackLoop: true, // Always validate execution
});
```

### For Fast Iterations
```typescript
const orchestrator = new EnhancedAgentOrchestrator({
  requireReview: false,
  maxConcurrentTasks: 3,
  enableFeedbackLoop: false, // Skip execution validation
});
```

---

## Troubleshooting

### Issue: Tasks stuck in "pending"
**Solution**: Check dependencies - may have circular dependency
```typescript
const blocked = orchestrator.getQueueStats().blocked;
console.log(`${blocked} tasks blocked by dependencies`);
```

### Issue: High failure rate
**Solution**: Check evaluation metrics
```typescript
const metrics = orchestrator.getEvaluationMetrics();
console.log('Suggestions:', metrics.improvementSuggestions);
```

### Issue: Slow execution
**Solution**: Increase concurrency or disable feedback loop
```typescript
const orchestrator = new EnhancedAgentOrchestrator({
  maxConcurrentTasks: 5,
  enableFeedbackLoop: false,
});
```

---

## Migration Checklist

- [ ] Import `EnhancedAgentOrchestrator` instead of `AgentOrchestrator`
- [ ] Add `orchestrator.setWebContainer(webcontainer, shell)` call
- [ ] Update config with Phase 2 options
- [ ] Add progress monitoring UI (optional)
- [ ] Add metrics dashboard (optional)
- [ ] Test with sample requests
- [ ] Monitor performance metrics
- [ ] Adjust configuration based on metrics

---

## Next Steps

1. **Test in Development**: Run sample requests, verify execution
2. **Monitor Metrics**: Check evaluation dashboard after 10-20 tasks
3. **Tune Configuration**: Adjust based on performance data
4. **Deploy to Production**: Roll out gradually with feature flags

---

**Questions?** Check `PHASE2_COMPLETE.md` for detailed documentation.

**Ready to deploy!** 🚀
