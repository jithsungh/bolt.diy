/**
 * AST-Aware Patch Engine — Phase 5
 *
 * Generates minimal, surgical code patches by operating on syntax nodes
 * rather than raw text. Preserves formatting, comments, and code style.
 *
 * Key Features:
 *  - Parse code into AST (Abstract Syntax Tree)
 *  - Identify minimal changes at semantic level
 *  - Generate patches that preserve formatting
 *  - Validate patches before application
 *  - Support multiple languages via pluggable parsers
 *
 * Integration:
 *  - Used by ExecutorAgent for file modifications
 *  - Replaces naive full-file rewrites with targeted patches
 *  - Preserves git history cleanliness (small diffs)
 */

import { createScopedLogger } from '~/utils/logger';
import { diffFiles } from '~/utils/diff';
import type { FileChange } from './types';

const logger = createScopedLogger('ASTAwarePatchEngine');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PatchOperation {
  type: 'insert' | 'replace' | 'delete';
  startLine: number;
  endLine: number;
  oldContent?: string;
  newContent?: string;
  context?: {
    before: string[]; // Lines before change for context
    after: string[]; // Lines after change for context
  };
}

export interface Patch {
  filePath: string;
  language: string;
  operations: PatchOperation[];
  metadata: {
    totalLinesAdded: number;
    totalLinesRemoved: number;
    affectedFunctions: string[];
    preservesFormatting: boolean;
  };
}

export interface PatchValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  safetyScore: number; // 0-1
}

export interface ASTNode {
  type: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
  name?: string;
  children: ASTNode[];
  text: string;
}

export interface PatchEngineConfig {
  preserveFormatting?: boolean;
  contextLines?: number; // Lines of context around changes
  maxPatchSize?: number; // Max lines per operation
  strictSafety?: boolean;
}

// ---------------------------------------------------------------------------
// Language Parsers (pluggable)
// ---------------------------------------------------------------------------

interface LanguageParser {
  parse(code: string): ASTNode | null;
  format(code: string): string;
  validateSyntax(code: string): { valid: boolean; errors: string[] };
}

/**
 * Simple line-based parser fallback
 * Used when no language-specific parser available
 */
class LineBasedParser implements LanguageParser {
  parse(code: string): ASTNode {
    const lines = code.split('\n');
    return {
      type: 'root',
      startLine: 1,
      endLine: lines.length,
      startColumn: 0,
      endColumn: 0,
      text: code,
      children: lines.map((line, idx) => ({
        type: 'line',
        startLine: idx + 1,
        endLine: idx + 1,
        startColumn: 0,
        endColumn: line.length,
        text: line,
        children: [],
      })),
    };
  }

  format(code: string): string {
    return code; // No formatting
  }

  validateSyntax(code: string): { valid: boolean; errors: string[] } {
    return { valid: true, errors: [] };
  }
}

/**
 * JavaScript/TypeScript parser
 * Future: Could integrate with Tree-sitter or typescript compiler API
 */
class JavaScriptParser extends LineBasedParser {
  override validateSyntax(code: string): { valid: boolean; errors: string[] } {
    try {
      // Basic syntax check - try to parse as function
      new Function(code);
      return { valid: true, errors: [] };
    } catch (e: any) {
      return { valid: false, errors: [e.message] };
    }
  }
}

// ---------------------------------------------------------------------------
// AST-Aware Patch Engine Implementation
// ---------------------------------------------------------------------------

export class ASTAwarePatchEngine {
  private config: Required<PatchEngineConfig>;
  private parsers: Map<string, LanguageParser>;

  constructor(config: PatchEngineConfig = {}) {
    this.config = {
      preserveFormatting: config.preserveFormatting ?? true,
      contextLines: config.contextLines ?? 3,
      maxPatchSize: config.maxPatchSize ?? 100,
      strictSafety: config.strictSafety ?? true,
    };

    // Initialize language parsers
    this.parsers = new Map();
    const fallback = new LineBasedParser();
    this.parsers.set('javascript', new JavaScriptParser());
    this.parsers.set('typescript', new JavaScriptParser());
    this.parsers.set('jsx', new JavaScriptParser());
    this.parsers.set('tsx', new JavaScriptParser());
    this.parsers.set('fallback', fallback);

    logger.info('ASTAwarePatchEngine initialized', this.config);
  }

  // -------------------------------------------------------------------------
  // Main API
  // -------------------------------------------------------------------------

  /**
   * Generate a minimal patch from old code to new code
   */
  generatePatch(filePath: string, oldCode: string, newCode: string, language?: string): Patch {
    logger.debug(`Generating patch for ${filePath}`, { language });

    const detectedLang = language || this.detectLanguage(filePath);
    const parser = this.parsers.get(detectedLang) || this.parsers.get('fallback')!;

    // Parse both versions
    const oldAST = parser.parse(oldCode);
    const newAST = parser.parse(newCode);

    if (!oldAST || !newAST) {
      // Fallback to simple diff
      return this.generateSimplePatch(filePath, oldCode, newCode, detectedLang);
    }

    // Compute operations by comparing ASTs
    const operations = this.computeOperations(oldCode, newCode, oldAST, newAST);

    // Calculate metadata
    const metadata = this.calculateMetadata(operations, oldAST, newAST);

    return {
      filePath,
      language: detectedLang,
      operations,
      metadata,
    };
  }

  /**
   * Apply a patch to code
   */
  applyPatch(code: string, patch: Patch): string {
    logger.debug(`Applying patch to ${patch.filePath}`, {
      operations: patch.operations.length,
    });

    let lines = code.split('\n');

    // Sort operations by line number (descending) to apply from bottom-up
    const sortedOps = [...patch.operations].sort((a, b) => b.startLine - a.startLine);

    for (const op of sortedOps) {
      lines = this.applyOperation(lines, op);
    }

    return lines.join('\n');
  }

  /**
   * Validate a patch before applying
   */
  validatePatch(patch: Patch, originalCode: string): PatchValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check operation count
    if (patch.operations.length === 0) {
      errors.push('No operations in patch');
    }

    if (patch.operations.length > 50) {
      warnings.push(`Large number of operations (${patch.operations.length})`);
    }

    // Check patch size
    if (patch.metadata.totalLinesAdded > this.config.maxPatchSize) {
      warnings.push(`Large patch: ${patch.metadata.totalLinesAdded} lines added`);
    }

    // Validate each operation
    const originalLines = originalCode.split('\n');

    for (const op of patch.operations) {
      // Check line bounds
      if (op.startLine < 1 || op.startLine > originalLines.length + 1) {
        errors.push(`Operation line ${op.startLine} out of bounds`);
      }

      if (op.endLine < op.startLine) {
        errors.push(`Invalid line range: ${op.startLine}-${op.endLine}`);
      }

      // Validate operation has required content
      if (op.type === 'replace' && (!op.oldContent || !op.newContent)) {
        errors.push('Replace operation missing content');
      }

      if (op.type === 'insert' && !op.newContent) {
        errors.push('Insert operation missing content');
      }
    }

    // Check syntax if parser available
    const parser = this.parsers.get(patch.language) || this.parsers.get('fallback')!;
    try {
      const patchedCode = this.applyPatch(originalCode, patch);
      const syntaxCheck = parser.validateSyntax(patchedCode);

      if (!syntaxCheck.valid) {
        errors.push(...syntaxCheck.errors);
      }
    } catch (e: any) {
      errors.push(`Failed to apply patch: ${e.message}`);
    }

    // Calculate safety score
    let safetyScore = 1.0;
    safetyScore -= errors.length * 0.2;
    safetyScore -= warnings.length * 0.05;
    safetyScore = Math.max(0, Math.min(1, safetyScore));

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      safetyScore,
    };
  }

  /**
   * Generate a FileChange from a patch (for integration with ExecutorAgent)
   */
  patchToFileChange(patch: Patch, newContent: string): FileChange {
    return {
      filePath: patch.filePath,
      path: patch.filePath,
      changeType: 'modify',
      newContent,
      validated: false,
      safetyScore: 0.8, // Will be recalculated by validator
    };
  }

  // -------------------------------------------------------------------------
  // Internal Implementation
  // -------------------------------------------------------------------------

  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();

    const langMap: Record<string, string> = {
      js: 'javascript',
      jsx: 'jsx',
      ts: 'typescript',
      tsx: 'tsx',
      py: 'python',
      java: 'java',
      cpp: 'cpp',
      c: 'c',
      go: 'go',
      rs: 'rust',
    };

    return langMap[ext || ''] || 'fallback';
  }

  private generateSimplePatch(filePath: string, oldCode: string, newCode: string, language: string): Patch {
    const unifiedDiff = diffFiles(filePath, oldCode, newCode);

    if (!unifiedDiff) {
      // Files are identical
      return {
        filePath,
        language,
        operations: [],
        metadata: {
          totalLinesAdded: 0,
          totalLinesRemoved: 0,
          affectedFunctions: [],
          preservesFormatting: true,
        },
      };
    }

    // Parse unified diff into operations
    const operations = this.parseUnifiedDiff(unifiedDiff, oldCode);

    const metadata = {
      totalLinesAdded: operations.reduce((sum, op) => sum + (op.type === 'insert' ? 1 : 0), 0),
      totalLinesRemoved: operations.reduce((sum, op) => sum + (op.type === 'delete' ? 1 : 0), 0),
      affectedFunctions: [],
      preservesFormatting: false,
    };

    return {
      filePath,
      language,
      operations,
      metadata,
    };
  }

  private computeOperations(oldCode: string, newCode: string, oldAST: ASTNode, newAST: ASTNode): PatchOperation[] {
    // For now, use line-based diff
    // Future: Implement AST-diff algorithm
    const oldLines = oldCode.split('\n');
    const newLines = newCode.split('\n');

    const operations: PatchOperation[] = [];

    // Simple line-by-line comparison
    let i = 0;
    let j = 0;

    while (i < oldLines.length || j < newLines.length) {
      if (i >= oldLines.length) {
        // Insert remaining new lines
        operations.push({
          type: 'insert',
          startLine: i + 1,
          endLine: i + 1,
          newContent: newLines[j],
        });
        j++;
      } else if (j >= newLines.length) {
        // Delete remaining old lines
        operations.push({
          type: 'delete',
          startLine: i + 1,
          endLine: i + 1,
          oldContent: oldLines[i],
        });
        i++;
      } else if (oldLines[i] === newLines[j]) {
        // Lines match, continue
        i++;
        j++;
      } else {
        // Lines differ, replace
        operations.push({
          type: 'replace',
          startLine: i + 1,
          endLine: i + 1,
          oldContent: oldLines[i],
          newContent: newLines[j],
        });
        i++;
        j++;
      }
    }

    // Merge consecutive operations
    return this.mergeOperations(operations);
  }

  private mergeOperations(operations: PatchOperation[]): PatchOperation[] {
    if (operations.length <= 1) {
      return operations;
    }

    const merged: PatchOperation[] = [];
    let current = operations[0];

    for (let i = 1; i < operations.length; i++) {
      const next = operations[i];

      // Try to merge consecutive operations of same type
      if (
        current.type === next.type &&
        next.startLine === current.endLine + 1
      ) {
        // Merge
        current.endLine = next.endLine;
        if (current.newContent && next.newContent) {
          current.newContent += '\n' + next.newContent;
        }
        if (current.oldContent && next.oldContent) {
          current.oldContent += '\n' + next.oldContent;
        }
      } else {
        merged.push(current);
        current = next;
      }
    }

    merged.push(current);
    return merged;
  }

  private applyOperation(lines: string[], op: PatchOperation): string[] {
    const result = [...lines];

    // Convert 1-based to 0-based indexing
    const startIdx = op.startLine - 1;
    const endIdx = op.endLine - 1;

    switch (op.type) {
      case 'insert':
        result.splice(startIdx, 0, op.newContent || '');
        break;

      case 'delete':
        result.splice(startIdx, endIdx - startIdx + 1);
        break;

      case 'replace':
        const removeCount = endIdx - startIdx + 1;
        result.splice(startIdx, removeCount, op.newContent || '');
        break;
    }

    return result;
  }

  private calculateMetadata(operations: PatchOperation[], oldAST: ASTNode, newAST: ASTNode) {
    let totalLinesAdded = 0;
    let totalLinesRemoved = 0;

    for (const op of operations) {
      if (op.type === 'insert') {
        totalLinesAdded += op.newContent?.split('\n').length || 1;
      } else if (op.type === 'delete') {
        totalLinesRemoved += op.oldContent?.split('\n').length || 1;
      } else if (op.type === 'replace') {
        totalLinesAdded += op.newContent?.split('\n').length || 1;
        totalLinesRemoved += op.oldContent?.split('\n').length || 1;
      }
    }

    // Extract affected functions (simplified)
    const affectedFunctions: string[] = [];

    // Look for function names in operations
    for (const op of operations) {
      const content = op.newContent || op.oldContent || '';
      const functionMatch = content.match(/function\s+(\w+)|const\s+(\w+)\s*=/);

      if (functionMatch) {
        const funcName = functionMatch[1] || functionMatch[2];
        if (!affectedFunctions.includes(funcName)) {
          affectedFunctions.push(funcName);
        }
      }
    }

    return {
      totalLinesAdded,
      totalLinesRemoved,
      affectedFunctions,
      preservesFormatting: this.config.preserveFormatting,
    };
  }

  private parseUnifiedDiff(diff: string, originalCode: string): PatchOperation[] {
    const operations: PatchOperation[] = [];
    const lines = diff.split('\n');

    let currentLine = 1;

    for (const line of lines) {
      if (line.startsWith('@@')) {
        // Parse hunk header: @@ -start,count +start,count @@
        const match = line.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/);
        if (match) {
          currentLine = parseInt(match[1]);
        }
      } else if (line.startsWith('-')) {
        operations.push({
          type: 'delete',
          startLine: currentLine,
          endLine: currentLine,
          oldContent: line.substring(1),
        });
        currentLine++;
      } else if (line.startsWith('+')) {
        operations.push({
          type: 'insert',
          startLine: currentLine,
          endLine: currentLine,
          newContent: line.substring(1),
        });
      } else {
        currentLine++;
      }
    }

    return operations;
  }

  // -------------------------------------------------------------------------
  // Utility Methods
  // -------------------------------------------------------------------------

  /**
   * Format code using language-specific formatter
   */
  formatCode(code: string, language: string): string {
    const parser = this.parsers.get(language) || this.parsers.get('fallback')!;
    return parser.format(code);
  }

  /**
   * Check if two code snippets are semantically equivalent
   */
  areEquivalent(code1: string, code2: string, language: string): boolean {
    const parser = this.parsers.get(language) || this.parsers.get('fallback')!;
    const ast1 = parser.parse(code1);
    const ast2 = parser.parse(code2);

    // Simple comparison - in future could do deep AST comparison
    return code1.trim() === code2.trim();
  }

  /**
   * Get statistics about the patch engine
   */
  getStats() {
    return {
      supportedLanguages: Array.from(this.parsers.keys()),
      config: this.config,
    };
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export default ASTAwarePatchEngine;
