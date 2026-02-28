/**
 * Self-Improvement Engine — Phase 6
 *
 * Analyzes agent performance metrics and automatically improves the system
 * by identifying patterns, tuning prompts, and adjusting strategies.
 *
 * Key Features:
 *  - Analyze failure patterns across tasks
 *  - Generate prompt improvements based on data
 *  - Track improvement impact over time
 *  - Auto-generate regression tests from failures
 *  - Adaptive strategy selection
 *
 * Integration:
 *  - Consumes data from AgentEvaluationSystem
 *  - Generates improved prompts for agents
 *  - Tracks long-term performance trends
 *  - Feeds insights back into MemoryManager
 */

import { createScopedLogger } from '~/utils/logger';
import type { AgentRole, Task, TaskResult } from './types';
import type { EvaluationMetrics, AgentPerformance, FailureCategory } from './AgentEvaluationSystem';

const logger = createScopedLogger('SelfImprovementEngine');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FailurePattern {
  id: string;
  type: FailureCategory['type'];
  frequency: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  examples: string[];
  affectedAgents: AgentRole[];
  firstSeen: number;
  lastSeen: number;
  suggestedFix?: string;
}

export interface PromptImprovement {
  id: string;
  agentRole: AgentRole;
  currentPrompt: string;
  improvedPrompt: string;
  rationale: string;
  expectedImpact: number; // 0-1
  confidence: number; // 0-1
  basedOnMetrics: {
    failureCount: number;
    successRate: number;
    avgQuality: number;
  };
  status: 'proposed' | 'applied' | 'measuring' | 'validated' | 'rejected';
  appliedAt?: number;
  measuredImpact?: number;
}

export interface ImprovementReport {
  timestamp: number;
  period: {
    start: number;
    end: number;
  };
  improvements: PromptImprovement[];
  patternsIdentified: FailurePattern[];
  performanceTrends: {
    agent: AgentRole;
    successRateTrend: number; // -1 to 1 (negative is degrading)
    qualityTrend: number;
    speedTrend: number;
  }[];
  recommendations: string[];
  overallHealth: number; // 0-1
}

export interface RegressionTest {
  id: string;
  name: string;
  description: string;
  basedOnFailure: string; // Failure pattern ID
  input: {
    task: Partial<Task>;
    context: Record<string, any>;
  };
  expectedOutput: {
    success: boolean;
    minQuality?: number;
    maxDuration?: number;
  };
  status: 'pending' | 'passing' | 'failing';
  lastRun?: number;
  passRate: number; // 0-1
}

export interface SelfImprovementConfig {
  /** Enable automatic prompt improvements */
  autoApplyImprovements?: boolean;
  /** Minimum confidence to auto-apply (0-1) */
  minConfidenceForAutoApply?: number;
  /** How many tasks to analyze for patterns */
  patternAnalysisWindow?: number;
  /** Minimum failure count to consider a pattern */
  minFailureCountForPattern?: number;
  /** Enable regression test generation */
  autoGenerateTests?: boolean;
  /** Enable performance tracking */
  trackPerformanceTrends?: boolean;
}

// ---------------------------------------------------------------------------
// Self-Improvement Engine Implementation
// ---------------------------------------------------------------------------

export class SelfImprovementEngine {
  private config: Required<SelfImprovementConfig>;
  private failurePatterns: Map<string, FailurePattern> = new Map();
  private promptImprovements: Map<string, PromptImprovement> = new Map();
  private regressionTests: Map<string, RegressionTest> = new Map();
  private historicalMetrics: EvaluationMetrics[] = [];
  private performanceBaseline: Map<AgentRole, AgentPerformance> = new Map();

  constructor(config: SelfImprovementConfig = {}) {
    this.config = {
      autoApplyImprovements: config.autoApplyImprovements ?? false,
      minConfidenceForAutoApply: config.minConfidenceForAutoApply ?? 0.8,
      patternAnalysisWindow: config.patternAnalysisWindow ?? 100,
      minFailureCountForPattern: config.minFailureCountForPattern ?? 3,
      autoGenerateTests: config.autoGenerateTests ?? true,
      trackPerformanceTrends: config.trackPerformanceTrends ?? true,
    };

    logger.info('SelfImprovementEngine initialized', this.config);
  }

  // -------------------------------------------------------------------------
  // Main API - Pattern Analysis
  // -------------------------------------------------------------------------

  /**
   * Analyze recent metrics to identify failure patterns
   */
  analyzeFailurePatterns(metrics: EvaluationMetrics[]): FailurePattern[] {
    logger.info(`Analyzing ${metrics.length} metrics for patterns`);

    // Store historical data
    this.historicalMetrics.push(...metrics);

    // Keep only recent history
    if (this.historicalMetrics.length > this.config.patternAnalysisWindow * 2) {
      this.historicalMetrics = this.historicalMetrics.slice(-this.config.patternAnalysisWindow * 2);
    }

    // Group failures by characteristics
    const failureGroups = this.groupFailures(metrics.filter((m) => !m.success));

    // Identify patterns
    const patterns: FailurePattern[] = [];

    for (const [key, failures] of failureGroups.entries()) {
      if (failures.length >= this.config.minFailureCountForPattern) {
        const pattern = this.createPattern(key, failures);
        patterns.push(pattern);
        this.failurePatterns.set(pattern.id, pattern);
      }
    }

    logger.info(`Identified ${patterns.length} failure patterns`);
    return patterns;
  }

  /**
   * Get all known failure patterns
   */
  getFailurePatterns(): FailurePattern[] {
    return Array.from(this.failurePatterns.values());
  }

  /**
   * Get patterns affecting a specific agent
   */
  getPatternsByAgent(agent: AgentRole): FailurePattern[] {
    return this.getFailurePatterns().filter((p) => p.affectedAgents.includes(agent));
  }

  // -------------------------------------------------------------------------
  // Prompt Improvement
  // -------------------------------------------------------------------------

  /**
   * Generate prompt improvement suggestions based on metrics
   */
  suggestPromptImprovements(agent: AgentRole, performance: AgentPerformance): PromptImprovement[] {
    logger.info(`Generating prompt improvements for ${agent}`);

    const improvements: PromptImprovement[] = [];
    const patterns = this.getPatternsByAgent(agent);

    // Analyze what's going wrong
    for (const pattern of patterns) {
      const improvement = this.generateImprovementForPattern(agent, pattern, performance);

      if (improvement) {
        improvements.push(improvement);
        this.promptImprovements.set(improvement.id, improvement);
      }
    }

    // Sort by expected impact
    improvements.sort((a, b) => b.expectedImpact - a.expectedImpact);

    logger.info(`Generated ${improvements.length} improvement suggestions`);
    return improvements;
  }

  /**
   * Apply a prompt improvement
   */
  applyImprovement(improvementId: string): boolean {
    const improvement = this.promptImprovements.get(improvementId);

    if (!improvement) {
      logger.error(`Improvement ${improvementId} not found`);
      return false;
    }

    if (improvement.status !== 'proposed') {
      logger.warn(`Improvement ${improvementId} already in status: ${improvement.status}`);
      return false;
    }

    logger.info(`Applying improvement ${improvementId} for ${improvement.agentRole}`);

    // Mark as applied
    improvement.status = 'applied';
    improvement.appliedAt = Date.now();

    // In real implementation, this would update the agent's prompt
    // For now, we just track it
    logger.info(`Improvement applied: ${improvement.rationale}`);

    // Schedule measurement
    setTimeout(() => {
      this.measureImprovementImpact(improvementId);
    }, 0);

    return true;
  }

  /**
   * Measure the impact of an applied improvement
   */
  async measureImprovementImpact(improvementId: string): Promise<number> {
    const improvement = this.promptImprovements.get(improvementId);

    if (!improvement || improvement.status !== 'applied') {
      return 0;
    }

    logger.info(`Measuring impact of improvement ${improvementId}`);

    improvement.status = 'measuring';

    // Get metrics before and after improvement
    const appliedAt = improvement.appliedAt || Date.now();
    const beforeMetrics = this.historicalMetrics.filter((m) => m.timestamp < appliedAt && m.agentRole === improvement.agentRole);

    const afterMetrics = this.historicalMetrics.filter((m) => m.timestamp >= appliedAt && m.agentRole === improvement.agentRole);

    if (afterMetrics.length < 10) {
      logger.info('Not enough data yet to measure impact');
      return 0;
    }

    // Compare success rates
    const beforeSuccess = beforeMetrics.filter((m) => m.success).length / Math.max(1, beforeMetrics.length);

    const afterSuccess = afterMetrics.filter((m) => m.success).length / Math.max(1, afterMetrics.length);

    const impact = afterSuccess - beforeSuccess;

    improvement.measuredImpact = impact;

    if (impact >= 0.05) {
      improvement.status = 'validated';
      logger.info(`✅ Improvement validated: +${(impact * 100).toFixed(1)}% success rate`);
    } else if (impact < -0.05) {
      improvement.status = 'rejected';
      logger.warn(`❌ Improvement rejected: ${(impact * 100).toFixed(1)}% success rate`);
    } else {
      improvement.status = 'measuring'; // Keep measuring
      logger.info(`⏳ Neutral impact so far: ${(impact * 100).toFixed(1)}% success rate`);
    }

    return impact;
  }

  /**
   * Auto-apply high-confidence improvements
   */
  autoApplyImprovements(agent?: AgentRole): number {
    if (!this.config.autoApplyImprovements) {
      return 0;
    }

    let appliedCount = 0;

    for (const improvement of this.promptImprovements.values()) {
      if (agent && improvement.agentRole !== agent) {
        continue;
      }

      if (
        improvement.status === 'proposed' &&
        improvement.confidence >= this.config.minConfidenceForAutoApply
      ) {
        if (this.applyImprovement(improvement.id)) {
          appliedCount++;
        }
      }
    }

    logger.info(`Auto-applied ${appliedCount} improvements`);
    return appliedCount;
  }

  // -------------------------------------------------------------------------
  // Regression Test Generation
  // -------------------------------------------------------------------------

  /**
   * Generate regression tests from failure patterns
   */
  generateRegressionTests(patterns: FailurePattern[]): RegressionTest[] {
    if (!this.config.autoGenerateTests) {
      return [];
    }

    const tests: RegressionTest[] = [];

    for (const pattern of patterns) {
      if (pattern.severity === 'low') {
        continue; // Skip low severity
      }

      const test = this.createRegressionTest(pattern);
      tests.push(test);
      this.regressionTests.set(test.id, test);
    }

    logger.info(`Generated ${tests.length} regression tests`);
    return tests;
  }

  /**
   * Get all regression tests
   */
  getRegressionTests(): RegressionTest[] {
    return Array.from(this.regressionTests.values());
  }

  /**
   * Get failing regression tests
   */
  getFailingTests(): RegressionTest[] {
    return this.getRegressionTests().filter((t) => t.status === 'failing');
  }

  // -------------------------------------------------------------------------
  // Performance Tracking
  // -------------------------------------------------------------------------

  /**
   * Track performance trends over time
   */
  trackPerformanceTrends(currentPerformance: Map<AgentRole, AgentPerformance>): ImprovementReport['performanceTrends'] {
    if (!this.config.trackPerformanceTrends) {
      return [];
    }

    const trends: ImprovementReport['performanceTrends'] = [];

    for (const [agent, current] of currentPerformance.entries()) {
      const baseline = this.performanceBaseline.get(agent);

      if (!baseline) {
        // First time seeing this agent, set baseline
        this.performanceBaseline.set(agent, current);
        continue;
      }

      const successRateTrend = current.successRate - baseline.successRate;
      const qualityTrend = current.averageQuality - baseline.averageQuality;
      const speedTrend = baseline.averageCompletionTime - current.averageCompletionTime; // Lower is better

      trends.push({
        agent,
        successRateTrend,
        qualityTrend,
        speedTrend,
      });
    }

    return trends;
  }

  /**
   * Generate comprehensive improvement report
   */
  generateImprovementReport(
    currentPerformance: Map<AgentRole, AgentPerformance>,
    recentMetrics: EvaluationMetrics[],
  ): ImprovementReport {
    logger.info('Generating improvement report');

    const patterns = this.analyzeFailurePatterns(recentMetrics);
    const trends = this.trackPerformanceTrends(currentPerformance);

    // Generate recommendations
    const recommendations: string[] = this.generateRecommendations(patterns, trends, currentPerformance);

    // Calculate overall health
    const overallHealth = this.calculateOverallHealth(currentPerformance, patterns);

    const startTime = recentMetrics.length > 0 ? Math.min(...recentMetrics.map((m) => m.timestamp)) : Date.now();

    const endTime = recentMetrics.length > 0 ? Math.max(...recentMetrics.map((m) => m.timestamp)) : Date.now();

    return {
      timestamp: Date.now(),
      period: { start: startTime, end: endTime },
      improvements: Array.from(this.promptImprovements.values()),
      patternsIdentified: patterns,
      performanceTrends: trends,
      recommendations,
      overallHealth,
    };
  }

  // -------------------------------------------------------------------------
  // Internal Implementation
  // -------------------------------------------------------------------------

  private groupFailures(failures: EvaluationMetrics[]): Map<string, EvaluationMetrics[]> {
    const groups = new Map<string, EvaluationMetrics[]>();

    for (const metric of failures) {
      // Group by agent role + rough characteristics
      const key = `${metric.agentRole}:${this.categorizeFailure(metric)}`;

      if (!groups.has(key)) {
        groups.set(key, []);
      }

      groups.get(key)!.push(metric);
    }

    return groups;
  }

  private categorizeFailure(metric: EvaluationMetrics): FailureCategory['type'] {
    if (metric.errorCount > 0) {
      return 'syntax';
    }

    if (metric.safetyScore < 0.5) {
      return 'safety';
    }

    if (metric.completionTime > 30000) {
      return 'timeout';
    }

    return 'logic';
  }

  private createPattern(key: string, failures: EvaluationMetrics[]): FailurePattern {
    const [agentStr, typeStr] = key.split(':');
    const agent = agentStr as AgentRole;
    const type = typeStr as FailureCategory['type'];

    const severity = this.determineSeverity(failures);
    const examples = failures.slice(0, 3).map((f) => f.taskId);

    return {
      id: `pattern-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      frequency: failures.length,
      severity,
      description: this.generatePatternDescription(type, agent, failures),
      examples,
      affectedAgents: [agent],
      firstSeen: Math.min(...failures.map((f) => f.timestamp)),
      lastSeen: Math.max(...failures.map((f) => f.timestamp)),
      suggestedFix: this.generateSuggestedFix(type, agent),
    };
  }

  private determineSeverity(failures: EvaluationMetrics[]): FailurePattern['severity'] {
    const avgSafety = failures.reduce((sum, f) => sum + f.safetyScore, 0) / failures.length;

    if (avgSafety < 0.3 || failures.some((f) => f.dataLossRisk)) {
      return 'critical';
    }

    if (failures.length > 10 || avgSafety < 0.5) {
      return 'high';
    }

    if (failures.length > 5) {
      return 'medium';
    }

    return 'low';
  }

  private generatePatternDescription(type: FailureCategory['type'], agent: AgentRole, failures: EvaluationMetrics[]): string {
    const templates: Record<FailureCategory['type'], string> = {
      syntax: `${agent} frequently produces code with syntax errors`,
      logic: `${agent} generates logically incorrect implementations`,
      integration: `${agent} fails at integrating with existing code`,
      dependency: `${agent} misses or incorrectly handles dependencies`,
      timeout: `${agent} operations frequently timeout`,
      safety: `${agent} produces unsafe changes`,
    };

    return templates[type] || `${agent} has recurring issues with ${type}`;
  }

  private generateSuggestedFix(type: FailureCategory['type'], agent: AgentRole): string {
    const fixes: Record<FailureCategory['type'], string> = {
      syntax: 'Add syntax validation step before proposing changes',
      logic: 'Improve reasoning in prompt, add more examples',
      integration: 'Enhance context gathering, provide more architectural info',
      dependency: 'Add dependency analysis step to planning',
      timeout: 'Break down tasks into smaller chunks',
      safety: 'Strengthen safety constraints and validation',
    };

    return fixes[type] || 'Review and improve agent prompts';
  }

  private generateImprovementForPattern(
    agent: AgentRole,
    pattern: FailurePattern,
    performance: AgentPerformance,
  ): PromptImprovement | null {
    // Generate improved prompt based on pattern
    const rationale = `Address ${pattern.type} failures (${pattern.frequency} occurrences)`;

    const improvement: PromptImprovement = {
      id: `improvement-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      agentRole: agent,
      currentPrompt: '[Current prompt]',
      improvedPrompt: this.generateImprovedPrompt(agent, pattern),
      rationale,
      expectedImpact: this.estimateImpact(pattern, performance),
      confidence: this.calculateConfidence(pattern, performance),
      basedOnMetrics: {
        failureCount: pattern.frequency,
        successRate: performance.successRate,
        avgQuality: performance.averageQuality,
      },
      status: 'proposed',
    };

    return improvement;
  }

  private generateImprovedPrompt(agent: AgentRole, pattern: FailurePattern): string {
    // This would generate an actual improved prompt
    // For now, return a template
    return `Improved prompt addressing ${pattern.type} issues: ${pattern.suggestedFix}`;
  }

  private estimateImpact(pattern: FailurePattern, performance: AgentPerformance): number {
    // Estimate: more frequent failures = higher potential impact
    const impactByFrequency = Math.min(1, pattern.frequency / 20);
    const impactBySeverity = { low: 0.2, medium: 0.5, high: 0.8, critical: 1.0 }[pattern.severity];

    return (impactByFrequency + impactBySeverity) / 2;
  }

  private calculateConfidence(pattern: FailurePattern, performance: AgentPerformance): number {
    // Higher confidence if pattern is consistent and clear
    let confidence = 0.5;

    if (pattern.frequency >= 5) confidence += 0.2;
    if (pattern.frequency >= 10) confidence += 0.1;
    if (pattern.severity !== 'low') confidence += 0.1;
    if (pattern.suggestedFix) confidence += 0.1;

    return Math.min(1, confidence);
  }

  private createRegressionTest(pattern: FailurePattern): RegressionTest {
    return {
      id: `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: `Test ${pattern.type} handling`,
      description: `Regression test for: ${pattern.description}`,
      basedOnFailure: pattern.id,
      input: {
        task: {
          type: 'file_edit',
          description: `Test case based on ${pattern.type} failure`,
        },
        context: {},
      },
      expectedOutput: {
        success: true,
        minQuality: 0.7,
        maxDuration: 30000,
      },
      status: 'pending',
      passRate: 0,
    };
  }

  private generateRecommendations(
    patterns: FailurePattern[],
    trends: ImprovementReport['performanceTrends'],
    performance: Map<AgentRole, AgentPerformance>,
  ): string[] {
    const recommendations: string[] = [];

    // Critical patterns
    const criticalPatterns = patterns.filter((p) => p.severity === 'critical');
    if (criticalPatterns.length > 0) {
      recommendations.push(`🔴 Address ${criticalPatterns.length} critical failure patterns immediately`);
    }

    // Degrading agents
    const degrading = trends.filter((t) => t.successRateTrend < -0.1);
    if (degrading.length > 0) {
      recommendations.push(`⚠️ ${degrading.map((t) => t.agent).join(', ')} showing performance degradation`);
    }

    // High-impact improvements available
    const highImpact = Array.from(this.promptImprovements.values()).filter((i) => i.expectedImpact > 0.7 && i.status === 'proposed');

    if (highImpact.length > 0) {
      recommendations.push(`✨ ${highImpact.length} high-impact improvements available to apply`);
    }

    // Failing regression tests
    const failingTests = this.getFailingTests();
    if (failingTests.length > 0) {
      recommendations.push(`🧪 ${failingTests.length} regression tests failing`);
    }

    // Overall health
    const avgSuccess = Array.from(performance.values()).reduce((sum, p) => sum + p.successRate, 0) / performance.size;

    if (avgSuccess < 0.7) {
      recommendations.push('📉 Overall success rate below 70% - system needs attention');
    } else if (avgSuccess > 0.9) {
      recommendations.push('✅ System performing well - continue monitoring');
    }

    return recommendations;
  }

  private calculateOverallHealth(performance: Map<AgentRole, AgentPerformance>, patterns: FailurePattern[]): number {
    let health = 1.0;

    // Deduct for low success rates
    const avgSuccess = Array.from(performance.values()).reduce((sum, p) => sum + p.successRate, 0) / Math.max(1, performance.size);

    health -= (1 - avgSuccess) * 0.4;

    // Deduct for critical patterns
    const criticalCount = patterns.filter((p) => p.severity === 'critical').length;
    health -= criticalCount * 0.1;

    // Deduct for high pattern count
    health -= Math.min(0.3, patterns.length * 0.02);

    return Math.max(0, Math.min(1, health));
  }

  // -------------------------------------------------------------------------
  // Utility Methods
  // -------------------------------------------------------------------------

  /**
   * Get statistics about the improvement engine
   */
  getStats() {
    return {
      patternsTracked: this.failurePatterns.size,
      improvementsProposed: Array.from(this.promptImprovements.values()).filter((i) => i.status === 'proposed').length,
      improvementsApplied: Array.from(this.promptImprovements.values()).filter((i) => i.status === 'applied').length,
      improvementsValidated: Array.from(this.promptImprovements.values()).filter((i) => i.status === 'validated').length,
      regressionTests: this.regressionTests.size,
      historicalDataPoints: this.historicalMetrics.length,
      config: this.config,
    };
  }

  /**
   * Clear historical data (for testing or reset)
   */
  reset() {
    this.failurePatterns.clear();
    this.promptImprovements.clear();
    this.regressionTests.clear();
    this.historicalMetrics = [];
    this.performanceBaseline.clear();
    logger.info('SelfImprovementEngine reset');
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export default SelfImprovementEngine;
