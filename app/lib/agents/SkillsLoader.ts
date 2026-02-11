/**
 * Skills Loader - Loads skills from .agent/skills/ directory
 * Browser-compatible version using fetch API
 */

import type { AgentRole } from './types';

export interface Skill {
  name: string;
  description: string;
  content: string;
  applicableAgents: AgentRole[];
  priority: number;
  tags: string[];
}

export interface SkillMetadata {
  name: string;
  description: string;
  allowedTools?: string[];
  tags?: string[];
  priority?: number;
  applicableAgents?: AgentRole[];
}

export interface LoadedSkill extends Skill {
  files: string[];
  scripts: string[];
  references: string[];
}

export interface SkillLoadResult {
  success: boolean;
  loaded: LoadedSkill[];
  failed: { path: string; error: string }[];
  stats: {
    totalSkills: number;
    totalFiles: number;
    totalScripts: number;
    categories: Record<string, number>;
  };
}

/**
 * SkillsLoader - Dynamically loads skills (browser-compatible)
 */
export class SkillsLoader {
  private skillsPath: string;
  private loadedSkills: Map<string, LoadedSkill>;

  constructor(skillsPath: string = '.agent/skills') {
    this.skillsPath = skillsPath;
    this.loadedSkills = new Map();
  }

  /**
   * Load all skills - browser compatible version
   * In a browser environment, skills must be bundled or fetched via API
   */
  async loadSkills(): Promise<SkillLoadResult> {
    const result: SkillLoadResult = {
      success: true,
      loaded: [],
      failed: [],
      stats: {
        totalSkills: 0,
        totalFiles: 0,
        totalScripts: 0,
        categories: {},
      },
    };

    // For browser environment, we return an empty result
    // Skills should be loaded through the SkillsManager built-in skills
    // or fetched from an API endpoint
    console.warn('SkillsLoader: Browser environment detected, using SkillsManager built-in skills');
    
    return result;
  }

  /**
   * Load a skill from a pre-processed object
   */
  addSkill(skill: LoadedSkill): void {
    this.loadedSkills.set(skill.name, skill);
  }

  /**
   * Get a skill by name
   */
  getSkill(name: string): LoadedSkill | undefined {
    return this.loadedSkills.get(name);
  }

  /**
   * Get all loaded skills
   */
  getAllSkills(): LoadedSkill[] {
    return Array.from(this.loadedSkills.values());
  }

  /**
   * Search skills by tags
   */
  searchByTags(tags: string[]): LoadedSkill[] {
    return this.getAllSkills().filter(skill => tags.some(tag => skill.tags.includes(tag)));
  }

  /**
   * Search skills by agent role
   */
  searchByAgent(agentRole: AgentRole): LoadedSkill[] {
    return this.getAllSkills().filter(skill => skill.applicableAgents.includes(agentRole));
  }

  /**
   * Search skills by keyword
   */
  searchByKeyword(keyword: string): LoadedSkill[] {
    const lowerKeyword = keyword.toLowerCase();
    return this.getAllSkills().filter(
      skill =>
        skill.name.toLowerCase().includes(lowerKeyword) ||
        skill.description.toLowerCase().includes(lowerKeyword) ||
        skill.content.toLowerCase().includes(lowerKeyword),
    );
  }

  /**
   * Reload skills
   */
  async reload(): Promise<SkillLoadResult> {
    this.loadedSkills.clear();
    return this.loadSkills();
  }

  /**
   * Get skills path
   */
  getSkillsPath(): string {
    return this.skillsPath;
  }

  /**
   * Export all skills as JSON
   */
  exportSkills(): string {
    const skills = this.getAllSkills().map(skill => ({
      name: skill.name,
      description: skill.description,
      tags: skill.tags,
      priority: skill.priority,
      applicableAgents: skill.applicableAgents,
      fileCount: skill.files.length,
      scriptCount: skill.scripts.length,
    }));

    return JSON.stringify(skills, null, 2);
  }
}
