import { useState, useEffect } from 'react';
import { Brain } from 'lucide-react';
import { classNames } from '~/utils/classNames';
import Cookies from 'js-cookie';
import WithTooltip from '~/components/ui/Tooltip';

export function AgentModeIndicator() {
  const [agentMode, setAgentMode] = useState(false);
  const [memoryEnabled, setMemoryEnabled] = useState(false);

  useEffect(() => {
    const checkAgentMode = () => {
      setAgentMode(Cookies.get('agent_mode') === 'true');
      setMemoryEnabled(Cookies.get('memory_enabled') === 'true');
    };

    checkAgentMode();
    const interval = setInterval(checkAgentMode, 1000);
    
    return () => clearInterval(interval);
  }, []);

  if (!agentMode) {
    return null;
  }

  return (
    <WithTooltip
      tooltip={
        <div className="text-xs">
          <div className="font-semibold mb-1">🤖 Agent Mode Active</div>
          <div>Multi-agent system enabled</div>
          {memoryEnabled && <div>✓ Long-term memory active</div>}
          <div className="text-[10px] mt-1 text-bolt-elements-textTertiary">
            Requests will be processed by Planner, Executor, and Reviewer agents
          </div>
        </div>
      }
      position="top"
    >
      <div
        className={classNames(
          'flex items-center gap-1.5 px-2 py-1 rounded-lg',
          'bg-gradient-to-r from-purple-500/10 to-blue-500/10',
          'border border-purple-500/30',
          'text-xs font-medium',
          'cursor-help transition-all hover:scale-105'
        )}
      >
        <Brain className="w-3.5 h-3.5 text-purple-500 animate-pulse" />
        <span className="text-purple-600 dark:text-purple-400">
          Agent Mode
        </span>
        {memoryEnabled && (
          <span className="text-[10px] px-1 py-0.5 rounded bg-green-500/20 text-green-600 dark:text-green-400">
            +Memory
          </span>
        )}
      </div>
    </WithTooltip>
  );
}
