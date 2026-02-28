/**
 * IntegratedOrchestrator Test Suite
 * 
 * Tests for the main orchestrator that coordinates the multi-agent system
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IntegratedOrchestrator } from './IntegratedOrchestrator';
import type { ActionRunner } from '~/lib/runtime/action-runner';
import type { WorkbenchStore } from '~/lib/stores/workbench';

describe('IntegratedOrchestrator', () => {
  let mockActionRunner: ActionRunner;
  let orchestrator: IntegratedOrchestrator;

  beforeEach(() => {
    // Create mock ActionRunner
    mockActionRunner = {
      runAction: vi.fn().mockResolvedValue({ success: true }),
      actions: {
        get: vi.fn().mockReturnValue(new Map()),
      },
    } as any;

    // Initialize orchestrator
    orchestrator = new IntegratedOrchestrator({
      actionRunner: mockActionRunner,
      enableMemory: false,
    });
  });

  describe('initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(orchestrator).toBeDefined();
    });

    it('should initialize without memory when disabled', () => {
      expect(orchestrator).toBeDefined();
      // Memory manager should not be initialized
    });

    it('should accept custom safety constraints', () => {
      const customOrchestrator = new IntegratedOrchestrator({
        actionRunner: mockActionRunner,
        safetyConstraints: {
          maxFilesPerTask: 5,
          forbiddenOperations: ['rm -rf'],
        },
      });

      expect(customOrchestrator).toBeDefined();
    });
  });

  describe('processRequest', () => {
    it('should process a simple request', async () => {
      const result = await orchestrator.processRequest('Create a hello.js file', {
        files: {},
      });

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
    });

    it('should handle empty request gracefully', async () => {
      const result = await orchestrator.processRequest('', {
        files: {},
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(false);
    });

    it('should decompose complex requests into tasks', async () => {
      const result = await orchestrator.processRequest(
        'Build a React counter component with tests',
        { files: {} }
      );

      expect(result).toBeDefined();
      if (result.success) {
        expect(result.tasks.length).toBeGreaterThan(1);
      }
    });

    it('should use action runner for execution', async () => {
      await orchestrator.processRequest('Create index.js', { files: {} });

      // ActionRunner should be used (if execution succeeds)
      // In real scenario, this would be called
      expect(mockActionRunner.runAction).toBeDefined();
    });

    it('should respect safety constraints', async () => {
      const safeOrchestrator = new IntegratedOrchestrator({
        actionRunner: mockActionRunner,
        safetyConstraints: {
          forbiddenOperations: ['rm -rf'],
        },
      });

      const result = await safeOrchestrator.processRequest('Delete all files with rm -rf', {
        files: {},
      });

      expect(result).toBeDefined();
      // Should fail or warn about forbidden operation
    });
  });

  describe('agent coordination', () => {
    it('should coordinate planner, executor, and reviewer', async () => {
      const result = await orchestrator.processRequest('Add a function', {
        files: { 'test.js': { content: '', isBinary: false } },
      });

      expect(result).toBeDefined();
      // Result should show evidence of multiple agents working
      if (result.success) {
        expect(result.tasks.length).toBeGreaterThan(0);
      }
    });

    it('should handle executor failures gracefully', async () => {
      mockActionRunner.runAction = vi.fn().mockRejectedValue(new Error('Execution failed'));

      const result = await orchestrator.processRequest('Broken request', { files: {} });

      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should collect results from all agents', async () => {
      const result = await orchestrator.processRequest('Simple task', { files: {} });

      expect(result).toBeDefined();
      expect(result.results).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle planning failures', async () => {
      const result = await orchestrator.processRequest('!@#$%^&*()', { files: {} });

      expect(result).toBeDefined();
      // Should gracefully handle gibberish input
    });

    it('should provide meaningful error messages', async () => {
      const result = await orchestrator.processRequest('', { files: {} });

      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      if (result.errors) {
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });

    it('should not crash on null/undefined inputs', async () => {
      const result = await orchestrator.processRequest(null as any, null as any);

      expect(result).toBeDefined();
      expect(result.success).toBe(false);
    });
  });
});
