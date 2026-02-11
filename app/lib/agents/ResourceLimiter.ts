/**
 * ResourceLimiter — Phase 3
 *
 * Enforces hard execution limits (time, retries, output size) so that a
 * runaway agent or build can never hang the browser tab indefinitely.
 *
 * Integration:
 *  - Wraps every command execution inside ExecutionFeedbackLoop
 *  - Provides a withTimeout helper used by the iterative feedback loop
 *  - Budget tracker counts overall resource usage per orchestration run
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ResourceLimiter');

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ResourceLimits {
  /** Max wall-clock time for a single command, ms (default 120 s) */
  commandTimeout: number;
  /** Max total wall-clock time for the entire feedback loop, ms (default 300 s) */
  totalTimeout: number;
  /** Max retry attempts per phase (build / test / lint) */
  maxRetriesPerPhase: number;
  /** Max total retries across all phases */
  maxTotalRetries: number;
  /** Max output bytes to keep in memory per command (prevents OOM on huge logs) */
  maxOutputBytes: number;
  /** Max number of files a single task may touch */
  maxFilesPerTask: number;
}

export interface ResourceBudget {
  startedAt: number;
  totalRetries: number;
  phaseRetries: Record<string, number>;
  outputBytes: number;
  filesChanged: number;
  timedOut: boolean;
  limitExceeded: string | null;
}

export interface ResourceLimiterConfig {
  limits?: Partial<ResourceLimits>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class ResourceLimiter {
  readonly limits: ResourceLimits;
  private budget: ResourceBudget;

  constructor(config: ResourceLimiterConfig = {}) {
    this.limits = {
      commandTimeout: config.limits?.commandTimeout ?? 120_000,
      totalTimeout: config.limits?.totalTimeout ?? 300_000,
      maxRetriesPerPhase: config.limits?.maxRetriesPerPhase ?? 3,
      maxTotalRetries: config.limits?.maxTotalRetries ?? 8,
      maxOutputBytes: config.limits?.maxOutputBytes ?? 2 * 1024 * 1024, // 2 MB
      maxFilesPerTask: config.limits?.maxFilesPerTask ?? 30,
    };

    this.budget = this.freshBudget();
    logger.info('ResourceLimiter initialized', this.limits);
  }

  // -------------------------------------------------------------------------
  // Budget lifecycle
  // -------------------------------------------------------------------------

  /** Call at the start of every top-level feedback-loop run. */
  resetBudget(): void {
    this.budget = this.freshBudget();
  }

  getBudget(): Readonly<ResourceBudget> {
    return { ...this.budget };
  }

  // -------------------------------------------------------------------------
  // Timeout helpers
  // -------------------------------------------------------------------------

  /**
   * Race `promise` against a per-command timeout.
   * Rejects with a descriptive error if the timeout fires first.
   */
  async withCommandTimeout<T>(promise: Promise<T>, label = 'command'): Promise<T> {
    return this.withTimeout(promise, this.limits.commandTimeout, label);
  }

  /**
   * Check whether the overall total-timeout budget has been exceeded.
   * The caller should invoke this before each new phase.
   */
  checkTotalTimeout(): void {
    const elapsed = Date.now() - this.budget.startedAt;

    if (elapsed >= this.limits.totalTimeout) {
      this.budget.timedOut = true;
      this.budget.limitExceeded = `Total timeout exceeded (${elapsed}ms >= ${this.limits.totalTimeout}ms)`;

      throw new ResourceLimitError(this.budget.limitExceeded);
    }
  }

  /**
   * Remaining ms before total timeout fires.  Useful for dynamically
   * shrinking per-command timeouts as we get close to the hard ceiling.
   */
  remainingTime(): number {
    return Math.max(0, this.limits.totalTimeout - (Date.now() - this.budget.startedAt));
  }

  // -------------------------------------------------------------------------
  // Retry helpers
  // -------------------------------------------------------------------------

  /**
   * Register a retry for `phase` and throw if any retry cap is reached.
   * Returns the new retry count for the phase.
   */
  registerRetry(phase: string): number {
    this.budget.totalRetries++;
    this.budget.phaseRetries[phase] = (this.budget.phaseRetries[phase] ?? 0) + 1;
    const phaseCount = this.budget.phaseRetries[phase];

    if (phaseCount > this.limits.maxRetriesPerPhase) {
      this.budget.limitExceeded =
        `Phase "${phase}" exceeded max retries (${phaseCount} > ${this.limits.maxRetriesPerPhase})`;
      throw new ResourceLimitError(this.budget.limitExceeded);
    }

    if (this.budget.totalRetries > this.limits.maxTotalRetries) {
      this.budget.limitExceeded =
        `Total retries exceeded (${this.budget.totalRetries} > ${this.limits.maxTotalRetries})`;
      throw new ResourceLimitError(this.budget.limitExceeded);
    }

    logger.debug(`Retry registered: phase=${phase} count=${phaseCount} total=${this.budget.totalRetries}`);

    return phaseCount;
  }

  /** True when the phase still has retries available. */
  canRetryPhase(phase: string): boolean {
    const phaseCount = this.budget.phaseRetries[phase] ?? 0;
    return (
      phaseCount < this.limits.maxRetriesPerPhase &&
      this.budget.totalRetries < this.limits.maxTotalRetries
    );
  }

  // -------------------------------------------------------------------------
  // Output-size guard
  // -------------------------------------------------------------------------

  /**
   * Truncate output to `maxOutputBytes` so huge build logs don't blow up
   * browser memory.  Returns the (possibly truncated) string.
   */
  truncateOutput(output: string): string {
    this.budget.outputBytes += output.length;

    if (output.length > this.limits.maxOutputBytes) {
      const half = Math.floor(this.limits.maxOutputBytes / 2);
      const truncated =
        output.slice(0, half) +
        `\n\n... [truncated ${output.length - this.limits.maxOutputBytes} bytes] ...\n\n` +
        output.slice(-half);
      return truncated;
    }

    return output;
  }

  // -------------------------------------------------------------------------
  // File-count guard
  // -------------------------------------------------------------------------

  /** Call before applying changes.  Throws if too many files. */
  validateFileCount(count: number): void {
    this.budget.filesChanged += count;

    if (count > this.limits.maxFilesPerTask) {
      this.budget.limitExceeded =
        `Task touches too many files (${count} > ${this.limits.maxFilesPerTask})`;
      throw new ResourceLimitError(this.budget.limitExceeded);
    }
  }

  // -------------------------------------------------------------------------
  // Generic timeout wrapper
  // -------------------------------------------------------------------------

  private withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.budget.timedOut = true;
        reject(new ResourceLimitError(`Timeout: "${label}" exceeded ${ms}ms`));
      }, ms);

      promise.then(
        (val) => { clearTimeout(timer); resolve(val); },
        (err) => { clearTimeout(timer); reject(err); },
      );
    });
  }

  private freshBudget(): ResourceBudget {
    return {
      startedAt: Date.now(),
      totalRetries: 0,
      phaseRetries: {},
      outputBytes: 0,
      filesChanged: 0,
      timedOut: false,
      limitExceeded: null,
    };
  }
}

// ---------------------------------------------------------------------------
// Custom error class
// ---------------------------------------------------------------------------

export class ResourceLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResourceLimitError';
  }
}
