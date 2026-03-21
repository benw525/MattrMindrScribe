import React, { useEffect, useState, useRef } from 'react';
import { EditIcon, CheckIcon, XIcon } from 'lucide-react';
import { Transcript } from '../../types/transcript';
import {
  formatDuration,
  formatFileSize,
  formatRelativeDate } from
'../../utils/formatters';
interface MetadataEditorProps {
  transcript: Transcript;
  onUpdate?: (updates: Partial<Transcript>) => void;
}
export function MetadataEditor({ transcript, onUpdate }: MetadataEditorProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(transcript.filename);
  const titleInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setTitleValue(transcript.filename);
  }, [transcript.filename]);
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) titleInputRef.current.focus();
  }, [isEditingTitle]);
  const handleSaveTitle = () => {
    if (titleValue.trim() && titleValue !== transcript.filename && onUpdate) {
      onUpdate({
        filename: titleValue.trim()
      });
    } else {
      setTitleValue(transcript.filename);
    }
    setIsEditingTitle(false);
  };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSaveTitle();
    if (e.key === 'Escape') {
      setTitleValue(transcript.filename);
      setIsEditingTitle(false);
    }
  };
  return (
    <div className="flex flex-col min-w-0">
      {isEditingTitle ?
      <div className="flex items-center gap-2">
          <input
          ref={titleInputRef}
          type="text"
          value={titleValue}
          onChange={(e) => setTitleValue(e.target.value)}
          onKeyDown={handleKeyDown}
          className="text-base sm:text-xl font-bold text-slate-900 dark:text-white border-b-2 border-indigo-500 focus:outline-none bg-transparent px-1 py-0.5 w-full max-w-md" />

          <button
          onClick={handleSaveTitle}
          className="p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded">

            <CheckIcon className="h-5 w-5" />
          </button>
          <button
          onClick={() => {
            setTitleValue(transcript.filename);
            setIsEditingTitle(false);
          }}
          className="p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">

            <XIcon className="h-5 w-5" />
          </button>
        </div> :

      <div className="flex items-center gap-2 group min-w-0">
          <h1 className="text-base sm:text-xl font-bold text-slate-900 dark:text-white truncate max-w-[70vw] sm:max-w-md">
            {transcript.filename}
          </h1>
          {onUpdate && (
            <button
            onClick={() => setIsEditingTitle(true)}
            className="p-1 text-slate-400 opacity-0 group-hover:opacity-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all rounded flex-shrink-0"
            aria-label="Edit title">
              <EditIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      }

      <div className="hidden lg:flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
        <span>{formatDuration(transcript.duration)}</span>
        <span>•</span>
        <span>{formatFileSize(transcript.fileSize)}</span>
        <span>•</span>
        <span>Uploaded {formatRelativeDate(transcript.createdAt)}</span>
      </div>
    </div>);

}