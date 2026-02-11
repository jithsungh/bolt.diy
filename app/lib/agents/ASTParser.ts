/**
 * AST Parser and Symbol Extraction
 * Provides code understanding capabilities without heavy dependencies
 * Uses regex-based parsing for TypeScript/JavaScript/JSX/TSX
 */

export interface Symbol {
  name: string;
  type: 'function' | 'class' | 'interface' | 'type' | 'const' | 'let' | 'var' | 'import' | 'export';
  startLine: number;
  endLine: number;
  file: string;
  signature?: string;
  children?: Symbol[];
  imports?: string[];
  exports?: string[];
}

export interface FileSymbols {
  file: string;
  language: 'typescript' | 'javascript' | 'tsx' | 'jsx' | 'unknown';
  symbols: Symbol[];
  imports: Map<string, string[]>; // module -> [imported symbols]
  exports: string[];
  dependencies: string[];
}

export interface SymbolGraph {
  files: Map<string, FileSymbols>;
  symbolIndex: Map<string, Symbol[]>; // symbol name -> occurrences
  dependencyGraph: Map<string, Set<string>>; // file -> files it depends on
  reverseDependencyGraph: Map<string, Set<string>>; // file -> files that depend on it
}

/**
 * ASTParser - Lightweight code analysis without heavy tree-sitter dependency
 */
export class ASTParser {
  private symbolGraph: SymbolGraph;

  constructor() {
    this.symbolGraph = {
      files: new Map(),
      symbolIndex: new Map(),
      dependencyGraph: new Map(),
      reverseDependencyGraph: new Map(),
    };
  }

  /**
   * Parse a file and extract symbols
   */
  parseFile(filePath: string, content: string): FileSymbols {
    const language = this.detectLanguage(filePath);
    const symbols: Symbol[] = [];
    const imports = new Map<string, string[]>();
    const exports: string[] = [];
    const lines = content.split('\n');

    // Extract imports
    this.extractImports(lines, imports);

    // Extract functions
    symbols.push(...this.extractFunctions(filePath, lines));

    // Extract classes
    symbols.push(...this.extractClasses(filePath, lines));

    // Extract interfaces and types
    symbols.push(...this.extractTypesAndInterfaces(filePath, lines));

    // Extract exports
    exports.push(...this.extractExports(lines));

    const fileSymbols: FileSymbols = {
      file: filePath,
      language,
      symbols,
      imports,
      exports,
      dependencies: Array.from(imports.keys()),
    };

    // Update graph
    this.symbolGraph.files.set(filePath, fileSymbols);
    this.updateSymbolIndex(symbols);
    this.updateDependencyGraph(filePath, fileSymbols.dependencies);

    return fileSymbols;
  }

  /**
   * Extract function declarations
   */
  private extractFunctions(file: string, lines: string[]): Symbol[] {
    const symbols: Symbol[] = [];
    
    // Patterns for different function types
    const patterns = [
      /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\((.*?)\)/,
      /^\s*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\((.*?)\)\s*=>/,
      /^\s*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?function\s*\((.*?)\)/,
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          const name = match[1];
          const params = match[2];
          const startLine = i;
          
          // Find end of function (naive: look for closing brace)
          let braceCount = 0;
          let endLine = startLine;
          let foundStart = false;
          
          for (let j = startLine; j < lines.length; j++) {
            const l = lines[j];
            for (const char of l) {
              if (char === '{') {
                braceCount++;
                foundStart = true;
              }
              if (char === '}') braceCount--;
            }
            
            if (foundStart && braceCount === 0) {
              endLine = j;
              break;
            }
          }

          symbols.push({
            name,
            type: 'function',
            startLine,
            endLine,
            file,
            signature: `function ${name}(${params})`,
          });
          
          break;
        }
      }
    }

    return symbols;
  }

  /**
   * Extract class declarations
   */
  private extractClasses(file: string, lines: string[]): Symbol[] {
    const symbols: Symbol[] = [];
    const classPattern = /^\s*(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(classPattern);
      
      if (match) {
        const name = match[1];
        const startLine = i;
        
        // Find end of class
        let braceCount = 0;
        let endLine = startLine;
        let foundStart = false;
        
        for (let j = startLine; j < lines.length; j++) {
          const l = lines[j];
          for (const char of l) {
            if (char === '{') {
              braceCount++;
              foundStart = true;
            }
            if (char === '}') braceCount--;
          }
          
          if (foundStart && braceCount === 0) {
            endLine = j;
            break;
          }
        }

        // Extract methods within class
        const children = this.extractMethods(file, lines.slice(startLine, endLine + 1), startLine);

        symbols.push({
          name,
          type: 'class',
          startLine,
          endLine,
          file,
          signature: `class ${name}`,
          children,
        });
      }
    }

    return symbols;
  }

  /**
   * Extract methods from a class
   */
  private extractMethods(file: string, lines: string[], offset: number): Symbol[] {
    const methods: Symbol[] = [];
    const methodPattern = /^\s*(?:async\s+)?(\w+)\s*\((.*?)\)\s*[:{]/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(methodPattern);
      
      if (match) {
        const name = match[1];
        const params = match[2];
        
        methods.push({
          name,
          type: 'function',
          startLine: offset + i,
          endLine: offset + i, // Simplified
          file,
          signature: `${name}(${params})`,
        });
      }
    }

    return methods;
  }

  /**
   * Extract TypeScript interfaces and types
   */
  private extractTypesAndInterfaces(file: string, lines: string[]): Symbol[] {
    const symbols: Symbol[] = [];
    
    const interfacePattern = /^\s*(?:export\s+)?interface\s+(\w+)/;
    const typePattern = /^\s*(?:export\s+)?type\s+(\w+)/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      let match = line.match(interfacePattern);
      if (match) {
        symbols.push({
          name: match[1],
          type: 'interface',
          startLine: i,
          endLine: i,
          file,
        });
        continue;
      }

      match = line.match(typePattern);
      if (match) {
        symbols.push({
          name: match[1],
          type: 'type',
          startLine: i,
          endLine: i,
          file,
        });
      }
    }

    return symbols;
  }

  /**
   * Extract imports from file
   */
  private extractImports(lines: string[], imports: Map<string, string[]>): void {
    const importPattern = /import\s+(?:{([^}]+)}|(\w+)|\*\s+as\s+(\w+))\s+from\s+['"]([^'"]+)['"]/;

    for (const line of lines) {
      const match = line.match(importPattern);
      if (match) {
        const module = match[4];
        const symbols: string[] = [];

        if (match[1]) {
          // Named imports: { a, b, c }
          symbols.push(...match[1].split(',').map(s => s.trim()));
        } else if (match[2]) {
          // Default import: import React from 'react'
          symbols.push(match[2]);
        } else if (match[3]) {
          // Namespace import: import * as React from 'react'
          symbols.push(match[3]);
        }

        imports.set(module, symbols);
      }
    }
  }

  /**
   * Extract exports from file
   */
  private extractExports(lines: string[]): string[] {
    const exports: string[] = [];
    const exportPattern = /export\s+(?:{([^}]+)}|(?:default\s+)?(?:class|function|const|let|var)\s+(\w+))/;

    for (const line of lines) {
      const match = line.match(exportPattern);
      if (match) {
        if (match[1]) {
          // Named exports: export { a, b, c }
          exports.push(...match[1].split(',').map(s => s.trim()));
        } else if (match[2]) {
          // Direct exports: export class Foo
          exports.push(match[2]);
        }
      }
    }

    return exports;
  }

  /**
   * Detect language from file extension
   */
  private detectLanguage(filePath: string): FileSymbols['language'] {
    if (filePath.endsWith('.ts')) return 'typescript';
    if (filePath.endsWith('.tsx')) return 'tsx';
    if (filePath.endsWith('.js')) return 'javascript';
    if (filePath.endsWith('.jsx')) return 'jsx';
    return 'unknown';
  }

  /**
   * Update symbol index for fast lookups
   */
  private updateSymbolIndex(symbols: Symbol[]): void {
    for (const symbol of symbols) {
      const existing = this.symbolGraph.symbolIndex.get(symbol.name) || [];
      existing.push(symbol);
      this.symbolGraph.symbolIndex.set(symbol.name, existing);

      // Recursively add children
      if (symbol.children) {
        this.updateSymbolIndex(symbol.children);
      }
    }
  }

  /**
   * Update dependency graphs
   */
  private updateDependencyGraph(file: string, dependencies: string[]): void {
    // Forward dependencies
    const deps = this.symbolGraph.dependencyGraph.get(file) || new Set();
    dependencies.forEach(dep => deps.add(dep));
    this.symbolGraph.dependencyGraph.set(file, deps);

    // Reverse dependencies
    for (const dep of dependencies) {
      const reverseDeps = this.symbolGraph.reverseDependencyGraph.get(dep) || new Set();
      reverseDeps.add(file);
      this.symbolGraph.reverseDependencyGraph.set(dep, reverseDeps);
    }
  }

  /**
   * Find symbol by name
   */
  findSymbol(name: string): Symbol[] {
    return this.symbolGraph.symbolIndex.get(name) || [];
  }

  /**
   * Find all symbols in a file
   */
  getFileSymbols(file: string): FileSymbols | undefined {
    return this.symbolGraph.files.get(file);
  }

  /**
   * Get all files that depend on a file
   */
  getDependents(file: string): string[] {
    return Array.from(this.symbolGraph.reverseDependencyGraph.get(file) || []);
  }

  /**
   * Get all files that a file depends on
   */
  getDependencies(file: string): string[] {
    return Array.from(this.symbolGraph.dependencyGraph.get(file) || []);
  }

  /**
   * Get the entire symbol graph
   */
  getSymbolGraph(): SymbolGraph {
    return this.symbolGraph;
  }

  /**
   * Export symbol graph as JSON
   */
  exportGraph(): string {
    const data = {
      files: Array.from(this.symbolGraph.files.entries()).map(([file, symbols]) => ({
        file,
        symbols,
      })),
      symbolIndex: Array.from(this.symbolGraph.symbolIndex.entries()),
      dependencyGraph: Array.from(this.symbolGraph.dependencyGraph.entries()).map(([file, deps]) => [
        file,
        Array.from(deps),
      ]),
      reverseDependencyGraph: Array.from(this.symbolGraph.reverseDependencyGraph.entries()).map(
        ([file, deps]) => [file, Array.from(deps)],
      ),
    };

    return JSON.stringify(data, null, 2);
  }

  /**
   * Clear the symbol graph
   */
  clear(): void {
    this.symbolGraph.files.clear();
    this.symbolGraph.symbolIndex.clear();
    this.symbolGraph.dependencyGraph.clear();
    this.symbolGraph.reverseDependencyGraph.clear();
  }
}
