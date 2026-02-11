/**
 * Context Builder - Assembles relevant context for agent execution
 * Automatically finds related files, imports, and dependencies
 */

import type { FileSymbols, Symbol } from './ASTParser';
import { ASTParser } from './ASTParser';
import type { VectorMemoryStore } from './VectorMemoryStore';

export interface ContextItem {
  type: 'file' | 'symbol' | 'dependency' | 'test' | 'documentation' | 'related';
  path: string;
  content?: string;
  excerpt?: string;
  relevance: number; // 0-1
  reason: string;
  startLine?: number;
  endLine?: number;
}

export interface ContextBundle {
  primary: ContextItem[]; // Files/symbols directly mentioned
  dependencies: ContextItem[]; // Files imported by primary
  dependents: ContextItem[]; // Files that import primary
  related: ContextItem[]; // Semantically similar
  tests: ContextItem[]; // Test files
  documentation: ContextItem[]; // README, docs, comments
  totalTokens: number; // Estimated token count
  tokenLimit: number; // Max tokens allowed
}

export interface ContextBuilderOptions {
  maxTokens?: number;
  includeDependencies?: boolean;
  includeDependents?: boolean;
  includeTests?: boolean;
  includeDocumentation?: boolean;
  includeRelated?: boolean;
  maxDependencyDepth?: number;
  semanticSearchThreshold?: number;
}

/**
 * ContextBuilder - Smart context assembly for agents
 */
export class ContextBuilder {
  private astParser: ASTParser;
  private memoryStore?: VectorMemoryStore;
  private fileCache: Map<string, string>;

  constructor(astParser: ASTParser, memoryStore?: VectorMemoryStore) {
    this.astParser = astParser;
    this.memoryStore = memoryStore;
    this.fileCache = new Map();
  }

  /**
   * Build context for a task
   */
  async buildContext(
    files: string[],
    description: string,
    options: ContextBuilderOptions = {},
  ): Promise<ContextBundle> {
    const {
      maxTokens = 100000,
      includeDependencies = true,
      includeDependents = true,
      includeTests = true,
      includeDocumentation = true,
      includeRelated = true,
      maxDependencyDepth = 2,
      semanticSearchThreshold = 0.7,
    } = options;

    const context: ContextBundle = {
      primary: [],
      dependencies: [],
      dependents: [],
      related: [],
      tests: [],
      documentation: [],
      totalTokens: 0,
      tokenLimit: maxTokens,
    };

    // 1. Add primary files
    for (const file of files) {
      const content = await this.getFileContent(file);
      if (content) {
        context.primary.push({
          type: 'file',
          path: file,
          content,
          relevance: 1.0,
          reason: 'Primary file specified in task',
        });
      }
    }

    // 2. Add dependencies (imports)
    if (includeDependencies) {
      await this.addDependencies(context, files, maxDependencyDepth);
    }

    // 3. Add dependents (files that import these)
    if (includeDependents) {
      await this.addDependents(context, files);
    }

    // 4. Find related files via semantic search
    if (includeRelated && this.memoryStore) {
      await this.addRelatedFiles(context, description, semanticSearchThreshold);
    }

    // 5. Find test files
    if (includeTests) {
      await this.addTestFiles(context, files);
    }

    // 6. Add documentation
    if (includeDocumentation) {
      await this.addDocumentation(context);
    }

    // 7. Calculate total tokens and trim if needed
    this.calculateTokens(context);
    if (context.totalTokens > maxTokens) {
      this.trimContext(context, maxTokens);
    }

    return context;
  }

  /**
   * Add dependencies recursively
   */
  private async addDependencies(
    context: ContextBundle,
    files: string[],
    maxDepth: number,
    currentDepth = 0,
  ): Promise<void> {
    if (currentDepth >= maxDepth) return;

    const allDeps = new Set<string>();

    for (const file of files) {
      const deps = this.astParser.getDependencies(file);
      deps.forEach(dep => {
        // Only include relative imports (project files)
        if (dep.startsWith('.') || dep.startsWith('/')) {
          allDeps.add(dep);
        }
      });
    }

    for (const dep of allDeps) {
      // Skip if already in context
      if (this.isInContext(context, dep)) continue;

      const content = await this.getFileContent(dep);
      if (content) {
        context.dependencies.push({
          type: 'dependency',
          path: dep,
          content,
          relevance: 1.0 / (currentDepth + 2), // Decrease relevance with depth
          reason: `Imported by ${files[0]} (depth: ${currentDepth + 1})`,
        });
      }
    }

    // Recurse
    if (allDeps.size > 0) {
      await this.addDependencies(context, Array.from(allDeps), maxDepth, currentDepth + 1);
    }
  }

  /**
   * Add files that depend on these files
   */
  private async addDependents(context: ContextBundle, files: string[]): Promise<void> {
    for (const file of files) {
      const dependents = this.astParser.getDependents(file);

      for (const dependent of dependents) {
        if (this.isInContext(context, dependent)) continue;

        const content = await this.getFileContent(dependent);
        if (content) {
          context.dependents.push({
            type: 'dependency',
            path: dependent,
            content,
            relevance: 0.7,
            reason: `Depends on ${file}`,
          });
        }
      }
    }
  }

  /**
   * Find semantically related files
   */
  private async addRelatedFiles(
    context: ContextBundle,
    description: string,
    threshold: number,
  ): Promise<void> {
    if (!this.memoryStore) return;

    // Search memory for related code
    const memories = await this.memoryStore.search(description, {
      limit: 10,
      threshold,
      filter: { type: 'code' },
    });

    for (const memory of memories) {
      const metadata = memory.metadata as any;
      const file = metadata?.filePath;

      if (!file || this.isInContext(context, file)) continue;

      const content = await this.getFileContent(file);
      if (content) {
        // Calculate relevance from embedding similarity (simplified)
        const relevance = threshold;
        context.related.push({
          type: 'related',
          path: file,
          content,
          relevance,
          reason: `Semantically related (${(threshold * 100).toFixed(0)}% match)`,
        });
      }
    }
  }

  /**
   * Find test files for given files
   */
  private async addTestFiles(context: ContextBundle, files: string[]): Promise<void> {
    const testPatterns = [
      (file: string) => file.replace(/\.(ts|tsx|js|jsx)$/, '.test.$1'),
      (file: string) => file.replace(/\.(ts|tsx|js|jsx)$/, '.spec.$1'),
      (file: string) => file.replace(/^(.*)\/([^/]+)$/, '$1/__tests__/$2'),
      (file: string) => file.replace(/^(.*)\/([^/]+)$/, '$1/__test__/$2'),
    ];

    for (const file of files) {
      for (const pattern of testPatterns) {
        const testFile = pattern(file);
        if (this.isInContext(context, testFile)) continue;

        const content = await this.getFileContent(testFile);
        if (content) {
          context.tests.push({
            type: 'test',
            path: testFile,
            content,
            relevance: 0.8,
            reason: `Test file for ${file}`,
          });
          break; // Found a test, don't check other patterns
        }
      }
    }
  }

  /**
   * Add documentation files
   */
  private async addDocumentation(context: ContextBundle): Promise<void> {
    const docFiles = ['README.md', 'CONTRIBUTING.md', 'docs/README.md', '.agent/ARCHITECTURE.md'];

    for (const docFile of docFiles) {
      const content = await this.getFileContent(docFile);
      if (content) {
        context.documentation.push({
          type: 'documentation',
          path: docFile,
          content,
          relevance: 0.5,
          reason: 'Project documentation',
        });
      }
    }
  }

  /**
   * Check if file is already in context
   */
  private isInContext(context: ContextBundle, file: string): boolean {
    const allItems = [
      ...context.primary,
      ...context.dependencies,
      ...context.dependents,
      ...context.related,
      ...context.tests,
      ...context.documentation,
    ];

    return allItems.some(item => item.path === file);
  }

  /**
   * Get file content (cached)
   */
  private async getFileContent(file: string): Promise<string | null> {
    if (this.fileCache.has(file)) {
      return this.fileCache.get(file)!;
    }

    try {
      // In production, this would use the actual file system
      // For now, return null for demonstration
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Set file content in cache
   */
  cacheFile(file: string, content: string): void {
    this.fileCache.set(file, content);
  }

  /**
   * Calculate estimated token count
   */
  private calculateTokens(context: ContextBundle): void {
    let total = 0;

    const countItems = (items: ContextItem[]) => {
      for (const item of items) {
        if (item.content) {
          // Rough estimate: 1 token ≈ 4 characters
          total += Math.ceil(item.content.length / 4);
        }
      }
    };

    countItems(context.primary);
    countItems(context.dependencies);
    countItems(context.dependents);
    countItems(context.related);
    countItems(context.tests);
    countItems(context.documentation);

    context.totalTokens = total;
  }

  /**
   * Trim context to fit within token limit
   */
  private trimContext(context: ContextBundle, maxTokens: number): void {
    // Priority: primary > tests > dependencies > dependents > related > documentation
    const priorities: (keyof ContextBundle)[] = [
      'primary',
      'tests',
      'dependencies',
      'dependents',
      'related',
      'documentation',
    ];

    let currentTokens = context.totalTokens;

    // Remove items starting from lowest priority
    for (let i = priorities.length - 1; i >= 0 && currentTokens > maxTokens; i--) {
      const key = priorities[i];
      const items = context[key] as ContextItem[];

      // Sort by relevance (lowest first)
      items.sort((a, b) => a.relevance - b.relevance);

      // Remove items until within limit
      while (items.length > 0 && currentTokens > maxTokens) {
        const removed = items.pop()!;
        if (removed.content) {
          currentTokens -= Math.ceil(removed.content.length / 4);
        }
      }
    }

    context.totalTokens = currentTokens;
  }

  /**
   * Format context as a string for LLM
   */
  formatContext(context: ContextBundle): string {
    const sections: string[] = [];

    const formatItems = (title: string, items: ContextItem[]) => {
      if (items.length === 0) return '';

      const lines = [`## ${title}\n`];

      for (const item of items) {
        lines.push(`### ${item.path}`);
        lines.push(`**Relevance:** ${(item.relevance * 100).toFixed(0)}%`);
        lines.push(`**Reason:** ${item.reason}\n`);

        if (item.content) {
          lines.push('```');
          lines.push(item.content);
          lines.push('```\n');
        }
      }

      return lines.join('\n');
    };

    sections.push(formatItems('Primary Files', context.primary));
    sections.push(formatItems('Dependencies', context.dependencies));
    sections.push(formatItems('Dependents', context.dependents));
    sections.push(formatItems('Related Files', context.related));
    sections.push(formatItems('Tests', context.tests));
    sections.push(formatItems('Documentation', context.documentation));

    return sections.filter(s => s).join('\n\n');
  }

  /**
   * Clear file cache
   */
  clearCache(): void {
    this.fileCache.clear();
  }
}
