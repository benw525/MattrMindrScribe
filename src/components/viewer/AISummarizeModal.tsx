import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XIcon, Stethoscope, Heart, Shield, HardHat, ShieldCheck, Briefcase, Activity, Building, Globe, Scale, Loader2Icon, ArrowLeftIcon } from 'lucide-react';

interface SubTypeInfo {
  id: string;
  name: string;
  description: string;
}

interface AgentInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
  subTypes: SubTypeInfo[];
}

interface AISummarizeModalProps {
  agents: AgentInfo[];
  onSelectAgent: (agentId: string, subTypeId: string, customDescription?: string) => void;
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
  const [selectedAgent, setSelectedAgent] = useState<AgentInfo | null>(null);
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [otherDescription, setOtherDescription] = useState('');

  const handleBack = () => {
    if (showOtherInput) {
      setShowOtherInput(false);
      setOtherDescription('');
    } else {
      setSelectedAgent(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm p-0 sm:p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white dark:bg-slate-900 rounded-t-xl sm:rounded-xl shadow-2xl w-full sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <AnimatePresence mode="wait">
              {selectedAgent && (
                <motion.button
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  onClick={handleBack}
                  disabled={!!loadingAgentId}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors disabled:opacity-50 -ml-1"
                >
                  <ArrowLeftIcon className="h-5 w-5" />
                </motion.button>
              )}
            </AnimatePresence>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                {selectedAgent ? selectedAgent.name : 'AI Summarize'}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                {selectedAgent && showOtherInput
                  ? 'Describe this recording so the AI can adapt'
                  : selectedAgent
                  ? 'Select the type of recording'
                  : 'Select a practice area for a tailored summary'}
              </p>
            </div>
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
          <AnimatePresence mode="wait">
            {!selectedAgent ? (
              <motion.div
                key="agents"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.15 }}
                className="grid grid-cols-1 sm:grid-cols-2 gap-3"
              >
                {agents.map((agent) => {
                  const IconComponent = ICON_MAP[agent.icon] || Scale;
                  const colorClass = ICON_COLORS[agent.id] || 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30';

                  return (
                    <button
                      key={agent.id}
                      onClick={() => setSelectedAgent(agent)}
                      className="flex items-start gap-3 p-3.5 rounded-lg border text-left transition-all border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-sm cursor-pointer"
                    >
                      <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${colorClass}`}>
                        <IconComponent className="h-4.5 w-4.5" />
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
              </motion.div>
            ) : showOtherInput ? (
              <motion.div
                key="other-input"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.15 }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Describe the recording type
                  </label>
                  <input
                    type="text"
                    value={otherDescription}
                    onChange={(e) => setOtherDescription(e.target.value)}
                    placeholder='e.g. "Client interview", "Settlement conference", "Witness statement"'
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && otherDescription.trim() && selectedAgent) {
                        onSelectAgent(selectedAgent.id, 'other', otherDescription.trim());
                      }
                    }}
                  />
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">
                    This helps the AI tailor its analysis to your specific recording
                  </p>
                </div>
                <button
                  onClick={() => selectedAgent && onSelectAgent(selectedAgent.id, 'other', otherDescription.trim())}
                  disabled={!otherDescription.trim() || !!loadingAgentId}
                  className="w-full py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {loadingAgentId ? (
                    <>
                      <Loader2Icon className="h-4 w-4 animate-spin" />
                      Generating Summary...
                    </>
                  ) : (
                    'Generate Summary'
                  )}
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="subtypes"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.15 }}
                className="grid grid-cols-1 sm:grid-cols-2 gap-3"
              >
                {selectedAgent.subTypes.map((subType) => {
                  const isLoading = loadingAgentId === selectedAgent.id;
                  const isDisabled = !!loadingAgentId;
                  const colorClass = ICON_COLORS[selectedAgent.id] || 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30';
                  const dotColor = colorClass.split(' ')[0];

                  return (
                    <button
                      key={subType.id}
                      onClick={() => {
                        if (subType.id === 'other') {
                          setShowOtherInput(true);
                        } else {
                          onSelectAgent(selectedAgent.id, subType.id);
                        }
                      }}
                      disabled={isDisabled}
                      className={`flex items-start gap-3 p-3.5 rounded-lg border text-left transition-all ${
                        isLoading
                          ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-950/20'
                          : isDisabled
                          ? 'border-slate-200 dark:border-slate-700 opacity-50 cursor-not-allowed'
                          : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-sm cursor-pointer'
                      }`}
                    >
                      <div className={`flex-shrink-0 w-2 h-2 rounded-full mt-1.5 ${dotColor.replace('text-', 'bg-')}`} />
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                          {subType.name}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                          {subType.description}
                        </p>
                      </div>
                      {isLoading && (
                        <Loader2Icon className="h-4 w-4 text-indigo-500 animate-spin flex-shrink-0 mt-0.5" />
                      )}
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
