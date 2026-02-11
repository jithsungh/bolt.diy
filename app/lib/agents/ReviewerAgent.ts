// Reviewer Agent
// Responsible for reviewing code changes and providing quality assessments

import { BaseAgent } from './BaseAgent';
import { createScopedLogger } from '~/utils/logger';
import type {
  Task,
  TaskResult,
  ReviewerOutput,
  FileChange,
  ValidationError,
} from './types';

const logger = createScopedLogger('ReviewerAgent');

export class ReviewerAgent extends BaseAgent {
  private qualityThreshold = 70; // Minimum score to approve

  constructor() {
    super('reviewer', {
      capabilities: ['review', 'validation', 'quality_check'],
      maxRetries: 2,
      timeout: 45000,
      validationLevel: 'strict',
    });
  }

  /**
   * Execute review task
   */
  protected async executeTask(task: Task, context: any): Promise<TaskResult> {
    this.logger.info(`Reviewing task: ${task.description}`);

    const changes = context.changes as FileChange[];
    if (!changes || changes.length === 0) {
      return {
        success: false,
        validationErrors: [{
          type: 'logic',
          severity: 'error',
          message: 'No changes to review',
        }],
      };
    }

    try {
      const review = await this.performReview(changes, context);

      return {
        success: review.approved,
        output: review,
        validationErrors: review.issues,
        suggestions: review.suggestions,
        metrics: {
          filesModified: changes.length,
        },
      };
    } catch (error) {
      this.logger.error('Review failed:', error);
      throw error;
    }
  }

  /**
   * Perform comprehensive review of changes
   */
  private async performReview(
    changes: FileChange[],
    context: any
  ): Promise<ReviewerOutput> {
    const issues: ValidationError[] = [];
    const suggestions: string[] = [];
    let totalScore = 0;

    // Review each file
    for (const change of changes) {
      const fileReview = await this.reviewFile(change);
      issues.push(...fileReview.issues);
      suggestions.push(...fileReview.suggestions);
      totalScore += fileReview.score;
    }

    const averageScore = changes.length > 0 ? totalScore / changes.length : 0;

    // Assess overall risk
    const riskAssessment = this.assessRisk(changes, issues);

    // Check for improvements
    const improvements = this.suggestImprovements(changes, issues);

    const approved = averageScore >= this.qualityThreshold && riskAssessment.level !== 'critical';

    return {
      approved,
      score: averageScore,
      issues,
      suggestions,
      riskAssessment,
      improvements,
    };
  }

  /**
   * Review individual file
   */
  private async reviewFile(change: FileChange): Promise<{
    score: number;
    issues: ValidationError[];
    suggestions: string[];
  }> {
    const issues: ValidationError[] = [];
    const suggestions: string[] = [];
    let score = 100;

    // 1. Code quality checks
    if (change.newContent) {
      const qualityIssues = this.checkCodeQuality(change);
      issues.push(...qualityIssues);
      score -= qualityIssues.length * 5;
    }

    // 2. Security checks
    if (change.newContent) {
      const securityIssues = this.checkSecurity(change);
      issues.push(...securityIssues);
      score -= securityIssues.filter(i => i.severity === 'error').length * 15;
      score -= securityIssues.filter(i => i.severity === 'warning').length * 5;
    }

    // 3. Best practices
    const practiceIssues = this.checkBestPractices(change);
    issues.push(...practiceIssues);
    score -= practiceIssues.length * 3;

    // 4. Performance considerations
    const performanceIssues = this.checkPerformance(change);
    issues.push(...performanceIssues);
    score -= performanceIssues.length * 5;

    // 5. Suggest improvements
    if (change.newContent) {
      suggestions.push(...this.generateSuggestions(change));
    }

    return {
      score: Math.max(0, score),
      issues,
      suggestions,
    };
  }

  /**
   * Check code quality
   */
  private checkCodeQuality(change: FileChange): ValidationError[] {
    const issues: ValidationError[] = [];
    const content = change.newContent || '';

    // Check file length
    const lines = content.split('\n');
    if (lines.length > 300) {
      issues.push({
        type: 'style',
        severity: 'warning',
        message: `File ${change.filePath} is too long (${lines.length} lines)`,
        filePath: change.filePath,
        suggestion: 'Consider breaking into smaller modules',
      });
    }

    // Check function length
    const functionRegex = /function\s+\w+\s*\([^)]*\)\s*{|=>\s*{/g;
    let match;
    while ((match = functionRegex.exec(content)) !== null) {
      const startIdx = match.index;
      const endIdx = this.findClosingBrace(content, startIdx);
      const functionContent = content.substring(startIdx, endIdx);
      const functionLines = functionContent.split('\n').length;

      if (functionLines > 50) {
        issues.push({
          type: 'style',
          severity: 'warning',
          message: `Long function detected (${functionLines} lines)`,
          filePath: change.filePath,
          suggestion: 'Break down into smaller functions',
        });
      }
    }

    // Check for TODO/FIXME comments
    if (content.includes('TODO') || content.includes('FIXME')) {
      issues.push({
        type: 'style',
        severity: 'info',
        message: 'Contains TODO/FIXME comments',
        filePath: change.filePath,
        suggestion: 'Address pending items',
      });
    }

    // Check for console.log
    if (content.match(/console\.log\(/)) {
      issues.push({
        type: 'style',
        severity: 'warning',
        message: 'Contains console.log statements',
        filePath: change.filePath,
        suggestion: 'Remove or replace with proper logging',
      });
    }

    return issues;
  }

  /**
   * Check security issues
   */
  private checkSecurity(change: FileChange): ValidationError[] {
    const issues: ValidationError[] = [];
    const content = change.newContent || '';

    // Dangerous patterns
    const dangerousPatterns = [
      { pattern: /eval\(/gi, name: 'eval', risk: 'critical' },
      { pattern: /exec\(/gi, name: 'exec', risk: 'high' },
      { pattern: /Function\(/gi, name: 'Function constructor', risk: 'high' },
      { pattern: /innerHTML\s*=/gi, name: 'innerHTML assignment', risk: 'medium' },
      { pattern: /dangerouslySetInnerHTML/gi, name: 'dangerouslySetInnerHTML', risk: 'medium' },
      { pattern: /document\.write/gi, name: 'document.write', risk: 'high' },
    ];

    dangerousPatterns.forEach(({ pattern, name, risk }) => {
      if (pattern.test(content)) {
        issues.push({
          type: 'security',
          severity: risk === 'critical' || risk === 'high' ? 'error' : 'warning',
          message: `Potentially dangerous use of ${name}`,
          filePath: change.filePath,
          suggestion: `Avoid ${name} or ensure proper sanitization`,
        });
      }
    });

    // Check for hardcoded secrets
    const secretPatterns = [
      /api[_-]?key\s*[:=]\s*["'][a-zA-Z0-9]{20,}["']/gi,
      /password\s*[:=]\s*["'][^"']+["']/gi,
      /secret\s*[:=]\s*["'][^"']+["']/gi,
      /token\s*[:=]\s*["'][a-zA-Z0-9]{20,}["']/gi,
    ];

    secretPatterns.forEach(pattern => {
      if (pattern.test(content)) {
        issues.push({
          type: 'security',
          severity: 'error',
          message: 'Potential hardcoded secret detected',
          filePath: change.filePath,
          suggestion: 'Use environment variables for sensitive data',
        });
      }
    });

    return issues;
  }

  /**
   * Check best practices
   */
  private checkBestPractices(change: FileChange): ValidationError[] {
    const issues: ValidationError[] = [];
    const content = change.newContent || '';

    // Check for proper imports
    if (change.filePath.match(/\.(ts|tsx|js|jsx)$/)) {
      // Unused imports (basic check)
      const imports = content.match(/import\s+{[^}]+}\s+from/g) || [];
      if (imports.length > 20) {
        issues.push({
          type: 'style',
          severity: 'info',
          message: 'High number of imports',
          filePath: change.filePath,
          suggestion: 'Consider code splitting',
        });
      }
    }

    // Check for magic numbers
    const numberRegex = /\b\d{3,}\b/g;
    const matches = content.match(numberRegex);
    if (matches && matches.length > 5) {
      issues.push({
        type: 'style',
        severity: 'info',
        message: 'Multiple magic numbers detected',
        filePath: change.filePath,
        suggestion: 'Extract numbers as named constants',
      });
    }

    return issues;
  }

  /**
   * Check performance considerations
   */
  private checkPerformance(change: FileChange): ValidationError[] {
    const issues: ValidationError[] = [];
    const content = change.newContent || '';

    // Check for nested loops
    if ((content.match(/for\s*\(/g) || []).length > 2) {
      issues.push({
        type: 'performance',
        severity: 'warning',
        message: 'Multiple loops detected - potential O(n²) complexity',
        filePath: change.filePath,
        suggestion: 'Review algorithmic complexity',
      });
    }

    // Check for inefficient patterns
    if (content.includes('.forEach') && content.includes('.filter')) {
      issues.push({
        type: 'performance',
        severity: 'info',
        message: 'Multiple array iterations detected',
        filePath: change.filePath,
        suggestion: 'Consider combining operations with reduce',
      });
    }

    return issues;
  }

  /**
   * Assess overall risk level
   */
  private assessRisk(
    changes: FileChange[],
    issues: ValidationError[]
  ): { level: 'low' | 'medium' | 'high' | 'critical'; reasons: string[] } {
    const reasons: string[] = [];

    // Critical errors = critical risk
    const criticalIssues = issues.filter(i => i.severity === 'error' && i.type === 'security');
    if (criticalIssues.length > 0) {
      reasons.push(`${criticalIssues.length} critical security issues`);
      return { level: 'critical', reasons };
    }

    // High risk factors
    let riskScore = 0;

    // Many files modified
    if (changes.length > 10) {
      riskScore += 20;
      reasons.push(`${changes.length} files modified`);
    }

    // Deletions
    const deletions = changes.filter(c => c.changeType === 'delete');
    if (deletions.length > 0) {
      riskScore += 15 * deletions.length;
      reasons.push(`${deletions.length} files deleted`);
    }

    // Low safety scores
    const lowSafetyChanges = changes.filter(c => (c.safetyScore || 1) < 0.5);
    if (lowSafetyChanges.length > 0) {
      riskScore += 10 * lowSafetyChanges.length;
      reasons.push(`${lowSafetyChanges.length} changes with low safety scores`);
    }

    // Error count
    const errors = issues.filter(i => i.severity === 'error');
    riskScore += errors.length * 10;
    if (errors.length > 0) {
      reasons.push(`${errors.length} errors found`);
    }

    // Determine level
    let level: 'low' | 'medium' | 'high' | 'critical';
    if (riskScore >= 50) {
      level = 'high';
    } else if (riskScore >= 25) {
      level = 'medium';
    } else {
      level = 'low';
    }

    return { level, reasons };
  }

  /**
   * Suggest improvements
   */
  private suggestImprovements(changes: FileChange[], issues: ValidationError[]): string[] {
    const improvements: string[] = [];

    // Group issues by type
    const issuesByType = issues.reduce((acc, issue) => {
      acc[issue.type] = (acc[issue.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Generate improvement suggestions
    if (issuesByType.security > 0) {
      improvements.push('Review and address security vulnerabilities');
    }

    if (issuesByType.style > 3) {
      improvements.push('Consider running a code formatter');
    }

    if (issuesByType.performance > 2) {
      improvements.push('Optimize performance-critical sections');
    }

    // Check for test coverage
    const hasTests = changes.some(c => c.filePath.includes('.test.') || c.filePath.includes('.spec.'));
    if (!hasTests && changes.length > 2) {
      improvements.push('Add unit tests for new functionality');
    }

    return improvements;
  }

  /**
   * Generate suggestions for a file
   */
  private generateSuggestions(change: FileChange): string[] {
    const suggestions: string[] = [];

    // Type safety suggestions
    if (change.filePath.endsWith('.js') || change.filePath.endsWith('.jsx')) {
      suggestions.push('Consider migrating to TypeScript for better type safety');
    }

    // Documentation suggestions
    if (change.newContent && !change.newContent.includes('/**')) {
      suggestions.push('Add JSDoc comments for public APIs');
    }

    return suggestions;
  }

  /**
   * Helper: find closing brace
   */
  private findClosingBrace(content: string, startIdx: number): number {
    let depth = 0;
    let inString = false;
    let stringChar = '';

    for (let i = startIdx; i < content.length; i++) {
      const char = content[i];
      const prevChar = i > 0 ? content[i - 1] : '';

      // Handle strings
      if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
      }

      if (!inString) {
        if (char === '{') {
          depth++;
        } else if (char === '}') {
          depth--;
          if (depth === 0) {
            return i;
          }
        }
      }
    }

    return content.length;
  }
}
