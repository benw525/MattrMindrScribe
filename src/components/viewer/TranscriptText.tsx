import React, { useEffect, useState, useRef, Fragment } from 'react';
import { MergeIcon, SplitIcon } from 'lucide-react';
import { TranscriptSegment } from '../../types/transcript';
import { formatDuration } from '../../utils/formatters';
interface TranscriptTextProps {
  segments: TranscriptSegment[];
  currentTime: number;
  onSeek: (time: number) => void;
  onUpdateSegment: (id: string, newText: string) => void;
  onMergeSegments: (firstId: string, secondId: string) => void;
  onSplitSegment: (id: string, splitPosition: number) => void;
}
export function TranscriptText({
  segments,
  currentTime,
  onSeek,
  onUpdateSegment,
  onMergeSegments,
  onSplitSegment
}: TranscriptTextProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editingId && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      textareaRef.current.focus();
    }
  }, [editingId, editValue]);
  const handleEditStart = (segment: TranscriptSegment) => {
    setEditingId(segment.id);
    setEditValue(segment.text);
  };
  const handleSave = (id: string) => {
    if (editValue.trim()) {
      onUpdateSegment(id, editValue.trim());
    }
    setEditingId(null);
  };
  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave(id);
    }
    if (e.key === 'Escape') {
      setEditingId(null);
    }
  };
  const handleSplit = (segment: TranscriptSegment) => {
    const midpoint = Math.floor(segment.text.length / 2);
    let splitAt = midpoint;
    for (let i = 0; i <= 20; i++) {
      if (
      midpoint + i < segment.text.length &&
      segment.text[midpoint + i] === ' ')
      {
        splitAt = midpoint + i;
        break;
      }
      if (midpoint - i >= 0 && segment.text[midpoint - i] === ' ') {
        splitAt = midpoint - i;
        break;
      }
    }
    onSplitSegment(segment.id, splitAt);
  };
  const getSpeakerColor = (speaker: string) => {
    const colors = [
    'border-blue-500',
    'border-purple-500',
    'border-emerald-500',
    'border-amber-500',
    'border-rose-500'];

    let hash = 0;
    for (let i = 0; i < speaker.length; i++) {
      hash = speaker.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };
  if (segments.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-slate-500 dark:text-slate-400">
        No transcription data available yet.
      </div>);

  }
  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-4 sm:py-6 space-y-1 scroll-smooth">
      {segments.map((segment, index) => {
        const isActive =
        currentTime >= segment.startTime && currentTime < segment.endTime;
        const isEditing = editingId === segment.id;
        const speakerColor = getSpeakerColor(segment.speaker);
        const nextSegment =
        index < segments.length - 1 ? segments[index + 1] : null;
        return (
          <Fragment key={segment.id}>
            <div
              className={`flex gap-2 sm:gap-4 group transition-colors p-2 -mx-2 rounded-lg ${isActive ? 'bg-indigo-50/50 dark:bg-indigo-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-900/50'}`}>

              <div className="w-12 sm:w-16 flex-shrink-0 pt-1 text-right">
                <button
                  onClick={() => onSeek(segment.startTime)}
                  className={`text-xs font-medium hover:underline ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'}`}>

                  {formatDuration(segment.startTime)}
                </button>
              </div>

              <div className={`flex-1 border-l-2 pl-3 sm:pl-4 ${speakerColor}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="font-semibold text-sm text-slate-900 dark:text-white">
                    {segment.speaker}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleSplit(segment)}
                      className="p-1 text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded transition-colors"
                      title="Split this section"
                      aria-label="Split section">

                      <SplitIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {isEditing ?
                <div className="relative">
                    <textarea
                    ref={textareaRef}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, segment.id)}
                    onBlur={() => handleSave(segment.id)}
                    className="w-full text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-700 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none overflow-hidden"
                    rows={1} />

                    <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                      Press Enter to save, Shift+Enter for new line
                    </div>
                  </div> :

                <p
                  onClick={() => handleEditStart(segment)}
                  className="text-slate-700 dark:text-slate-300 leading-relaxed cursor-text hover:bg-white dark:hover:bg-slate-800 hover:shadow-sm rounded px-1 -mx-1 transition-all">

                    {segment.text}
                  </p>
                }
              </div>
            </div>

            {nextSegment &&
            <div className="flex items-center pl-14 sm:pl-20 pr-2 -my-0.5">
                <div className="flex-1 flex items-center justify-center">
                  <button
                  onClick={() => onMergeSegments(segment.id, nextSegment.id)}
                  className="flex items-center gap-1.5 px-2.5 py-0.5 text-xs text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-full transition-all opacity-0 hover:opacity-100 focus:opacity-100"
                  title="Merge with next section"
                  aria-label="Merge sections">

                    <MergeIcon className="h-3 w-3" />
                    <span>Merge</span>
                  </button>
                </div>
              </div>
            }
          </Fragment>);

      })}
    </div>);

}