/**
 * Agent Evaluation and Scoring System
 * Measures agent performance, tracks metrics, and enables self-improvement
 */

import { createScopedLogger } from '~/utils/logger';
import type { Task, TaskResult, AgentRole, FileChange } from './types';

const logger = createScopedLogger('AgentEvaluation');

export interface EvaluationMetrics {
  taskId: string;
  agentRole: AgentRole;
  timestamp: number;
  
  // Success metrics
  success: boolean;
  completionTime: number; // milliseconds
  attempts: number;
  
  // Quality metrics
  codeQuality: number; // 0-1
  testCoverage?: number; // 0-1
  performanceScore?: number; // 0-1
  
  // Efficiency metrics
  linesChanged: number;
  filesModified: number;
  tokenUsage?: number;
  
  // Error metrics
  errorCount: number;
  warningCount: number;
  criticalIssues: number;
  
  // Safety metrics
  safetyScore: number; // 0-1
  breakingChanges: boolean;
  dataLossRisk: boolean;
}

export interface AgentPerformance {
  agentRole: AgentRole;
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  successRate: number;
  
  averageCompletionTime: number;
  averageAttempts: number;
  averageQuality: number;
  averageSafety: number;
  
  strengths: string[];
  weaknesses: string[];
  improvementAreas: string[];
}

export interface FailureCategory {
  type: 'syntax' | 'logic' | 'integration' | 'dependency' | 'timeout' | 'safety';
  count: number;
  examples: string[];
  pattern?: string;
}

/**
 * Evaluation system for measuring and improving agent performance
 */
export class AgentEvaluationSystem {
  private metrics: Map<string, EvaluationMetrics> = new Map();
  private performanceCache: Map<AgentRole, AgentPerformance> = new Map();
  
  constructor() {
    logger.info('Agent Evaluation System initialized');
  }

  /**
   * Evaluate a completed task
   */
  evaluateTask(
    task: Task,
    result: TaskResult,
    metadata: {
      completionTime: number;
      attempts: number;
      tokenUsage?: number;
    }
  ): EvaluationMetrics {
    const metrics: EvaluationMetrics = {
      taskId: task.id,
      agentRole: task.assignedTo || 'executor',
      timestamp: Date.now(),
      
      success: result.success,
      completionTime: metadata.completionTime,
      attempts: metadata.attempts,
      
      codeQuality: this.calculateCodeQuality(result),
      
      linesChanged: this.countLinesChanged(result.changes || []),
      filesModified: result.changes?.length || 0,
      tokenUsage: metadata.tokenUsage,
      
      errorCount: result.validationErrors?.filter(e => e.severity === 'error').length || 0,
      warningCount: result.validationErrors?.filter(e => e.severity === 'warning').length || 0,
      criticalIssues: result.validationErrors?.filter(e => 
        e.severity === 'error' && (e.type === 'safety' || e.type === 'breaking')
      ).length || 0,
      
      safetyScore: this.calculateSafetyScore(result),
      breakingChanges: this.hasBreakingChanges(result),
      dataLossRisk: this.hasDataLossRisk(result),
    };

    this.metrics.set(task.id, metrics);
    this.performanceCache.clear(); // Clear cache to recalculate
    
    logger.info(`Task evaluated: ${task.id}`, {
      success: metrics.success,
      quality: metrics.codeQuality,
      safety: metrics.safetyScore,
    });

    return metrics;
  }

  /**
   * Calculate code quality score
   */
  private calculateCodeQuality(result: TaskResult): number {
    let score = 1.0;

    // Deduct for errors
    const errors = result.validationErrors?.filter(e => e.severity === 'error') || [];
    score -= errors.length * 0.1;

    // Deduct for warnings
    const warnings = result.validationErrors?.filter(e => e.severity === 'warning') || [];
    score -= warnings.length * 0.05;

    // Bonus for suggestions followed
    if (result.suggestions && result.suggestions.length > 0) {
      score += 0.05;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Calculate safety score
   */
  private calculateSafetyScore(result: TaskResult): number {
    let score = 1.0;

    // Check for breaking changes
    if (this.hasBreakingChanges(result)) {
      score -= 0.3;
    }

    // Check for data loss risk
    if (this.hasDataLossRisk(result)) {
      score -= 0.4;
    }

    // Check for safety validation errors
    const safetyErrors = result.validationErrors?.filter(e => e.type === 'safety') || [];
    score -= safetyErrors.length * 0.15;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Count total lines changed
   */
  private countLinesChanged(changes: FileChange[]): number {
    let total = 0;

    for (const change of changes) {
      if (change.diff) {
        // Count + and - lines in diff
        const lines = change.diff.split('\n');
        total += lines.filter(l => l.startsWith('+') || l.startsWith('-')).length;
      } else if (change.newContent) {
        total += change.newContent.split('\n').length;
      }
    }

    return total;
  }

  /**
   * Check for breaking changes
   */
  private hasBreakingChanges(result: TaskResult): boolean {
    return result.validationErrors?.some(e => e.type === 'breaking') || false;
  }

  /**
   * Check for data loss risk
   */
  private hasDataLossRisk(result: TaskResult): boolean {
    // Check for delete operations
    const hasDeletes = result.changes?.some(c => c.changeType === 'delete');
    
    // Check for destructive database operations
    const hasDestructiveOps = result.changes?.some(c =>
      c.newContent?.includes('DROP TABLE') ||
      c.newContent?.includes('DELETE FROM') ||
      c.newContent?.includes('TRUNCATE')
    );

    return hasDeletes || hasDestructiveOps || false;
  }

  /**
   * Get performance statistics for an agent
   */
  getAgentPerformance(agentRole: AgentRole): AgentPerformance {
    // Check cache first
    if (this.performanceCache.has(agentRole)) {
      return this.performanceCache.get(agentRole)!;
    }

    const agentMetrics = Array.from(this.metrics.values())
      .filter(m => m.agentRole === agentRole);

    if (agentMetrics.length === 0) {
      return {
        agentRole,
        totalTasks: 0,
        successfulTasks: 0,
        failedTasks: 0,
        successRate: 0,
        averageCompletionTime: 0,
        averageAttempts: 0,
        averageQuality: 0,
        averageSafety: 0,
        strengths: [],
        weaknesses: [],
        improvementAreas: [],
      };
    }

    const totalTasks = agentMetrics.length;
    const successfulTasks = agentMetrics.filter(m => m.success).length;
    const failedTasks = totalTasks - successfulTasks;
    const successRate = successfulTasks / totalTasks;

    const averageCompletionTime = agentMetrics.reduce((sum, m) => 
      sum + m.completionTime, 0
    ) / totalTasks;

    const averageAttempts = agentMetrics.reduce((sum, m) => 
      sum + m.attempts, 0
    ) / totalTasks;

    const averageQuality = agentMetrics.reduce((sum, m) => 
      sum + m.codeQuality, 0
    ) / totalTasks;

    const averageSafety = agentMetrics.reduce((sum, m) => 
      sum + m.safetyScore, 0
    ) / totalTasks;

    // Identify strengths and weaknesses
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const improvementAreas: string[] = [];

    if (successRate > 0.9) {
      strengths.push('High success rate');
    } else if (successRate < 0.7) {
      weaknesses.push('Low success rate');
      improvementAreas.push('Improve task planning and error handling');
    }

    if (averageQuality > 0.8) {
      strengths.push('High code quality');
    } else if (averageQuality < 0.6) {
      weaknesses.push('Low code quality');
      improvementAreas.push('Focus on cleaner code and fewer errors');
    }

    if (averageSafety > 0.9) {
      strengths.push('Excellent safety record');
    } else if (averageSafety < 0.7) {
      weaknesses.push('Safety concerns');
      improvementAreas.push('Be more cautious with breaking changes');
    }

    if (averageAttempts < 1.5) {
      strengths.push('Efficient - few retries needed');
    } else if (averageAttempts > 2.5) {
      weaknesses.push('Too many retries required');
      improvementAreas.push('Improve first-attempt success rate');
    }

    const performance: AgentPerformance = {
      agentRole,
      totalTasks,
      successfulTasks,
      failedTasks,
      successRate,
      averageCompletionTime,
      averageAttempts,
      averageQuality,
      averageSafety,
      strengths,
      weaknesses,
      improvementAreas,
    };

    this.performanceCache.set(agentRole, performance);
    return performance;
  }

  /**
   * Categorize failures for pattern analysis
   */
  categorizeFailures(agentRole?: AgentRole): FailureCategory[] {
    const relevantMetrics = agentRole
      ? Array.from(this.metrics.values()).filter(m => m.agentRole === agentRole)
      : Array.from(this.metrics.values());

    const failedMetrics = relevantMetrics.filter(m => !m.success);

    const categories = new Map<string, FailureCategory>();

    for (const metric of failedMetrics) {
      // Analyze failure type based on metrics
      let type: FailureCategory['type'] = 'logic';

      if (metric.errorCount > 0) {
        type = 'syntax';
      } else if (metric.safetyScore < 0.5) {
        type = 'safety';
      } else if (metric.completionTime > 300000) {
        type = 'timeout';
      }

      const key = type;
      const category = categories.get(key) || {
        type,
        count: 0,
        examples: [],
      };

      category.count++;
      if (category.examples.length < 5) {
        category.examples.push(metric.taskId);
      }

      categories.set(key, category);
    }

    return Array.from(categories.values()).sort((a, b) => b.count - a.count);
  }

  /**
   * Get overall system performance
   */
  getSystemPerformance(): {
    totalTasks: number;
    successRate: number;
    averageQuality: number;
    averageSafety: number;
    topPerformer: AgentRole | null;
    needsImprovement: AgentRole | null;
  } {
    const allMetrics = Array.from(this.metrics.values());
    
    if (allMetrics.length === 0) {
      return {
        totalTasks: 0,
        successRate: 0,
        averageQuality: 0,
        averageSafety: 0,
        topPerformer: null,
        needsImprovement: null,
      };
    }

    const totalTasks = allMetrics.length;
    const successfulTasks = allMetrics.filter(m => m.success).length;
    const successRate = successfulTasks / totalTasks;

    const averageQuality = allMetrics.reduce((sum, m) => 
      sum + m.codeQuality, 0
    ) / totalTasks;

    const averageSafety = allMetrics.reduce((sum, m) => 
      sum + m.safetyScore, 0
    ) / totalTasks;

    // Find top performer and underperformer
    const agents: AgentRole[] = ['planner', 'executor', 'reviewer'];
    let topPerformer: AgentRole | null = null;
    let topScore = 0;
    let needsImprovement: AgentRole | null = null;
    let lowestScore = 1;

    for (const agent of agents) {
      const perf = this.getAgentPerformance(agent);
      const score = (perf.successRate + perf.averageQuality + perf.averageSafety) / 3;

      if (perf.totalTasks > 0 && score > topScore) {
        topScore = score;
        topPerformer = agent;
      }

      if (perf.totalTasks > 0 && score < lowestScore) {
        lowestScore = score;
        needsImprovement = agent;
      }
    }

    return {
      totalTasks,
      successRate,
      averageQuality,
      averageSafety,
      topPerformer,
      needsImprovement,
    };
  }

  /**
   * Export metrics for analysis
   */
  exportMetrics(): EvaluationMetrics[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Clear old metrics (keep only recent)
   */
  pruneMetrics(daysToKeep: number = 7): number {
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    let pruned = 0;

    for (const [taskId, metric] of this.metrics) {
      if (metric.timestamp < cutoffTime) {
        this.metrics.delete(taskId);
        pruned++;
      }
    }

    this.performanceCache.clear();
    logger.info(`Pruned ${pruned} old metrics`);
    return pruned;
  }

  /**
   * Get improvement suggestions based on performance data
   */
  getImprovementSuggestions(): string[] {
    const suggestions: string[] = [];
    const systemPerf = this.getSystemPerformance();

    if (systemPerf.successRate < 0.8) {
      suggestions.push('Overall success rate is low. Review task planning and error handling.');
    }

    if (systemPerf.averageQuality < 0.7) {
      suggestions.push('Code quality needs improvement. Focus on validation and testing.');
    }

    if (systemPerf.averageSafety < 0.8) {
      suggestions.push('Safety scores are concerning. Implement stricter safety checks.');
    }

    // Agent-specific suggestions
    const agents: AgentRole[] = ['planner', 'executor', 'reviewer'];
    for (const agent of agents) {
      const perf = this.getAgentPerformance(agent);
      if (perf.totalTasks > 0 && perf.successRate < 0.75) {
        suggestions.push(`${agent} agent needs attention: ${perf.improvementAreas.join(', ')}`);
      }
    }

    return suggestions;
  }
}
