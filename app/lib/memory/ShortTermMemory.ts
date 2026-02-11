/**
 * Short-Term Memory Manager — Phase 4
 *
 * Manages conversation history, active task state, and working memory.
 * Uses IndexedDB for persistence across browser sessions.
 *
 * Integration:
 *  - Tracks conversation messages
 *  - Compresses old history via LLM
 *  - Maintains active task state
 *  - Provides rolling context window
 */

import { createScopedLogger } from '~/utils/logger';
import type { Task, TaskResult } from '../agents/types';
import { streamText } from '~/lib/.server/llm/stream-text';
import type { Message as AIMessage } from 'ai';
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from '~/utils/constants';

const logger = createScopedLogger('ShortTermMemory');

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface CompressedHistory {
  summary: string;
  messageCount: number;
  timeRange: [number, number];
  keyPoints: string[];
  compressedAt: number;
}

export interface ConversationContext {
  recentMessages: Message[];
  compressedHistory?: CompressedHistory;
  activeTask?: Task;
  messageCount: number;
}

export interface ActiveTaskState {
  task: Task;
  startedAt: number;
  progress: number;
  lastUpdate: number;
  attempts: number;
}

export interface ShortTermMemoryConfig {
  /**
   * Max messages to keep in active window
   */
  maxActiveMessages?: number;
  /**
   * Messages older than this get compressed
   */
  compressionThreshold?: number;
  /**
   * Enable IndexedDB persistence
   */
  persistToDB?: boolean;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class ShortTermMemory {
  private config: Required<ShortTermMemoryConfig>;
  private messages: Message[] = [];
  private compressedHistory?: CompressedHistory;
  private activeTask?: ActiveTaskState;
  private dbName = 'bolt_memory_shortterm';
  private db?: IDBDatabase;

  constructor(config: ShortTermMemoryConfig = {}) {
    this.config = {
      maxActiveMessages: config.maxActiveMessages ?? 20,
      compressionThreshold: config.compressionThreshold ?? 50,
      persistToDB: config.persistToDB ?? true,
    };

    logger.info('ShortTermMemory initialized', this.config);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.config.persistToDB) {
      await this.initDB();
      await this.loadFromDB();
    }

    logger.info('ShortTermMemory ready');
  }

  async cleanup(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = undefined;
    }

    logger.info('ShortTermMemory cleaned up');
  }

  // -------------------------------------------------------------------------
  // Message management
  // -------------------------------------------------------------------------

  /**
   * Add a new message to conversation history.
   */
  async addMessage(message: Message): Promise<void> {
    this.messages.push(message);

    // Check if compression is needed
    if (this.messages.length > this.config.compressionThreshold) {
      await this.compressOldMessages();
    }

    // Persist to DB
    if (this.config.persistToDB) {
      await this.saveMessageToDB(message);
    }

    logger.debug(`Message added: ${message.role} (${message.content.slice(0, 50)}...)`);
  }

  /**
   * Get recent messages (rolling window).
   */
  getRecentMessages(count?: number): Message[] {
    const n = count ?? this.config.maxActiveMessages;
    return this.messages.slice(-n);
  }

  /**
   * Get all messages (includes compressed history context).
   */
  getAllMessages(): Message[] {
    return [...this.messages];
  }

  /**
   * Clear all messages.
   */
  clearMessages(): void {
    this.messages = [];
    this.compressedHistory = undefined;

    if (this.config.persistToDB) {
      this.clearMessagesFromDB();
    }

    logger.info('Messages cleared');
  }

  // -------------------------------------------------------------------------
  // History compression
  // -------------------------------------------------------------------------

  /**
   * Compress old messages to save memory.
   * Uses LLM to create a summary of older conversation.
   */
  async compressOldMessages(): Promise<void> {
    const keepCount = this.config.maxActiveMessages;
    const toCompress = this.messages.slice(0, -keepCount);

    if (toCompress.length === 0) {
      return;
    }

    logger.info(`Compressing ${toCompress.length} old messages`);

    try {
      // Generate summary (placeholder - will integrate with LLM)
      const summary = await this.generateSummary(toCompress);

      // Extract key points
      const keyPoints = this.extractKeyPoints(toCompress);

      this.compressedHistory = {
        summary,
        messageCount: toCompress.length,
        timeRange: [toCompress[0].timestamp, toCompress[toCompress.length - 1].timestamp],
        keyPoints,
        compressedAt: Date.now(),
      };

      // Remove compressed messages from active memory
      this.messages = this.messages.slice(-keepCount);

      logger.info('Compression complete', {
        compressed: toCompress.length,
        remaining: this.messages.length,
      });
    } catch (error) {
      logger.error('Compression failed:', error);
    }
  }

  /**
   * Generate summary of messages using LLM.
   * Integrated with bolt.diy's streamText API.
   */
  private async generateSummary(messages: Message[]): Promise<string> {
    try {
      // Convert messages to AI format
      const conversationText = messages.map((m) => `${m.role}: ${m.content}`).join('\n\n');

      const summaryPrompt: AIMessage[] = [
        {
          role: 'system',
          content: 'You are a concise summarizer. Create a brief 2-3 sentence summary of the conversation.',
        },
        {
          role: 'user',
          content: `Summarize this conversation:\n\n${conversationText}`,
        },
      ];

      // Use bolt.diy's streamText API
      const result = await streamText({
        messages: summaryPrompt,
      });

      // Collect streamed response
      let summary = '';
      const reader = result.toDataStreamResponse().body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          summary += decoder.decode(value, { stream: true });
        }
      }

      return summary || this.generateFallbackSummary(messages);
    } catch (error) {
      logger.warn('LLM summary generation failed, using fallback:', error);
      return this.generateFallbackSummary(messages);
    }
  }

  /**
   * Fallback summary when LLM is unavailable.
   */
  private generateFallbackSummary(messages: Message[]): string {
    const userMessages = messages.filter((m) => m.role === 'user');
    const assistantMessages = messages.filter((m) => m.role === 'assistant');

    return (
      `Conversation summary: ${userMessages.length} user messages, ${assistantMessages.length} assistant responses. ` +
      `Topics discussed: ${this.extractTopics(messages).join(', ')}.`
    );
  }

  /**
   * Extract key points from messages.
   */
  private extractKeyPoints(messages: Message[]): string[] {
    const points: string[] = [];

    // Extract important user requests
    const userMessages = messages.filter((m) => m.role === 'user');
    for (const msg of userMessages.slice(0, 5)) {
      points.push(msg.content.slice(0, 100));
    }

    return points;
  }

  /**
   * Extract topics from messages.
   */
  private extractTopics(messages: Message[]): string[] {
    // Simple keyword extraction
    const topics = new Set<string>();
    const keywords = ['implement', 'fix', 'create', 'update', 'refactor', 'test', 'deploy'];

    for (const msg of messages) {
      for (const keyword of keywords) {
        if (msg.content.toLowerCase().includes(keyword)) {
          topics.add(keyword);
        }
      }
    }

    return Array.from(topics);
  }

  // -------------------------------------------------------------------------
  // Active task state
  // -------------------------------------------------------------------------

  /**
   * Set the currently active task.
   */
  setActiveTask(task: Task): void {
    this.activeTask = {
      task,
      startedAt: Date.now(),
      progress: 0,
      lastUpdate: Date.now(),
      attempts: 0,
    };

    logger.info(`Active task set: ${task.id}`);
  }

  /**
   * Update task progress.
   */
  updateTaskProgress(taskId: string, progress: number): void {
    if (this.activeTask && this.activeTask.task.id === taskId) {
      this.activeTask.progress = progress;
      this.activeTask.lastUpdate = Date.now();

      logger.debug(`Task progress updated: ${taskId} -> ${progress}%`);
    }
  }

  /**
   * Increment task attempt counter.
   */
  incrementTaskAttempt(taskId: string): void {
    if (this.activeTask && this.activeTask.task.id === taskId) {
      this.activeTask.attempts++;
    }
  }

  /**
   * Clear active task.
   */
  clearActiveTask(): void {
    this.activeTask = undefined;
    logger.debug('Active task cleared');
  }

  /**
   * Get active task state.
   */
  getActiveTask(): ActiveTaskState | undefined {
    return this.activeTask;
  }

  // -------------------------------------------------------------------------
  // Context assembly
  // -------------------------------------------------------------------------

  /**
   * Get conversation context for agents.
   */
  getActiveContext(): ConversationContext {
    return {
      recentMessages: this.getRecentMessages(),
      compressedHistory: this.compressedHistory,
      activeTask: this.activeTask?.task,
      messageCount: this.messages.length,
    };
  }

  // -------------------------------------------------------------------------
  // IndexedDB persistence
  // -------------------------------------------------------------------------

  private async initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create messages store
        if (!db.objectStoreNames.contains('messages')) {
          const store = db.createObjectStore('messages', { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Create metadata store
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' });
        }
      };
    });
  }

  private async loadFromDB(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages', 'metadata'], 'readonly');
      const messagesStore = transaction.objectStore('messages');
      const metadataStore = transaction.objectStore('metadata');

      // Load messages
      const messagesRequest = messagesStore.getAll();
      messagesRequest.onsuccess = () => {
        this.messages = messagesRequest.result || [];
      };

      // Load compressed history
      const historyRequest = metadataStore.get('compressedHistory');
      historyRequest.onsuccess = () => {
        if (historyRequest.result) {
          this.compressedHistory = historyRequest.result.value;
        }
      };

      transaction.oncomplete = () => {
        logger.info(`Loaded ${this.messages.length} messages from DB`);
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  }

  private async saveMessageToDB(message: Message): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readwrite');
      const store = transaction.objectStore('messages');

      const request = store.put(message);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async clearMessagesFromDB(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages', 'metadata'], 'readwrite');

      transaction.objectStore('messages').clear();
      transaction.objectStore('metadata').clear();

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  // -------------------------------------------------------------------------
  // Statistics
  // -------------------------------------------------------------------------

  getStats(): {
    activeMessages: number;
    compressedMessages: number;
    totalMessages: number;
    activeTask: boolean;
  } {
    return {
      activeMessages: this.messages.length,
      compressedMessages: this.compressedHistory?.messageCount ?? 0,
      totalMessages: this.messages.length + (this.compressedHistory?.messageCount ?? 0),
      activeTask: !!this.activeTask,
    };
  }
}
