import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { XIcon, ChevronDownIcon, ChevronUpIcon, Loader2Icon, SparklesIcon } from 'lucide-react';
import { formatRelativeDate } from '../../utils/formatters';

interface Summary {
  id: string;
  agentType: string;
  subType: string | null;
  subTypeName: string | null;
  summary: string;
  modelUsed: string;
  createdAt: string;
}

interface AISummaryPanelProps {
  summaries: Summary[];
  streamingContent: string;
  streamingAgentType: string | null;
  isStreaming: boolean;
  onClose: () => void;
  agentNames: Record<string, string>;
  onGenerateNew?: () => void;
}

const AGENT_LABELS: Record<string, string> = {
  'personal-injury': 'Personal Injury',
  'family-law': 'Family Law',
  'criminal-defense': 'Criminal Defense',
  'workers-comp': "Workers' Compensation",
  'insurance-defense': 'Insurance Defense',
  'employment-law': 'Employment Law',
  'medical-malpractice': 'Medical Malpractice',
  'real-estate': 'Real Estate / Property',
  'immigration': 'Immigration',
  'general-litigation': 'General Litigation',
};

function renderMarkdown(text: string) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (const line of lines) {
    if (line.startsWith('**') && line.endsWith('**')) {
      elements.push(
        <h3 key={key++} className="text-sm font-bold text-slate-900 dark:text-white mt-4 mb-1.5">
          {line.replace(/\*\*/g, '')}
        </h3>
      );
    } else if (line.match(/^\*\*\d+\./)) {
      const cleaned = line.replace(/\*\*/g, '');
      elements.push(
        <h3 key={key++} className="text-sm font-bold text-slate-900 dark:text-white mt-4 mb-1.5">
          {cleaned}
        </h3>
      );
    } else if (line.startsWith('- ') || line.startsWith('• ')) {
      elements.push(
        <li key={key++} className="text-sm text-slate-700 dark:text-slate-300 ml-4 list-disc">
          {line.slice(2)}
        </li>
      );
    } else if (line.trim() === '') {
      elements.push(<div key={key++} className="h-2" />);
    } else {
      elements.push(
        <p key={key++} className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {line}
        </p>
      );
    }
  }
  return elements;
}

function getSummaryLabel(summary: Summary, agentNames: Record<string, string>) {
  const agentLabel = agentNames[summary.agentType] || AGENT_LABELS[summary.agentType] || summary.agentType;
  const subTypeLabel = summary.subTypeName || null;
  return { agentLabel, subTypeLabel };
}

export function AISummaryPanel({ summaries, streamingContent, streamingAgentType, isStreaming, onClose, agentNames, onGenerateNew }: AISummaryPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="absolute top-0 right-0 bottom-0 w-full sm:w-96 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl z-20 flex flex-col"
    >
      <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900 flex-shrink-0">
        <div className="flex items-center gap-2">
          <SparklesIcon className="h-4 w-4 text-indigo-500" />
          <h3 className="font-semibold text-slate-900 dark:text-white">
            AI Summaries
          </h3>
          {summaries.length > 0 && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              ({summaries.length})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onGenerateNew && !isStreaming && (
            <button
              onClick={onGenerateNew}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-md transition-colors"
            >
              <SparklesIcon className="h-3 w-3" />
              Generate New
            </button>
          )}
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isStreaming && streamingAgentType && (
          <div className="bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Loader2Icon className="h-4 w-4 text-indigo-500 animate-spin" />
              <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">
                Generating — {agentNames[streamingAgentType] || AGENT_LABELS[streamingAgentType] || streamingAgentType}
              </span>
            </div>
            <div className="prose-sm">
              {renderMarkdown(streamingContent)}
              <span className="inline-block w-1.5 h-4 bg-indigo-500 animate-pulse ml-0.5 align-middle" />
            </div>
          </div>
        )}

        {summaries.length === 0 && !isStreaming && (
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center mt-8">
            No summaries generated yet.
          </p>
        )}

        {summaries.map((summary) => {
          const isExpanded = expandedId === summary.id;
          const { agentLabel, subTypeLabel } = getSummaryLabel(summary, agentNames);
          return (
            <div
              key={summary.id}
              className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden"
            >
              <button
                onClick={() => setExpandedId(isExpanded ? null : summary.id)}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {agentLabel}
                  </h4>
                  {subTypeLabel && (
                    <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                      {subTypeLabel}
                    </span>
                  )}
                  <span className="text-xs text-slate-500 dark:text-slate-400 block mt-0.5">
                    {formatRelativeDate(summary.createdAt)}
                  </span>
                </div>
                {isExpanded ? (
                  <ChevronUpIcon className="h-4 w-4 text-slate-400" />
                ) : (
                  <ChevronDownIcon className="h-4 w-4 text-slate-400" />
                )}
              </button>
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-slate-100 dark:border-slate-800 pt-3">
                  {renderMarkdown(summary.summary)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
