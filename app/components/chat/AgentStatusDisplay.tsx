import { AnimatePresence, motion } from 'framer-motion';
import React from 'react';
import type { AgentStatusAnnotation, AgentStepAnnotation } from '~/types/context';
import { classNames } from '~/utils/classNames';
import { Brain, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface AgentStatusDisplayProps {
  agentStatuses?: AgentStatusAnnotation[];
  agentSteps?: AgentStepAnnotation[];
}

export default function AgentStatusDisplay({ agentStatuses = [], agentSteps = [] }: AgentStatusDisplayProps) {
  const [expanded, setExpanded] = React.useState(true);

  if (agentStatuses.length === 0 && agentSteps.length === 0) {
    return null;
  }

  const currentAgent = agentStatuses.slice(-1)[0];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className={classNames(
          'bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20',
          'border border-purple-200 dark:border-purple-800',
          'shadow-lg rounded-lg relative w-full max-w-chat mx-auto',
          'p-4 mb-4',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <Brain className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-bolt-elements-textPrimary">
                Multi-Agent System
              </h3>
              {currentAgent && (
                <p className="text-xs text-bolt-elements-textSecondary">
                  {currentAgent.agent} • {currentAgent.message}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 hover:bg-purple-500/10 rounded transition-colors"
          >
            <div className={expanded ? 'i-ph:caret-up-bold' : 'i-ph:caret-down-bold'}></div>
          </button>
        </div>

        {/* Agent Progress */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-2 overflow-hidden"
            >
              {/* Agent Status Timeline */}
              <div className="space-y-2">
                {agentStatuses.map((status, idx) => (
                  <AgentStatusItem key={idx} status={status} />
                ))}
              </div>

              {/* Agent Steps (if any) */}
              {agentSteps.length > 0 && (
                <div className="mt-4 pt-4 border-t border-purple-200 dark:border-purple-800">
                  <h4 className="text-xs font-semibold text-bolt-elements-textSecondary mb-2">
                    Execution Steps
                  </h4>
                  <div className="space-y-2">
                    {agentSteps.map((step, idx) => (
                      <AgentStepItem key={idx} step={step} />
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}

function AgentStatusItem({ status }: { status: AgentStatusAnnotation }) {
  const getIcon = () => {
    switch (status.status) {
      case 'active':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'complete':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      default:
        return <div className="w-4 h-4 rounded-full bg-gray-300" />;
    }
  };

  const getAgentColor = () => {
    switch (status.agent) {
      case 'Planner':
        return 'text-blue-600 dark:text-blue-400';
      case 'Executor':
        return 'text-purple-600 dark:text-purple-400';
      case 'Reviewer':
        return 'text-green-600 dark:text-green-400';
      case 'Complete':
        return 'text-emerald-600 dark:text-emerald-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-start gap-3 p-2 rounded-lg bg-white/50 dark:bg-black/20"
    >
      <div className="mt-0.5">{getIcon()}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={classNames('text-sm font-medium', getAgentColor())}>
            {status.agent}
          </span>
          {status.status === 'active' && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
              Active
            </span>
          )}
        </div>
        <p className="text-xs text-bolt-elements-textSecondary mt-0.5">
          {status.message}
        </p>
      </div>
    </motion.div>
  );
}

function AgentStepItem({ step }: { step: AgentStepAnnotation }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="text-xs p-2 rounded bg-white/30 dark:bg-black/10"
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="font-medium text-bolt-elements-textPrimary">{step.agent}</span>
        <span className="text-bolt-elements-textSecondary">→</span>
        <span className="text-bolt-elements-textSecondary">{step.action}</span>
      </div>
      <div className="text-bolt-elements-textTertiary pl-4">
        {step.result}
      </div>
    </motion.div>
  );
}
