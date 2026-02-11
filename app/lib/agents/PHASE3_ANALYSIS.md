# Phase 3: Execution Feedback Loop - Analysis & Implementation Plan

**Date:** February 11, 2026  
**Current Status:** Phase 2 Complete ✅  
**Next Phase:** Phase 3 - Enhanced Execution Feedback Loop 🔁

---

## 📊 Current State Analysis

### What We Have (Phase 1 + Phase 2)

#### ✅ Phase 1: Repo Intelligence Layer
- **AST Parser** - Tree-sitter-based parsing
- **Semantic Repo Index** - Vector embeddings with search
- **Context Builder** - Intelligent context assembly
- **Skills System** - Reusable coding patterns
- **Memory System** - Vector-based memory storage

#### ✅ Phase 2: Multi-Agent Pipeline  
- **Planner Agent** - Task decomposition and planning
- **Executor Agent** - Code generation and modification
- **Reviewer Agent** - Quality and safety validation
- **TaskQueue** - Priority scheduling with dependencies
- **ExecutionFeedbackLoop** (Basic) - Command execution with error parsing
- **AgentEvaluationSystem** - Performance tracking

### Current ExecutionFeedbackLoop (Phase 2)

**File:** `app/lib/agents/ExecutionFeedbackLoop.ts` (447 lines)

**What It Does:**
```typescript
// Basic execution with error parsing
const result = await feedbackLoop.executeWithFeedback(
  fileChanges,
  { webcontainer, shell, workDir },
  { buildCommand, testCommand, lintCommand }
);

// Returns:
{
  success: boolean,
  output: string,
  errors: ParsedError[],
  feedback: FeedbackSummary
}
```

**Capabilities:**
✅ Execute build/test/lint commands  
✅ Parse errors (TypeScript, ESLint, Jest)  
✅ Error categorization  
✅ Retry strategy suggestions  
✅ Feedback summarization  

**Limitations (Phase 2):**
❌ No isolated execution environment  
❌ No comprehensive error recovery loop  
❌ Limited test execution intelligence  
❌ No build artifact validation  
❌ No performance regression detection  
❌ No security vulnerability scanning  
❌ No automated fix generation  

---

## 🎯 Phase 3 Requirements (from plan.md)

### Core Requirements

1. **Automated Sandbox** ✅ (Using WebContainer)
   - Build/compile execution
   - Lint/type checking
   - Test execution
   - Error capture

2. **Error Analysis Loop** 🔄 (Needs Enhancement)
   ```
   generate → execute → analyze errors → retry
   ```

3. **Hard Limits** ⚠️ (Needs Implementation)
   - Max retries per task
   - Timeout protection
   - Resource limits

### Deliverables Required

1. **Isolated Execution Container** ✅ (WebContainer)
2. **Structured Error Parser** ✅ (Phase 2)
3. **Feedback Summarizer** ✅ (Phase 2)

**Additional Enhancements Needed:**
4. **Automated Fix Generator** 🆕
5. **Test Intelligence** 🆕
6. **Build Artifact Validator** 🆕
7. **Performance Monitor** 🆕

---

## 🏗️ Current bolt.diy Infrastructure

### WebContainer Integration

**File:** `app/lib/webcontainer/index.ts`

```typescript
// Already available globally
export let webcontainer: Promise<WebContainer>;

// Features:
- Safe browser-based execution
- Shell command execution
- File system access
- Process spawning
- Error forwarding from preview
```

**Current Usage:**
```typescript
const webcontainer = await import('~/lib/webcontainer').webcontainer;
const process = await webcontainer.spawn('sh', ['-c', command]);
```

### ActionRunner

**File:** `app/lib/runtime/action-runner.ts` (761 lines)

**Capabilities:**
- Execute shell commands
- Manage action lifecycle (pending → running → complete)
- File operations (read, write, delete)
- Error handling with ActionCommandError
- Alert system for failures

**Current Command Execution:**
```typescript
class ActionRunner {
  #webcontainer: Promise<WebContainer>;
  #shellTerminal: () => BoltShell;
  
  // Executes commands and tracks status
  addAction(data: ActionCallbackData)
  runAction(action)
}
```

### Terminal/Shell System

**Type:** `BoltShell`

**Features:**
- Interactive terminal
- Command history
- Output streaming
- Process management

---

## 🔍 Gap Analysis: Phase 2 vs Phase 3

| Feature | Phase 2 Status | Phase 3 Target |
|---------|---------------|----------------|
| **Command Execution** | ✅ Basic | ✅ Enhanced with retry |
| **Error Parsing** | ✅ Multi-format | ✅ + AI-powered analysis |
| **Feedback Loop** | ✅ Single pass | 🔄 Iterative until fixed |
| **Fix Generation** | ❌ None | ✅ Automated fix attempts |
| **Test Intelligence** | ❌ Run all tests | ✅ Smart test selection |
| **Build Validation** | ✅ Basic | ✅ Artifact validation |
| **Performance Check** | ❌ None | ✅ Regression detection |
| **Security Scan** | ❌ None | ✅ Vulnerability detection |
| **Resource Limits** | ⚠️ Timeout only | ✅ CPU/Memory/Time limits |
| **Rollback Support** | ❌ None | ✅ Automatic rollback |

---

## 🚀 Phase 3 Implementation Strategy

### Approach: Enhance Existing ExecutionFeedbackLoop

Instead of creating a new system, we'll **upgrade the existing Phase 2 ExecutionFeedbackLoop** with Phase 3 capabilities.

### Why This Approach?

1. ✅ **Already Integrated** - Phase 2 ExecutionFeedbackLoop is wired into AgentOrchestrator
2. ✅ **WebContainer Ready** - Already uses WebContainer for safe execution
3. ✅ **Error Parsing Done** - Multi-format error parsing exists
4. ✅ **Type Safe** - All TypeScript types defined
5. ✅ **Incremental** - Add features without breaking existing code

---

## 📋 Phase 3 Component Breakdown

### 1. Enhanced Execution Loop (Core)

**Upgrade:** `ExecutionFeedbackLoop.ts`

**New Features to Add:**

#### A. Iterative Error Correction Loop
```typescript
async executeWithIterativeFeedback(
  changes: FileChange[],
  context: ExecutionContext,
  commands: ExecutionCommands,
  options: {
    maxAttempts: number;
    autoFix: boolean;
    rollbackOnFailure: boolean;
  }
): Promise<IterativeExecutionResult>
```

**Loop Flow:**
```
1. Apply changes
2. Run build
   ↓ errors? → Generate fix → retry (max 3 times)
   ↓ success
3. Run tests
   ↓ failures? → Analyze → Generate fix → retry
   ↓ success
4. Run lint
   ↓ warnings? → Apply auto-fixes → retry
   ↓ success
5. Validate artifacts
6. Return comprehensive result
```

#### B. Automated Fix Generator
```typescript
async generateFix(
  error: ParsedError,
  context: FileContext
): Promise<FileChange | null>
```

**Fix Strategies:**
- Import missing dependencies
- Fix syntax errors
- Add missing type annotations
- Adjust function signatures
- Update deprecated API usage

#### C. Test Intelligence System
```typescript
async selectRelevantTests(
  changes: FileChange[],
  allTests: string[]
): Promise<string[]>
```

**Features:**
- Detect affected test files
- Run only related tests first
- Full test suite on final validation
- Track test performance

#### D. Build Artifact Validator
```typescript
async validateBuildArtifacts(
  buildDir: string,
  expectedArtifacts: string[]
): Promise<ValidationResult>
```

**Checks:**
- Output files exist
- No console errors in bundles
- Source maps valid
- Asset sizes within limits

---

### 2. Performance Monitor

**New File:** `PerformanceMonitor.ts`

**Purpose:** Track performance regressions

```typescript
class PerformanceMonitor {
  async measureBuildTime(command: string): Promise<number>
  async detectRegressions(current: Metrics, baseline: Metrics): Promise<Regression[]>
  async trackBundleSize(buildDir: string): Promise<SizeReport>
}
```

**Metrics Tracked:**
- Build time
- Bundle sizes
- Test execution time
- Memory usage
- CPU usage (if available)

---

### 3. Security Scanner (Optional)

**New File:** `SecurityScanner.ts`

**Purpose:** Basic security vulnerability detection

```typescript
class SecurityScanner {
  async scanDependencies(packageJson: string): Promise<Vulnerability[]>
  async checkCodePatterns(files: FileChange[]): Promise<SecurityIssue[]>
}
```

**Checks:**
- Known vulnerable dependencies
- Unsafe code patterns (eval, innerHTML, etc.)
- Exposed secrets/API keys
- Insecure crypto usage

---

### 4. Resource Limiter

**New File:** `ResourceLimiter.ts`

**Purpose:** Enforce execution limits

```typescript
class ResourceLimiter {
  enforceTimeout(promise: Promise<any>, timeout: number): Promise<any>
  trackMemoryUsage(): MemoryStats
  enforceMaxRetries(attempt: number, max: number): void
}
```

**Limits:**
- Max execution time per command
- Max total time per task
- Max retry attempts
- Memory thresholds

---

### 5. Rollback Manager

**New File:** `RollbackManager.ts`

**Purpose:** Automatic rollback on failure

```typescript
class RollbackManager {
  createCheckpoint(files: FileChange[]): Checkpoint
  async rollback(checkpoint: Checkpoint): Promise<void>
  async validateCheckpoint(checkpoint: Checkpoint): Promise<boolean>
}
```

**Features:**
- Save file states before changes
- Rollback on critical errors
- Validate rollback success
- Cleanup old checkpoints

---

## 📐 Architecture Diagram

```
┌────────────────────────────────────────────────────────┐
│                  AgentOrchestrator                      │
│                    (Phase 2)                            │
└──────────────────┬─────────────────────────────────────┘
                   │
                   ↓
┌────────────────────────────────────────────────────────┐
│         ExecutionFeedbackLoop (Enhanced)                │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │  1. Apply Changes                                │  │
│  │  2. Create Checkpoint (RollbackManager)          │  │
│  │  3. Run Build (ResourceLimiter)                  │  │
│  │     ↓ errors?                                    │  │
│  │     → Parse Errors                               │  │
│  │     → Generate Fix (FixGenerator)                │  │
│  │     → Retry (max 3x)                             │  │
│  │  4. Run Tests (TestIntelligence)                 │  │
│  │     ↓ failures?                                  │  │
│  │     → Analyze Failures                           │  │
│  │     → Generate Fix                               │  │
│  │     → Retry                                      │  │
│  │  5. Run Lint                                     │  │
│  │     → Apply Auto-fixes                           │  │
│  │  6. Validate Artifacts (ArtifactValidator)       │  │
│  │  7. Check Performance (PerformanceMonitor)       │  │
│  │  8. Security Scan (SecurityScanner) [Optional]   │  │
│  │  9. If all pass → Success                        │  │
│  │  10. If critical fail → Rollback                 │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
                   │
                   ↓
┌────────────────────────────────────────────────────────┐
│                  WebContainer                           │
│              (Safe Execution Environment)               │
└────────────────────────────────────────────────────────┘
```

---

## 🎯 Implementation Priorities

### Phase 3.1: Core Iterative Loop (Must Have)
1. ✅ Enhanced executeWithIterativeFeedback method
2. ✅ Automated fix generator for common errors
3. ✅ Rollback manager for safety
4. ✅ Resource limiter for stability

**Estimated:** ~500 lines

### Phase 3.2: Test Intelligence (High Priority)
5. ✅ Smart test selection
6. ✅ Test failure analysis
7. ✅ Test performance tracking

**Estimated:** ~300 lines

### Phase 3.3: Validation & Monitoring (Medium Priority)
8. ✅ Build artifact validator
9. ✅ Performance monitor
10. ✅ Bundle size tracking

**Estimated:** ~400 lines

### Phase 3.4: Security (Nice to Have)
11. ⚠️ Basic security scanner
12. ⚠️ Dependency vulnerability check

**Estimated:** ~300 lines

---

## 📊 Success Metrics

### Phase 3 Goals

| Metric | Target |
|--------|--------|
| **Auto-fix Success Rate** | >60% of common errors |
| **Build Success Rate** | >90% after 3 attempts |
| **Test Recovery Rate** | >80% after analysis |
| **Rollback Reliability** | 100% when triggered |
| **Performance Overhead** | <20% vs manual |
| **False Positive Rate** | <5% for security |

---

## 🔧 Integration Points

### Existing Systems to Enhance

1. **AgentOrchestrator**
   - Already calls `feedbackLoop.executeWithFeedback()`
   - Will automatically get Phase 3 benefits
   - Add options for Phase 3 features

2. **AgentEvaluationSystem**
   - Track auto-fix success rates
   - Measure rollback frequency
   - Monitor performance impact

3. **TaskQueue**
   - No changes needed
   - Continues to manage task flow

4. **Executor Agent**
   - Receives better feedback
   - Can retry with fixes
   - Learns from failures

---

## 📝 Implementation Steps

### Step 1: Enhance ExecutionFeedbackLoop (Core)
- Add iterative execution method
- Implement fix generator
- Add checkpoint/rollback support
- Enhance error analysis

### Step 2: Create Support Components
- RollbackManager
- ResourceLimiter
- FixGenerator (integrated)

### Step 3: Add Test Intelligence
- TestSelector
- TestAnalyzer
- Performance tracking

### Step 4: Add Validation
- ArtifactValidator
- PerformanceMonitor

### Step 5: Optional Security
- SecurityScanner
- Vulnerability checker

### Step 6: Integration & Testing
- Update AgentOrchestrator config
- Add comprehensive tests
- Update documentation

---

## 🎓 Key Learnings from Phase 2

### What Worked Well
✅ WebContainer integration is solid  
✅ Error parsing is comprehensive  
✅ Type safety prevents many issues  
✅ Modular design is flexible  

### What to Improve in Phase 3
🔄 Add iterative retry loops  
🔄 Generate fixes automatically  
🔄 Add rollback safety  
🔄 Monitor performance  

---

## 🚦 Ready to Proceed?

**Prerequisites:** ✅ All met
- Phase 1: Complete
- Phase 2: Complete
- WebContainer: Available
- ActionRunner: Ready
- Type System: Defined

**Estimated Time:**
- Phase 3.1 (Core): 2-3 hours
- Phase 3.2 (Tests): 1-2 hours
- Phase 3.3 (Validation): 1-2 hours
- Phase 3.4 (Security): 1 hour
- **Total: 5-8 hours of focused work**

**Estimated Code:**
- ~1,500 lines of production code
- ~500 lines of tests
- ~200 lines of documentation

---

## 🎯 Next Action

Ready to implement Phase 3.1 (Core Iterative Loop)?

1. Enhance `ExecutionFeedbackLoop.ts` with iterative feedback
2. Create `RollbackManager.ts` for safety
3. Create `ResourceLimiter.ts` for stability
4. Add automated fix generation
5. Update AgentOrchestrator integration
6. Write comprehensive tests

**Let's make bolt.diy truly autonomous! 🚀**

---

**Analysis Date:** February 11, 2026  
**Status:** Ready to implement Phase 3  
**Confidence:** High (based on solid Phase 2 foundation)
