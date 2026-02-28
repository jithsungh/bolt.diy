/**
 * SelfImprovementEngine Test Suite
 * 
 * Tests for Phase 6 self-improvement and pattern detection
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SelfImprovementEngine } from './SelfImprovementEngine';
import type { EvaluationMetrics, AgentPerformance } from './AgentEvaluationSystem';

describe('SelfImprovementEngine', () => {
  let engine: SelfImprovementEngine;

  beforeEach(() => {
    engine = new SelfImprovementEngine({
      autoApplyImprovements: false,
      minFailureCountForPattern: 2,
    });
  });

  describe('initialization', () => {
    it('should initialize with default config', () => {
      expect(engine).toBeDefined();
      const stats = engine.getStats();
      expect(stats.patternsTracked).toBe(0);
    });

    it('should accept custom config', () => {
      const customEngine = new SelfImprovementEngine({
        autoApplyImprovements: true,
        minConfidenceForAutoApply: 0.9,
      });

      expect(customEngine).toBeDefined();
    });
  });

  describe('analyzeFailurePatterns', () => {
    it('should identify patterns from failures', () => {
      const failures: EvaluationMetrics[] = [
        createFailureMetric('task1', 'executor', 'syntax'),
        createFailureMetric('task2', 'executor', 'syntax'),
        createFailureMetric('task3', 'executor', 'syntax'),
      ];

      const patterns = engine.analyzeFailurePatterns(failures);

      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].type).toBe('syntax');
      expect(patterns[0].frequency).toBeGreaterThanOrEqual(2);
    });

    it('should not create patterns for infrequent failures', () => {
      const failures: EvaluationMetrics[] = [
        createFailureMetric('task1', 'executor', 'syntax'),
        // Only one failure, below threshold
      ];

      const patterns = engine.analyzeFailurePatterns(failures);

      expect(patterns.length).toBe(0);
    });

    it('should track multiple pattern types', () => {
      const failures: EvaluationMetrics[] = [
        createFailureMetric('task1', 'executor', 'syntax'),
        createFailureMetric('task2', 'executor', 'syntax'),
        createFailureMetric('task3', 'reviewer', 'safety'),
        createFailureMetric('task4', 'reviewer', 'safety'),
      ];

      const patterns = engine.analyzeFailurePatterns(failures);

      expect(patterns.length).toBeGreaterThanOrEqual(2);
      const types = patterns.map(p => p.type);
      expect(types).toContain('syntax');
      expect(types).toContain('safety');
    });

    it('should determine pattern severity', () => {
      const criticalFailures: EvaluationMetrics[] = Array(10).fill(null).map((_, i) =>
        createFailureMetric(`task${i}`, 'executor', 'safety', 0.2)
      );

      const patterns = engine.analyzeFailurePatterns(criticalFailures);

      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].severity).toBe('critical');
    });
  });

  describe('suggestPromptImprovements', () => {
    it('should suggest improvements based on patterns', () => {
      const failures: EvaluationMetrics[] = Array(5).fill(null).map((_, i) =>
        createFailureMetric(`task${i}`, 'executor', 'syntax')
      );

      engine.analyzeFailurePatterns(failures);

      const performance: AgentPerformance = {
        agentRole: 'executor',
        totalTasks: 10,
        successfulTasks: 5,
        failedTasks: 5,
        successRate: 0.5,
        averageCompletionTime: 5000,
        averageAttempts: 2,
        averageQuality: 0.6,
        averageSafety: 0.7,
        strengths: [],
        weaknesses: ['syntax errors'],
        improvementAreas: ['validation'],
      };

      const improvements = engine.suggestPromptImprovements('executor', performance);

      expect(improvements.length).toBeGreaterThan(0);
      expect(improvements[0].agentRole).toBe('executor');
      expect(improvements[0].status).toBe('proposed');
    });

    it('should calculate confidence scores', () => {
      const failures: EvaluationMetrics[] = Array(10).fill(null).map((_, i) =>
        createFailureMetric(`task${i}`, 'planner', 'logic')
      );

      engine.analyzeFailurePatterns(failures);

      const performance: AgentPerformance = {
        agentRole: 'planner',
        totalTasks: 15,
        successfulTasks: 5,
        failedTasks: 10,
        successRate: 0.33,
        averageCompletionTime: 3000,
        averageAttempts: 2.5,
        averageQuality: 0.4,
        averageSafety: 0.8,
        strengths: [],
        weaknesses: ['logic'],
        improvementAreas: [],
      };

      const improvements = engine.suggestPromptImprovements('planner', performance);

      expect(improvements.length).toBeGreaterThan(0);
      expect(improvements[0].confidence).toBeGreaterThan(0);
      expect(improvements[0].confidence).toBeLessThanOrEqual(1);
    });

    it('should estimate impact', () => {
      const failures: EvaluationMetrics[] = Array(8).fill(null).map((_, i) =>
        createFailureMetric(`task${i}`, 'reviewer', 'safety')
      );

      engine.analyzeFailurePatterns(failures);

      const performance: AgentPerformance = {
        agentRole: 'reviewer',
        totalTasks: 10,
        successfulTasks: 2,
        failedTasks: 8,
        successRate: 0.2,
        averageCompletionTime: 4000,
        averageAttempts: 3,
        averageQuality: 0.3,
        averageSafety: 0.4,
        strengths: [],
        weaknesses: ['safety'],
        improvementAreas: [],
      };

      const improvements = engine.suggestPromptImprovements('reviewer', performance);

      expect(improvements.length).toBeGreaterThan(0);
      expect(improvements[0].expectedImpact).toBeGreaterThan(0);
      expect(improvements[0].expectedImpact).toBeLessThanOrEqual(1);
    });
  });

  describe('applyImprovement', () => {
    it('should apply proposed improvements', () => {
      const failures: EvaluationMetrics[] = Array(3).fill(null).map((_, i) =>
        createFailureMetric(`task${i}`, 'executor', 'syntax')
      );

      engine.analyzeFailurePatterns(failures);

      const performance: AgentPerformance = createMockPerformance('executor', 0.5);
      const improvements = engine.suggestPromptImprovements('executor', performance);

      expect(improvements.length).toBeGreaterThan(0);

      const success = engine.applyImprovement(improvements[0].id);

      expect(success).toBe(true);
      expect(improvements[0].status).toBe('applied');
      expect(improvements[0].appliedAt).toBeDefined();
    });

    it('should not apply already-applied improvements', () => {
      const failures: EvaluationMetrics[] = Array(3).fill(null).map((_, i) =>
        createFailureMetric(`task${i}`, 'executor', 'syntax')
      );

      engine.analyzeFailurePatterns(failures);
      const performance = createMockPerformance('executor', 0.5);
      const improvements = engine.suggestPromptImprovements('executor', performance);

      engine.applyImprovement(improvements[0].id);
      const secondApply = engine.applyImprovement(improvements[0].id);

      expect(secondApply).toBe(false);
    });
  });

  describe('generateRegressionTests', () => {
    it('should generate tests from patterns', () => {
      const failures: EvaluationMetrics[] = Array(5).fill(null).map((_, i) =>
        createFailureMetric(`task${i}`, 'executor', 'syntax')
      );

      const patterns = engine.analyzeFailurePatterns(failures);
      const tests = engine.generateRegressionTests(patterns);

      expect(tests.length).toBeGreaterThan(0);
      expect(tests[0].name).toBeDefined();
      expect(tests[0].status).toBe('pending');
    });

    it('should skip low severity patterns', () => {
      const failures: EvaluationMetrics[] = Array(3).fill(null).map((_, i) =>
        createFailureMetric(`task${i}`, 'executor', 'logic', 0.9)
      );

      const patterns = engine.analyzeFailurePatterns(failures);
      const tests = engine.generateRegressionTests(patterns);

      // Should have fewer tests since low severity are skipped
      expect(tests.length).toBe(0);
    });
  });

  describe('generateImprovementReport', () => {
    it('should generate comprehensive report', () => {
      const metrics: EvaluationMetrics[] = [
        ...Array(3).fill(null).map((_, i) => createFailureMetric(`fail${i}`, 'executor', 'syntax')),
        ...Array(7).fill(null).map((_, i) => createSuccessMetric(`success${i}`, 'executor')),
      ];

      const performance = new Map([
        ['executor' as const, createMockPerformance('executor', 0.7)],
        ['planner' as const, createMockPerformance('planner', 0.9)],
      ]);

      const report = engine.generateImprovementReport(performance, metrics);

      expect(report).toBeDefined();
      expect(report.timestamp).toBeDefined();
      expect(report.patternsIdentified.length).toBeGreaterThanOrEqual(0);
      expect(report.recommendations.length).toBeGreaterThanOrEqual(0);
      expect(report.overallHealth).toBeGreaterThanOrEqual(0);
      expect(report.overallHealth).toBeLessThanOrEqual(1);
    });

    it('should provide actionable recommendations', () => {
      const criticalFailures: EvaluationMetrics[] = Array(8).fill(null).map((_, i) =>
        createFailureMetric(`task${i}`, 'executor', 'safety', 0.2)
      );

      const performance = new Map([
        ['executor' as const, createMockPerformance('executor', 0.2)],
      ]);

      const report = engine.generateImprovementReport(performance, criticalFailures);

      expect(report.recommendations.length).toBeGreaterThan(0);
      // Should have critical pattern recommendation
      expect(report.recommendations.some(r => r.includes('critical'))).toBe(true);
    });
  });

  describe('reset', () => {
    it('should clear all data', () => {
      const failures: EvaluationMetrics[] = Array(3).fill(null).map((_, i) =>
        createFailureMetric(`task${i}`, 'executor', 'syntax')
      );

      engine.analyzeFailurePatterns(failures);

      let stats = engine.getStats();
      expect(stats.patternsTracked).toBeGreaterThan(0);

      engine.reset();

      stats = engine.getStats();
      expect(stats.patternsTracked).toBe(0);
      expect(stats.historicalDataPoints).toBe(0);
    });
  });
});

// Helper functions
function createFailureMetric(
  taskId: string,
  agent: 'planner' | 'executor' | 'reviewer',
  errorType: 'syntax' | 'logic' | 'safety' = 'syntax',
  safetyScore: number = 0.5
): EvaluationMetrics {
  return {
    taskId,
    agentRole: agent,
    timestamp: Date.now(),
    success: false,
    completionTime: 5000,
    attempts: 2,
    codeQuality: 0.4,
    linesChanged: 10,
    filesModified: 1,
    errorCount: 5,
    warningCount: 2,
    criticalIssues: errorType === 'safety' ? 1 : 0,
    safetyScore,
    breakingChanges: false,
    dataLossRisk: errorType === 'safety',
  };
}

function createSuccessMetric(taskId: string, agent: 'planner' | 'executor' | 'reviewer'): EvaluationMetrics {
  return {
    taskId,
    agentRole: agent,
    timestamp: Date.now(),
    success: true,
    completionTime: 3000,
    attempts: 1,
    codeQuality: 0.85,
    linesChanged: 15,
    filesModified: 2,
    errorCount: 0,
    warningCount: 0,
    criticalIssues: 0,
    safetyScore: 0.95,
    breakingChanges: false,
    dataLossRisk: false,
  };
}

function createMockPerformance(agent: 'planner' | 'executor' | 'reviewer', successRate: number): AgentPerformance {
  return {
    agentRole: agent,
    totalTasks: 10,
    successfulTasks: Math.floor(10 * successRate),
    failedTasks: Math.ceil(10 * (1 - successRate)),
    successRate,
    averageCompletionTime: 4000,
    averageAttempts: 1.5,
    averageQuality: successRate * 0.9,
    averageSafety: 0.8,
    strengths: [],
    weaknesses: [],
    improvementAreas: [],
  };
}
