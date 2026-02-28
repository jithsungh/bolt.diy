/**
 * ASTAwarePatchEngine Test Suite
 * 
 * Tests for Phase 5 AST-aware patch generation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ASTAwarePatchEngine } from './ASTAwarePatchEngine';

describe('ASTAwarePatchEngine', () => {
  let engine: ASTAwarePatchEngine;

  beforeEach(() => {
    engine = new ASTAwarePatchEngine();
  });

  describe('initialization', () => {
    it('should initialize with default config', () => {
      expect(engine).toBeDefined();
      const stats = engine.getStats();
      expect(stats.supportedLanguages).toContain('javascript');
      expect(stats.supportedLanguages).toContain('typescript');
    });

    it('should accept custom config', () => {
      const customEngine = new ASTAwarePatchEngine({
        preserveFormatting: false,
        contextLines: 5,
        maxPatchSize: 200,
      });

      expect(customEngine).toBeDefined();
    });
  });

  describe('generatePatch', () => {
    it('should generate patch for simple change', () => {
      const oldCode = 'const x = 1;';
      const newCode = 'const x = 2;';

      const patch = engine.generatePatch('test.js', oldCode, newCode);

      expect(patch).toBeDefined();
      expect(patch.operations.length).toBeGreaterThan(0);
    });

    it('should handle identical code', () => {
      const code = 'const x = 1;';

      const patch = engine.generatePatch('test.js', code, code);

      expect(patch).toBeDefined();
      expect(patch.operations.length).toBe(0);
      expect(patch.metadata.totalLinesAdded).toBe(0);
      expect(patch.metadata.totalLinesRemoved).toBe(0);
    });

    it('should generate insert operations', () => {
      const oldCode = 'line1\nline2';
      const newCode = 'line1\ninserted\nline2';

      const patch = engine.generatePatch('test.js', oldCode, newCode);

      expect(patch.operations.some(op => op.type === 'insert')).toBe(true);
      expect(patch.metadata.totalLinesAdded).toBeGreaterThan(0);
    });

    it('should generate delete operations', () => {
      const oldCode = 'line1\nline2\nline3';
      const newCode = 'line1\nline3';

      const patch = engine.generatePatch('test.js', oldCode, newCode);

      expect(patch.operations.some(op => op.type === 'delete')).toBe(true);
      expect(patch.metadata.totalLinesRemoved).toBeGreaterThan(0);
    });

    it('should generate replace operations', () => {
      const oldCode = 'old line';
      const newCode = 'new line';

      const patch = engine.generatePatch('test.js', oldCode, newCode);

      expect(patch.operations.length).toBeGreaterThan(0);
    });

    it('should detect language from file extension', () => {
      const code = 'const x = 1;';
      
      const jsPatch = engine.generatePatch('test.js', code, code);
      expect(jsPatch.language).toBe('javascript');

      const tsPatch = engine.generatePatch('test.ts', code, code);
      expect(tsPatch.language).toBe('typescript');

      const unknownPatch = engine.generatePatch('test.xyz', code, code);
      expect(unknownPatch.language).toBe('fallback');
    });
  });

  describe('applyPatch', () => {
    it('should apply simple patch correctly', () => {
      const oldCode = 'line1\nline2\nline3';
      const newCode = 'line1\nmodified\nline3';

      const patch = engine.generatePatch('test.js', oldCode, newCode);
      const result = engine.applyPatch(oldCode, patch);

      expect(result).toBe(newCode);
    });

    it('should handle insert operations', () => {
      const oldCode = 'line1\nline2';
      const newCode = 'line1\ninserted\nline2';

      const patch = engine.generatePatch('test.js', oldCode, newCode);
      const result = engine.applyPatch(oldCode, patch);

      expect(result).toContain('inserted');
    });

    it('should handle delete operations', () => {
      const oldCode = 'line1\nline2\nline3';
      const newCode = 'line1\nline3';

      const patch = engine.generatePatch('test.js', oldCode, newCode);
      const result = engine.applyPatch(oldCode, patch);

      expect(result).toBe(newCode);
    });

    it('should be reversible for simple cases', () => {
      const code1 = 'original';
      const code2 = 'modified';

      const patch = engine.generatePatch('test.js', code1, code2);
      const result = engine.applyPatch(code1, patch);

      expect(result).toBe(code2);
    });
  });

  describe('validatePatch', () => {
    it('should validate valid patch', () => {
      const oldCode = 'const x = 1;';
      const newCode = 'const x = 2;';

      const patch = engine.generatePatch('test.js', oldCode, newCode);
      const validation = engine.validatePatch(patch, oldCode);

      expect(validation.valid).toBe(true);
      expect(validation.errors.length).toBe(0);
    });

    it('should detect invalid line ranges', () => {
      const code = 'line1';
      const patch = engine.generatePatch('test.js', code, 'line2');
      
      // Manually corrupt patch
      patch.operations[0].startLine = 999;

      const validation = engine.validatePatch(patch, code);

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it('should calculate safety score', () => {
      const oldCode = 'const x = 1;';
      const newCode = 'const x = 2;';

      const patch = engine.generatePatch('test.js', oldCode, newCode);
      const validation = engine.validatePatch(patch, oldCode);

      expect(validation.safetyScore).toBeGreaterThanOrEqual(0);
      expect(validation.safetyScore).toBeLessThanOrEqual(1);
    });

    it('should warn on large patches', () => {
      const oldCode = 'line\n'.repeat(100);
      const newCode = 'modified\n'.repeat(100);

      const patch = engine.generatePatch('test.js', oldCode, newCode);
      const validation = engine.validatePatch(patch, oldCode);

      // Should have warnings about large patch
      expect(validation.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('language support', () => {
    it('should support JavaScript', () => {
      const code = 'function test() { return 42; }';
      const patch = engine.generatePatch('test.js', code, code);
      expect(patch.language).toBe('javascript');
    });

    it('should support TypeScript', () => {
      const code = 'const x: number = 42;';
      const patch = engine.generatePatch('test.ts', code, code);
      expect(patch.language).toBe('typescript');
    });

    it('should fallback for unsupported languages', () => {
      const code = 'some code';
      const patch = engine.generatePatch('test.xyz', code, code);
      expect(patch.language).toBe('fallback');
    });
  });

  describe('integration', () => {
    it('should convert patch to FileChange', () => {
      const oldCode = 'old';
      const newCode = 'new';

      const patch = engine.generatePatch('test.js', oldCode, newCode);
      const fileChange = engine.patchToFileChange(patch, newCode);

      expect(fileChange).toBeDefined();
      expect(fileChange.filePath).toBe('test.js');
      expect(fileChange.changeType).toBe('modify');
      expect(fileChange.newContent).toBe(newCode);
    });
  });
});
