// Executor Agent
// Responsible for executing code modifications with safety checks

import { BaseAgent } from './BaseAgent';
import { createScopedLogger } from '~/utils/logger';
import type {
  Task,
  TaskResult,
  ExecutorInput,
  FileChange,
  ValidationError,
  SafetyConstraints,
} from './types';
import { diffFiles } from '~/utils/diff';
import { ActionRunner } from '~/lib/runtime/action-runner';
import type { ActionCallbackData } from '~/lib/runtime/message-parser';

interface ExecutorAgentConfig {
  actionRunner?: ActionRunner;
}

const logger = createScopedLogger('ExecutorAgent');

export class ExecutorAgent extends BaseAgent {
  private safetyValidator: SafetyValidator;
  private actionRunner?: ActionRunner;

  constructor(config: ExecutorAgentConfig = {}) {
    super('executor', {
      capabilities: ['file_edit', 'file_create', 'file_delete'],
      maxRetries: 3,
      timeout: 90000, // 90 seconds for file operations
      safetyChecks: true,
      validationLevel: 'strict',
    });

    this.safetyValidator = new SafetyValidator();
    this.actionRunner = config.actionRunner;
  }

  /**
   * Execute file modification task
   */
  protected async executeTask(task: Task, input: ExecutorInput): Promise<TaskResult> {
    this.logger.info(`Executing ${task.type} task: ${task.description}`);

    const { context, safetyConstraints } = input;

    // Pre-execution safety checks
    if (safetyConstraints.validateBeforeExecute) {
      const safetyCheck = await this.performSafetyChecks(task, context, safetyConstraints);
      if (!safetyCheck.passed) {
        return {
          success: false,
          validationErrors: safetyCheck.errors,
          suggestions: ['Review safety constraints', 'Reduce scope of changes'],
        };
      }
    }

    try {
      let changes: FileChange[] = [];

      switch (task.type) {
        case 'file_create':
          changes = await this.handleFileCreate(task, context);
          break;
        case 'file_edit':
          changes = await this.handleFileEdit(task, context);
          break;
        case 'file_delete':
          changes = await this.handleFileDelete(task, context);
          break;
        default:
          throw new Error(`Unsupported task type: ${task.type}`);
      }

      // If an ActionRunner is available, delegate execution to it
      if (this.actionRunner) {
        const executedChanges: FileChange[] = [];

        for (let i = 0; i < changes.length; i++) {
          const change = changes[i];
          const actionId = `${task.id || 'task'}_${i}_${Date.now()}`;

          let actionData: ActionCallbackData;

          if (change.changeType === 'delete') {
            // Use shell action to remove files (safe, explicit)
            actionData = {
              artifactId: task.id || 'agent_artifact',
              messageId: task.id || 'agent_msg',
              actionId,
              action: {
                type: 'shell',
                content: `rm -rf ${change.filePath}`,
              } as any,
            };
          } else {
            // create/modify -> file action
            actionData = {
              artifactId: task.id || 'agent_artifact',
              messageId: task.id || 'agent_msg',
              actionId,
              action: {
                type: 'file',
                filePath: change.filePath,
                content: change.newContent ?? change.originalContent ?? '',
              } as any,
            };
          }

          // Register and run the action via ActionRunner
          try {
            this.actionRunner.addAction(actionData);
            await this.actionRunner.runAction(actionData, false);

            // After runAction resolves, inspect status
            const state = this.actionRunner.actions.get()[actionId];
            if (state && state.status === 'failed') {
              change.validated = false;
              change.validationError = state instanceof Object ? (state as any).error : 'Action failed';
            } else {
              change.validated = true;
            }
          } catch (err) {
            this.logger.error('ActionRunner execution error', err);
            change.validated = false;
            change.validationError = (err as Error).message;
          }

          executedChanges.push(change);
        }

        // Post-execution validation using safety validator
        const validation = await this.validateChanges(executedChanges, safetyConstraints);

        return {
          success: validation.passed,
          changes: executedChanges,
          validationErrors: validation.errors,
          metrics: {
            filesModified: executedChanges.length,
            linesAdded: executedChanges.reduce((sum, c) => sum + (c.newContent?.split('\n').length || 0), 0),
            linesRemoved: executedChanges.reduce(
              (sum, c) => sum + (c.originalContent?.split('\n').length || 0),
              0
            ),
          },
        };
      }

      // Fallback: no ActionRunner available - return changes for caller to apply
      const validation = await this.validateChanges(changes, safetyConstraints);

      return {
        success: validation.passed,
        changes,
        validationErrors: validation.errors,
        metrics: {
          filesModified: changes.length,
          linesAdded: changes.reduce((sum, c) => sum + (c.newContent?.split('\n').length || 0), 0),
          linesRemoved: changes.reduce(
            (sum, c) => sum + (c.originalContent?.split('\n').length || 0),
            0
          ),
        },
      };
    } catch (error) {
      this.logger.error('Execution failed:', error);
      throw error;
    }
  }

  /**
   * Handle file creation
   */
  private async handleFileCreate(task: Task, context: any): Promise<FileChange[]> {
    const changes: FileChange[] = [];

    if (!task.targetFiles || task.targetFiles.length === 0) {
      throw new Error('No target files specified for creation');
    }

    for (const filePath of task.targetFiles) {
      // Check if file already exists
      if (context.repoContext.files[filePath]) {
        this.logger.warn(`File ${filePath} already exists, treating as edit`);
        continue;
      }

      // Generate minimal file content
      const content = this.generateFileContent(filePath, task.metadata);

      changes.push({
        filePath,
        path: filePath,
        changeType: 'create',
        newContent: content,
        validated: false,
        safetyScore: 1.0, // New files are generally safe
      });
    }

    return changes;
  }

  /**
   * Handle file editing
   */
  private async handleFileEdit(task: Task, context: any): Promise<FileChange[]> {
    const changes: FileChange[] = [];

    if (!task.targetFiles || task.targetFiles.length === 0) {
      throw new Error('No target files specified for editing');
    }

    for (const filePath of task.targetFiles) {
      const originalContent = context.repoContext.files[filePath]?.content;

      if (!originalContent) {
        this.logger.warn(`File ${filePath} does not exist, skipping`);
        continue;
      }

      // Generate new content (this would be powered by LLM in real implementation)
      const newContent = await this.generateEditedContent(
        filePath,
        originalContent,
        task.description
      );

      // Calculate diff
      const diff = diffFiles(filePath, originalContent, newContent);

      // Calculate safety score
      const safetyScore = this.calculateSafetyScore(originalContent, newContent);

      changes.push({
        filePath,
        path: filePath,
        changeType: 'modify',
        originalContent,
        newContent,
        diff,
        validated: false,
        safetyScore,
      });
    }

    return changes;
  }

  /**
   * Handle file deletion
   */
  private async handleFileDelete(task: Task, context: any): Promise<FileChange[]> {
    const changes: FileChange[] = [];

    if (!task.targetFiles || task.targetFiles.length === 0) {
      throw new Error('No target files specified for deletion');
    }

    for (const filePath of task.targetFiles) {
      const originalContent = context.repoContext.files[filePath]?.content;

      if (!originalContent) {
        this.logger.warn(`File ${filePath} does not exist, skipping`);
        continue;
      }

      changes.push({
        filePath,
        path: filePath,
        changeType: 'delete',
        originalContent,
        validated: false,
        safetyScore: 0.5, // Deletions are moderately risky
      });
    }

    return changes;
  }

  /**
   * Perform pre-execution safety checks
   */
  private async performSafetyChecks(
    task: Task,
    context: any,
    constraints: SafetyConstraints
  ): Promise<{ passed: boolean; errors: ValidationError[] }> {
    const errors: ValidationError[] = [];

    // Check file count
    if (task.targetFiles && task.targetFiles.length > constraints.maxFilesPerTask) {
      errors.push({
        type: 'safety',
        severity: 'error',
        message: `Task exceeds maximum files per task (${constraints.maxFilesPerTask})`,
        suggestion: 'Break down into smaller tasks',
      });
    }

    // Check for locked files
    const lockedFiles = task.targetFiles?.filter(f =>
      context.repoContext.lockedFiles.includes(f)
    );
    if (lockedFiles && lockedFiles.length > 0) {
      errors.push({
        type: 'safety',
        severity: 'error',
        message: `Cannot modify locked files: ${lockedFiles.join(', ')}`,
        suggestion: 'Unlock files before proceeding',
      });
    }

    // Check forbidden operations
    for (const operation of constraints.forbiddenOperations) {
      if (task.description.toLowerCase().includes(operation.toLowerCase())) {
        errors.push({
          type: 'safety',
          severity: 'error',
          message: `Forbidden operation detected: ${operation}`,
          suggestion: 'Modify task to avoid forbidden operations',
        });
      }
    }

    return {
      passed: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate changes after execution
   */
  private async validateChanges(
    changes: FileChange[],
    constraints: SafetyConstraints
  ): Promise<{ passed: boolean; errors: ValidationError[] }> {
    const errors: ValidationError[] = [];

    for (const change of changes) {
      // Check line count
      if (change.newContent) {
        const lineCount = change.newContent.split('\n').length;
        if (lineCount > constraints.maxLinesPerFile) {
          errors.push({
            type: 'safety',
            severity: 'warning',
            message: `File ${change.filePath} exceeds maximum lines (${constraints.maxLinesPerFile})`,
            filePath: change.filePath,
            suggestion: 'Consider breaking into smaller modules',
          });
        }
      }

      // Check safety score
      if (change.safetyScore !== undefined && change.safetyScore < 0.5) {
        errors.push({
          type: 'safety',
          severity: 'warning',
          message: `Low safety score for ${change.filePath}: ${change.safetyScore.toFixed(2)}`,
          filePath: change.filePath,
          suggestion: 'Review changes carefully',
        });
      }

      // Syntax validation (basic)
      if (change.newContent) {
        const syntaxErrors = this.checkBasicSyntax(change.filePath, change.newContent);
        errors.push(...syntaxErrors);
      }
    }

    const criticalErrors = errors.filter(e => e.severity === 'error');

    return {
      passed: criticalErrors.length === 0,
      errors,
    };
  }

  /**
   * Generate file content for new files
   */
  private generateFileContent(filePath: string, metadata?: Record<string, any>): string {
    const ext = filePath.split('.').pop()?.toLowerCase();

    // Basic file templates
    const templates: Record<string, string> = {
      ts: `// ${filePath}\n\nexport {};\n`,
      tsx: `// ${filePath}\n\nimport React from 'react';\n\nexport {};\n`,
      js: `// ${filePath}\n\nexport {};\n`,
      jsx: `// ${filePath}\n\nimport React from 'react';\n\nexport {};\n`,
      css: `/* ${filePath} */\n\n`,
      md: `# ${filePath.split('/').pop()?.replace('.md', '')}\n\n`,
    };

    return templates[ext || ''] || `// ${filePath}\n`;
  }

  /**
   * Generate edited content (placeholder - would use LLM)
   */
  private async generateEditedContent(
    filePath: string,
    originalContent: string,
    description: string
  ): Promise<string> {
    // In real implementation, this would call the LLM with context
    // For now, return original with a comment
    return `${originalContent}\n\n// Modified: ${description}\n`;
  }

  /**
   * Calculate safety score for changes
   */
  private calculateSafetyScore(originalContent: string, newContent: string): number {
    const originalLines = originalContent.split('\n').length;
    const newLines = newContent.split('\n').length;

    // Lower score for larger changes
    const sizeRatio = Math.min(originalLines, newLines) / Math.max(originalLines, newLines);

    // Check for dangerous patterns
    let dangerousPatterns = 0;
    const patterns = [
      /eval\(/gi,
      /exec\(/gi,
      /Function\(/gi,
      /innerHTML\s*=/gi,
      /dangerouslySetInnerHTML/gi,
    ];

    patterns.forEach(pattern => {
      if (pattern.test(newContent)) {
        dangerousPatterns++;
      }
    });

    const patternPenalty = dangerousPatterns * 0.15;

    return Math.max(0, sizeRatio - patternPenalty);
  }

  /**
   * Basic syntax checking
   */
  private checkBasicSyntax(filePath: string, content: string): ValidationError[] {
    const errors: ValidationError[] = [];
    const ext = filePath.split('.').pop()?.toLowerCase();

    // Basic bracket matching
    const brackets = { '{': '}', '[': ']', '(': ')' };
    const stack: string[] = [];

    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      if (Object.keys(brackets).includes(char)) {
        stack.push(char);
      } else if (Object.values(brackets).includes(char)) {
        const last = stack.pop();
        if (!last || brackets[last as keyof typeof brackets] !== char) {
          errors.push({
            type: 'syntax',
            severity: 'error',
            message: `Unmatched bracket: ${char}`,
            filePath,
            suggestion: 'Check bracket pairing',
          });
        }
      }
    }

    if (stack.length > 0) {
      errors.push({
        type: 'syntax',
        severity: 'error',
        message: `Unclosed brackets: ${stack.join(', ')}`,
        filePath,
        suggestion: 'Close all brackets',
      });
    }

    return errors;
  }
}

/**
 * Safety Validator - ensures changes are safe to apply
 */
class SafetyValidator {
  private logger = createScopedLogger('SafetyValidator');

  /**
   * Validate that changes are safe
   */
  async validate(changes: FileChange[]): Promise<{ safe: boolean; issues: string[] }> {
    const issues: string[] = [];

    for (const change of changes) {
      if (change.safetyScore !== undefined && change.safetyScore < 0.3) {
        issues.push(`${change.filePath}: Safety score too low (${change.safetyScore.toFixed(2)})`);
      }

      if (change.changeType === 'delete' && !this.canSafelyDelete(change.filePath)) {
        issues.push(`${change.filePath}: Cannot safely delete critical file`);
      }
    }

    return {
      safe: issues.length === 0,
      issues,
    };
  }

  /**
   * Check if file can be safely deleted
   */
  private canSafelyDelete(filePath: string): boolean {
    const criticalPatterns = [
      /package\.json$/,
      /tsconfig\.json$/,
      /\.gitignore$/,
      /README\.md$/,
      /index\.(ts|tsx|js|jsx)$/,
    ];

    return !criticalPatterns.some(pattern => pattern.test(filePath));
  }
}
