// Agent System Types
// Core types for the multi-agent autonomous coding system

export type AgentRole = 'planner' | 'executor' | 'reviewer' | 'validator';

export type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'failed' | 'blocked';

export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

export interface Task {
  id: string;
  type: 'file_edit' | 'file_create' | 'file_delete' | 'analysis' | 'validation' | 'review';
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  targetFiles?: string[];
  dependencies?: string[];
  metadata?: Record<string, any>;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  result?: TaskResult;
  errors?: string[];
  retryCount?: number;
}

export interface TaskResult {
  success: boolean;
  status?: TaskStatus;
  output?: any;
  changes?: FileChange[];
  validationErrors?: ValidationError[];
  suggestions?: string[];
  warnings?: string[];
  metrics?: {
    linesAdded?: number;
    linesRemoved?: number;
    filesModified?: number;
    executionTime?: number;
  };
}

export interface FileChange {
  filePath: string;
  path: string;
  changeType: 'create' | 'modify' | 'delete';
  originalContent?: string;
  newContent?: string;
  diff?: string;
  validated: boolean;
  safetyScore?: number;
}

export interface ValidationError {
  type: 'syntax' | 'logic' | 'safety' | 'style' | 'breaking' | 'security' | 'performance';
  severity: 'error' | 'warning' | 'info';
  message: string;
  filePath?: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

export interface AgentConfig {
  role: AgentRole;
  maxRetries: number;
  timeout: number;
  safetyChecks: boolean;
  validationLevel: 'strict' | 'moderate' | 'loose';
  capabilities: string[];
}

export interface PlannerOutput {
  tasks: Task[];
  strategy: string;
  estimatedComplexity: 'simple' | 'moderate' | 'complex';
  riskLevel: 'low' | 'medium' | 'high';
  prerequisites?: string[];
  warnings?: string[];
}

export interface ExecutorInput {
  task: Task;
  context: ExecutionContext;
  safetyConstraints: SafetyConstraints;
}

export interface ExecutionContext {
  repoContext: {
    files: Record<string, any>;
    dependencies: string[];
    architecture: string[];
    lockedFiles: string[];
  };
  conversationHistory: string[];
  previousAttempts?: {
    count: number;
    lastError?: string;
  };
}

export interface SafetyConstraints {
  maxFilesPerTask: number;
  maxLinesPerFile: number;
  forbiddenOperations: string[];
  requiresApproval: boolean;
  validateBeforeExecute: boolean;
  rollbackOnError: boolean;
}

export interface ReviewerOutput {
  approved: boolean;
  score: number; // 0-100
  issues: ValidationError[];
  suggestions: string[];
  riskAssessment: {
    level: 'low' | 'medium' | 'high' | 'critical';
    reasons: string[];
  };
  improvements?: string[];
}

export interface AgentMemoryEntry {
  id: string;
  timestamp: number;
  agentRole: AgentRole;
  action: string;
  input: any;
  output: any;
  success: boolean;
  duration: number;
  metadata?: Record<string, any>;
}

export interface AgentMetrics {
  tasksCompleted: number;
  tasksFailures: number;
  averageExecutionTime: number;
  successRate: number;
  errorsEncountered: string[];
  lastExecution?: number;
}
