/**
 * Execution Feedback Loop
 * Integrates with WebContainer and ActionRunner for real code execution
 * Provides error analysis and retry logic with feedback
 */

import { createScopedLogger } from '~/utils/logger';
import type { Task, TaskResult, FileChange } from './types';

const logger = createScopedLogger('ExecutionFeedback');

// Import WebContainer type dynamically to avoid compile errors
type WebContainer = any; // Will be properly typed at runtime
type BoltShell = any;

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

/**
 * Execution feedback loop for autonomous error correction
 */
export class ExecutionFeedbackLoop {
  private maxRetries: number;
  private timeout: number;

  constructor(config?: {
    maxRetries?: number;
    timeout?: number;
  }) {
    this.maxRetries = config?.maxRetries || 3;
    this.timeout = config?.timeout || 120000; // 2 minutes default
  }

  /**
   * Execute code changes with feedback loop
   */
  async executeWithFeedback(
    changes: FileChange[],
    context: ExecutionContext,
    options?: {
      buildCommand?: string;
      testCommand?: string;
      lintCommand?: string;
    }
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    let attemptCount = 0;
    let lastResult: ExecutionResult | null = null;

    while (attemptCount < this.maxRetries) {
      attemptCount++;
      
      logger.info(`Execution attempt ${attemptCount}/${this.maxRetries}`);

      try {
        // Apply changes to WebContainer
        await this.applyChanges(changes, context);

        // Run build/compile
        if (options?.buildCommand) {
          const buildResult = await this.runCommand(
            options.buildCommand,
            context,
            'build'
          );

          if (!buildResult.success) {
            lastResult = buildResult;
            
            // Analyze errors and determine if retry is possible
            const feedback = this.analyzeFeedback(buildResult);
            
            if (!feedback.canRetry) {
              break; // Fatal error, stop retrying
            }

            logger.warn('Build failed, analyzing errors...', {
              errorCount: feedback.errorCount,
              attempt: attemptCount,
            });

            continue; // Try again
          }
        }

        // Run lint
        if (options?.lintCommand) {
          const lintResult = await this.runCommand(
            options.lintCommand,
            context,
            'lint'
          );

          // Lint warnings are not fatal, just log them
          if (!lintResult.success) {
            logger.warn('Lint warnings detected', {
              warnings: lintResult.errors.length,
            });
          }
        }

        // Run tests
        if (options?.testCommand) {
          const testResult = await this.runCommand(
            options.testCommand,
            context,
            'test'
          );

          if (!testResult.success) {
            lastResult = testResult;
            
            const feedback = this.analyzeFeedback(testResult);
            
            if (!feedback.canRetry) {
              break;
            }

            logger.warn('Tests failed, analyzing...', {
              errorCount: feedback.errorCount,
            });

            continue;
          }
        }

        // All checks passed!
        const duration = Date.now() - startTime;
        
        return {
          success: true,
          output: 'All checks passed',
          errors: [],
          exitCode: 0,
          duration,
        };

      } catch (error) {
        logger.error('Execution error:', error);
        
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

    // Max retries reached or fatal error
    return lastResult || {
      success: false,
      output: 'Execution failed after max retries',
      errors: [],
      duration: Date.now() - startTime,
    };
  }

  /**
   * Apply file changes to WebContainer
   */
  private async applyChanges(
    changes: FileChange[],
    context: ExecutionContext
  ): Promise<void> {
    for (const change of changes) {
      const fullPath = `${context.workDir}/${change.filePath}`;

      try {
        switch (change.changeType) {
          case 'create':
          case 'modify':
            if (change.newContent) {
              await context.webcontainer.fs.writeFile(
                fullPath,
                change.newContent
              );
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

  /**
   * Run command in WebContainer shell
   */
  private async runCommand(
    command: string,
    context: ExecutionContext,
    type: string
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    
    logger.info(`Running ${type} command: ${command}`);

    try {
      // Create a promise that will be resolved with the command output
      const process = await context.webcontainer.spawn('sh', ['-c', command]);
      
      let output = '';
      let errorOutput = '';

      // Capture stdout
      process.output.pipeTo(
        new WritableStream({
          write(chunk) {
            output += chunk;
          },
        })
      );

      // Wait for process to complete
      const exitCode = await process.exit;
      const duration = Date.now() - startTime;

      // Parse errors from output
      const errors = this.parseErrors(output + errorOutput, type);

      return {
        success: exitCode === 0 && errors.filter(e => e.severity === 'error').length === 0,
        output: output + errorOutput,
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
          type: type as any,
          severity: 'error',
          message: error instanceof Error ? error.message : String(error),
        }],
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Parse errors from command output
   */
  private parseErrors(output: string, type: string): ParsedError[] {
    const errors: ParsedError[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      // TypeScript compiler errors
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

      // ESLint errors
      const eslintMatch = line.match(/^\s+(\d+):(\d+)\s+(error|warning)\s+(.+?)\s+(.+)$/);
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

      // Jest/Vitest test errors
      const testMatch = line.match(/^\s+●\s+(.+)$/);
      if (testMatch) {
        errors.push({
          type: 'test',
          severity: 'error',
          message: testMatch[1],
        });
        continue;
      }

      // Generic error patterns
      if (line.toLowerCase().includes('error:')) {
        errors.push({
          type: type as any,
          severity: 'error',
          message: line.trim(),
        });
      } else if (line.toLowerCase().includes('warning:')) {
        errors.push({
          type: type as any,
          severity: 'warning',
          message: line.trim(),
        });
      }
    }

    return errors;
  }

  /**
   * Analyze feedback and determine retry strategy
   */
  analyzeFeedback(result: ExecutionResult): FeedbackSummary {
    const errorCount = result.errors.filter(e => e.severity === 'error').length;
    const warningCount = result.errors.filter(e => e.severity === 'warning').length;
    
    const criticalErrors = result.errors.filter(e => 
      e.severity === 'error' && this.isCriticalError(e)
    );

    const suggestions: string[] = [];
    let canRetry = true;
    let retryStrategy: 'fix' | 'rollback' | 'skip' = 'fix';

    // Analyze error patterns and provide suggestions
    for (const error of result.errors) {
      if (error.type === 'compile') {
        suggestions.push(`Fix compilation error in ${error.file}:${error.line}`);
      } else if (error.type === 'type') {
        suggestions.push(`Fix type error: ${error.message}`);
      } else if (error.type === 'test') {
        suggestions.push(`Fix failing test: ${error.message}`);
      }
    }

    // Determine if we can retry
    if (criticalErrors.length > 0) {
      canRetry = false;
      retryStrategy = 'rollback';
      suggestions.push('Critical errors detected - consider rolling back changes');
    } else if (errorCount > 10) {
      canRetry = false;
      retryStrategy = 'rollback';
      suggestions.push('Too many errors - full rollback recommended');
    } else if (errorCount > 0) {
      canRetry = true;
      retryStrategy = 'fix';
    }

    return {
      errorCount,
      warningCount,
      criticalErrors,
      suggestions,
      canRetry,
      retryStrategy,
    };
  }

  /**
   * Check if error is critical (unrecoverable)
   */
  private isCriticalError(error: ParsedError): boolean {
    const criticalPatterns = [
      /module not found/i,
      /cannot find module/i,
      /syntax error/i,
      /unexpected token/i,
      /fatal error/i,
    ];

    return criticalPatterns.some(pattern => 
      pattern.test(error.message)
    );
  }

  /**
   * Generate error summary for agent consumption
   */
  generateErrorSummary(result: ExecutionResult): string {
    const feedback = this.analyzeFeedback(result);
    
    let summary = `Execution Result:\n`;
    summary += `- Errors: ${feedback.errorCount}\n`;
    summary += `- Warnings: ${feedback.warningCount}\n`;
    summary += `- Can Retry: ${feedback.canRetry}\n`;
    
    if (feedback.criticalErrors.length > 0) {
      summary += `\nCritical Errors:\n`;
      for (const error of feedback.criticalErrors) {
        summary += `- ${error.file}:${error.line} - ${error.message}\n`;
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
