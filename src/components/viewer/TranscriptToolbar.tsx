import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DownloadIcon,
  MaximizeIcon,
  HistoryIcon,
  SaveIcon,
  Undo2Icon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  BrainCircuitIcon,
  ActivityIcon,
  FileTextIcon,
  FileTypeIcon,
  FileIcon,
  ChevronDownIcon } from
'lucide-react';
import { toast } from 'sonner';

interface TranscriptToolbarProps {
  transcriptId: string;
  onToggleHistory: () => void;
  onSave: () => void;
  onUndo: () => void;
  canUndo: boolean;
  sidebarHidden: boolean;
  onToggleSidebar: () => void;
  onAISummarize: () => void;
  onShowPipeline?: () => void;
  hasPipelineIssue?: boolean;
  onShowSummaries?: () => void;
  summaryCount?: number;
}

const EXPORT_FORMATS = [
  { key: 'txt', label: 'Plain Text (.txt)', icon: FileTextIcon },
  { key: 'docx', label: 'Word Document (.docx)', icon: FileTypeIcon },
  { key: 'pdf', label: 'PDF Document (.pdf)', icon: FileIcon },
] as const;

export function TranscriptToolbar({
  transcriptId,
  onToggleHistory,
  onSave,
  onUndo,
  canUndo,
  sidebarHidden,
  onToggleSidebar,
  onAISummarize,
  onShowPipeline,
  hasPipelineIssue,
  onShowSummaries,
  summaryCount
}: TranscriptToolbarProps) {
  const navigate = useNavigate();
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    if (showExportMenu) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [showExportMenu]);

  const handleExport = async (format: string) => {
    setShowExportMenu(false);
    setExporting(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/transcripts/${transcriptId}/export/${format}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Export failed' }));
        throw new Error(err.error || 'Export failed');
      }

      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      const filename = filenameMatch ? filenameMatch[1] : `transcript.${format}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Exported as ${format.toUpperCase()}`);
    } catch (err: any) {
      toast.error(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex items-center gap-1 sm:gap-2">
      <button
        onClick={onToggleSidebar}
        className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
        aria-label={sidebarHidden ? 'Show sidebar' : 'Hide sidebar'}>
        {sidebarHidden ?
        <PanelLeftOpenIcon className="h-4 w-4" /> :
        <PanelLeftCloseIcon className="h-4 w-4" />
        }
      </button>

      <button
        onClick={onUndo}
        disabled={!canUndo}
        className="inline-flex items-center gap-1.5 p-2 sm:px-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="Undo last action">
        <Undo2Icon className="h-4 w-4" />
        <span className="hidden sm:inline">Undo</span>
      </button>

      <button
        onClick={onSave}
        className="inline-flex items-center gap-1.5 p-2 sm:px-3 sm:py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-md transition-colors shadow-sm">
        <SaveIcon className="h-4 w-4" />
        <span className="hidden sm:inline">Save</span>
      </button>

      <div className="hidden sm:block h-5 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" />

      <button
        onClick={onAISummarize}
        className="inline-flex items-center gap-1.5 p-2 sm:px-3 sm:py-2 text-sm font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 active:bg-emerald-200 dark:active:bg-emerald-900/70 rounded-md transition-colors">
        <BrainCircuitIcon className="h-4 w-4" />
        <span className="hidden sm:inline">Summarize</span>
      </button>

      {onShowSummaries && (
        <button
          onClick={onShowSummaries}
          className="inline-flex items-center gap-1.5 p-2 sm:px-3 sm:py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700 rounded-md transition-colors relative"
          title="View previously generated summaries">
          <FileTextIcon className="h-4 w-4" />
          <span className="hidden lg:inline">Summaries</span>
          {!!summaryCount && summaryCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-emerald-500 text-white text-[10px] font-bold rounded-full border-2 border-white dark:border-slate-900 px-1">
              {summaryCount}
            </span>
          )}
        </button>
      )}

      <div className="relative hidden sm:block" ref={exportRef}>
        <button
          onClick={() => setShowExportMenu(!showExportMenu)}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors disabled:opacity-50"
          title="Export transcript">
          <DownloadIcon className={`h-4 w-4 ${exporting ? 'animate-pulse' : ''}`} />
          <span className="hidden lg:inline">{exporting ? 'Exporting...' : 'Export'}</span>
          <ChevronDownIcon className="h-3 w-3 hidden lg:block" />
        </button>
        {showExportMenu && (
          <div className="absolute right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-50 w-56 py-1 overflow-hidden">
            {EXPORT_FORMATS.map((fmt) => {
              const Icon = fmt.icon;
              return (
                <button
                  key={fmt.key}
                  onClick={() => handleExport(fmt.key)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-left">
                  <Icon className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  {fmt.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {onShowPipeline && (
        <button
          onClick={onShowPipeline}
          className={`inline-flex items-center gap-1.5 p-2 sm:px-2.5 text-sm font-medium rounded-md transition-colors relative ${
            hasPipelineIssue
              ? 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/50'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700'
          }`}
          title="View transcription pipeline details">
          <ActivityIcon className="h-4 w-4" />
          <span className="hidden lg:inline">Pipeline</span>
          {hasPipelineIssue && (
            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 bg-amber-500 rounded-full border-2 border-white dark:border-slate-900" />
          )}
        </button>
      )}

      <button
        onClick={onToggleHistory}
        className="inline-flex items-center gap-1.5 p-2 sm:px-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700 rounded-md transition-colors">
        <HistoryIcon className="h-4 w-4" />
        <span className="hidden lg:inline">History</span>
      </button>

      <button
        onClick={() => navigate(`/app/transcript/${transcriptId}/present`)}
        className="inline-flex items-center gap-1.5 p-2 sm:px-3 sm:py-2 text-sm font-medium text-white bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 active:bg-slate-700 dark:active:bg-slate-500 rounded-md transition-colors shadow-sm">
        <MaximizeIcon className="h-4 w-4" />
        <span className="hidden lg:inline">Present</span>
      </button>
    </div>);
}
