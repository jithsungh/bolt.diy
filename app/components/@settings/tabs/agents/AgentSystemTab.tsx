import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import Cookies from 'js-cookie';
import { Switch } from '~/components/ui/Switch';
import { Brain, Database, Zap, Shield, Activity } from 'lucide-react';

interface AgentSystemSettings {
  agentMode: boolean;
  memoryEnabled: boolean;
  autoApprove: boolean;
  safetyLevel: 'strict' | 'moderate' | 'permissive';
}

interface MemoryStats {
  shortTermMessages: number;
  longTermItems: number;
  cacheSize: number;
}

export default function AgentSystemTab() {
  const [settings, setSettings] = useState<AgentSystemSettings>(() => {
    const savedSafetyLevel = Cookies.get('agent_safety_level');
    const safetyLevel: AgentSystemSettings['safetyLevel'] =
      savedSafetyLevel === 'moderate' || savedSafetyLevel === 'permissive' ? savedSafetyLevel : 'strict';

    return {
      agentMode: Cookies.get('agent_mode') === 'true',
      memoryEnabled: Cookies.get('memory_enabled') === 'true',
      autoApprove: Cookies.get('agent_auto_approve') === 'true',
      safetyLevel,
    };
  });

  const [memoryStats, setMemoryStats] = useState<MemoryStats | null>(null);

  // Load memory stats
  useEffect(() => {
    if (settings.memoryEnabled) {
      // TODO: Fetch memory stats from API
      setMemoryStats({
        shortTermMessages: 0,
        longTermItems: 0,
        cacheSize: 0,
      });
    }
  }, [settings.memoryEnabled]);

  const updateSetting = <K extends keyof AgentSystemSettings>(key: K, value: AgentSystemSettings[K]) => {
    setSettings((prev) => {
      const updated = { ...prev, [key]: value };

      // Save to cookies
      Cookies.set(
        `agent_${key === 'agentMode' ? 'mode' : key === 'memoryEnabled' ? 'memory_enabled' : key === 'autoApprove' ? 'auto_approve' : 'safety_level'}`,
        String(value),
        { expires: 365 },
      );

      toast.success(`Agent system ${key} updated`);
      return updated;
    });
  };

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <motion.div
        className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 rounded-lg p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-start gap-4">
          <div className="p-3 bg-purple-500/10 rounded-lg">
            <Brain className="w-6 h-6 text-purple-500" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-bolt-elements-textPrimary mb-2">Autonomous Agent System</h2>
            <p className="text-sm text-bolt-elements-textSecondary leading-relaxed">
              Enable multi-agent AI system with task planning, execution feedback, and long-term memory. The agent
              system breaks down complex requests, validates changes, and learns from past work.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Agent Mode Toggle */}
      <motion.div
        className="bg-white dark:bg-[#0A0A0A] rounded-lg shadow-sm dark:shadow-none p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg mt-1">
              <Zap className="w-5 h-5 text-blue-500" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-bolt-elements-textPrimary mb-1">Enable Agent Mode</h3>
              <p className="text-sm text-bolt-elements-textSecondary">
                Activate autonomous multi-agent system for complex task execution. Agents will plan, execute, and
                validate changes automatically.
              </p>
            </div>
          </div>
          <Switch
            checked={settings.agentMode}
            onCheckedChange={(checked: boolean) => updateSetting('agentMode', checked)}
          />
        </div>
      </motion.div>

      {/* Memory System Toggle */}
      <motion.div
        className="bg-white dark:bg-[#0A0A0A] rounded-lg shadow-sm dark:shadow-none p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-green-500/10 rounded-lg mt-1">
              <Database className="w-5 h-5 text-green-500" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-bolt-elements-textPrimary mb-1">Long-Term Memory</h3>
              <p className="text-sm text-bolt-elements-textSecondary">
                Store and retrieve past work to improve code quality over time. The system learns from successful
                patterns and avoids past mistakes.
              </p>
            </div>
          </div>
          <Switch
            checked={settings.memoryEnabled}
            onCheckedChange={(checked: boolean) => updateSetting('memoryEnabled', checked)}
          />
        </div>

        {/* Memory Stats */}
        {settings.memoryEnabled && memoryStats && (
          <div className="mt-4 pt-4 border-t border-bolt-elements-borderColor">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-bolt-elements-textPrimary">{memoryStats.shortTermMessages}</div>
                <div className="text-xs text-bolt-elements-textSecondary mt-1">Recent Messages</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-bolt-elements-textPrimary">{memoryStats.longTermItems}</div>
                <div className="text-xs text-bolt-elements-textSecondary mt-1">Stored Patterns</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-bolt-elements-textPrimary">{memoryStats.cacheSize}</div>
                <div className="text-xs text-bolt-elements-textSecondary mt-1">Cache Size (KB)</div>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* Safety Settings */}
      <motion.div
        className="bg-white dark:bg-[#0A0A0A] rounded-lg shadow-sm dark:shadow-none p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 bg-orange-500/10 rounded-lg mt-1">
            <Shield className="w-5 h-5 text-orange-500" />
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-bolt-elements-textPrimary mb-1">Safety Level</h3>
            <p className="text-sm text-bolt-elements-textSecondary mb-4">
              Control how cautious the agent system should be when making changes.
            </p>

            <div className="space-y-2">
              {(['strict', 'moderate', 'permissive'] as const).map((level) => (
                <label
                  key={level}
                  className="flex items-center gap-3 p-3 rounded-lg border-2 border-bolt-elements-borderColor hover:border-purple-500/50 cursor-pointer transition-colors"
                >
                  <input
                    type="radio"
                    name="safetyLevel"
                    value={level}
                    checked={settings.safetyLevel === level}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      updateSetting('safetyLevel', e.target.value as 'strict' | 'moderate' | 'permissive')
                    }
                    className="text-purple-500 focus:ring-purple-500"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-bolt-elements-textPrimary capitalize">{level}</div>
                    <div className="text-xs text-bolt-elements-textSecondary mt-0.5">
                      {level === 'strict' && 'Validate all changes, require approval for risky operations'}
                      {level === 'moderate' && 'Validate major changes, auto-approve safe operations'}
                      {level === 'permissive' && 'Minimal validation, trust agent decisions'}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Status Info */}
      <motion.div
        className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <div className="flex items-start gap-3">
          <Activity className="w-5 h-5 text-blue-500 mt-0.5" />
          <div className="text-sm text-bolt-elements-textSecondary">
            <p className="font-medium text-bolt-elements-textPrimary mb-1">System Status</p>
            <p>
              {settings.agentMode
                ? '✓ Agent system is active and ready'
                : '○ Agent system is disabled - using standard chat mode'}
            </p>
            {settings.memoryEnabled && <p className="mt-1">✓ Memory system is recording interactions</p>}
          </div>
        </div>
      </motion.div>

      {/* Warning */}
      <motion.div
        className="bg-yellow-50 dark:bg-yellow-950/20 rounded-lg p-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <p className="text-sm text-yellow-800 dark:text-yellow-200">
          <strong>Note:</strong> The agent system is experimental. It may take longer to respond as it plans and
          validates changes. You can switch back to standard chat mode anytime.
        </p>
      </motion.div>
    </div>
  );
}
