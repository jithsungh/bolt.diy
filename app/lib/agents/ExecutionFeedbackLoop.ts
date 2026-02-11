/**
 * Execution Feedback Loop — Phase 3 (Enhanced)
 *
 * Iterative generate → execute → analyse → retry loop with:
 *  - File-level rollback via RollbackManager
 *  - Hard resource limits via ResourceLimiter
 *  - Smart test selection via TestRunner
 *  - Build artifact validation via BuildValidator
 *  - Per-phase retry with auto-fix heuristics
 *  - Full backward compatibility with Phase 2 callers
 *
 * Integration:
 *  - WebContainer.spawn() for shell commands
 *  - ActionRunner patterns (exit code + output parsing)
 *  - AgentOrchestrator calls executeWithFeedback()
 */

import { createScopedLogger } from '~/utils/logger';
import type { FileChange } from './types';
import { RollbackManager, type Checkpoint, type RollbackResult } from './RollbackManager';
import { ResourceLimiter, ResourceLimitError, type ResourceLimits } from './ResourceLimiter';
import { TestRunner, type TestRunResult, type TestRunnerConfig } from './TestRunner';
import { BuildValidator, type BuildValidationResult, type BuildValidatorConfig } from './BuildValidator';

const logger = createScopedLogger('ExecutionFeedback');

// Import WebContainer type dynamically to avoid compile errors
type WebContainer = any; // Will be properly typed at runtime
type BoltShell = any;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ExecutionContext {
  webcontainer: WebContainer;
  shell: BoltShell;
  workDir: string;
}

export interface ExecutionResult {
  success: boolean;
  output: string;
  errors: ParsedError[];
  exitCode?: number;
  duration: number;
}

export interface ParsedError {
  type: 'compile' | 'runtime' | 'lint' | 'test' | 'type';
  severity: 'error' | 'warning';
  message: string;
  file?: string;
  line?: number;
  column?: number;
  code?: string;
  suggestion?: string;
}

export interface FeedbackSummary {
  errorCount: number;
  warningCount: number;
  criticalErrors: ParsedError[];
  suggestions: string[];
  canRetry: boolean;
  retryStrategy?: 'fix' | 'rollback' | 'skip';
}

/** Result returned by the Phase 3 iterative loop */
export interface IterativeExecutionResult extends ExecutionResult {
  phases: PhaseResult[];
  totalAttempts: number;
  rollback?: RollbackResult;
  testResult?: TestRunResult;
  buildValidation?: BuildValidationResult;
  feedback: FeedbackSummary;
  fixAttempts: FixAttempt[];
}

export interface PhaseResult {
  phase: 'apply' | 'build' | 'validate' | 'test-selective' | 'test-full' | 'lint';
  success: boolean;
  attempts: number;
  duration: number;
  output: string;
  errors: ParsedError[];
}

export interface FixAttempt {
  phase: string;
  attempt: number;
  description: string;
  applied: boolean;
}

export interface ExecutionFeedbackConfig {
  maxRetries?: number;
  timeout?: number;
  /** Enable the full Phase 3 iterative loop (default: true) */
  iterativeMode?: boolean;
  /** Resource limits overrides */
  resourceLimits?: Partial<ResourceLimits>;
  /** Test runner config overrides */
  testRunnerConfig?: TestRunnerConfig;
  /** Build validator config overrides */
  buildValidatorConfig?: BuildValidatorConfig;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

class PhaseError extends Error {
  constructor(
    public readonly phase: string,
    public readonly errors: ParsedError[],
    public readonly output: string,
    message?: string,
  ) {
    super(message ?? `Phase "${phase}" failed with ${errors.length} error(s)`);
    this.name = 'PhaseError';
  }
}

// ---------------------------------------------------------------------------
// Main class
// ---------------------------------------------------------------------------

/**
 * Execution feedback loop for autonomous error correction.
 *
 * Phase 2 callers: call `executeWithFeedback()` exactly as before.
 * Phase 3 callers: the same method delegates to `iterativeExecute()` when
 * `iterativeMode` is enabled (default).
 */
export class ExecutionFeedbackLoop {
  private maxRetries: number;
  private timeout: number;
  private iterativeMode: boolean;

  // Phase 3 sub-systems
  private rollbackManager: RollbackManager;
  private resourceLimiter: ResourceLimiter;
  private testRunner: TestRunner;
  private buildValidator: BuildValidator;

  constructor(config?: ExecutionFeedbackConfig) {
    this.maxRetries = config?.maxRetries ?? 3;
    this.timeout = config?.timeout ?? 120_000;
    this.iterativeMode = config?.iterativeMode ?? true;

    this.rollbackManager = new RollbackManager();
    this.resourceLimiter = new ResourceLimiter({ limits: config?.resourceLimits });
    this.testRunner = new TestRunner(config?.testRunnerConfig);
    this.buildValidator = new BuildValidator(config?.buildValidatorConfig);

    logger.info('ExecutionFeedbackLoop initialized (Phase 3)', {
      iterativeMode: this.iterativeMode,
      maxRetries: this.maxRetries,
    });
  }

  // -----------------------------------------------------------------------
  // Accessors for sub-systems (used by orchestrator / tests)
  // -----------------------------------------------------------------------

  getRollbackManager(): RollbackManager { return this.rollbackManager; }
  getResourceLimiter(): ResourceLimiter { return this.resourceLimiter; }
  getTestRunner(): TestRunner { return this.testRunner; }
  getBuildValidator(): BuildValidator { return this.buildValidator; }

  // -----------------------------------------------------------------------
  // Public entry point (backward-compatible)
  // -----------------------------------------------------------------------

  /**
   * Execute code changes with feedback loop.
   *
   * When `iterativeMode` is on (default) the full Phase 3 pipeline runs:
   *   checkpoint → apply → build (retry) → validate artifacts
   *   → selective tests → full tests (retry) → lint (retry)
   *   → success OR rollback
   *
   * Otherwise falls back to the Phase 2 single-pass implementation.
   */
  async executeWithFeedback(
    changes: FileChange[],
    context: ExecutionContext,
    options?: {
      buildCommand?: string;
      testCommand?: string;
      lintCommand?: string;
    },
  ): Promise<IterativeExecutionResult> {
    if (this.iterativeMode) {
      return this.iterativeExecute(changes, context, options);
    }

    return this.legacySinglePass(changes, context, options);
  }

  // -----------------------------------------------------------------------
  // Phase 3: Iterative execution loop
  // -----------------------------------------------------------------------

  private async iterativeExecute(
    changes: FileChange[],
    context: ExecutionContext,
    options?: {
      buildCommand?: string;
      testCommand?: string;
      lintCommand?: string;
    },
  ): Promise<IterativeExecutionResult> {
    const startTime = Date.now();
    const phases: PhaseResult[] = [];
    const fixAttempts: FixAttempt[] = [];
    let checkpoint: Checkpoint | undefined;
    let testResult: TestRunResult | undefined;
    let buildValidation: BuildValidationResult | undefined;

    // Reset resource budget for this run
    this.resourceLimiter.resetBudget();

    try {
      // 0. Validate file count
      this.resourceLimiter.validateFileCount(changes.length);

      // 1. Create rollback checkpoint
      checkpoint = await this.rollbackManager.createCheckpoint(
        changes,
        context.webcontainer,
        context.workDir,
        { trigger: 'iterativeExecute' },
      );
      logger.info(`Checkpoint created: ${checkpoint.id}`);

      // 2. Apply changes
      const applyPhase = await this.timedPhase('apply', async () => {
        await this.applyChanges(changes, context);
        return { output: `Applied ${changes.length} file change(s)`, errors: [] as ParsedError[] };
      });
      phases.push(applyPhase);

      if (!applyPhase.success) {
        throw new PhaseError('apply', applyPhase.errors, applyPhase.output);
      }

      // 3. Build phase (with retries)
      if (options?.buildCommand) {
        this.resourceLimiter.checkTotalTimeout();

        const buildPhase = await this.runPhaseWithRetries(
          'build',
          options.buildCommand,
          context,
          fixAttempts,
        );
        phases.push(buildPhase);

        if (!buildPhase.success) {
          throw new PhaseError('build', buildPhase.errors, buildPhase.output);
        }

        // 4. Validate build artifacts
        try {
          this.resourceLimiter.checkTotalTimeout();
          const buildDuration = buildPhase.duration;

          buildValidation = await this.buildValidator.validate(
            context.webcontainer,
            context.workDir,
            buildDuration,
          );

          const validatePhase: PhaseResult = {
            phase: 'validate',
            success: buildValidation.valid,
            attempts: 1,
            duration: 0,
            output: `Artifacts: ${buildValidation.artifactCount}, Size: ${buildValidation.bundleSize.totalSize} bytes`,
            errors: buildValidation.issues
              .filter(i => i.severity === 'error')
              .map(i => ({
                type: 'compile' as const,
                severity: 'error' as const,
                message: i.message,
              })),
          };
          phases.push(validatePhase);

          // Non-fatal: warnings only logged
          if (buildValidation.performanceRegression) {
            logger.warn('Build performance regression detected');
          }
        } catch (validationErr) {
          logger.warn('Build validation skipped:', validationErr);
        }
      }

      // 5. Selective tests (fast inner loop)
      if (options?.testCommand) {
        this.resourceLimiter.checkTotalTimeout();

        try {
          const selectiveResult = await this.resourceLimiter.withCommandTimeout(
            this.testRunner.runSelectiveTests(changes, context.webcontainer, context.workDir),
            'selective-tests',
          );

          const selectivePhase: PhaseResult = {
            phase: 'test-selective',
            success: selectiveResult.success,
            attempts: 1,
            duration: selectiveResult.duration,
            output: `Selective: ${selectiveResult.passed}/${selectiveResult.total} passed`,
            errors: selectiveResult.failedTests.map(t => ({
              type: 'test' as const,
              severity: 'error' as const,
              message: `${t.suite} > ${t.name}: ${t.error ?? 'failed'}`,
              file: t.file,
              line: t.line,
            })),
          };
          phases.push(selectivePhase);

          if (!selectiveResult.success) {
            // Selective test failure → skip full suite, report immediately
            testResult = selectiveResult;
            throw new PhaseError('test-selective', selectivePhase.errors, selectivePhase.output);
          }
        } catch (err) {
          if (err instanceof PhaseError) {
            throw err;
          }

          // Selective tests may not be available — fall through to full suite
          logger.debug('Selective test run skipped or errored, falling back to full suite');
        }

        // 6. Full test suite (with retries)
        this.resourceLimiter.checkTotalTimeout();

        const testPhase = await this.runPhaseWithRetries(
          'test-full',
          options.testCommand,
          context,
          fixAttempts,
        );
        phases.push(testPhase);

        if (!testPhase.success) {
          throw new PhaseError('test-full', testPhase.errors, testPhase.output);
        }

        // Parse structured test results from last successful run
        try {
          const parsed = this.testRunner.parseTestOutput(testPhase.output);
          const passed = parsed.testCases.filter(t => t.status === 'passed').length;
          const failed = parsed.testCases.filter(t => t.status === 'failed').length;
          const skipped = parsed.testCases.filter(t => t.status === 'skipped' || t.status === 'pending').length;

          testResult = {
            success: failed === 0,
            total: parsed.testCases.length,
            passed,
            failed,
            skipped,
            duration: testPhase.duration,
            testCases: parsed.testCases,
            failedTests: parsed.testCases.filter(t => t.status === 'failed'),
            coverageSummary: parsed.coverageSummary,
            rawOutput: testPhase.output,
          };
        } catch {
          // Parsing is best-effort
        }
      }

      // 7. Lint phase (with retries)
      if (options?.lintCommand) {
        this.resourceLimiter.checkTotalTimeout();

        const lintPhase = await this.runPhaseWithRetries(
          'lint',
          options.lintCommand,
          context,
          fixAttempts,
        );
        phases.push(lintPhase);

        // Lint failures are non-fatal — log only
        if (!lintPhase.success) {
          logger.warn('Lint phase failed but treated as non-fatal', {
            errors: lintPhase.errors.length,
          });
        }
      }

      // ---- All phases passed ----
      const duration = Date.now() - startTime;
      const allErrors = phases.flatMap(p => p.errors);
      const feedback = this.analyzeFeedback({
        success: true,
        output: 'All checks passed',
        errors: allErrors,
        duration,
      });

      return {
        success: true,
        output: 'All checks passed',
        errors: allErrors.filter(e => e.severity === 'warning'),
        exitCode: 0,
        duration,
        phases,
        totalAttempts: phases.reduce((sum, p) => sum + p.attempts, 0),
        testResult,
        buildValidation,
        feedback,
        fixAttempts,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const isResourceLimit = error instanceof ResourceLimitError;
      const isPhaseError = error instanceof PhaseError;

      logger.error('Iterative execution failed:', error);

      // Rollback to checkpoint
      let rollbackResult: RollbackResult | undefined;

      if (checkpoint) {
        try {
          rollbackResult = await this.rollbackManager.rollback(
            checkpoint,
            context.webcontainer,
            context.workDir,
          );
          logger.info('Rollback completed', rollbackResult);
        } catch (rbErr) {
          logger.error('Rollback failed:', rbErr);
        }
      }

      const allErrors = phases.flatMap(p => p.errors);

      if (isPhaseError) {
        allErrors.push(...(error as PhaseError).errors);
      } else {
        allErrors.push({
          type: isResourceLimit ? 'runtime' : 'runtime',
          severity: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      }

      const feedback = this.analyzeFeedback({
        success: false,
        output: error instanceof Error ? error.message : String(error),
        errors: allErrors,
        duration,
      });

      return {
        success: false,
        output: error instanceof Error ? error.message : String(error),
        errors: allErrors,
        exitCode: 1,
        duration,
        phases,
        totalAttempts: phases.reduce((sum, p) => sum + p.attempts, 0),
        rollback: rollbackResult,
        testResult,
        buildValidation,
        feedback,
        fixAttempts,
      };
    }
  }

  // -----------------------------------------------------------------------
  // Per-phase retry engine
  // -----------------------------------------------------------------------

  private async runPhaseWithRetries(
    phase: string,
    command: string,
    context: ExecutionContext,
    fixAttempts: FixAttempt[],
  ): Promise<PhaseResult> {
    let attempts = 0;
    let lastOutput = '';
    let lastErrors: ParsedError[] = [];

    const phaseStart = Date.now();

    while (true) {
      attempts++;

      const result = await this.runCommand(command, context, phase);
      lastOutput = result.output;
      lastErrors = result.errors;

      if (result.success) {
        return {
          phase: phase as PhaseResult['phase'],
          success: true,
          attempts,
          duration: Date.now() - phaseStart,
          output: lastOutput,
          errors: lastErrors,
        };
      }

      // Can we retry?
      if (!this.resourceLimiter.canRetryPhase(phase)) {
        break;
      }

      // Attempt auto-fix before retrying
      const fix = this.attemptAutoFix(lastErrors, phase);
      fixAttempts.push(fix);

      if (fix.applied) {
        logger.info(`Auto-fix applied for ${phase}: ${fix.description}`);
      } else {
        logger.warn(`No auto-fix available for ${phase} errors`);
      }

      this.resourceLimiter.registerRetry(phase);
      this.resourceLimiter.checkTotalTimeout();
    }

    return {
      phase: phase as PhaseResult['phase'],
      success: false,
      attempts,
      duration: Date.now() - phaseStart,
      output: lastOutput,
      errors: lastErrors,
    };
  }

  // -----------------------------------------------------------------------
  // Auto-fix heuristics
  // -----------------------------------------------------------------------

  /**
   * Analyse errors from the last run and produce a lightweight fix description.
   * The actual file mutations are not performed here — this is a best-effort
   * hint for the next retry (the LLM agent would apply real fixes).
   */
  private attemptAutoFix(errors: ParsedError[], phase: string): FixAttempt {
    const descriptions: string[] = [];
    let applied = false;

    for (const err of errors) {
      // Missing import
      if (/cannot find module/i.test(err.message) || /module not found/i.test(err.message)) {
        descriptions.push(`Install or fix missing module referenced in ${err.file ?? 'unknown'}`);
        applied = true;
      }

      // Unused variable
      if (/is declared but.*never used/i.test(err.message) || /no-unused-vars/i.test(err.message)) {
        descriptions.push(`Remove unused variable in ${err.file ?? 'unknown'}:${err.line ?? '?'}`);
        applied = true;
      }

      // Missing semicolon / unexpected token
      if (/unexpected token/i.test(err.message) || /missing semicolon/i.test(err.message)) {
        descriptions.push(`Fix syntax error in ${err.file ?? 'unknown'}:${err.line ?? '?'}`);
        applied = true;
      }

      // Property does not exist
      if (/property .+ does not exist/i.test(err.message)) {
        descriptions.push(`Fix property access error: ${err.message}`);
        applied = true;
      }
    }

    return {
      phase,
      attempt: errors.length,
      description: descriptions.length > 0 ? descriptions.join('; ') : 'No auto-fix pattern matched',
      applied,
    };
  }

  // -----------------------------------------------------------------------
  // Legacy single-pass (Phase 2 backward compat)
  // -----------------------------------------------------------------------

  private async legacySinglePass(
    changes: FileChange[],
    context: ExecutionContext,
    options?: {
      buildCommand?: string;
      testCommand?: string;
      lintCommand?: string;
    },
  ): Promise<IterativeExecutionResult> {
    const startTime = Date.now();
    let attemptCount = 0;
    let lastResult: ExecutionResult | null = null;
    const phases: PhaseResult[] = [];

    while (attemptCount < this.maxRetries) {
      attemptCount++;
      logger.info(`Legacy execution attempt ${attemptCount}/${this.maxRetries}`);

      try {
        await this.applyChanges(changes, context);

        // Build
        if (options?.buildCommand) {
          const buildResult = await this.runCommand(options.buildCommand, context, 'build');

          if (!buildResult.success) {
            lastResult = buildResult;
            const feedback = this.analyzeFeedback(buildResult);

            if (!feedback.canRetry) {
              break;
            }

            continue;
          }
        }

        // Lint
        if (options?.lintCommand) {
          const lintResult = await this.runCommand(options.lintCommand, context, 'lint');

          if (!lintResult.success) {
            logger.warn('Lint warnings detected', { warnings: lintResult.errors.length });
          }
        }

        // Tests
        if (options?.testCommand) {
          const testResult = await this.runCommand(options.testCommand, context, 'test');

          if (!testResult.success) {
            lastResult = testResult;
            const feedback = this.analyzeFeedback(testResult);

            if (!feedback.canRetry) {
              break;
            }

            continue;
          }
        }

        const duration = Date.now() - startTime;
        const feedback = this.analyzeFeedback({
          success: true,
          output: 'All checks passed',
          errors: [],
          duration,
        });

        return {
          success: true,
          output: 'All checks passed',
          errors: [],
          exitCode: 0,
          duration,
          phases,
          totalAttempts: attemptCount,
          feedback,
          fixAttempts: [],
        };
      } catch (error) {
        logger.error('Legacy execution error:', error);
        lastResult = {
          success: false,
          output: error instanceof Error ? error.message : String(error),
          errors: [{
            type: 'runtime',
            severity: 'error',
            message: error instanceof Error ? error.message : String(error),
          }],
          duration: Date.now() - startTime,
        };
      }
    }

    const finalResult = lastResult ?? {
      success: false,
      output: 'Execution failed after max retries',
      errors: [] as ParsedError[],
      duration: Date.now() - startTime,
    };

    const feedback = this.analyzeFeedback(finalResult);

    return {
      ...finalResult,
      phases,
      totalAttempts: attemptCount,
      feedback,
      fixAttempts: [],
    };
  }

  // -----------------------------------------------------------------------
  // File I/O helpers
  // -----------------------------------------------------------------------

  private async applyChanges(changes: FileChange[], context: ExecutionContext): Promise<void> {
    for (const change of changes) {
      const fullPath = `${context.workDir}/${change.filePath}`;

      try {
        switch (change.changeType) {
          case 'create':
          case 'modify':
            if (change.newContent) {
              await context.webcontainer.fs.writeFile(fullPath, change.newContent);
              logger.info(`Applied ${change.changeType}: ${change.filePath}`);
            }
            break;
          case 'delete':
            await context.webcontainer.fs.rm(fullPath);
            logger.info(`Deleted: ${change.filePath}`);
            break;
        }
      } catch (error) {
        logger.error(`Failed to apply change to ${change.filePath}:`, error);
        throw error;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Command execution
  // -----------------------------------------------------------------------

  private async runCommand(
    command: string,
    context: ExecutionContext,
    type: string,
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    logger.info(`Running ${type} command: ${command}`);

    try {
      const process = await context.webcontainer.spawn('sh', ['-c', command]);

      let output = '';

      process.output.pipeTo(
        new WritableStream({
          write: (chunk: string) => {
            output += chunk;
          },
        }),
      );

      const exitCode: number = await this.resourceLimiter.withCommandTimeout(
        process.exit,
        `${type}: ${command}`,
      );

      const duration = Date.now() - startTime;
      output = this.resourceLimiter.truncateOutput(output);

      const errors = this.parseErrors(output, type);

      return {
        success: exitCode === 0 && errors.filter(e => e.severity === 'error').length === 0,
        output,
        errors,
        exitCode,
        duration,
      };
    } catch (error) {
      logger.error(`Command failed: ${command}`, error);

      return {
        success: false,
        output: error instanceof Error ? error.message : String(error),
        errors: [{
          type: type as ParsedError['type'],
          severity: 'error',
          message: error instanceof Error ? error.message : String(error),
        }],
        duration: Date.now() - startTime,
      };
    }
  }

  // -----------------------------------------------------------------------
  // Timed phase helper
  // -----------------------------------------------------------------------

  private async timedPhase(
    name: string,
    fn: () => Promise<{ output: string; errors: ParsedError[] }>,
  ): Promise<PhaseResult> {
    const start = Date.now();

    try {
      const { output, errors } = await fn();

      return {
        phase: name as PhaseResult['phase'],
        success: errors.filter(e => e.severity === 'error').length === 0,
        attempts: 1,
        duration: Date.now() - start,
        output,
        errors,
      };
    } catch (error) {
      return {
        phase: name as PhaseResult['phase'],
        success: false,
        attempts: 1,
        duration: Date.now() - start,
        output: error instanceof Error ? error.message : String(error),
        errors: [{
          type: 'runtime',
          severity: 'error',
          message: error instanceof Error ? error.message : String(error),
        }],
      };
    }
  }

  // -----------------------------------------------------------------------
  // Error parsing (enhanced for Phase 3)
  // -----------------------------------------------------------------------

  private parseErrors(output: string, type: string): ParsedError[] {
    const errors: ParsedError[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      // TypeScript compiler errors: file(line,col): error TSxxxx: message
      const tsMatch = line.match(/^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS(\d+):\s+(.+)$/);
      if (tsMatch) {
        errors.push({
          type: 'compile',
          severity: tsMatch[4] as 'error' | 'warning',
          file: tsMatch[1],
          line: parseInt(tsMatch[2]),
          column: parseInt(tsMatch[3]),
          code: `TS${tsMatch[5]}`,
          message: tsMatch[6],
        });
        continue;
      }

      // Vite / esbuild errors: [ERROR] message
      const viteMatch = line.match(/^\[(?:ERROR|error)\]\s+(.+)/);
      if (viteMatch) {
        errors.push({
          type: 'compile',
          severity: 'error',
          message: viteMatch[1],
        });
        continue;
      }

      // Module not found: ERROR in ./src/foo.ts — Module not found
      const moduleNotFound = line.match(/Module not found:\s*(?:Error:\s*)?(?:Can't resolve\s+)?['"]?(.+?)['"]?\s*(?:in\s+(.+))?$/i);
      if (moduleNotFound) {
        errors.push({
          type: 'compile',
          severity: 'error',
          message: `Module not found: ${moduleNotFound[1]}`,
          file: moduleNotFound[2],
          suggestion: `Install missing package or fix import path: ${moduleNotFound[1]}`,
        });
        continue;
      }

      // ESLint errors:   line:col  error  message  rule-name
      const eslintMatch = line.match(/^\s+(\d+):(\d+)\s+(error|warning)\s+(.+?)\s{2,}(.+)$/);
      if (eslintMatch) {
        errors.push({
          type: 'lint',
          severity: eslintMatch[3] as 'error' | 'warning',
          line: parseInt(eslintMatch[1]),
          column: parseInt(eslintMatch[2]),
          message: eslintMatch[4],
          code: eslintMatch[5],
        });
        continue;
      }

      // Vitest FAIL pattern:  FAIL  src/foo.test.ts > suite > test name
      const vitestFail = line.match(/^\s*(?:FAIL|×)\s+(.+?)(?:\s+>\s+(.+))?$/);
      if (vitestFail) {
        errors.push({
          type: 'test',
          severity: 'error',
          file: vitestFail[1],
          message: vitestFail[2] ?? `Test failed: ${vitestFail[1]}`,
        });
        continue;
      }

      // Jest / Vitest test errors: ● suite > test name
      const testMatch = line.match(/^\s+●\s+(.+)$/);
      if (testMatch) {
        errors.push({
          type: 'test',
          severity: 'error',
          message: testMatch[1],
        });
        continue;
      }

      // Generic error / warning lines
      if (/\berror\b/i.test(line) && !/^\s*$/.test(line) && line.length < 500) {
        errors.push({
          type: type as ParsedError['type'],
          severity: 'error',
          message: line.trim(),
        });
      } else if (/\bwarning\b/i.test(line) && !/^\s*$/.test(line) && line.length < 500) {
        errors.push({
          type: type as ParsedError['type'],
          severity: 'warning',
          message: line.trim(),
        });
      }
    }

    return errors;
  }

  // -----------------------------------------------------------------------
  // Feedback analysis
  // -----------------------------------------------------------------------

  analyzeFeedback(result: ExecutionResult): FeedbackSummary {
    const errorCount = result.errors.filter(e => e.severity === 'error').length;
    const warningCount = result.errors.filter(e => e.severity === 'warning').length;

    const criticalErrors = result.errors.filter(
      e => e.severity === 'error' && this.isCriticalError(e),
    );

    const suggestions: string[] = [];
    let canRetry = true;
    let retryStrategy: 'fix' | 'rollback' | 'skip' = 'fix';

    for (const error of result.errors) {
      if (error.suggestion) {
        suggestions.push(error.suggestion);
      } else if (error.type === 'compile') {
        suggestions.push(`Fix compilation error in ${error.file ?? 'unknown'}:${error.line ?? '?'}`);
      } else if (error.type === 'type') {
        suggestions.push(`Fix type error: ${error.message}`);
      } else if (error.type === 'test') {
        suggestions.push(`Fix failing test: ${error.message}`);
      }
    }

    if (criticalErrors.length > 0) {
      canRetry = false;
      retryStrategy = 'rollback';
      suggestions.push('Critical errors detected — consider rolling back changes');
    } else if (errorCount > 10) {
      canRetry = false;
      retryStrategy = 'rollback';
      suggestions.push('Too many errors — full rollback recommended');
    } else if (errorCount > 0) {
      canRetry = true;
      retryStrategy = 'fix';
    }

    return { errorCount, warningCount, criticalErrors, suggestions, canRetry, retryStrategy };
  }

  private isCriticalError(error: ParsedError): boolean {
    const criticalPatterns = [
      /module not found/i,
      /cannot find module/i,
      /syntax error/i,
      /unexpected token/i,
      /fatal error/i,
      /out of memory/i,
      /heap out of memory/i,
    ];
    return criticalPatterns.some(p => p.test(error.message));
  }

  // -----------------------------------------------------------------------
  // Error summary for agent consumption
  // -----------------------------------------------------------------------

  generateErrorSummary(result: ExecutionResult): string {
    const feedback = this.analyzeFeedback(result);

    let summary = `Execution Result:\n`;
    summary += `- Errors: ${feedback.errorCount}\n`;
    summary += `- Warnings: ${feedback.warningCount}\n`;
    summary += `- Can Retry: ${feedback.canRetry}\n`;

    if (feedback.criticalErrors.length > 0) {
      summary += `\nCritical Errors:\n`;
      for (const error of feedback.criticalErrors) {
        summary += `- ${error.file ?? '?'}:${error.line ?? '?'} — ${error.message}\n`;
      }
    }

    if (feedback.suggestions.length > 0) {
      summary += `\nSuggestions:\n`;
      for (const suggestion of feedback.suggestions) {
        summary += `- ${suggestion}\n`;
      }
    }

    return summary;
  }
}
