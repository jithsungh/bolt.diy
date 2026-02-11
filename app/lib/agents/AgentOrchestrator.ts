/**
 * Agent Orchestrator (Phase 1 + Phase 2)
 * Coordinates multi-agent workflow with full Phase 2 capabilities:
 * - Task Queue for parallel execution
 * - Execution Feedback Loop for automated testing
 * - Agent Evaluation System for performance tracking
 * - WebContainer integration for safe execution
 */

import { createScopedLogger } from '~/utils/logger';
import { PlannerAgent } from './PlannerAgent';
import { ExecutorAgent } from './ExecutorAgent';
import { ReviewerAgent } from './ReviewerAgent';
import { TaskQueue, type QueueStats, type QueuedTask } from './TaskQueue';
import { ExecutionFeedbackLoop, type IterativeExecutionResult } from './ExecutionFeedbackLoop';
import type { ResourceLimits } from './ResourceLimiter';
import type { TestRunnerConfig } from './TestRunner';
import type { BuildValidatorConfig } from './BuildValidator';
import { AgentEvaluationSystem, type AgentPerformance } from './AgentEvaluationSystem';
import type {
  Task,
  TaskResult,
  PlannerOutput,
  ExecutionContext,
  SafetyConstraints,
  ExecutorInput,
  ReviewerOutput,
  AgentRole,
  TaskPriority,
} from './types';

const logger = createScopedLogger('AgentOrchestrator');

// WebContainer types (imported dynamically to avoid compile errors)
type WebContainer = any;
type BoltShell = any;

export interface OrchestratorConfig {
  maxConcurrentTasks: number;
  enableAutoRetry: boolean;
  requireReview: boolean;
  safetyMode: 'strict' | 'moderate' | 'permissive';
  maxExecutionTime: number; // milliseconds
  enableFeedbackLoop?: boolean; // Phase 2
  enableEvaluation?: boolean; // Phase 2
  // Phase 3: Iterative execution options
  iterativeMode?: boolean;
  resourceLimits?: Partial<ResourceLimits>;
  testRunnerConfig?: TestRunnerConfig;
  buildValidatorConfig?: BuildValidatorConfig;
}

export interface ExecutionResult {
  success: boolean;
  plan?: PlannerOutput;
  executedTasks: TaskExecutionRecord[];
  overallReview?: ReviewerOutput;
  queueStats?: QueueStats; // Phase 2
  evaluation?: {
    systemPerformance: any;
    agentPerformance: Map<AgentRole, AgentPerformance>;
  }; // Phase 2
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
  task: Task | QueuedTask;
  result: TaskResult;
  duration: number;
  agent: AgentRole;
  attempt: number;
  feedbackResult?: IterativeExecutionResult; // Phase 2+3
}

/**
 * Main orchestrator that coordinates all agents
 * Phase 1 + Phase 2: Task queue, feedback loop, and evaluation system
 */
export class AgentOrchestrator {
  private plannerAgent: PlannerAgent;
  private executorAgent: ExecutorAgent;
  private reviewerAgent: ReviewerAgent;
  private config: Required<OrchestratorConfig>;

  // Phase 2: Advanced components
  private taskQueue: TaskQueue;
  private feedbackLoop: ExecutionFeedbackLoop;
  private evaluationSystem: AgentEvaluationSystem;
  
  private executedTasks: TaskExecutionRecord[] = [];
  private isExecuting = false;

  // WebContainer integration (Phase 2)
  private webcontainer?: WebContainer;
  private shell?: BoltShell;

  constructor(config: Partial<OrchestratorConfig> = {}) {
    this.config = {
      maxConcurrentTasks: config.maxConcurrentTasks ?? 3,
      enableAutoRetry: config.enableAutoRetry ?? true,
      requireReview: config.requireReview ?? true,
      safetyMode: config.safetyMode ?? 'strict',
      maxExecutionTime: config.maxExecutionTime ?? 300000, // 5 minutes
      enableFeedbackLoop: config.enableFeedbackLoop ?? true,
      enableEvaluation: config.enableEvaluation ?? true,
      iterativeMode: config.iterativeMode ?? true,
      resourceLimits: config.resourceLimits ?? {},
      testRunnerConfig: config.testRunnerConfig ?? {},
      buildValidatorConfig: config.buildValidatorConfig ?? {},
    };

    // Initialize agents
    this.plannerAgent = new PlannerAgent();
    this.executorAgent = new ExecutorAgent();
    this.reviewerAgent = new ReviewerAgent();
    
    // Phase 2+3: Initialize advanced systems
    this.taskQueue = new TaskQueue({
      maxConcurrent: this.config.maxConcurrentTasks,
      defaultMaxAttempts: this.config.enableAutoRetry ? 3 : 1,
      taskTimeout: this.config.maxExecutionTime,
    });
    
    this.feedbackLoop = new ExecutionFeedbackLoop({
      maxRetries: this.config.enableAutoRetry ? 3 : 1,
      timeout: this.config.maxExecutionTime,
      iterativeMode: this.config.iterativeMode,
      resourceLimits: this.config.resourceLimits,
      testRunnerConfig: this.config.testRunnerConfig,
      buildValidatorConfig: this.config.buildValidatorConfig,
    });
    
    this.evaluationSystem = new AgentEvaluationSystem();

    logger.info('Agent Orchestrator initialized', this.config);
  }

  /**
   * Set WebContainer for code execution (Phase 2)
   */
  setWebContainer(webcontainer: WebContainer, shell?: BoltShell): void {
    this.webcontainer = webcontainer;
    this.shell = shell;
    logger.info('WebContainer configured for execution feedback');
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

      // Step 2: Execution Phase (with Task Queue)
      logger.info('Phase 2: Execution');
      
      // Enqueue all tasks with dependency detection
      this.taskQueue.enqueueBatch(plan.tasks, { detectDependencies: true });
      
      const executionResults = await this.executionPhase(context);
      result.executedTasks = executionResults;
      result.metrics.completedTasks = executionResults.filter(r => r.result.success).length;
      result.metrics.failedTasks = executionResults.filter(r => !r.result.success).length;

      // Add Phase 2 queue stats
      result.queueStats = this.taskQueue.getStats();

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

      // Phase 2: Add evaluation results
      if (this.config.enableEvaluation) {
        const systemPerf = this.evaluationSystem.getSystemPerformance();
        const agentPerformance = new Map<AgentRole, AgentPerformance>();
        
        (['planner', 'executor', 'reviewer'] as AgentRole[]).forEach(role => {
          const perf = this.evaluationSystem.getAgentPerformance(role);
          if (perf) {
            agentPerformance.set(role, perf);
          }
        });

        result.evaluation = {
          systemPerformance: systemPerf,
          agentPerformance,
        };
      }

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
   * Execution Phase: Execute tasks with TaskQueue (Phase 2)
   */
  private async executionPhase(context: ExecutionContext): Promise<TaskExecutionRecord[]> {
    const records: TaskExecutionRecord[] = [];
    const safetyConstraints = this.getSafetyConstraints();

    // Process tasks using TaskQueue
    let activePromises: Map<string, Promise<TaskExecutionRecord>> = new Map();

    while (true) {
      const stats = this.taskQueue.getStats();
      
      // Check if all tasks are done
      if (stats.pending === 0 && stats.running === 0 && stats.blocked === 0) {
        break;
      }

      // Get next ready task
      const queuedTask = this.taskQueue.getNext();
      
      if (queuedTask) {
        // Start executing the task
        const promise = this.executeTaskWithQueue(queuedTask, context, safetyConstraints)
          .then(record => {
            // Mark as completed or failed in queue
            if (record.result.success) {
              this.taskQueue.markCompleted(queuedTask.id);
            } else {
              this.taskQueue.markFailed(queuedTask.id, record.result.validationErrors?.[0]?.message);
            }
            
            // Add to evaluation system (Phase 2)
            if (this.config.enableEvaluation) {
              // Convert QueuedTask to Task for evaluation
              const taskForEval: Task = {
                ...queuedTask,
                priority: this.convertPriorityToString(queuedTask.priority),
              };
              
              this.evaluationSystem.evaluateTask(
                taskForEval,
                record.result,
                {
                  completionTime: record.duration,
                  attempts: queuedTask.attempts,
                }
              );
            }
            
            return record;
          });

        activePromises.set(queuedTask.id, promise);
      }

      // Wait for at least one task to complete before checking for more
      if (activePromises.size > 0) {
        const completedRecord = await Promise.race(activePromises.values());
        records.push(completedRecord);
        activePromises.delete(completedRecord.task.id);
      } else {
        // No tasks ready and none running - check if blocked
        const blockedTasks = this.taskQueue.getBlockedTasks();
        if (blockedTasks.length > 0) {
          logger.warn(`${blockedTasks.length} tasks blocked by dependencies`, {
            blocked: blockedTasks.map(b => ({
              task: b.task.id,
              waitingFor: b.waitingFor,
            })),
          });
        }
        
        // Small delay to prevent tight loop
        await this.delay(100);
      }
    }

    // Wait for any remaining tasks
    if (activePromises.size > 0) {
      const remaining = await Promise.all(activePromises.values());
      records.push(...remaining);
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
   * Execute a single task with Phase 2 features (feedback loop)
   */
  private async executeTaskWithQueue(
    queuedTask: QueuedTask,
    context: ExecutionContext,
    safetyConstraints: SafetyConstraints
  ): Promise<TaskExecutionRecord> {
    const startTime = Date.now();
    const agent = this.getAgentForTask(queuedTask);

    logger.info(`Executing task ${queuedTask.id} with ${agent} agent (attempt ${queuedTask.attempts})`);

    // Convert QueuedTask to Task for agent compatibility
    const task: Task = {
      ...queuedTask,
      priority: this.convertPriorityToString(queuedTask.priority),
    };

    let result: TaskResult;
    let feedbackResult: IterativeExecutionResult | undefined;

    try {
      if (agent === 'executor') {
        const executorInput: ExecutorInput = {
          task,
          context,
          safetyConstraints,
        };
        result = await this.executorAgent.execute(task, executorInput);

        // Phase 2: Execute with feedback loop if enabled
        if (this.config.enableFeedbackLoop && result.changes && this.webcontainer && this.shell) {
          try {
            feedbackResult = await this.feedbackLoop.executeWithFeedback(
              result.changes,
              {
                webcontainer: this.webcontainer,
                shell: this.shell,
                workDir: '/home/project',
              },
              {
                buildCommand: 'npm run build',
                testCommand: 'npm test',
                lintCommand: 'npm run lint',
              }
            );

            // If feedback indicates errors, update result
            if (!feedbackResult.success) {
              result.success = false;
              result.validationErrors = result.validationErrors || [];
              
              // Map ParsedError to ValidationError
              for (const err of feedbackResult.errors) {
                result.validationErrors.push({
                  type: err.type as any,
                  severity: err.severity,
                  message: err.message,
                  filePath: err.file,
                  line: err.line,
                });
              }
            }
          } catch (feedbackError) {
            logger.warn('Feedback loop error:', feedbackError);
            // Don't fail the task if feedback loop fails
          }
        }
      } else if (agent === 'planner') {
        result = await this.plannerAgent.execute(task, context);
      } else {
        result = await this.reviewerAgent.execute(task, context);
      }

    } catch (error) {
      logger.error(`Task ${queuedTask.id} threw error:`, error);
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
      task: queuedTask,
      result,
      duration,
      agent,
      attempt: queuedTask.attempts,
      feedbackResult,
    };
  }

  /**
   * Convert numeric priority to TaskPriority string
   */
  private convertPriorityToString(priority: number): TaskPriority {
    if (priority >= 90) return 'critical';
    if (priority >= 70) return 'high';
    if (priority >= 40) return 'medium';
    return 'low';
  }

  /**
   * Determine which agent should handle a task
   */
  private getAgentForTask(task: Task | QueuedTask): AgentRole {
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
    queueStats: QueueStats;
    agentMetrics: Record<AgentRole, any>;
  } {
    return {
      isExecuting: this.isExecuting,
      queuedTasks: this.taskQueue.getStats().pending,
      executedTasks: this.executedTasks.length,
      queueStats: this.taskQueue.getStats(),
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
    this.taskQueue.clear();
    this.executedTasks = [];
    this.isExecuting = false;
    
    this.plannerAgent.clearMemory();
    this.executorAgent.clearMemory();
    this.reviewerAgent.clearMemory();

    logger.info('Orchestrator reset');
  }
}
