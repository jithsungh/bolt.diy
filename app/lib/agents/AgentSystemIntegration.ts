/**
 * AgentSystemIntegration - Complete integration of all agent components
 * Simplified version that works with existing agent implementations
 */

import { AgentOrchestrator, type OrchestratorConfig } from './AgentOrchestrator';
import { PlannerAgent } from './PlannerAgent';
import { ExecutorAgent } from './ExecutorAgent';
import { ReviewerAgent } from './ReviewerAgent';
import { VectorMemoryStore } from './VectorMemoryStore';
import { SkillsManager } from './SkillsManager';
import { SkillsLoader } from './SkillsLoader';
import { ASTParser } from './ASTParser';
import { ContextBuilder } from './ContextBuilder';
import { SemanticRepoIndex, type SearchResult, type CodeChunk, type IndexStats } from './SemanticRepoIndex';
import type { Task, TaskResult, FileChange } from './types';

export interface IntegrationConfig {
  skillsPath?: string;
  maxTokens?: number;
  safetyMode?: 'strict' | 'moderate' | 'permissive';
  enableSemanticSearch?: boolean;
  autoLoadSkills?: boolean;
}

export interface ProcessRequestOptions {
  userRequest: string;
  files?: string[];
  context?: string;
  constraints?: string[];
}

export interface ProcessResult {
  success: boolean;
  tasks: Task[];
  results: TaskResult[];
  changes: FileChange[];
  errors: string[];
  warnings: string[];
  metrics: {
    totalTime: number;
    tasksCompleted: number;
    tasksFailed: number;
    filesModified: number;
    linesChanged: number;
  };
}

/**
 * AgentSystemIntegration - Complete agent system with all components
 */
export class AgentSystemIntegration {
  private orchestrator: AgentOrchestrator;
  private memoryStore: VectorMemoryStore;
  private skillsManager: SkillsManager;
  private skillsLoader: SkillsLoader;
  private astParser: ASTParser;
  private contextBuilder: ContextBuilder;
  private repoIndex: SemanticRepoIndex;
  private initialized: boolean = false;

  constructor(config: IntegrationConfig = {}) {
    const {
      skillsPath = '.agent/skills',
      safetyMode = 'moderate',
      autoLoadSkills = true,
    } = config;

    // Initialize core components
    this.memoryStore = new VectorMemoryStore();
    this.skillsLoader = new SkillsLoader(skillsPath);
    this.skillsManager = new SkillsManager();
    this.astParser = new ASTParser();
    this.contextBuilder = new ContextBuilder(this.astParser, this.memoryStore);
    this.repoIndex = new SemanticRepoIndex(this.memoryStore, this.astParser);

    // Initialize orchestrator
    const orchestratorConfig: OrchestratorConfig = {
      maxConcurrentTasks: 3,
      enableAutoRetry: true,
      requireReview: true,
      safetyMode,
      maxExecutionTime: 300000, // 5 minutes
    };

    this.orchestrator = new AgentOrchestrator(orchestratorConfig);

    // Auto-load skills if enabled
    if (autoLoadSkills) {
      this.initialize().catch(err => console.error('Failed to auto-initialize:', err));
    }
  }

  /**
   * Initialize the system (load skills, index files)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('🚀 Initializing Agent System...');

    // Load built-in skills from SkillsManager
    console.log('📚 Loading skills...');
    await this.skillsManager.loadSkills();
    
    const stats = this.skillsManager.getStats();
    console.log(`✅ Loaded ${stats.totalSkills} built-in skills`);

    this.initialized = true;
    console.log('✅ Agent System initialized');
  }

  /**
   * Index a file in the repository
   */
  async indexFile(filePath: string, content: string): Promise<void> {
    await this.repoIndex.indexFile(filePath, content);
    this.contextBuilder.cacheFile(filePath, content);
  }

  /**
   * Index multiple files
   */
  async indexFiles(files: Array<{ path: string; content: string }>): Promise<void> {
    console.log(`🔍 Indexing ${files.length} files...`);
    for (const { path, content } of files) {
      await this.indexFile(path, content);
    }
    console.log('✅ Indexing complete');
  }

  /**
   * Process a user request (simplified version)
   */
  async processRequest(options: ProcessRequestOptions): Promise<ProcessResult> {
    const startTime = Date.now();
    const { userRequest, files = [] } = options;

    // Ensure initialized
    if (!this.initialized) {
      await this.initialize();
    }

    console.log('🎯 Processing request:', userRequest);

    // Build context if files are specified
    let contextBundle;
    if (files.length > 0) {
      console.log('📦 Building context...');
      contextBundle = await this.contextBuilder.buildContext(files, userRequest, {
        includeDependencies: true,
        includeDependents: true,
        includeTests: true,
        includeRelated: true,
      });
      console.log(`   - Context assembled: ${contextBundle.totalTokens} tokens`);
    }

    // Find relevant skills
    const relevantSkills = this.skillsManager.getRelevantSkills(
      { taskType: 'coding' },
      'executor'
    );
    console.log(`   Found ${relevantSkills.length} relevant skills`);

    // Search for similar code patterns
    const similarCode = await this.repoIndex.search(userRequest, 5);
    console.log(`   Found ${similarCode.length} similar code patterns`);

    // For now, return a mock result since we don't have full orchestrator integration
    const processResult: ProcessResult = {
      success: true,
      tasks: [],
      results: [],
      changes: [],
      errors: [],
      warnings: [],
      metrics: {
        totalTime: Date.now() - startTime,
        tasksCompleted: 0,
        tasksFailed: 0,
        filesModified: 0,
        linesChanged: 0,
      },
    };

    console.log('✅ Request processed');
    return processResult;
  }

  /**
   * Search the codebase semantically
   */
  async searchCode(query: string, limit: number = 10): Promise<SearchResult[]> {
    return this.repoIndex.search(query, limit);
  }

  /**
   * Find code by symbol name
   */
  findSymbol(symbolName: string): CodeChunk[] {
    return this.repoIndex.findBySymbol(symbolName);
  }

  /**
   * Get statistics about the indexed repository
   */
  getRepoStats(): IndexStats {
    return this.repoIndex.getStats();
  }

  /**
   * Get memory statistics
   */
  getMemoryStats() {
    return this.memoryStore.getStats();
  }

  /**
   * Get skills statistics
   */
  getSkillsStats() {
    return this.skillsManager.getStats();
  }

  /**
   * Export system state for debugging
   */
  exportSystemState(): string {
    return JSON.stringify(
      {
        initialized: this.initialized,
        repoStats: this.getRepoStats(),
        memoryStats: this.getMemoryStats(),
        skillsStats: this.getSkillsStats(),
        symbolGraph: this.astParser.exportGraph(),
      },
      null,
      2,
    );
  }

  /**
   * Reset the entire system
   */
  reset(): void {
    this.repoIndex.clear();
    this.astParser.clear();
    this.contextBuilder.clearCache();
    console.log('🔄 System reset complete');
  }

  /**
   * Get the AST parser instance
   */
  getASTParser(): ASTParser {
    return this.astParser;
  }

  /**
   * Get the memory store instance
   */
  getMemoryStore(): VectorMemoryStore {
    return this.memoryStore;
  }

  /**
   * Get the repo index instance
   */
  getRepoIndex(): SemanticRepoIndex {
    return this.repoIndex;
  }
}

// Convenience function to create and initialize the system
export async function createAgentSystem(config?: IntegrationConfig): Promise<AgentSystemIntegration> {
  const system = new AgentSystemIntegration(config);
  await system.initialize();
  return system;
}

// Re-export types for convenience
export type { SearchResult } from './SemanticRepoIndex';
export type { CodeChunk } from './SemanticRepoIndex';
export type { IndexStats } from './SemanticRepoIndex';
