/**
 * Example Usage - Multi-Agent System
 * Demonstrates how to use the complete agent system
 */

import { createAgentSystem } from './AgentSystemIntegration';

/**
 * Example 1: Basic Usage - Process a coding request
 */
async function example1_BasicUsage() {
  console.log('=== Example 1: Basic Usage ===\n');

  // Create and initialize the system
  const agentSystem = await createAgentSystem({
    skillsPath: '.agent/skills',
    safetyMode: 'moderate',
    autoLoadSkills: true,
  });

  // Process a request
  const result = await agentSystem.processRequest({
    userRequest: 'Add a new React component for user profile display',
    files: ['app/components/user/Profile.tsx'],
    context: 'Create a clean, accessible user profile component with TypeScript',
  });

  console.log('Result:', result.success ? 'SUCCESS' : 'FAILED');
  console.log('Files modified:', result.metrics.filesModified);
  console.log('Lines changed:', result.metrics.linesChanged);
}

/**
 * Example 2: Code Search - Find similar code patterns
 */
async function example2_CodeSearch() {
  console.log('\n=== Example 2: Code Search ===\n');

  const agentSystem = await createAgentSystem();

  // Index some files first
  await agentSystem.indexFiles([
    {
      path: 'app/components/Button.tsx',
      content: `
        export function Button({ onClick, children }: ButtonProps) {
          return <button onClick={onClick}>{children}</button>;
        }
      `,
    },
    {
      path: 'app/components/Input.tsx',
      content: `
        export function Input({ value, onChange }: InputProps) {
          return <input value={value} onChange={onChange} />;
        }
      `,
    },
  ]);

  // Search for similar code
  const results = await agentSystem.searchCode('React component with props', 5);

  console.log(`Found ${results.length} similar code patterns:`);
  results.forEach(result => {
    console.log(`- ${result.chunk.file}: ${result.chunk.symbolName} (${(result.similarity * 100).toFixed(0)}% match)`);
  });
}

/**
 * Example 3: Symbol Search - Find specific functions/classes
 */
async function example3_SymbolSearch() {
  console.log('\n=== Example 3: Symbol Search ===\n');

  const agentSystem = await createAgentSystem();

  // Index a file
  await agentSystem.indexFile(
    'app/lib/utils/helpers.ts',
    `
    export function formatDate(date: Date): string {
      return date.toISOString().split('T')[0];
    }

    export class DataProcessor {
      process(data: any) {
        return data;
      }
    }
  `,
  );

  // Find by symbol name
  const formatDateSymbols = agentSystem.findSymbol('formatDate');
  console.log('Found formatDate in:', formatDateSymbols.map(s => s.file));

  const processorSymbols = agentSystem.findSymbol('DataProcessor');
  console.log('Found DataProcessor in:', processorSymbols.map(s => s.file));
}

/**
 * Example 4: Complex Request - Multi-file changes
 */
async function example4_ComplexRequest() {
  console.log('\n=== Example 4: Complex Request ===\n');

  const agentSystem = await createAgentSystem({
    safetyMode: 'strict', // Use strict mode for complex changes
  });

  const result = await agentSystem.processRequest({
    userRequest: `
      Refactor the authentication system:
      1. Add JWT token validation
      2. Create middleware for protected routes
      3. Update the login component to use the new system
      4. Add error handling for auth failures
    `,
    files: [
      'app/lib/auth/jwt.ts',
      'app/lib/middleware/auth.ts',
      'app/components/auth/Login.tsx',
    ],
    context: 'Use best practices for security and TypeScript strict mode',
    constraints: ['Must maintain backward compatibility', 'Add comprehensive error handling'],
  });

  console.log('\nExecution Results:');
  console.log('- Success:', result.success);
  console.log('- Tasks:', result.tasks.length);
  console.log('- Completed:', result.metrics.tasksCompleted);
  console.log('- Failed:', result.metrics.tasksFailed);
  console.log('- Files Modified:', result.metrics.filesModified);

  if (result.errors.length > 0) {
    console.log('\nErrors:');
    result.errors.forEach(err => console.log(`  - ${err}`));
  }

  if (result.warnings.length > 0) {
    console.log('\nWarnings:');
    result.warnings.forEach(warn => console.log(`  - ${warn}`));
  }
}

/**
 * Example 5: System Statistics
 */
async function example5_Statistics() {
  console.log('\n=== Example 5: System Statistics ===\n');

  const agentSystem = await createAgentSystem();

  // Index some files
  await agentSystem.indexFiles([
    { path: 'app/utils/a.ts', content: 'export function a() {}' },
    { path: 'app/utils/b.ts', content: 'export function b() {}' },
    { path: 'app/utils/c.ts', content: 'export function c() {}' },
  ]);

  // Get statistics
  const repoStats = agentSystem.getRepoStats();
  console.log('Repository Statistics:');
  console.log('- Total Files Indexed:', repoStats.totalFiles);
  console.log('- Total Code Chunks:', repoStats.totalChunks);
  console.log('- Total Symbols:', repoStats.totalSymbols);
  console.log('- Languages:', Object.keys(repoStats.languages));

  const memoryStats = agentSystem.getMemoryStats();
  console.log('\nMemory Statistics:');
  console.log('- Total Memories:', memoryStats.totalMemories);
  console.log('- Memory Types:', Object.keys(memoryStats.byType));

  const skillsStats = agentSystem.getSkillsStats();
  console.log('\nSkills Statistics:');
  console.log('- Total Skills:', skillsStats.totalSkills);
  console.log('- By Agent:', JSON.stringify(skillsStats.byAgent));
}

/**
 * Example 6: Export System State (for debugging)
 */
async function example6_ExportState() {
  console.log('\n=== Example 6: Export System State ===\n');

  const agentSystem = await createAgentSystem();

  // Do some work
  await agentSystem.processRequest({
    userRequest: 'Add a simple function',
    files: ['app/utils/test.ts'],
  });

  // Export state
  const state = agentSystem.exportSystemState();
  console.log('System state exported (truncated):');
  console.log(state.substring(0, 500) + '...');

  // In production, you would save this to a file
  // require('fs').writeFileSync('agent-system-state.json', state);
}

/**
 * Run all examples
 */
async function runAllExamples() {
  try {
    await example1_BasicUsage();
    await example2_CodeSearch();
    await example3_SymbolSearch();
    await example4_ComplexRequest();
    await example5_Statistics();
    await example6_ExportState();

    console.log('\n✅ All examples completed successfully!');
  } catch (error) {
    console.error('❌ Example failed:', error);
  }
}

// Export examples for use
export {
  example1_BasicUsage,
  example2_CodeSearch,
  example3_SymbolSearch,
  example4_ComplexRequest,
  example5_Statistics,
  example6_ExportState,
  runAllExamples,
};
