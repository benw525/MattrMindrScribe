import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DownloadIcon,
  SparklesIcon,
  MaximizeIcon,
  HistoryIcon,
  SaveIcon,
  Undo2Icon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon } from
'lucide-react';
import { toast } from 'sonner';
interface TranscriptToolbarProps {
  transcriptId: string;
  onToggleHistory: () => void;
  onSuggestName: () => void;
  isSuggesting: boolean;
  onSave: () => void;
  onUndo: () => void;
  canUndo: boolean;
  sidebarHidden: boolean;
  onToggleSidebar: () => void;
}
export function TranscriptToolbar({
  transcriptId,
  onToggleHistory,
  onSuggestName,
  isSuggesting,
  onSave,
  onUndo,
  canUndo,
  sidebarHidden,
  onToggleSidebar
}: TranscriptToolbarProps) {
  const navigate = useNavigate();
  const handleExport = () => {
    toast.success('Transcript exported as text successfully');
  };
  return (
    <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
      <button
        onClick={onToggleSidebar}
        className="hidden md:inline-flex items-center gap-1.5 px-2 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
        aria-label={sidebarHidden ? 'Show sidebar' : 'Hide sidebar'}>

        {sidebarHidden ?
        <PanelLeftOpenIcon className="h-4 w-4" /> :

        <PanelLeftCloseIcon className="h-4 w-4" />
        }
      </button>

      <button
        onClick={onUndo}
        disabled={!canUndo}
        className="inline-flex items-center gap-1.5 px-2 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="Undo last action">

        <Undo2Icon className="h-4 w-4" />
        <span className="hidden sm:inline">Undo</span>
      </button>

      <button
        onClick={onSave}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors shadow-sm">

        <SaveIcon className="h-4 w-4" />
        <span className="hidden sm:inline">Save</span>
      </button>

      <div className="hidden sm:block h-5 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" />

      <button
        onClick={onSuggestName}
        disabled={isSuggesting}
        className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-md transition-colors disabled:opacity-50">

        <SparklesIcon className="h-4 w-4" />
        {isSuggesting ? 'Suggesting...' : 'AI Name'}
      </button>

      <button
        onClick={handleExport}
        className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
        title="Export as Text">

        <DownloadIcon className="h-4 w-4" />
        <span className="hidden lg:inline">Export</span>
      </button>

      <button
        onClick={onToggleHistory}
        className="inline-flex items-center gap-1.5 px-2 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors">

        <HistoryIcon className="h-4 w-4" />
        <span className="hidden lg:inline">History</span>
      </button>

      <button
        onClick={() => navigate(`/transcript/${transcriptId}/present`)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-white bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 rounded-md transition-colors shadow-sm">

        <MaximizeIcon className="h-4 w-4" />
        <span className="hidden lg:inline">Present</span>
      </button>
    </div>);

}