import React, { useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileAudioIcon, FileVideoIcon, ClockIcon } from 'lucide-react';
import { Transcript } from '../../types/transcript';
import { StatusBadge } from './StatusBadge';
import {
  formatDuration,
  formatFileSize,
  formatRelativeDate } from
'../../utils/formatters';
interface TranscriptCardProps {
  transcript: Transcript;
  isSelected: boolean;
  onSelect: (id: string, selected: boolean) => void;
  selectionMode: boolean;
}
export function TranscriptCard({
  transcript,
  isSelected,
  onSelect,
  selectionMode
}: TranscriptCardProps) {
  const navigate = useNavigate();
  const Icon = transcript.type === 'video' ? FileVideoIcon : FileAudioIcon;
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchStart = useCallback(() => {
    clearLongPress();
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      onSelect(transcript.id, true);
    }, 500);
  }, [transcript.id, onSelect, clearLongPress]);

  const handleTouchEnd = useCallback(() => {
    clearLongPress();
  }, [clearLongPress]);

  const handleTouchMove = useCallback(() => {
    clearLongPress();
  }, [clearLongPress]);

  React.useEffect(() => {
    return () => { clearLongPress(); };
  }, [clearLongPress]);

  const handleCardClick = (e: React.MouseEvent) => {
    if (didLongPress.current) {
      didLongPress.current = false;
      return;
    }
    if ((e.target as HTMLElement).closest('input[type="checkbox"]')) return;
    if (selectionMode) {
      onSelect(transcript.id, !isSelected);
    } else {
      navigate(`/app/transcript/${transcript.id}`);
    }
  };

  return (
    <div
      onClick={handleCardClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onTouchCancel={handleTouchEnd}
      className={`group relative bg-white dark:bg-slate-900 border rounded-lg shadow-sm transition-all hover:shadow-md cursor-pointer select-none ${isSelected ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-slate-200 dark:border-slate-800'}`}>

      <div className="p-3 sm:p-4 flex items-start gap-3 sm:gap-4">
        <div className={`flex-shrink-0 pt-1 w-5 ${selectionMode || isSelected ? 'block' : 'hidden sm:group-hover:block'}`}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onSelect(transcript.id, e.target.checked)}
            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-600 rounded cursor-pointer bg-white dark:bg-slate-800" />
        </div>

        <div
          className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${transcript.type === 'video' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}>

          <Icon className="h-5 w-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1 gap-2">
            <span className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 truncate">
              {transcript.filename}
            </span>
            <StatusBadge status={transcript.status} />
          </div>

          <p className="text-sm text-slate-500 dark:text-slate-400 truncate mb-2 sm:mb-3">
            {transcript.description || 'No description provided'}
          </p>

          <div className="flex items-center gap-2 sm:gap-4 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
            <div className="flex items-center gap-1">
              <ClockIcon className="h-3.5 w-3.5" />
              {formatDuration(transcript.duration)}
            </div>
            <span className="hidden sm:inline">•</span>
            <span title={new Date(transcript.createdAt).toLocaleString()}>
              {formatRelativeDate(transcript.createdAt)}
            </span>
            <span className="hidden sm:inline">•</span>
            <span className="hidden sm:inline">
              {formatFileSize(transcript.fileSize)}
            </span>
          </div>
        </div>
      </div>
    </div>);

}
