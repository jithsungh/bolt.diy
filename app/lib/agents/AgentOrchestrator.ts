// Agent Orchestrator
// Coordinates multi-agent workflow and manages task execution

import { createScopedLogger } from '~/utils/logger';
import { PlannerAgent } from './PlannerAgent';
import { ExecutorAgent } from './ExecutorAgent';
import { ReviewerAgent } from './ReviewerAgent';
import type {
  Task,
  TaskResult,
  PlannerOutput,
  ExecutionContext,
  SafetyConstraints,
  ExecutorInput,
  ReviewerOutput,
  AgentRole,
} from './types';

const logger = createScopedLogger('AgentOrchestrator');

export interface OrchestratorConfig {
  maxConcurrentTasks: number;
  enableAutoRetry: boolean;
  requireReview: boolean;
  safetyMode: 'strict' | 'moderate' | 'permissive';
  maxExecutionTime: number; // milliseconds
}

export interface ExecutionResult {
  success: boolean;
  plan?: PlannerOutput;
  executedTasks: TaskExecutionRecord[];
  overallReview?: ReviewerOutput;
  errors: string[];
  warnings: string[];
  metrics: {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    totalDuration: number;
    agentMetrics: Record<AgentRole, any>;
  };
}

export interface TaskExecutionRecord {
  task: Task;
  result: TaskResult;
  duration: number;
  agent: AgentRole;
  attempt: number;
}

/**
 * Main orchestrator that coordinates all agents
 */
export class AgentOrchestrator {
  private plannerAgent: PlannerAgent;
  private executorAgent: ExecutorAgent;
  private reviewerAgent: ReviewerAgent;
  private config: OrchestratorConfig;

  private taskQueue: Task[] = [];
  private executedTasks: TaskExecutionRecord[] = [];
  private isExecuting = false;

  constructor(config: Partial<OrchestratorConfig> = {}) {
    this.config = {
      maxConcurrentTasks: config.maxConcurrentTasks ?? 3,
      enableAutoRetry: config.enableAutoRetry ?? true,
      requireReview: config.requireReview ?? true,
      safetyMode: config.safetyMode ?? 'strict',
      maxExecutionTime: config.maxExecutionTime ?? 300000, // 5 minutes
    };

    // Initialize agents
    this.plannerAgent = new PlannerAgent();
    this.executorAgent = new ExecutorAgent();
    this.reviewerAgent = new ReviewerAgent();

    logger.info('Agent Orchestrator initialized', this.config);
  }

  /**
   * Execute a user request through the multi-agent pipeline
   */
  async executeRequest(
    userRequest: string,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    logger.info(`Starting execution of request: "${userRequest}"`);

    const result: ExecutionResult = {
      success: false,
      executedTasks: [],
      errors: [],
      warnings: [],
      metrics: {
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        totalDuration: 0,
        agentMetrics: {
          planner: {},
          executor: {},
          reviewer: {},
          validator: {},
        },
      },
    };

    try {
      // Prevent concurrent executions
      if (this.isExecuting) {
        throw new Error('Orchestrator is already executing a request');
      }
      this.isExecuting = true;

      // Step 1: Planning Phase
      logger.info('Phase 1: Planning');
      const plan = await this.planningPhase(userRequest, context);
      if (!plan) {
        throw new Error('Planning phase failed');
      }
      result.plan = plan;
      result.metrics.totalTasks = plan.tasks.length;

      logger.info(`Plan created with ${plan.tasks.length} tasks`);
      if (plan.warnings && plan.warnings.length > 0) {
        result.warnings.push(...plan.warnings);
      }

      // Step 2: Execution Phase
      logger.info('Phase 2: Execution');
      this.taskQueue = [...plan.tasks];
      
      const executionResults = await this.executionPhase(context);
      result.executedTasks = executionResults;
      result.metrics.completedTasks = executionResults.filter(r => r.result.success).length;
      result.metrics.failedTasks = executionResults.filter(r => !r.result.success).length;

      // Step 3: Review Phase
      if (this.config.requireReview) {
        logger.info('Phase 3: Review');
        const review = await this.reviewPhase(executionResults, context);
        result.overallReview = review;

        if (!review.approved) {
          result.success = false;
          result.errors.push('Review failed - changes not approved');
          review.issues.forEach(issue => {
            if (issue.severity === 'error') {
              result.errors.push(issue.message);
            } else {
              result.warnings.push(issue.message);
            }
          });
        } else {
          result.success = true;
        }
      } else {
        // If no review required, success based on execution
        result.success = result.metrics.failedTasks === 0;
      }

      // Collect agent metrics
      result.metrics.agentMetrics.planner = this.plannerAgent.getMetrics();
      result.metrics.agentMetrics.executor = this.executorAgent.getMetrics();
      result.metrics.agentMetrics.reviewer = this.reviewerAgent.getMetrics();

    } catch (error) {
      logger.error('Orchestration failed:', error);
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      this.isExecuting = false;
      result.metrics.totalDuration = Date.now() - startTime;
      
      logger.info(`Execution completed in ${result.metrics.totalDuration}ms`, {
        success: result.success,
        completed: result.metrics.completedTasks,
        failed: result.metrics.failedTasks,
      });
    }

    return result;
  }

  /**
   * Planning Phase: Create execution plan
   */
  private async planningPhase(
    userRequest: string,
    context: ExecutionContext
  ): Promise<PlannerOutput | null> {
    const planningTask: Task = {
      id: `plan-${Date.now()}`,
      type: 'analysis',
      description: userRequest,
      priority: 'high',
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const result = await this.plannerAgent.execute(planningTask, context);

    if (!result.success || !result.output) {
      logger.error('Planning failed:', result.validationErrors);
      return null;
    }

    return result.output as PlannerOutput;
  }

  /**
   * Execution Phase: Execute tasks according to plan
   */
  private async executionPhase(context: ExecutionContext): Promise<TaskExecutionRecord[]> {
    const records: TaskExecutionRecord[] = [];
    const safetyConstraints = this.getSafetyConstraints();

    // Process tasks respecting dependencies
    while (this.taskQueue.length > 0) {
      const readyTasks = this.getReadyTasks(records);
      
      if (readyTasks.length === 0) {
        logger.warn('No ready tasks, but queue not empty. Possible circular dependency');
        break;
      }

      // Execute ready tasks (up to concurrency limit)
      const tasksToExecute = readyTasks.slice(0, this.config.maxConcurrentTasks);
      
      logger.info(`Executing ${tasksToExecute.length} tasks`);

      const promises = tasksToExecute.map(task => 
        this.executeTask(task, context, safetyConstraints)
      );

      const results = await Promise.allSettled(promises);

      results.forEach((result, index) => {
        const task = tasksToExecute[index];
        this.taskQueue = this.taskQueue.filter(t => t.id !== task.id);

        if (result.status === 'fulfilled') {
          records.push(result.value);
        } else {
          // Task failed completely
          records.push({
            task,
            result: {
              success: false,
              validationErrors: [{
                type: 'logic',
                severity: 'error',
                message: result.reason?.message || 'Task execution failed',
              }],
            },
            duration: 0,
            agent: this.getAgentForTask(task),
            attempt: 1,
          });
        }
      });
    }

    return records;
  }

  /**
   * Review Phase: Review all executed changes
   */
  private async reviewPhase(
    executionRecords: TaskExecutionRecord[],
    context: any
  ): Promise<ReviewerOutput> {
    // Collect all changes from execution
    const allChanges = executionRecords
      .flatMap(record => record.result.changes || []);

    const reviewTask: Task = {
      id: `review-${Date.now()}`,
      type: 'review',
      description: 'Review all changes',
      priority: 'critical',
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const reviewContext = {
      ...context,
      changes: allChanges,
      executionRecords,
    };

    const result = await this.reviewerAgent.execute(reviewTask, reviewContext);

    if (!result.success || !result.output) {
      return {
        approved: false,
        score: 0,
        issues: result.validationErrors || [],
        suggestions: result.suggestions || [],
        riskAssessment: {
          level: 'critical',
          reasons: ['Review process failed'],
        },
      };
    }

    return result.output as ReviewerOutput;
  }

  /**
   * Execute a single task
   */
  private async executeTask(
    task: Task,
    context: ExecutionContext,
    safetyConstraints: SafetyConstraints
  ): Promise<TaskExecutionRecord> {
    const startTime = Date.now();
    const agent = this.getAgentForTask(task);

    logger.info(`Executing task ${task.id} with ${agent} agent`);

    let result: TaskResult;
    let attempt = 1;

    try {
      if (agent === 'executor') {
        const executorInput: ExecutorInput = {
          task,
          context,
          safetyConstraints,
        };
        result = await this.executorAgent.execute(task, executorInput);
      } else if (agent === 'planner') {
        result = await this.plannerAgent.execute(task, context);
      } else {
        result = await this.reviewerAgent.execute(task, context);
      }

      // Retry logic
      if (!result.success && this.config.enableAutoRetry && task.retryCount && task.retryCount < 3) {
        logger.warn(`Task ${task.id} failed, retrying...`);
        task.retryCount = (task.retryCount || 0) + 1;
        attempt = task.retryCount;
        await this.delay(1000 * attempt);
        return this.executeTask(task, context, safetyConstraints);
      }

    } catch (error) {
      logger.error(`Task ${task.id} threw error:`, error);
      result = {
        success: false,
        validationErrors: [{
          type: 'logic',
          severity: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        }],
      };
    }

    const duration = Date.now() - startTime;

    return {
      task,
      result,
      duration,
      agent,
      attempt,
    };
  }

  /**
   * Get tasks that are ready to execute (dependencies met)
   */
  private getReadyTasks(completedRecords: TaskExecutionRecord[]): Task[] {
    const completedTaskIds = new Set(completedRecords.map(r => r.task.id));

    return this.taskQueue.filter(task => {
      if (!task.dependencies || task.dependencies.length === 0) {
        return true;
      }

      return task.dependencies.every(depId => completedTaskIds.has(depId));
    });
  }

  /**
   * Determine which agent should handle a task
   */
  private getAgentForTask(task: Task): AgentRole {
    switch (task.type) {
      case 'analysis':
        return 'planner';
      case 'file_create':
      case 'file_edit':
      case 'file_delete':
        return 'executor';
      case 'review':
      case 'validation':
        return 'reviewer';
      default:
        return 'executor';
    }
  }

  /**
   * Get safety constraints based on config
   */
  private getSafetyConstraints(): SafetyConstraints {
    const modeConstraints = {
      strict: {
        maxFilesPerTask: 5,
        maxLinesPerFile: 500,
        forbiddenOperations: ['delete database', 'drop table', 'rm -rf', 'format'],
        requiresApproval: true,
        validateBeforeExecute: true,
        rollbackOnError: true,
      },
      moderate: {
        maxFilesPerTask: 10,
        maxLinesPerFile: 1000,
        forbiddenOperations: ['rm -rf', 'format'],
        requiresApproval: false,
        validateBeforeExecute: true,
        rollbackOnError: true,
      },
      permissive: {
        maxFilesPerTask: 20,
        maxLinesPerFile: 2000,
        forbiddenOperations: [],
        requiresApproval: false,
        validateBeforeExecute: false,
        rollbackOnError: false,
      },
    };

    return modeConstraints[this.config.safetyMode];
  }

  /**
   * Helper: delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get orchestrator status
   */
  getStatus(): {
    isExecuting: boolean;
    queuedTasks: number;
    executedTasks: number;
    agentMetrics: Record<AgentRole, any>;
  } {
    return {
      isExecuting: this.isExecuting,
      queuedTasks: this.taskQueue.length,
      executedTasks: this.executedTasks.length,
      agentMetrics: {
        planner: this.plannerAgent.getMetrics(),
        executor: this.executorAgent.getMetrics(),
        reviewer: this.reviewerAgent.getMetrics(),
        validator: {},
      },
    };
  }

  /**
   * Reset orchestrator state
   */
  reset(): void {
    this.taskQueue = [];
    this.executedTasks = [];
    this.isExecuting = false;
    
    this.plannerAgent.clearMemory();
    this.executorAgent.clearMemory();
    this.reviewerAgent.clearMemory();

    logger.info('Orchestrator reset');
  }
}
