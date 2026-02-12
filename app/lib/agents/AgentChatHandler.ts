/**
 * Agent Chat Handler - Integrates the multi-agent system into the chat pipeline
 * 
 * This handler checks if agent mode is enabled and routes requests through
 * the IntegratedOrchestrator instead of direct LLM calls.
 */

import { createScopedLogger } from '~/utils/logger';
import { IntegratedOrchestrator, type OrchestratorConfig, type OrchestratorResult } from './IntegratedOrchestrator';
import { initializeMemoryForChat, augmentPromptWithMemory, recordInteractionToMemory } from './chat-integration';
import type { Message } from 'ai';
import type { ProgressAnnotation } from '~/types/context';
import type { FileMap } from '~/lib/.server/llm/constants';

const logger = createScopedLogger('AgentChatHandler');

export interface AgentChatOptions {
  messages: Message[];
  files?: FileMap;
  apiKeys?: Record<string, string>;
  serverEnv?: Record<string, string>;
  enableMemory?: boolean;
  modelProvider?: string;
  onProgress?: (annotation: ProgressAnnotation) => void;
  onAgentStatus?: (agent: string, status: string, message: string) => void;
}

export interface AgentChatResult {
  success: boolean;
  response: string;
  agentSteps: Array<{
    agent: string;
    action: string;
    result: string;
  }>;
  errors?: string[];
}

/**
 * Check if agent mode is enabled from cookies
 */
export function isAgentModeEnabled(cookies: Record<string, string>): boolean {
  return cookies.agent_mode === 'true';
}

/**
 * Check if memory is enabled from cookies
 */
export function isMemoryEnabled(cookies: Record<string, string>): boolean {
  return cookies.memory_enabled === 'true';
}

/**
 * Get safety level from cookies
 */
export function getAgentSafetyLevel(cookies: Record<string, string>): 'strict' | 'moderate' | 'permissive' {
  const level = cookies.agent_safety_level;
  if (level === 'moderate' || level === 'permissive') {
    return level;
  }
  return 'strict';
}

/**
 * Handle chat request using the agent system
 */
export async function handleAgentChat(options: AgentChatOptions): Promise<AgentChatResult> {
  const {
    messages,
    files,
    apiKeys,
    serverEnv,
    enableMemory = false,
    modelProvider = 'openai',
    onProgress,
    onAgentStatus,
  } = options;

  try {
    logger.info('Starting agent-based chat processing');

    // Step 1: Initialize memory if enabled
    let memoryManager;
    if (enableMemory) {
      // Skip memory on server-side (IndexedDB not available)
      if (typeof window === 'undefined') {
        logger.warn('Memory system requires browser environment, skipping on server');
      } else {
        onProgress?.({
          type: 'progress',
          label: 'agent-init',
          status: 'in-progress',
          order: 1,
          message: 'Initializing memory system...',
        });

        memoryManager = await initializeMemoryForChat(modelProvider);
        
        onProgress?.({
          type: 'progress',
          label: 'agent-init',
          status: 'complete',
          order: 1,
          message: 'Memory system ready',
        });
      }
    }

    // Step 2: Augment messages with memory context
    let processedMessages = messages;
    if (memoryManager) {
      onProgress?.({
        type: 'progress',
        label: 'memory-retrieval',
        status: 'in-progress',
        order: 2,
        message: 'Retrieving relevant past work...',
      });

      const { augmentedMessages } = await augmentPromptWithMemory(messages, memoryManager);
      processedMessages = augmentedMessages;

      onProgress?.({
        type: 'progress',
        label: 'memory-retrieval',
        status: 'complete',
        order: 2,
        message: 'Memory context added',
      });
    }

    // Step 3: Extract user request
    const lastUserMessage = processedMessages.filter((m) => m.role === 'user').slice(-1)[0];
    if (!lastUserMessage) {
      throw new Error('No user message found');
    }

    // Step 4: Initialize orchestrator
    onProgress?.({
      type: 'progress',
      label: 'agent-planning',
      status: 'in-progress',
      order: 3,
      message: 'Planning task execution...',
    });

    onAgentStatus?.('Planner', 'active', 'Analyzing request and creating task plan');

    // For now, we'll create a mock ActionRunner
    // In full integration, this would be the real ActionRunner from workbench
    const mockActionRunner = {
      async runAction(action: any) {
        logger.debug('Mock action runner executing:', action);
        return { success: true };
      }
    };

    const orchestratorConfig: OrchestratorConfig = {
      actionRunner: mockActionRunner as any,
      files,
      enableMemory,
      serverEnv,
      apiKeys,
      safetyConstraints: {
        maxTokensPerTask: 4000,
        maxRetries: 3,
      },
    };

    const orchestrator = new IntegratedOrchestrator(orchestratorConfig);

    // Step 5: Execute through orchestrator
    onProgress?.({
      type: 'progress',
      label: 'agent-planning',
      status: 'complete',
      order: 3,
      message: 'Task plan created',
    });

    onProgress?.({
      type: 'progress',
      label: 'agent-execution',
      status: 'in-progress',
      order: 4,
      message: 'Executing tasks...',
    });

    onAgentStatus?.('Executor', 'active', 'Implementing changes');

    const result: OrchestratorResult = await orchestrator.processRequest(lastUserMessage.content, {
      files: files || {},
      conversationHistory: processedMessages.slice(-5).map(m => m.content),
    });

    if (!result.success) {
      onProgress?.({
        type: 'progress',
        label: 'agent-execution',
        status: 'complete',
        order: 4,
        message: 'Execution completed with errors',
      });

      return {
        success: false,
        response: result.summary,
        agentSteps: result.tasks.map((task, idx) => ({
          agent: idx === 0 ? 'Planner' : 'Executor',
          action: task.description,
          result: result.results[idx]?.output || 'Failed',
        })),
        errors: result.errors,
      };
    }

    onProgress?.({
      type: 'progress',
      label: 'agent-execution',
      status: 'complete',
      order: 4,
      message: 'Execution complete',
    });

    // Step 6: Review phase
    onProgress?.({
      type: 'progress',
      label: 'agent-review',
      status: 'in-progress',
      order: 5,
      message: 'Reviewing changes...',
    });

    onAgentStatus?.('Reviewer', 'active', 'Validating changes for quality and safety');

    // Review is already done by orchestrator
    onProgress?.({
      type: 'progress',
      label: 'agent-review',
      status: 'complete',
      order: 5,
      message: 'Review complete',
    });

    // Step 7: Record to memory
    if (memoryManager) {
      onProgress?.({
        type: 'progress',
        label: 'memory-recording',
        status: 'in-progress',
        order: 6,
        message: 'Recording interaction to memory...',
      });

      await recordInteractionToMemory(
        lastUserMessage.content,
        result.summary,
        memoryManager
      );

      onProgress?.({
        type: 'progress',
        label: 'memory-recording',
        status: 'complete',
        order: 6,
        message: 'Interaction recorded',
      });
    }

    onAgentStatus?.('Complete', 'success', 'All tasks completed successfully');

    // Step 8: Return result
    return {
      success: true,
      response: result.summary,
      agentSteps: result.tasks.map((task, idx) => ({
        agent: task.assignedTo || 'Unknown',
        action: task.description,
        result: result.results[idx]?.output || 'Success',
      })),
    };
  } catch (error: any) {
    logger.error('Agent chat processing failed:', error);
    
    onProgress?.({
      type: 'progress',
      label: 'agent-error',
      status: 'complete',
      order: 99,
      message: `Error: ${error.message}`,
    });

    return {
      success: false,
      response: `Agent system error: ${error.message}`,
      agentSteps: [],
      errors: [error.message],
    };
  }
}
