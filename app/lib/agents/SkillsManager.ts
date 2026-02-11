// Skills Loader
// Load and manage agent skills from .agent/skills directory

import { createScopedLogger } from '~/utils/logger';
import type { AgentRole } from './types';

const logger = createScopedLogger('SkillsLoader');

export interface Skill {
  name: string;
  description: string;
  content: string;
  applicableAgents: AgentRole[];
  priority: number;
  tags: string[];
}

export interface SkillContext {
  language?: string;
  framework?: string;
  taskType?: string;
  complexity?: 'simple' | 'moderate' | 'complex';
}

/**
 * Skills Manager - loads and provides relevant skills to agents
 */
export class SkillsManager {
  private skills: Map<string, Skill> = new Map();
  private loaded = false;

  constructor() {
    logger.info('Skills Manager initialized');
  }

  /**
   * Load skills from configuration
   * In production, this would read from .agent/skills directory
   */
  async loadSkills(): Promise<void> {
    if (this.loaded) {
      return;
    }

    // For now, define some built-in skills
    // In production, these would be loaded from markdown files
    const builtInSkills: Skill[] = [
      {
        name: 'react-best-practices',
        description: 'React and Next.js performance optimization patterns',
        content: `
## React Best Practices

### Component Structure
- Use functional components with hooks
- Keep components small and focused
- Extract reusable logic into custom hooks

### Performance
- Use React.memo() for expensive components
- Implement useMemo() and useCallback() appropriately
- Avoid inline function definitions in JSX

### State Management
- Use useState for local state
- Use useReducer for complex state logic
- Consider Context API for global state

### Code Quality
- Use TypeScript for type safety
- Write meaningful component and prop names
- Add PropTypes or TypeScript interfaces
        `,
        applicableAgents: ['executor', 'reviewer'],
        priority: 8,
        tags: ['react', 'frontend', 'performance'],
      },
      {
        name: 'typescript-expert',
        description: 'TypeScript patterns and best practices',
        content: `
## TypeScript Patterns

### Type Safety
- Use strict type checking
- Avoid 'any' type unless absolutely necessary
- Define explicit return types for functions

### Advanced Types
- Use utility types (Partial, Pick, Omit, etc.)
- Create union and intersection types
- Use generic types for reusable code

### Best Practices
- Prefer interfaces over types for objects
- Use enums for fixed sets of values
- Leverage type guards for runtime checks
        `,
        applicableAgents: ['executor', 'reviewer'],
        priority: 7,
        tags: ['typescript', 'types', 'safety'],
      },
      {
        name: 'systematic-debugging',
        description: 'Structured approach to debugging and problem-solving',
        content: `
## Systematic Debugging

### Process
1. Reproduce the issue consistently
2. Identify the scope (which component/module)
3. Add logging/breakpoints
4. Form hypotheses
5. Test hypotheses systematically
6. Fix root cause, not symptoms

### Tools
- Console logging with context
- Browser DevTools / Node debugger
- Error boundaries in React
- Source maps for production debugging

### Prevention
- Write tests for bug fixes
- Add validation checks
- Document known issues
        `,
        applicableAgents: ['planner', 'executor'],
        priority: 9,
        tags: ['debugging', 'problem-solving'],
      },
      {
        name: 'clean-code',
        description: 'Clean code principles and patterns',
        content: `
## Clean Code Principles

### Naming
- Use descriptive, meaningful names
- Avoid abbreviations unless well-known
- Use consistent naming conventions

### Functions
- Keep functions small and focused
- One level of abstraction per function
- Minimize function parameters

### Code Organization
- Group related code together
- Separate concerns
- Follow DRY (Don't Repeat Yourself)

### Comments
- Write self-documenting code
- Comment "why", not "what"
- Remove obsolete comments
        `,
        applicableAgents: ['executor', 'reviewer'],
        priority: 8,
        tags: ['quality', 'maintainability'],
      },
      {
        name: 'security-patterns',
        description: 'Security best practices and vulnerability prevention',
        content: `
## Security Patterns

### Input Validation
- Validate all user input
- Sanitize data before use
- Use parameterized queries

### Authentication
- Use secure password hashing (bcrypt, argon2)
- Implement proper session management
- Use HTTPS only

### Data Protection
- Never store secrets in code
- Use environment variables
- Encrypt sensitive data

### Common Vulnerabilities
- Prevent XSS attacks
- Avoid SQL injection
- Protect against CSRF
- Validate file uploads
        `,
        applicableAgents: ['reviewer', 'executor'],
        priority: 10,
        tags: ['security', 'vulnerability', 'safety'],
      },
      {
        name: 'api-patterns',
        description: 'REST API and GraphQL best practices',
        content: `
## API Design Patterns

### REST Principles
- Use proper HTTP methods (GET, POST, PUT, DELETE)
- Implement meaningful status codes
- Version your API
- Use consistent naming

### Error Handling
- Return descriptive error messages
- Use standard error formats
- Log errors server-side

### Performance
- Implement pagination
- Use caching headers
- Consider rate limiting
- Optimize database queries

### Documentation
- Document all endpoints
- Provide request/response examples
- Include authentication requirements
        `,
        applicableAgents: ['executor', 'reviewer'],
        priority: 7,
        tags: ['api', 'backend', 'rest'],
      },
    ];

    builtInSkills.forEach(skill => {
      this.skills.set(skill.name, skill);
    });

    this.loaded = true;
    logger.info(`Loaded ${this.skills.size} skills`);
  }

  /**
   * Get relevant skills for a given context
   */
  getRelevantSkills(context: SkillContext, agentRole: AgentRole): Skill[] {
    const allSkills = Array.from(this.skills.values());

    // Filter by agent applicability
    let relevant = allSkills.filter(skill =>
      skill.applicableAgents.includes(agentRole) || skill.applicableAgents.includes('*' as any)
    );

    // Filter by context tags
    if (context.language || context.framework) {
      const contextTags = [
        context.language?.toLowerCase(),
        context.framework?.toLowerCase(),
      ].filter(Boolean) as string[];

      if (contextTags.length > 0) {
        relevant = relevant.filter(skill =>
          skill.tags.some(tag => contextTags.some(ct => tag.includes(ct)))
        );
      }
    }

    // Sort by priority
    relevant.sort((a, b) => b.priority - a.priority);

    return relevant;
  }

  /**
   * Get skill by name
   */
  getSkill(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  /**
   * Get all skills
   */
  getAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Add a custom skill
   */
  addSkill(skill: Skill): void {
    this.skills.set(skill.name, skill);
    logger.info(`Added skill: ${skill.name}`);
  }

  /**
   * Remove a skill
   */
  removeSkill(name: string): boolean {
    const removed = this.skills.delete(name);
    if (removed) {
      logger.info(`Removed skill: ${name}`);
    }
    return removed;
  }

  /**
   * Get skill statistics
   */
  getStats(): {
    totalSkills: number;
    byAgent: Record<AgentRole, number>;
    topTags: Array<{ tag: string; count: number }>;
  } {
    const allSkills = Array.from(this.skills.values());

    const byAgent = allSkills.reduce((acc, skill) => {
      skill.applicableAgents.forEach(agent => {
        acc[agent] = (acc[agent] || 0) + 1;
      });
      return acc;
    }, {} as Record<AgentRole, number>);

    const tagCounts = allSkills.reduce((acc, skill) => {
      skill.tags.forEach(tag => {
        acc[tag] = (acc[tag] || 0) + 1;
      });
      return acc;
    }, {} as Record<string, number>);

    const topTags = Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalSkills: allSkills.length,
      byAgent,
      topTags,
    };
  }
}

/**
 * Global skills manager instance
 */
let globalSkillsManager: SkillsManager | null = null;

export function getSkillsManager(): SkillsManager {
  if (!globalSkillsManager) {
    globalSkillsManager = new SkillsManager();
  }
  return globalSkillsManager;
}
