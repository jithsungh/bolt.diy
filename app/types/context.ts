export type ContextAnnotation =
  | {
      type: 'codeContext';
      files: string[];
    }
  | {
      type: 'chatSummary';
      summary: string;
      chatId: string;
    };

export type ProgressAnnotation = {
  type: 'progress';
  label: string;
  status: 'in-progress' | 'complete';
  order: number;
  message: string;
};

export type ToolCallAnnotation = {
  type: 'toolCall';
  toolCallId: string;
  serverName: string;
  toolName: string;
  toolDescription: string;
};

export type AgentStatusAnnotation = {
  type: 'agentStatus';
  agent: 'Planner' | 'Executor' | 'Reviewer' | 'Complete';
  status: 'active' | 'complete' | 'error' | 'success';
  message: string;
  timestamp: number;
};

export type AgentStepAnnotation = {
  type: 'agentStep';
  agent: string;
  action: string;
  result: string;
  order: number;
};
