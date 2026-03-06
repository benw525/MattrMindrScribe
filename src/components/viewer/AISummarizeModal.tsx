import React from 'react';
import { motion } from 'framer-motion';
import { XIcon, Stethoscope, Heart, Shield, HardHat, ShieldCheck, Briefcase, Activity, Building, Globe, Scale, Loader2Icon } from 'lucide-react';

interface AgentInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
}

interface AISummarizeModalProps {
  agents: AgentInfo[];
  onSelectAgent: (agentId: string) => void;
  onClose: () => void;
  loadingAgentId: string | null;
}

const ICON_MAP: Record<string, React.ElementType> = {
  Stethoscope, Heart, Shield, HardHat, ShieldCheck,
  Briefcase, Activity, Building, Globe, Scale,
};

const ICON_COLORS: Record<string, string> = {
  'personal-injury': 'text-red-500 bg-red-50 dark:bg-red-950/30',
  'family-law': 'text-pink-500 bg-pink-50 dark:bg-pink-950/30',
  'criminal-defense': 'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800',
  'workers-comp': 'text-amber-600 bg-amber-50 dark:bg-amber-950/30',
  'insurance-defense': 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30',
  'employment-law': 'text-blue-600 bg-blue-50 dark:bg-blue-950/30',
  'medical-malpractice': 'text-violet-600 bg-violet-50 dark:bg-violet-950/30',
  'real-estate': 'text-orange-600 bg-orange-50 dark:bg-orange-950/30',
  'immigration': 'text-cyan-600 bg-cyan-50 dark:bg-cyan-950/30',
  'general-litigation': 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30',
};

export function AISummarizeModal({ agents, onSelectAgent, onClose, loadingAgentId }: AISummarizeModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm p-0 sm:p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white dark:bg-slate-900 rounded-t-xl sm:rounded-xl shadow-2xl w-full sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              AI Summarize
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Select a practice area for a tailored summary
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={!!loadingAgentId}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors disabled:opacity-50"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {agents.map((agent) => {
              const IconComponent = ICON_MAP[agent.icon] || Scale;
              const colorClass = ICON_COLORS[agent.id] || 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30';
              const isLoading = loadingAgentId === agent.id;
              const isDisabled = !!loadingAgentId;

              return (
                <button
                  key={agent.id}
                  onClick={() => onSelectAgent(agent.id)}
                  disabled={isDisabled}
                  className={`flex items-start gap-3 p-3.5 rounded-lg border text-left transition-all ${
                    isLoading
                      ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-950/20'
                      : isDisabled
                      ? 'border-slate-200 dark:border-slate-700 opacity-50 cursor-not-allowed'
                      : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-sm cursor-pointer'
                  }`}
                >
                  <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${colorClass}`}>
                    {isLoading ? (
                      <Loader2Icon className="h-4.5 w-4.5 animate-spin" />
                    ) : (
                      <IconComponent className="h-4.5 w-4.5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {agent.name}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                      {agent.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
