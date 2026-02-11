// Planner Agent
// Responsible for breaking down user requests into executable tasks

import { BaseAgent } from './BaseAgent';
import { createScopedLogger } from '~/utils/logger';
import type {
  Task,
  TaskResult,
  PlannerOutput,
  TaskPriority,
  ExecutionContext,
} from './types';

const logger = createScopedLogger('PlannerAgent');

export class PlannerAgent extends BaseAgent {
  constructor() {
    super('planner', {
      capabilities: ['analysis', 'planning', 'task_decomposition'],
      maxRetries: 2,
      timeout: 30000,
    });
  }

  /**
   * Main execution method for planning tasks
   */
  protected async executeTask(task: Task, context: ExecutionContext): Promise<TaskResult> {
    this.logger.info('Planning task execution...');

    // Validate input
    const validation = this.validateTask(task);
    if (!validation.valid) {
      return {
        success: false,
        validationErrors: validation.errors.map(err => ({
          type: 'logic',
          severity: 'error',
          message: err,
        })),
      };
    }

    try {
      // Analyze the request
      const analysis = this.analyzeRequest(task.description, context);

      // Decompose into subtasks
      const plan = await this.createExecutionPlan(task, analysis, context);

      // Validate plan
      const planValidation = this.validatePlan(plan);
      if (!planValidation.valid) {
        return {
          success: false,
          validationErrors: planValidation.errors.map(err => ({
            type: 'logic',
            severity: 'warning',
            message: err,
          })),
          suggestions: ['Consider breaking down the request further'],
        };
      }

      return {
        success: true,
        output: plan,
        metrics: {
          executionTime: Date.now() - task.createdAt,
        },
      };
    } catch (error) {
      this.logger.error('Planning failed:', error);
      throw error;
    }
  }

  /**
   * Analyze user request and determine complexity
   */
  private analyzeRequest(
    description: string,
    context: ExecutionContext
  ): {
    complexity: 'simple' | 'moderate' | 'complex';
    riskLevel: 'low' | 'medium' | 'high';
    affectedFiles: string[];
    requiresAnalysis: boolean;
  } {
    const lowerDesc = description.toLowerCase();

    // Determine complexity
    let complexity: 'simple' | 'moderate' | 'complex' = 'simple';
    if (
      lowerDesc.includes('refactor') ||
      lowerDesc.includes('redesign') ||
      lowerDesc.includes('architecture')
    ) {
      complexity = 'complex';
    } else if (
      lowerDesc.includes('multiple') ||
      lowerDesc.includes('across') ||
      lowerDesc.includes('integrate')
    ) {
      complexity = 'moderate';
    }

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    if (
      lowerDesc.includes('delete') ||
      lowerDesc.includes('remove') ||
      lowerDesc.includes('breaking')
    ) {
      riskLevel = 'high';
    } else if (lowerDesc.includes('modify') || lowerDesc.includes('update')) {
      riskLevel = 'medium';
    }

    // Extract potential file patterns
    const filePatterns = this.extractFilePatterns(description);
    const affectedFiles = this.matchFiles(filePatterns, context);

    return {
      complexity,
      riskLevel,
      affectedFiles,
      requiresAnalysis: complexity !== 'simple' || affectedFiles.length > 5,
    };
  }

  /**
   * Create an execution plan from analysis
   */
  private async createExecutionPlan(
    originalTask: Task,
    analysis: ReturnType<typeof this.analyzeRequest>,
    context: ExecutionContext
  ): Promise<PlannerOutput> {
    const tasks: Task[] = [];

    // Step 1: Analysis phase (if needed)
    if (analysis.requiresAnalysis) {
      tasks.push(this.createTask(
        'analysis',
        'Analyze codebase structure and dependencies',
        'high',
        analysis.affectedFiles
      ));
    }

    // Step 2: Determine modification strategy
    if (analysis.complexity === 'complex') {
      // Complex: break into smaller chunks
      const chunks = this.chunkFiles(analysis.affectedFiles, 3);
      chunks.forEach((chunk, index) => {
        tasks.push(this.createTask(
          'file_edit',
          `Modify files: ${chunk.join(', ')}`,
          'medium',
          chunk,
          index > 0 ? [tasks[tasks.length - 1].id] : undefined
        ));
      });
    } else {
      // Simple/Moderate: direct modification
      tasks.push(this.createTask(
        originalTask.type,
        originalTask.description,
        originalTask.priority,
        analysis.affectedFiles
      ));
    }

    // Step 3: Validation phase
    tasks.push(this.createTask(
      'validation',
      'Validate changes and check for errors',
      'critical',
      analysis.affectedFiles,
      [tasks[tasks.length - 1].id]
    ));

    // Step 4: Review phase
    tasks.push(this.createTask(
      'review',
      'Review changes for quality and safety',
      'high',
      analysis.affectedFiles,
      [tasks[tasks.length - 1].id]
    ));

    const plan: PlannerOutput = {
      tasks,
      strategy: this.generateStrategy(analysis),
      estimatedComplexity: analysis.complexity,
      riskLevel: analysis.riskLevel,
      prerequisites: this.identifyPrerequisites(context),
      warnings: this.generateWarnings(analysis),
    };

    return plan;
  }

  /**
   * Create a task object
   */
  private createTask(
    type: Task['type'],
    description: string,
    priority: TaskPriority,
    targetFiles?: string[],
    dependencies?: string[]
  ): Task {
    return {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      description,
      priority,
      status: 'pending',
      targetFiles,
      dependencies,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      retryCount: 0,
    };
  }

  /**
   * Extract file patterns from description
   */
  private extractFilePatterns(description: string): string[] {
    const patterns: string[] = [];

    // Extract file extensions
    const extMatch = description.match(/\.(tsx?|jsx?|py|java|css|html|md)\b/gi);
    if (extMatch) {
      patterns.push(...extMatch.map(ext => `**/*${ext}`));
    }

    // Extract explicit file paths
    const pathMatch = description.match(/[\w\-./]+\.(tsx?|jsx?|py|java|css|html|md)/gi);
    if (pathMatch) {
      patterns.push(...pathMatch);
    }

    // Extract component/module names
    const componentMatch = description.match(/\b[A-Z]\w+(?:Component|Service|Store|Agent)\b/g);
    if (componentMatch) {
      patterns.push(...componentMatch.map(name => `**/*${name}*`));
    }

    return patterns;
  }

  /**
   * Match file patterns against repo context
   */
  private matchFiles(patterns: string[], context: ExecutionContext): string[] {
    const allFiles = Object.keys(context.repoContext.files);
    const matched = new Set<string>();

    patterns.forEach(pattern => {
      const regex = this.patternToRegex(pattern);
      allFiles.forEach(file => {
        if (regex.test(file)) {
          matched.add(file);
        }
      });
    });

    return Array.from(matched);
  }

  /**
   * Convert glob pattern to regex
   */
  private patternToRegex(pattern: string): RegExp {
    const escaped = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(escaped, 'i');
  }

  /**
   * Chunk files into smaller groups
   */
  private chunkFiles(files: string[], chunkSize: number): string[][] {
    const chunks: string[][] = [];
    for (let i = 0; i < files.length; i += chunkSize) {
      chunks.push(files.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Generate execution strategy description
   */
  private generateStrategy(analysis: ReturnType<typeof this.analyzeRequest>): string {
    const strategies = [];

    if (analysis.complexity === 'complex') {
      strategies.push('Break down into incremental changes');
      strategies.push('Validate after each step');
    }

    if (analysis.riskLevel === 'high') {
      strategies.push('Create backup checkpoints');
      strategies.push('Implement rollback capability');
    }

    if (analysis.affectedFiles.length > 10) {
      strategies.push('Process files in batches');
    }

    return strategies.join('. ') + '.';
  }

  /**
   * Identify prerequisites from context
   */
  private identifyPrerequisites(context: ExecutionContext): string[] {
    const prerequisites: string[] = [];

    // Check for locked files
    if (context.repoContext.lockedFiles.length > 0) {
      prerequisites.push(`Unlock files: ${context.repoContext.lockedFiles.join(', ')}`);
    }

    // Check for dependencies
    if (context.repoContext.dependencies.length === 0) {
      prerequisites.push('Install project dependencies');
    }

    return prerequisites;
  }

  /**
   * Generate warnings based on analysis
   */
  private generateWarnings(analysis: ReturnType<typeof this.analyzeRequest>): string[] {
    const warnings: string[] = [];

    if (analysis.riskLevel === 'high') {
      warnings.push('This operation carries HIGH risk - proceed with caution');
    }

    if (analysis.affectedFiles.length > 20) {
      warnings.push(`This will modify ${analysis.affectedFiles.length} files`);
    }

    if (analysis.complexity === 'complex') {
      warnings.push('This is a complex operation that may take several steps');
    }

    return warnings;
  }

  /**
   * Validate the generated plan
   */
  private validatePlan(plan: PlannerOutput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (plan.tasks.length === 0) {
      errors.push('Plan must contain at least one task');
    }

    // Check for circular dependencies
    const taskIds = new Set(plan.tasks.map(t => t.id));
    plan.tasks.forEach(task => {
      task.dependencies?.forEach(depId => {
        if (!taskIds.has(depId)) {
          errors.push(`Task ${task.id} depends on non-existent task ${depId}`);
        }
      });
    });

    // Validate task ordering
    const visited = new Set<string>();
    for (const task of plan.tasks) {
      if (task.dependencies) {
        for (const depId of task.dependencies) {
          if (!visited.has(depId)) {
            errors.push(`Task ${task.id} depends on ${depId} which hasn't been processed yet`);
          }
        }
      }
      visited.add(task.id);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
