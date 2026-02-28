/**
 * Agent Pipeline Visualizer
 * 
 * Real-time visualization of the multi-agent system pipeline:
 * Planner → Executor → Reviewer
 * 
 * Shows:
 * - Current active agent
 * - Task progress
 * - Agent status (idle/thinking/executing/reviewing)
 * - Success/failure indicators
 */

import React, { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Code, Shield, CheckCircle, XCircle, Loader2, ArrowRight, Clock, type LucideIcon } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Local agent type for pipeline visualization (subset of AgentRole)
type PipelineAgent = 'planner' | 'executor' | 'reviewer';

export interface AgentStep {
  id: string;
  agent: PipelineAgent;
  action: string;
  status: 'pending' | 'active' | 'complete' | 'failed';
  startTime: number;
  endTime?: number;
  details?: string;
  metadata?: {
    tasksPlanned?: number;
    filesModified?: number;
    issuesFound?: number;
    safetyScore?: number;
  };
}

export interface PipelineVisualizerProps {
  steps: AgentStep[];
  currentAgent?: PipelineAgent;
  showDetails?: boolean;
  compact?: boolean;
  onStepClick?: (step: AgentStep) => void;
}

// ---------------------------------------------------------------------------
// Agent Icons and Colors
// ---------------------------------------------------------------------------

interface AgentConfigItem {
  icon: LucideIcon;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
}

const AGENT_CONFIG: Record<PipelineAgent, AgentConfigItem> = {
  planner: {
    icon: Brain,
    label: 'Planner',
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500',
    description: 'Breaking down request into tasks',
  },
  executor: {
    icon: Code,
    label: 'Executor',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500',
    description: 'Executing code modifications',
  },
  reviewer: {
    icon: Shield,
    label: 'Reviewer',
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500',
    description: 'Reviewing and validating changes',
  },
};

interface StatusConfigItem {
  icon: LucideIcon;
  color: string;
  label: string;
  animate?: boolean;
}

const STATUS_CONFIG: Record<AgentStep['status'], StatusConfigItem> = {
  pending: {
    icon: Clock,
    color: 'text-gray-400',
    label: 'Pending',
  },
  active: {
    icon: Loader2,
    color: 'text-blue-500',
    label: 'Active',
    animate: true,
  },
  complete: {
    icon: CheckCircle,
    color: 'text-green-500',
    label: 'Complete',
  },
  failed: {
    icon: XCircle,
    color: 'text-red-500',
    label: 'Failed',
  },
};

// ---------------------------------------------------------------------------
// Agent Card Component
// ---------------------------------------------------------------------------

interface AgentCardProps {
  step: AgentStep;
  isActive: boolean;
  showDetails: boolean;
  onClick?: () => void;
}

const AgentCard = memo(({ step, isActive, showDetails, onClick }: AgentCardProps) => {
  const config = AGENT_CONFIG[step.agent];
  const statusConfig = STATUS_CONFIG[step.status];
  const Icon = config.icon;
  const StatusIcon = statusConfig.icon;

  const duration = step.endTime && step.startTime 
    ? ((step.endTime - step.startTime) / 1000).toFixed(1) + 's'
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={`
        relative p-4 rounded-lg border-2 transition-all cursor-pointer
        ${isActive ? config.borderColor + ' ' + config.bgColor : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2'}
        hover:shadow-lg hover:scale-[1.02]
      `}
      onClick={onClick}
    >
      {/* Agent Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-lg ${config.bgColor}`}>
            <Icon className={`w-5 h-5 ${config.color}`} />
          </div>
          <div>
            <h3 className={`font-semibold ${config.color}`}>{config.label}</h3>
            <p className="text-xs text-bolt-elements-textSecondary">{step.action}</p>
          </div>
        </div>

        {/* Status Indicator */}
        <div className="flex items-center gap-2">
          {duration && (
            <span className="text-xs text-bolt-elements-textSecondary">{duration}</span>
          )}
          <StatusIcon 
            className={`w-5 h-5 ${statusConfig.color} ${statusConfig.animate ? 'animate-spin' : ''}`} 
          />
        </div>
      </div>

      {/* Details (expandable) */}
      <AnimatePresence>
        {showDetails && step.details && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 pt-3 border-t border-bolt-elements-borderColor"
          >
            <p className="text-sm text-bolt-elements-textSecondary">{step.details}</p>

            {/* Metadata */}
            {step.metadata && (
              <div className="mt-2 flex flex-wrap gap-2">
                {step.metadata.tasksPlanned && (
                  <span className="text-xs px-2 py-1 rounded bg-bolt-elements-background-depth-3">
                    {step.metadata.tasksPlanned} tasks
                  </span>
                )}
                {step.metadata.filesModified && (
                  <span className="text-xs px-2 py-1 rounded bg-bolt-elements-background-depth-3">
                    {step.metadata.filesModified} files
                  </span>
                )}
                {step.metadata.issuesFound !== undefined && (
                  <span className={`text-xs px-2 py-1 rounded ${
                    step.metadata.issuesFound > 0 ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'
                  }`}>
                    {step.metadata.issuesFound} issues
                  </span>
                )}
                {step.metadata.safetyScore !== undefined && (
                  <span className={`text-xs px-2 py-1 rounded ${
                    step.metadata.safetyScore >= 0.8 
                      ? 'bg-green-500/20 text-green-400' 
                      : step.metadata.safetyScore >= 0.5 
                        ? 'bg-yellow-500/20 text-yellow-400'
                        : 'bg-red-500/20 text-red-400'
                  }`}>
                    Safety: {(step.metadata.safetyScore * 100).toFixed(0)}%
                  </span>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active Indicator */}
      {isActive && step.status === 'active' && (
        <motion.div
          className="absolute inset-0 rounded-lg border-2 border-blue-500"
          animate={{
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      )}
    </motion.div>
  );
});

AgentCard.displayName = 'AgentCard';

// ---------------------------------------------------------------------------
// Pipeline Arrows
// ---------------------------------------------------------------------------

const PipelineArrow = memo(({ active }: { active: boolean }) => (
  <div className="flex items-center justify-center px-2">
    <ArrowRight 
      className={`w-6 h-6 transition-colors ${
        active ? 'text-blue-500 animate-pulse' : 'text-bolt-elements-borderColor'
      }`} 
    />
  </div>
));

PipelineArrow.displayName = 'PipelineArrow';

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const AgentPipelineVisualizer = memo(({
  steps,
  currentAgent,
  showDetails = false,
  compact = false,
  onStepClick,
}: PipelineVisualizerProps) => {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  // Group steps by agent
  const groupedSteps = steps.reduce((acc, step) => {
    if (!acc[step.agent]) {
      acc[step.agent] = [];
    }
    acc[step.agent].push(step);
    return acc;
  }, {} as Record<PipelineAgent, AgentStep[]>);

  // Get latest step for each agent
  const latestSteps: Record<PipelineAgent, AgentStep | undefined> = {
    planner: groupedSteps.planner?.[groupedSteps.planner.length - 1],
    executor: groupedSteps.executor?.[groupedSteps.executor.length - 1],
    reviewer: groupedSteps.reviewer?.[groupedSteps.reviewer.length - 1],
  };

  const handleStepClick = (step: AgentStep) => {
    setExpandedSteps((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(step.id)) {
        next.delete(step.id);
      } else {
        next.add(step.id);
      }
      return next;
    });
    onStepClick?.(step);
  };

  const PIPELINE_AGENTS: PipelineAgent[] = ['planner', 'executor', 'reviewer'];

  if (compact) {
    // Compact horizontal pipeline view
    return (
      <div className="flex items-center gap-2 p-4 bg-bolt-elements-background-depth-1 rounded-lg">
        {PIPELINE_AGENTS.map((agent, index) => {
          const step = latestSteps[agent];
          const config = AGENT_CONFIG[agent];
          const Icon = config.icon;
          const isActive = currentAgent === agent;
          const status = step?.status || 'pending';

          return (
            <React.Fragment key={agent}>
              <div
                className={`
                  flex items-center gap-2 px-3 py-2 rounded-lg transition-all
                  ${isActive ? config.bgColor + ' ' + config.borderColor + ' border-2' : 'border border-bolt-elements-borderColor'}
                `}
              >
                <Icon className={`w-4 h-4 ${isActive ? config.color : 'text-bolt-elements-textSecondary'}`} />
                <span className={`text-sm font-medium ${isActive ? config.color : 'text-bolt-elements-textSecondary'}`}>
                  {config.label}
                </span>
                {status === 'complete' && <CheckCircle className="w-4 h-4 text-green-500" />}
                {status === 'failed' && <XCircle className="w-4 h-4 text-red-500" />}
                {status === 'active' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
              </div>
              {index < 2 && <PipelineArrow active={isActive} />}
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  // Full detailed view
  return (
    <div className="space-y-4">
      {/* Pipeline Header */}
      <div className="flex items-center justify-between p-4 bg-bolt-elements-background-depth-1 rounded-lg">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-bolt-elements-textPrimary" />
          <h3 className="font-semibold text-bolt-elements-textPrimary">
            Multi-Agent Pipeline
          </h3>
        </div>
        <div className="text-sm text-bolt-elements-textSecondary">
          {steps.filter(s => s.status === 'complete').length} / {steps.length} steps complete
        </div>
      </div>

      {/* Agent Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PIPELINE_AGENTS.map((agent) => {
          const step = latestSteps[agent];
          if (!step) return null;

          const isActive = currentAgent === agent;
          const isExpanded = expandedSteps.has(step.id) || showDetails;

          return (
            <AgentCard
              key={step.id}
              step={step}
              isActive={isActive}
              showDetails={isExpanded}
              onClick={() => handleStepClick(step)}
            />
          );
        })}
      </div>

      {/* Full Step History */}
      {showDetails && steps.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-semibold text-bolt-elements-textPrimary mb-3">
            Step History
          </h4>
          <div className="space-y-2">
            {steps.map((step, index) => (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="flex items-center gap-3 p-3 rounded-lg bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3 transition-colors"
              >
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${AGENT_CONFIG[step.agent].bgColor}`}>
                  {React.createElement(AGENT_CONFIG[step.agent].icon, { 
                    className: `w-4 h-4 ${AGENT_CONFIG[step.agent].color}` 
                  })}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-bolt-elements-textPrimary truncate">
                    {step.action}
                  </p>
                  <p className="text-xs text-bolt-elements-textSecondary">
                    {new Date(step.startTime).toLocaleTimeString()}
                  </p>
                </div>
                {React.createElement(STATUS_CONFIG[step.status].icon, {
                  className: `w-5 h-5 ${STATUS_CONFIG[step.status].color} ${STATUS_CONFIG[step.status].animate ? 'animate-spin' : ''}`
                })}
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

AgentPipelineVisualizer.displayName = 'AgentPipelineVisualizer';

export default AgentPipelineVisualizer;
