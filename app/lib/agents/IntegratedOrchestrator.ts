/**
 * Integrated Agent Orchestrator
 * 
 * Coordinates the multi-agent system while properly integrating with
 * bolt.diy's existing infrastructure (ActionRunner, LLMManager, WorkbenchStore).
 * 
 * This replaces the standalone AgentOrchestrator with a properly integrated version.
 */

import { createScopedLogger } from '~/utils/logger';
import type { ActionRunner } from '~/lib/runtime/action-runner';
import { PlannerAgent } from './PlannerAgent';
import { ExecutorAgent } from './ExecutorAgent';
import { ReviewerAgent } from './ReviewerAgent';
import type { Task, TaskResult, SafetyConstraints } from './types';
import { MemoryManager } from '~/lib/memory/MemoryManager';
import type { FileMap } from '~/lib/.server/llm/constants';

const logger = createScopedLogger('IntegratedOrchestrator');

export interface OrchestratorConfig {
  actionRunner: ActionRunner;
  files?: FileMap;
  cwd?: string;
  enableMemory?: boolean;
  safetyConstraints?: Partial<SafetyConstraints>;
  serverEnv?: Record<string, string>;
  apiKeys?: Record<string, string>;
}

export interface OrchestratorResult {
  success: boolean;
  tasks: Task[];
  results: TaskResult[];
  summary: string;
  errors?: string[];
}

/**
 * Integrated Agent Orchestrator
 * Properly wraps bolt.diy's existing systems
 */
export class IntegratedOrchestrator {
  private actionRunner: ActionRunner;
  private planner: PlannerAgent;
  private executor: ExecutorAgent;
  private reviewer: ReviewerAgent;
  private memoryManager?: MemoryManager;
  private safetyConstraints: SafetyConstraints;

  constructor(config: OrchestratorConfig) {
    this.actionRunner = config.actionRunner;

    // Initialize agents with proper dependencies
    this.planner = new PlannerAgent();
    this.executor = new ExecutorAgent({
      actionRunner: config.actionRunner, // ✅ Properly inject ActionRunner
    });
    this.reviewer = new ReviewerAgent();

    // Setup memory if enabled
    if (config.enableMemory) {
      this.memoryManager = new MemoryManager({
        modelProvider: 'openai',
        embeddingDimensions: 384,
        persistencePrefix: 'bolt_agent',
      });
    }

    // Default safety constraints
    this.safetyConstraints = {
      maxFilesPerTask: 10,
      maxLinesPerFile: 1000,
      forbiddenOperations: ['rm -rf /', 'sudo', 'format'],
      requiresApproval: false,
      validateBeforeExecute: true,
      rollbackOnError: true,
      ...config.safetyConstraints,
    };

    logger.info('IntegratedOrchestrator initialized', {
      memoryEnabled: !!this.memoryManager,
      safetyLevel: this.safetyConstraints.validateBeforeExecute ? 'strict' : 'loose',
    });
  }

  /**
   * Initialize async components (memory, etc.)
   */
  async initialize(): Promise<void> {
    if (this.memoryManager) {
      await this.memoryManager.initialize();
      logger.info('Memory system initialized');
    }
  }

  /**
   * Process a user request through the agent pipeline
   * 
   * Flow:
   * 1. Planner decomposes request into tasks
   * 2. Executor executes tasks via ActionRunner
   * 3. Reviewer validates results
   * 4. Memory records learnings (if enabled)
   */
  async processRequest(
    userRequest: string,
    context: {
      files?: FileMap;
      conversationHistory?: string[];
      cwd?: string;
    }
  ): Promise<OrchestratorResult> {
    logger.info('Processing user request', { requestLength: userRequest.length });

    try {
      // Step 1: Planning
      const planResult = await this.planner.execute({
        id: `plan_${Date.now()}`,
        type: 'analysis',
        description: userRequest,
        priority: 'high',
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }, {
        repoContext: {
          files: context.files || {},
          dependencies: [],
          architecture: [],
          lockedFiles: [],
        },
        conversationHistory: context.conversationHistory || [],
      } as any);

      if (!planResult.success || !planResult.output) {
        return {
          success: false,
          tasks: [],
          results: [],
          summary: 'Planning failed',
          errors: planResult.validationErrors?.map(e => e.message) || ['Planning failed'],
        };
      }

      const tasks: Task[] = planResult.output.tasks || [];
      logger.info(`Planner generated ${tasks.length} tasks`);

      // Step 2: Execution
      const results: TaskResult[] = [];

      for (const task of tasks) {
        logger.info(`Executing task: ${task.id} - ${task.description}`);

        const executionResult = await this.executor.execute(task, {
          context: {
            repoContext: {
              files: context.files || {},
              dependencies: [],
              architecture: [],
              lockedFiles: [],
            },
            conversationHistory: context.conversationHistory || [],
          },
          task,
          safetyConstraints: this.safetyConstraints,
        });

        results.push(executionResult);

        // Stop on critical failure
        if (!executionResult.success) {
          const hasErrors = executionResult.validationErrors?.some(e => e.severity === 'error');
          if (hasErrors) {
            logger.error(`Task ${task.id} failed critically, stopping execution`);
            break;
          }
        }
      }

      // Step 3: Review
      const reviewResult = await this.reviewer.execute({
        id: `review_${Date.now()}`,
        type: 'review',
        description: 'Review execution results',
        priority: 'high',
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }, {
        tasks,
        results,
        originalRequest: userRequest,
      } as any);

      // Step 4: Memory (if enabled)
      if (this.memoryManager && reviewResult.success) {
        await this.recordToMemory(userRequest, tasks, results, reviewResult.output);
      }

      // Generate summary
      const successCount = results.filter(r => r.success).length;
      const summary = `Completed ${successCount}/${tasks.length} tasks successfully`;

      return {
        success: reviewResult.output?.approved ?? false,
        tasks,
        results,
        summary,
        errors: results
          .flatMap(r => r.validationErrors || [])
          .filter(e => e.severity === 'error')
          .map(e => e.message),
      };

    } catch (error) {
      logger.error('Orchestrator error:', error);
      return {
        success: false,
        tasks: [],
        results: [],
        summary: 'Orchestration failed',
        errors: [(error as Error).message],
      };
    }
  }

  /**
   * Record successful patterns to long-term memory
   */
  private async recordToMemory(
    request: string,
    tasks: Task[],
    results: TaskResult[],
    reviewOutput: any
  ): Promise<void> {
    if (!this.memoryManager) {
      return;
    }

    try {
      // Record successful patterns
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        const result = results[i];

        if (result && this.memoryManager) {
          // Record each task result to memory
          await this.memoryManager.recordTaskResult(task, result);
        }
      }

      const successCount = results.filter(r => r?.success).length;
      logger.info(`Recorded ${successCount}/${tasks.length} task results to memory`);
    } catch (error) {
      logger.warn('Failed to record to memory:', error);
    }
  }

  /**
   * Search memory for relevant past work
   */
  async searchMemory(query: string, limit: number = 5): Promise<any[]> {
    if (!this.memoryManager) {
      return [];
    }

    try {
      return await this.memoryManager.search(query, limit);
    } catch (error) {
      logger.warn('Memory search failed:', error);
      return [];
    }
  }

  /**
   * Get orchestrator status
   */
  getStatus(): {
    ready: boolean;
    memoryEnabled: boolean;
    safetyLevel: string;
  } {
    return {
      ready: true,
      memoryEnabled: !!this.memoryManager,
      safetyLevel: this.safetyConstraints.validateBeforeExecute ? 'strict' : 'loose',
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    // Cleanup memory connections, etc.
    logger.info('Orchestrator cleanup complete');
  }
}
