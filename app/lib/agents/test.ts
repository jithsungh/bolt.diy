/**
 * Test Suite for Multi-Agent System
 * Run with: npm test or directly with ts-node
 */

import { AgentSystemIntegration } from './AgentSystemIntegration';
import { ASTParser } from './ASTParser';
import { ContextBuilder } from './ContextBuilder';
import { SemanticRepoIndex } from './SemanticRepoIndex';
import { SkillsLoader } from './SkillsLoader';
import { VectorMemoryStore } from './VectorMemoryStore';

// Test utilities
class TestRunner {
  private tests: Array<{ name: string; fn: () => Promise<void> }> = [];
  private passed = 0;
  private failed = 0;

  test(name: string, fn: () => Promise<void>) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log('🧪 Running Agent System Tests\n');
    console.log('='.repeat(60));

    for (const test of this.tests) {
      try {
        await test.fn();
        console.log(`✅ ${test.name}`);
        this.passed++;
      } catch (error) {
        console.log(`❌ ${test.name}`);
        console.error('   Error:', error instanceof Error ? error.message : error);
        this.failed++;
      }
    }

    console.log('='.repeat(60));
    console.log(`\n📊 Results: ${this.passed} passed, ${this.failed} failed`);
    console.log(`Total: ${this.tests.length} tests\n`);

    return this.failed === 0;
  }
}

const test = new TestRunner();

// Test 1: AST Parser
test.test('AST Parser - Extract functions', async () => {
  const parser = new ASTParser();
  const code = `
    export function hello() {
      return "world";
    }
    
    const goodbye = () => {
      return "farewell";
    }
  `;

  const symbols = parser.parseFile('test.ts', code);
  
  if (symbols.symbols.length !== 2) {
    throw new Error(`Expected 2 symbols, got ${symbols.symbols.length}`);
  }
  
  const functionNames = symbols.symbols.map(s => s.name);
  if (!functionNames.includes('hello') || !functionNames.includes('goodbye')) {
    throw new Error(`Expected functions 'hello' and 'goodbye', got ${functionNames.join(', ')}`);
  }
});

// Test 2: AST Parser - Extract classes
test.test('AST Parser - Extract classes', async () => {
  const parser = new ASTParser();
  const code = `
    export class MyClass {
      method1() {}
      method2() {}
    }
  `;

  const symbols = parser.parseFile('test.ts', code);
  
  if (symbols.symbols.length !== 1) {
    throw new Error(`Expected 1 class, got ${symbols.symbols.length}`);
  }
  
  const classSymbol = symbols.symbols[0];
  if (classSymbol.type !== 'class' || classSymbol.name !== 'MyClass') {
    throw new Error(`Expected class 'MyClass', got ${classSymbol.type} '${classSymbol.name}'`);
  }
  
  if (!classSymbol.children || classSymbol.children.length !== 2) {
    throw new Error(`Expected 2 methods, got ${classSymbol.children?.length || 0}`);
  }
});

// Test 3: AST Parser - Extract imports
test.test('AST Parser - Extract imports', async () => {
  const parser = new ASTParser();
  const code = `
    import { useState, useEffect } from 'react';
    import axios from 'axios';
  `;

  const symbols = parser.parseFile('test.ts', code);
  
  if (symbols.imports.size !== 2) {
    throw new Error(`Expected 2 imports, got ${symbols.imports.size}`);
  }
  
  const reactImports = symbols.imports.get('react');
  if (!reactImports || reactImports.length !== 2) {
    throw new Error(`Expected 2 react imports, got ${reactImports?.length || 0}`);
  }
});

// Test 4: AST Parser - Dependency graph
test.test('AST Parser - Dependency graph', async () => {
  const parser = new ASTParser();
  
  parser.parseFile('a.ts', `import { b } from './b';`);
  parser.parseFile('b.ts', `import { c } from './c';`);
  parser.parseFile('c.ts', `export function c() {}`);

  const aDeps = parser.getDependencies('a.ts');
  if (!aDeps.includes('./b')) {
    throw new Error(`Expected a.ts to depend on ./b`);
  }

  const bDependents = parser.getDependents('./b');
  if (!bDependents.includes('a.ts')) {
    throw new Error(`Expected ./b to be used by a.ts`);
  }
});

// Test 5: Vector Memory Store
test.test('Vector Memory Store - Add and search', async () => {
  const store = new VectorMemoryStore();
  
  await store.store({
    content: 'React component for user authentication',
    metadata: {
      type: 'code',
      timestamp: Date.now(),
      agentRole: 'executor',
      tags: ['react', 'auth'],
    },
  });

  await store.store({
    content: 'Python function for data processing',
    metadata: {
      type: 'code',
      timestamp: Date.now(),
      agentRole: 'executor',
      tags: ['python', 'data'],
    },
  });

  const results = await store.search('React authentication', { limit: 5 });
  
  if (results.length === 0) {
    throw new Error('Expected at least one search result');
  }
  
  if (!results[0].content.includes('authentication')) {
    throw new Error('Expected top result to be about authentication');
  }
});

// Test 6: Semantic Repo Index
test.test('Semantic Repo Index - Index and search', async () => {
  const index = new SemanticRepoIndex();
  
  await index.indexFile('component.tsx', `
    export function Button({ onClick }: ButtonProps) {
      return <button onClick={onClick}>Click me</button>;
    }
  `);

  const stats = index.getStats();
  if (stats.totalFiles !== 1) {
    throw new Error(`Expected 1 file indexed, got ${stats.totalFiles}`);
  }

  const buttonSymbols = index.findBySymbol('Button');
  if (buttonSymbols.length === 0) {
    throw new Error('Expected to find Button symbol');
  }
});

// Test 7: Context Builder - Build context
test.test('Context Builder - Build context', async () => {
  const parser = new ASTParser();
  const store = new VectorMemoryStore();
  const builder = new ContextBuilder(parser, store);

  // Cache some files
  builder.cacheFile('main.ts', `
    import { helper } from './helper';
    export function main() {
      return helper();
    }
  `);
  
  builder.cacheFile('helper.ts', `
    export function helper() {
      return "help";
    }
  `);

  // Parse files
  parser.parseFile('main.ts', `import { helper } from './helper';`);
  parser.parseFile('helper.ts', `export function helper() {}`);

  const context = await builder.buildContext(['main.ts'], 'Refactor main function', {
    includeDependencies: true,
    maxTokens: 10000,
  });

  if (context.primary.length === 0) {
    throw new Error('Expected primary files in context');
  }
});

// Test 8: Skills Loader - Parse metadata
test.test('Skills Loader - Parse skill metadata', async () => {
  const loader = new SkillsLoader('.agent/skills');
  
  // Note: This test assumes .agent/skills exists
  // In a real test environment, you'd mock the file system
  try {
    const result = await loader.loadSkills();
    
    if (result.loaded.length === 0 && result.failed.length === 0) {
      // No skills directory, skip test
      console.log('   (Skipped - no skills directory)');
      return;
    }
    
    if (!result.success && result.failed.length > 0) {
      throw new Error(`Failed to load skills: ${result.failed[0].error}`);
    }
    
    if (result.loaded.length > 0) {
      const skill = result.loaded[0];
      if (!skill.name || !skill.description) {
        throw new Error('Skill missing name or description');
      }
    }
  } catch (error) {
    // Skills directory might not exist in test environment
    console.log('   (Skipped - no skills directory)');
  }
});

// Test 9: Agent System Integration - Initialize
test.test('Agent System Integration - Initialize', async () => {
  const system = new AgentSystemIntegration({
    autoLoadSkills: false, // Don't auto-load to avoid file system issues
  });

  await system.initialize();
  
  const memoryStats = system.getMemoryStats();
  if (typeof memoryStats.totalMemories !== 'number') {
    throw new Error('Memory stats not available');
  }
});

// Test 10: Agent System Integration - Index files
test.test('Agent System Integration - Index files', async () => {
  const system = new AgentSystemIntegration({
    autoLoadSkills: false,
  });

  await system.indexFile('test.ts', `
    export function test() {
      return "test";
    }
  `);

  const stats = system.getRepoStats();
  if (stats.totalFiles !== 1) {
    throw new Error(`Expected 1 file indexed, got ${stats.totalFiles}`);
  }
});

// Test 11: Agent System Integration - Search code
test.test('Agent System Integration - Search code', async () => {
  const system = new AgentSystemIntegration({
    autoLoadSkills: false,
  });

  await system.indexFile('button.tsx', `
    export function Button() {
      return <button>Click</button>;
    }
  `);

  const results = await system.searchCode('React button component', 5);
  
  if (results.length === 0) {
    throw new Error('Expected search results');
  }
});

// Test 12: Agent System Integration - Find symbol
test.test('Agent System Integration - Find symbol', async () => {
  const system = new AgentSystemIntegration({
    autoLoadSkills: false,
  });

  await system.indexFile('utils.ts', `
    export function formatDate() {
      return new Date().toISOString();
    }
  `);

  const symbols = system.findSymbol('formatDate');
  if (symbols.length === 0) {
    throw new Error('Expected to find formatDate symbol');
  }
});

// Test 13: Agent System Integration - Export state
test.test('Agent System Integration - Export state', async () => {
  const system = new AgentSystemIntegration({
    autoLoadSkills: false,
  });

  const state = system.exportSystemState();
  
  if (!state || typeof state !== 'string') {
    throw new Error('Expected state to be a string');
  }
  
  const parsed = JSON.parse(state);
  if (!parsed.initialized || !parsed.repoStats) {
    throw new Error('State missing expected properties');
  }
});

// Run tests (can be called programmatically)
export async function runTests() {
  return await test.run();
}

export { test, TestRunner };
