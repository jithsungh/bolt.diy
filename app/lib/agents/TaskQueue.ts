/**
 * Task Queue System for Multi-Agent Pipeline
 * Manages task distribution, prioritization, and execution tracking
 */

import { createScopedLogger } from '~/utils/logger';
import type { Task, AgentRole, TaskStatus } from './types';

const logger = createScopedLogger('TaskQueue');

export interface QueuedTask extends Omit<Task, 'priority'> {
  queuedAt: number;
  startedAt?: number;
  completedAt?: number;
  attempts: number;
  maxAttempts: number;
  priority: number; // Numeric priority instead of TaskPriority
  dependencies: string[]; // Task IDs that must complete first
}

export interface QueueStats {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  blocked: number; // Waiting for dependencies
}

export interface TaskQueueConfig {
  maxConcurrent?: number;
  defaultMaxAttempts?: number;
  taskTimeout?: number; // milliseconds
  priorityLevels?: number;
}

/**
 * Priority-based task queue with dependency resolution
 */
export class TaskQueue {
  private queue: Map<string, QueuedTask> = new Map();
  private running: Set<string> = new Set();
  private completed: Set<string> = new Set();
  private failed: Set<string> = new Set();
  
  private maxConcurrent: number;
  private defaultMaxAttempts: number;
  private taskTimeout: number;
  
  private onTaskStart?: (task: QueuedTask) => void;
  private onTaskComplete?: (taskId: string, success: boolean) => void;

  constructor(config: TaskQueueConfig = {}) {
    this.maxConcurrent = config.maxConcurrent || 3;
    this.defaultMaxAttempts = config.defaultMaxAttempts || 3;
    this.taskTimeout = config.taskTimeout || 300000; // 5 minutes default
    
    logger.info('TaskQueue initialized', {
      maxConcurrent: this.maxConcurrent,
      defaultMaxAttempts: this.defaultMaxAttempts,
      taskTimeout: this.taskTimeout,
    });
  }

  /**
   * Add task to queue
   */
  enqueue(task: Task, options?: {
    priority?: number;
    maxAttempts?: number;
    dependencies?: string[];
  }): string {
    const queuedTask: QueuedTask = {
      ...task,
      queuedAt: Date.now(),
      attempts: 0,
      maxAttempts: options?.maxAttempts || this.defaultMaxAttempts,
      priority: options?.priority || 0,
      dependencies: options?.dependencies || [],
    };

    this.queue.set(task.id, queuedTask);
    logger.info(`Task enqueued: ${task.id}`, {
      type: task.type,
      priority: queuedTask.priority,
      dependencies: queuedTask.dependencies,
    });

    return task.id;
  }

  /**
   * Add multiple tasks with automatic dependency detection
   */
  enqueueBatch(tasks: Task[], options?: {
    priority?: number;
    detectDependencies?: boolean;
  }): string[] {
    const taskIds: string[] = [];

    // If dependency detection is enabled, analyze task relationships
    if (options?.detectDependencies) {
      const dependencyMap = this.detectDependencies(tasks);
      
      for (const task of tasks) {
        const deps = dependencyMap.get(task.id) || [];
        const taskId = this.enqueue(task, {
          priority: options?.priority,
          dependencies: deps,
        });
        taskIds.push(taskId);
      }
    } else {
      // Simple batch enqueue
      for (const task of tasks) {
        const taskId = this.enqueue(task, { priority: options?.priority });
        taskIds.push(taskId);
      }
    }

    return taskIds;
  }

  /**
   * Detect dependencies between tasks based on file targets
   */
  private detectDependencies(tasks: Task[]): Map<string, string[]> {
    const dependencyMap = new Map<string, string[]>();
    
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const deps: string[] = [];
      
      // Check if this task depends on files modified by previous tasks
      for (let j = 0; j < i; j++) {
        const prevTask = tasks[j];
        
        if (this.hasFileDependency(task, prevTask)) {
          deps.push(prevTask.id);
        }
      }
      
      dependencyMap.set(task.id, deps);
    }
    
    return dependencyMap;
  }

  /**
   * Check if task depends on files from another task
   */
  private hasFileDependency(task: Task, dependsOn: Task): boolean {
    if (!task.targetFiles || !dependsOn.targetFiles) {
      return false;
    }

    // If any target file is in common, there's a dependency
    const taskFiles = new Set(task.targetFiles);
    return dependsOn.targetFiles.some(file => taskFiles.has(file));
  }

  /**
   * Get next task to execute (priority + dependency aware)
   */
  getNext(): QueuedTask | null {
    if (this.running.size >= this.maxConcurrent) {
      return null; // At capacity
    }

    let bestTask: QueuedTask | null = null;
    let bestPriority = -Infinity;

    for (const [taskId, task] of this.queue) {
      // Skip if already running or completed
      if (this.running.has(taskId) || this.completed.has(taskId) || this.failed.has(taskId)) {
        continue;
      }

      // Check if dependencies are satisfied
      if (!this.areDependenciesSatisfied(task)) {
        continue;
      }

      // Select task with highest priority
      if (task.priority > bestPriority) {
        bestTask = task;
        bestPriority = task.priority;
      }
    }

    if (bestTask) {
      this.running.add(bestTask.id);
      bestTask.startedAt = Date.now();
      bestTask.attempts++;
      bestTask.status = 'in-progress';
      
      logger.info(`Task started: ${bestTask.id}`, {
        attempt: bestTask.attempts,
        maxAttempts: bestTask.maxAttempts,
      });

      if (this.onTaskStart) {
        this.onTaskStart(bestTask);
      }
    }

    return bestTask;
  }

  /**
   * Check if all task dependencies are satisfied
   */
  private areDependenciesSatisfied(task: QueuedTask): boolean {
    for (const depId of task.dependencies) {
      if (!this.completed.has(depId)) {
        // Dependency not completed yet
        if (this.failed.has(depId)) {
          // Dependency failed - mark this task as failed too
          this.markFailed(task.id, 'Dependency failed');
          return false;
        }
        return false; // Still waiting
      }
    }
    return true;
  }

  /**
   * Mark task as completed
   */
  markCompleted(taskId: string): void {
    this.running.delete(taskId);
    this.completed.add(taskId);
    
    const task = this.queue.get(taskId);
    if (task) {
      task.completedAt = Date.now();
      task.status = 'completed';
      
      const duration = task.completedAt - (task.startedAt || task.queuedAt);
      logger.info(`Task completed: ${taskId}`, {
        duration: `${duration}ms`,
        attempts: task.attempts,
      });
    }

    if (this.onTaskComplete) {
      this.onTaskComplete(taskId, true);
    }
  }

  /**
   * Mark task as failed (with retry logic)
   */
  markFailed(taskId: string, error?: string): boolean {
    const task = this.queue.get(taskId);
    
    if (!task) {
      return false;
    }

    this.running.delete(taskId);

    // Check if we should retry
    if (task.attempts < task.maxAttempts) {
      logger.warn(`Task failed, will retry: ${taskId}`, {
        attempt: task.attempts,
        maxAttempts: task.maxAttempts,
        error,
      });
      
      task.status = 'pending';
      // Task stays in queue for retry
      return true; // Will retry
    }

    // Max attempts reached
    this.failed.add(taskId);
    task.status = 'failed';
    task.completedAt = Date.now();
    
    logger.error(`Task failed permanently: ${taskId}`, {
      attempts: task.attempts,
      error,
    });

    if (this.onTaskComplete) {
      this.onTaskComplete(taskId, false);
    }

    return false; // No more retries
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): QueuedTask | undefined {
    return this.queue.get(taskId);
  }

  /**
   * Get all tasks with specific status
   */
  getTasksByStatus(status: TaskStatus): QueuedTask[] {
    return Array.from(this.queue.values()).filter(task => task.status === status);
  }

  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    const tasks = Array.from(this.queue.values());
    
    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      running: this.running.size,
      completed: this.completed.size,
      failed: this.failed.size,
      blocked: tasks.filter(t => 
        t.status === 'pending' && !this.areDependenciesSatisfied(t)
      ).length,
    };
  }

  /**
   * Get tasks blocked by dependencies
   */
  getBlockedTasks(): Array<{ task: QueuedTask; waitingFor: string[] }> {
    const blocked: Array<{ task: QueuedTask; waitingFor: string[] }> = [];
    
    for (const task of this.queue.values()) {
      if (task.status === 'pending') {
        const waitingFor = task.dependencies.filter(depId => 
          !this.completed.has(depId)
        );
        
        if (waitingFor.length > 0) {
          blocked.push({ task, waitingFor });
        }
      }
    }
    
    return blocked;
  }

  /**
   * Set task start callback
   */
  onStart(callback: (task: QueuedTask) => void): void {
    this.onTaskStart = callback;
  }

  /**
   * Set task completion callback
   */
  onComplete(callback: (taskId: string, success: boolean) => void): void {
    this.onTaskComplete = callback;
  }

  /**
   * Clear completed tasks from queue
   */
  clearCompleted(): number {
    let cleared = 0;
    
    for (const [taskId, task] of this.queue) {
      if (this.completed.has(taskId) || this.failed.has(taskId)) {
        this.queue.delete(taskId);
        cleared++;
      }
    }
    
    logger.info(`Cleared ${cleared} completed/failed tasks`);
    return cleared;
  }

  /**
   * Cancel a pending task
   */
  cancel(taskId: string): boolean {
    const task = this.queue.get(taskId);
    
    if (!task || this.running.has(taskId)) {
      return false; // Can't cancel running task
    }

    this.queue.delete(taskId);
    logger.info(`Task cancelled: ${taskId}`);
    return true;
  }

  /**
   * Clear all tasks
   */
  clear(): void {
    this.queue.clear();
    this.running.clear();
    this.completed.clear();
    this.failed.clear();
    logger.info('Queue cleared');
  }

  /**
   * Get execution progress
   */
  getProgress(): {
    completed: number;
    total: number;
    percentage: number;
    estimatedTimeRemaining?: number;
  } {
    const total = this.queue.size;
    const completed = this.completed.size;
    const percentage = total > 0 ? (completed / total) * 100 : 0;

    // Calculate average task duration for estimation
    let totalDuration = 0;
    let completedCount = 0;

    for (const task of this.queue.values()) {
      if (task.completedAt && task.startedAt) {
        totalDuration += task.completedAt - task.startedAt;
        completedCount++;
      }
    }

    const avgDuration = completedCount > 0 ? totalDuration / completedCount : null;
    const remaining = total - completed;
    const estimatedTimeRemaining = avgDuration && remaining > 0 
      ? avgDuration * remaining 
      : undefined;

    return {
      completed,
      total,
      percentage,
      estimatedTimeRemaining,
    };
  }
}
