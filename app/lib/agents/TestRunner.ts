/**
 * TestRunner — Phase 3
 *
 * Smart test selection and execution intelligence.  Instead of naïvely
 * running the full suite after every change, this module:
 *
 *  1. Determines which test files are affected by the changed source files.
 *  2. Runs only those tests first (fast inner loop).
 *  3. Falls back to the full suite for the final validation pass.
 *  4. Parses structured test output (Jest / Vitest) into actionable results.
 *  5. Keeps lightweight timing data so the evaluation system can track
 *     test-performance regressions over time.
 *
 * Integration:
 *  - Called by the enhanced ExecutionFeedbackLoop during its test phase.
 *  - Uses WebContainer.spawn() for execution (same as Phase 2 runCommand).
 *  - Feeds parsed results into AgentEvaluationSystem.
 */

import { createScopedLogger } from '~/utils/logger';
import type { FileChange } from './types';

const logger = createScopedLogger('TestRunner');

type WebContainer = any;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TestCase {
  name: string;
  suite: string;
  status: 'passed' | 'failed' | 'skipped' | 'pending';
  duration: number; // ms
  error?: string;
  file?: string;
  line?: number;
}

export interface TestRunResult {
  success: boolean;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  testCases: TestCase[];
  failedTests: TestCase[];
  coverageSummary?: CoverageSummary;
  rawOutput: string;
}

export interface CoverageSummary {
  lines: number;
  branches: number;
  functions: number;
  statements: number;
}

export interface TestRunnerConfig {
  /** Command used when running the full suite (default: npm test) */
  fullSuiteCommand?: string;
  /** Command template for running specific files.  `{files}` is replaced. */
  selectiveCommandTemplate?: string;
  /** Test-file glob extensions (default: .test.ts, .spec.ts, etc.) */
  testExtensions?: string[];
  /** Source → test mapping conventions */
  testDirMappings?: Array<{ srcDir: string; testDir: string }>;
  /** Maximum time for a test run (ms) */
  timeout?: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class TestRunner {
  private config: Required<TestRunnerConfig>;
  /** History of test durations keyed by test file */
  private timingHistory: Map<string, number[]> = new Map();

  constructor(config: TestRunnerConfig = {}) {
    this.config = {
      fullSuiteCommand: config.fullSuiteCommand ?? 'npm test -- --reporter=verbose',
      selectiveCommandTemplate:
        config.selectiveCommandTemplate ?? 'npx vitest run {files} --reporter=verbose',
      testExtensions: config.testExtensions ?? [
        '.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx',
        '.test.js', '.test.jsx', '.spec.js', '.spec.jsx',
      ],
      testDirMappings: config.testDirMappings ?? [
        { srcDir: 'src/', testDir: 'src/' },           // co-located
        { srcDir: 'src/', testDir: '__tests__/' },      // __tests__ sibling
        { srcDir: 'app/', testDir: 'app/' },            // bolt.diy convention
        { srcDir: 'lib/', testDir: 'lib/' },
      ],
      timeout: config.timeout ?? 120_000,
    };

    logger.info('TestRunner initialized', {
      fullSuiteCommand: this.config.fullSuiteCommand,
    });
  }

  // -------------------------------------------------------------------------
  // Smart test selection
  // -------------------------------------------------------------------------

  /**
   * Given a set of file changes, return the test files that should be run.
   *
   * Strategy:
   *  1. Direct hit — the changed file *is* a test file.
   *  2. Co-located — foo.ts → foo.test.ts
   *  3. Mapping — src/utils/foo.ts → __tests__/utils/foo.test.ts
   *  4. Import graph (TODO: could use AST parser from Phase 1 in the future)
   */
  selectTestsForChanges(changes: FileChange[]): string[] {
    const testFiles = new Set<string>();

    for (const change of changes) {
      const path = change.filePath;

      // 1. Direct hit
      if (this.isTestFile(path)) {
        testFiles.add(path);
        continue;
      }

      // 2. Co-located (e.g. foo.ts → foo.test.ts)
      for (const ext of this.config.testExtensions) {
        const base = this.stripExtension(path);
        testFiles.add(base + ext);
      }

      // 3. Mapping conventions
      for (const { srcDir, testDir } of this.config.testDirMappings) {
        if (path.startsWith(srcDir)) {
          const relative = path.slice(srcDir.length);
          const base = this.stripExtension(relative);

          for (const ext of this.config.testExtensions) {
            testFiles.add(testDir + base + ext);
          }
        }
      }
    }

    const result = Array.from(testFiles);

    logger.info(`Selected ${result.length} candidate test files for ${changes.length} changes`);

    return result;
  }

  // -------------------------------------------------------------------------
  // Execution
  // -------------------------------------------------------------------------

  /**
   * Run only the test files affected by the changes (fast inner loop).
   */
  async runSelectiveTests(
    changes: FileChange[],
    webcontainer: WebContainer,
    workDir: string,
  ): Promise<TestRunResult> {
    const candidates = this.selectTestsForChanges(changes);

    if (candidates.length === 0) {
      logger.info('No candidate test files found — skipping selective run');
      return this.emptyResult();
    }

    // Verify which candidate files actually exist on disk
    const existing = await this.filterExistingFiles(candidates, webcontainer, workDir);

    if (existing.length === 0) {
      logger.info('No matching test files found on disk — skipping selective run');
      return this.emptyResult();
    }

    const command = this.config.selectiveCommandTemplate.replace(
      '{files}',
      existing.join(' '),
    );

    logger.info(`Running selective tests: ${command}`);

    return this.executeTestCommand(command, webcontainer);
  }

  /**
   * Run the full test suite (final validation pass).
   */
  async runFullSuite(webcontainer: WebContainer): Promise<TestRunResult> {
    logger.info(`Running full suite: ${this.config.fullSuiteCommand}`);
    return this.executeTestCommand(this.config.fullSuiteCommand, webcontainer);
  }

  // -------------------------------------------------------------------------
  // Output parsing
  // -------------------------------------------------------------------------

  /**
   * Parse Jest / Vitest verbose output into structured TestCase objects.
   */
  parseTestOutput(output: string): { testCases: TestCase[]; coverageSummary?: CoverageSummary } {
    const testCases: TestCase[] = [];
    let currentSuite = '';

    const lines = output.split('\n');

    for (const line of lines) {
      // Suite header — e.g. "  PASS src/utils/foo.test.ts" or "FAIL ..."
      const suiteMatch = line.match(/^\s*(PASS|FAIL|SKIP)\s+(.+)$/);

      if (suiteMatch) {
        currentSuite = suiteMatch[2].trim();
        continue;
      }

      // Individual test — e.g. "  ✓ should add numbers (3 ms)"
      const passMatch = line.match(/^\s+[✓✔√]\s+(.+?)(?:\s+\((\d+)\s*m?s\))?$/);

      if (passMatch) {
        testCases.push({
          name: passMatch[1].trim(),
          suite: currentSuite,
          status: 'passed',
          duration: passMatch[2] ? parseInt(passMatch[2], 10) : 0,
        });
        continue;
      }

      // Failed test — e.g. "  ✕ should add numbers (5 ms)"
      const failMatch = line.match(/^\s+[✕✗×]\s+(.+?)(?:\s+\((\d+)\s*m?s\))?$/);

      if (failMatch) {
        testCases.push({
          name: failMatch[1].trim(),
          suite: currentSuite,
          status: 'failed',
          duration: failMatch[2] ? parseInt(failMatch[2], 10) : 0,
        });
        continue;
      }

      // Skipped / pending
      const skipMatch = line.match(/^\s+[○◌-]\s+(.+)$/);

      if (skipMatch) {
        testCases.push({
          name: skipMatch[1].trim(),
          suite: currentSuite,
          status: 'skipped',
          duration: 0,
        });
        continue;
      }

      // Vitest-style "✓ suiteName > testName 3ms"
      const vitestMatch = line.match(/^\s*[✓✔]\s+(.+?)\s+>\s+(.+?)\s+(\d+)ms$/);

      if (vitestMatch) {
        testCases.push({
          name: vitestMatch[2].trim(),
          suite: vitestMatch[1].trim(),
          status: 'passed',
          duration: parseInt(vitestMatch[3], 10),
        });
        continue;
      }

      const vitestFailMatch = line.match(/^\s*[×✕]\s+(.+?)\s+>\s+(.+?)\s+(\d+)ms$/);

      if (vitestFailMatch) {
        testCases.push({
          name: vitestFailMatch[2].trim(),
          suite: vitestFailMatch[1].trim(),
          status: 'failed',
          duration: parseInt(vitestFailMatch[3], 10),
        });
        continue;
      }
    }

    // Try to parse coverage summary
    const coverageSummary = this.parseCoverageSummary(output);

    return { testCases, coverageSummary };
  }

  /**
   * Extract error messages for failed test cases from raw output.
   */
  extractFailureDetails(output: string, failedTests: TestCase[]): TestCase[] {
    // Look for blocks between "● <test name>" and the next "●" or end
    const errorBlocks = output.split(/^\s*●\s+/m).filter(Boolean);

    for (const block of errorBlocks) {
      const firstLine = block.split('\n')[0].trim();
      const matching = failedTests.find(t =>
        firstLine.includes(t.name) || firstLine.includes(t.suite),
      );

      if (matching) {
        // Grab the first ~20 lines as the error description
        matching.error = block.split('\n').slice(0, 20).join('\n').trim();

        // Try to pull file:line from "at Object.<anonymous> (file:line:col)"
        const locMatch = block.match(/at\s+.+\((.+):(\d+):\d+\)/);

        if (locMatch) {
          matching.file = locMatch[1];
          matching.line = parseInt(locMatch[2], 10);
        }
      }
    }

    return failedTests;
  }

  // -------------------------------------------------------------------------
  // Timing & regression tracking
  // -------------------------------------------------------------------------

  /**
   * Record the duration for a test file so we can detect regressions later.
   */
  recordTiming(testFile: string, durationMs: number): void {
    const history = this.timingHistory.get(testFile) ?? [];
    history.push(durationMs);

    // keep only the last 10 runs
    if (history.length > 10) {
      history.shift();
    }

    this.timingHistory.set(testFile, history);
  }

  /**
   * Detect test files whose latest duration is significantly above
   * their recent average (>2× default).
   */
  detectSlowTests(threshold = 2): Array<{ file: string; avg: number; latest: number }> {
    const slow: Array<{ file: string; avg: number; latest: number }> = [];

    for (const [file, history] of this.timingHistory) {
      if (history.length < 2) continue;

      const latest = history[history.length - 1];
      const avg = history.slice(0, -1).reduce((a, b) => a + b, 0) / (history.length - 1);

      if (latest > avg * threshold) {
        slow.push({ file, avg: Math.round(avg), latest });
      }
    }

    return slow;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async executeTestCommand(
    command: string,
    webcontainer: WebContainer,
  ): Promise<TestRunResult> {
    const start = Date.now();

    try {
      const proc = await webcontainer.spawn('sh', ['-c', command]);
      let output = '';

      await proc.output.pipeTo(
        new WritableStream({
          write(chunk: string) {
            output += chunk;
          },
        }),
      );

      const exitCode = await proc.exit;
      const duration = Date.now() - start;

      const { testCases, coverageSummary } = this.parseTestOutput(output);
      const failedCases = testCases.filter(t => t.status === 'failed');

      // Enrich failures with error details
      const enrichedFailures = this.extractFailureDetails(output, failedCases);

      // Record timing per suite
      const suiteFiles = new Set(testCases.map(t => t.suite).filter(Boolean));

      for (const file of suiteFiles) {
        const suiteDuration = testCases
          .filter(t => t.suite === file)
          .reduce((sum, t) => sum + t.duration, 0);
        this.recordTiming(file, suiteDuration);
      }

      return {
        success: exitCode === 0 && enrichedFailures.length === 0,
        total: testCases.length,
        passed: testCases.filter(t => t.status === 'passed').length,
        failed: enrichedFailures.length,
        skipped: testCases.filter(t => t.status === 'skipped' || t.status === 'pending').length,
        duration,
        testCases,
        failedTests: enrichedFailures,
        coverageSummary,
        rawOutput: output,
      };
    } catch (err) {
      logger.error('Test execution failed', err);

      return {
        success: false,
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: Date.now() - start,
        testCases: [],
        failedTests: [],
        rawOutput: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private parseCoverageSummary(output: string): CoverageSummary | undefined {
    // Jest/Vitest coverage table:  "Stmts   : 85.71% | Branch : 60%  | ..."
    const stmtMatch = output.match(/Stmts?\s*:\s*([\d.]+)%/i);
    const branchMatch = output.match(/Branch(?:es)?\s*:\s*([\d.]+)%/i);
    const funcMatch = output.match(/Funcs?\s*:\s*([\d.]+)%/i);
    const lineMatch = output.match(/Lines?\s*:\s*([\d.]+)%/i);

    if (stmtMatch || lineMatch) {
      return {
        statements: stmtMatch ? parseFloat(stmtMatch[1]) : 0,
        branches: branchMatch ? parseFloat(branchMatch[1]) : 0,
        functions: funcMatch ? parseFloat(funcMatch[1]) : 0,
        lines: lineMatch ? parseFloat(lineMatch[1]) : 0,
      };
    }

    return undefined;
  }

  private async filterExistingFiles(
    candidates: string[],
    webcontainer: WebContainer,
    workDir: string,
  ): Promise<string[]> {
    const existing: string[] = [];

    for (const file of candidates) {
      const fullPath = `${workDir}/${file}`;

      try {
        await webcontainer.fs.readFile(fullPath, 'utf-8');
        existing.push(file);
      } catch {
        // file doesn't exist — skip
      }
    }

    return existing;
  }

  private isTestFile(path: string): boolean {
    return this.config.testExtensions.some(ext => path.endsWith(ext));
  }

  private stripExtension(path: string): string {
    return path.replace(/\.[^/.]+$/, '');
  }

  private emptyResult(): TestRunResult {
    return {
      success: true,
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: 0,
      testCases: [],
      failedTests: [],
      rawOutput: '',
    };
  }
}
