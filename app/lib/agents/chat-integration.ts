/**
 * Chat Integration Helpers for Agent System
 *
 * Provides utilities to integrate the agent system with bolt.diy's chat pipeline.
 * This is opt-in via user settings.
 */

import { createScopedLogger } from '~/utils/logger';
import { MemoryManager } from '~/lib/memory/MemoryManager';
import type { Message } from 'ai';

const logger = createScopedLogger('ChatIntegration');

/**
 * Check if agent mode is enabled via settings
 */
export function isAgentModeEnabled(cookies: Record<string, string>): boolean {
  return cookies.agent_mode === 'true';
}

/**
 * Check if memory system is enabled via settings
 */
export function isMemoryEnabled(cookies: Record<string, string>): boolean {
  return cookies.memory_enabled === 'true';
}

/**
 * Augment system prompt with memory context
 *
 * This adds relevant past learnings to the context without modifying
 * the existing prompt structure.
 */
export async function augmentPromptWithMemory(
  messages: Message[],
  memoryManager?: MemoryManager,
): Promise<{ augmentedMessages: Message[]; memoryContext?: string }> {
  if (!memoryManager) {
    return { augmentedMessages: messages };
  }

  try {
    // Extract user's request
    const lastUserMessage = messages.filter((m) => m.role === 'user').slice(-1)[0];

    if (!lastUserMessage) {
      return { augmentedMessages: messages };
    }

    // Search memory for relevant past work
    const relevantMemories = await memoryManager.search(lastUserMessage.content, 3);

    if (relevantMemories.length === 0) {
      logger.debug('No relevant memories found');
      return { augmentedMessages: messages };
    }

    // Build memory context
    const memoryContext = buildMemoryContext(relevantMemories);

    // Inject memory into system prompt
    const augmentedMessages = [...messages];
    const systemMessageIndex = augmentedMessages.findIndex((m) => m.role === 'system');

    if (systemMessageIndex >= 0) {
      // Append to existing system message
      augmentedMessages[systemMessageIndex] = {
        ...augmentedMessages[systemMessageIndex],
        content: augmentedMessages[systemMessageIndex].content + '\n\n' + memoryContext,
      };
    } else {
      // Insert new system message at the start
      augmentedMessages.unshift({
        id: `memory_${Date.now()}`,
        role: 'system',
        content: memoryContext,
      } as Message);
    }

    logger.info(`Augmented prompt with ${relevantMemories.length} memory items`);

    return { augmentedMessages, memoryContext };
  } catch (error) {
    logger.error('Failed to augment prompt with memory:', error);
    return { augmentedMessages: messages };
  }
}

/**
 * Build memory context string from search results
 */
function buildMemoryContext(memories: any[]): string {
  const items = memories
    .map((mem, i) => {
      return `${i + 1}. ${mem.content || mem.text || JSON.stringify(mem)}`;
    })
    .join('\n');

  return `<memory_context>
Relevant past work and learnings:

${items}

Use this context to inform your current response, but don't reference it explicitly unless relevant.
</memory_context>`;
}

/**
 * Record successful interaction to memory
 *
 * Call this after a successful chat response to store learnings.
 */
export async function recordInteractionToMemory(
  userMessage: string,
  assistantResponse: string,
  memoryManager?: MemoryManager,
): Promise<void> {
  if (!memoryManager) {
    return;
  }

  try {
    // Add messages using recordMessage method
    await memoryManager.recordMessage('user', userMessage);
    await memoryManager.recordMessage('assistant', assistantResponse);

    logger.debug('Recorded interaction to memory');
  } catch (error) {
    logger.warn('Failed to record interaction to memory:', error);
  }
}

/**
 * Initialize memory manager for chat
 *
 * Creates and initializes a MemoryManager instance with appropriate config.
 */
export async function initializeMemoryForChat(modelProvider: string = 'openai'): Promise<MemoryManager | undefined> {
  try {
    const memoryManager = new MemoryManager({
      modelProvider,
      embeddingDimensions: 384,
      persistencePrefix: 'bolt_chat',
    });

    await memoryManager.initialize();
    logger.info('Memory system initialized for chat');

    return memoryManager;
  } catch (error) {
    logger.error('Failed to initialize memory system:', error);
    return undefined;
  }
}

/**
 * Get memory statistics for UI display
 */
export async function getMemoryStats(memoryManager?: MemoryManager): Promise<any> {
  if (!memoryManager) {
    return null;
  }

  try {
    return await memoryManager.getStats();
  } catch (error) {
    logger.warn('Failed to get memory stats:', error);
    return null;
  }
}
