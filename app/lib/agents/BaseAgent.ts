// Base Agent Class
// Foundation for all specialized agents in the multi-agent system

import { createScopedLogger } from '~/utils/logger';
import type {
  AgentConfig,
  AgentRole,
  Task,
  TaskResult,
  AgentMemoryEntry,
  AgentMetrics,
} from './types';

export abstract class BaseAgent {
  protected logger: ReturnType<typeof createScopedLogger>;
  protected config: AgentConfig;
  protected memory: AgentMemoryEntry[] = [];
  protected metrics: AgentMetrics;

  constructor(role: AgentRole, config: Partial<AgentConfig> = {}) {
    this.logger = createScopedLogger(`Agent:${role}`);
    
    this.config = {
      role,
      maxRetries: config.maxRetries ?? 3,
      timeout: config.timeout ?? 60000, // 60 seconds
      safetyChecks: config.safetyChecks ?? true,
      validationLevel: config.validationLevel ?? 'moderate',
      capabilities: config.capabilities ?? [],
    };

    this.metrics = {
      tasksCompleted: 0,
      tasksFailures: 0,
      averageExecutionTime: 0,
      successRate: 0,
      errorsEncountered: [],
    };

    this.logger.info(`${role} agent initialized`);
  }

  /**
   * Execute a task with retry logic and metrics tracking
   */
  async execute<T = any>(task: Task, context: any): Promise<TaskResult> {
    const startTime = Date.now();
    let lastError: Error | undefined;
    
    this.logger.info(`Executing task: ${task.id} (${task.description})`);

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        // Check timeout
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Task execution timeout')), this.config.timeout);
        });

        // Execute with timeout
        const resultPromise = this.executeTask(task, context);
        const result = await Promise.race([resultPromise, timeoutPromise]);

        // Record success
        const duration = Date.now() - startTime;
        this.recordExecution(task, result, true, duration);
        this.updateMetrics(true, duration);

        this.logger.info(`Task ${task.id} completed successfully in ${duration}ms`);
        
        return result;
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`Task ${task.id} attempt ${attempt + 1} failed:`, error);
        
        if (attempt < this.config.maxRetries - 1) {
          // Wait before retry (exponential backoff)
          await this.delay(Math.min(1000 * Math.pow(2, attempt), 10000));
        }
      }
    }

    // All retries failed
    const duration = Date.now() - startTime;
    const failureResult: TaskResult = {
      success: false,
      validationErrors: [{
        type: 'logic',
        severity: 'error',
        message: lastError?.message || 'Task execution failed',
      }],
    };

    this.recordExecution(task, failureResult, false, duration);
    this.updateMetrics(false, duration);
    
    this.logger.error(`Task ${task.id} failed after ${this.config.maxRetries} attempts`);
    
    return failureResult;
  }

  /**
   * Abstract method that each agent must implement
   */
  protected abstract executeTask(task: Task, context: any): Promise<TaskResult>;

  /**
   * Record execution in agent memory
   */
  protected recordExecution(
    task: Task,
    result: TaskResult,
    success: boolean,
    duration: number
  ): void {
    const entry: AgentMemoryEntry = {
      id: `${task.id}-${Date.now()}`,
      timestamp: Date.now(),
      agentRole: this.config.role,
      action: task.type,
      input: task,
      output: result,
      success,
      duration,
      metadata: {
        retryCount: task.retryCount || 0,
        priority: task.priority,
      },
    };

    this.memory.push(entry);
    
    // Keep only last 100 entries
    if (this.memory.length > 100) {
      this.memory = this.memory.slice(-100);
    }
  }

  /**
   * Update agent metrics
   */
  protected updateMetrics(success: boolean, duration: number): void {
    if (success) {
      this.metrics.tasksCompleted++;
    } else {
      this.metrics.tasksFailures++;
    }

    // Update average execution time
    const totalTasks = this.metrics.tasksCompleted + this.metrics.tasksFailures;
    this.metrics.averageExecutionTime =
      (this.metrics.averageExecutionTime * (totalTasks - 1) + duration) / totalTasks;

    // Update success rate
    this.metrics.successRate =
      (this.metrics.tasksCompleted / totalTasks) * 100;

    this.metrics.lastExecution = Date.now();
  }

  /**
   * Get agent metrics
   */
  getMetrics(): AgentMetrics {
    return { ...this.metrics };
  }

  /**
   * Get agent memory
   */
  getMemory(limit?: number): AgentMemoryEntry[] {
    if (limit) {
      return this.memory.slice(-limit);
    }
    return [...this.memory];
  }

  /**
   * Clear agent memory
   */
  clearMemory(): void {
    this.memory = [];
    this.logger.info('Agent memory cleared');
  }

  /**
   * Helper: delay execution
   */
  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate task before execution
   */
  protected validateTask(task: Task): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!task.id) {
      errors.push('Task ID is required');
    }

    if (!task.description) {
      errors.push('Task description is required');
    }

    if (!task.type) {
      errors.push('Task type is required');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if agent can handle task type
   */
  canHandle(taskType: string): boolean {
    return this.config.capabilities.includes(taskType) || this.config.capabilities.includes('*');
  }
}
