import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { MergeIcon, SplitIcon, ChevronDownIcon, PlusIcon, CheckIcon, XIcon, BookmarkIcon, StickyNoteIcon, Trash2Icon, PencilIcon, XCircleIcon } from 'lucide-react';
import { TranscriptSegment, TranscriptAnnotation } from '../../types/transcript';
import { formatDuration } from '../../utils/formatters';

const SPEAKER_COLOR_OPTIONS = [
  { name: 'Blue', bg: 'bg-blue-500', border: 'border-blue-500' },
  { name: 'Purple', bg: 'bg-purple-500', border: 'border-purple-500' },
  { name: 'Emerald', bg: 'bg-emerald-500', border: 'border-emerald-500' },
  { name: 'Amber', bg: 'bg-amber-500', border: 'border-amber-500' },
  { name: 'Rose', bg: 'bg-rose-500', border: 'border-rose-500' },
  { name: 'Cyan', bg: 'bg-cyan-500', border: 'border-cyan-500' },
  { name: 'Orange', bg: 'bg-orange-500', border: 'border-orange-500' },
  { name: 'Indigo', bg: 'bg-indigo-500', border: 'border-indigo-500' },
  { name: 'Pink', bg: 'bg-pink-500', border: 'border-pink-500' },
  { name: 'Teal', bg: 'bg-teal-500', border: 'border-teal-500' },
];

function getDefaultColorIndex(speaker: string): number {
  let hash = 0;
  for (let i = 0; i < speaker.length; i++) {
    hash = speaker.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % SPEAKER_COLOR_OPTIONS.length;
}

function getSpeakerColorFromMap(speaker: string, colorMap: Record<string, string>) {
  const colorName = colorMap[speaker];
  if (colorName) {
    const found = SPEAKER_COLOR_OPTIONS.find(c => c.name === colorName);
    if (found) return found;
  }
  return SPEAKER_COLOR_OPTIONS[getDefaultColorIndex(speaker)];
}

interface InlineNoteProps {
  annotation: TranscriptAnnotation;
  onUpdate: (id: string, text: string) => void;
  onDelete: (id: string) => void;
}

function InlineNote({ annotation, onUpdate, onDelete }: InlineNoteProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(annotation.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      textareaRef.current.focus();
    }
  }, [editing]);

  const handleSave = () => {
    if (editText.trim() !== annotation.text) {
      onUpdate(annotation.id, editText.trim());
    }
    setEditing(false);
  };

  return (
    <div className="mx-2 sm:mx-0 sm:ml-16 sm:mr-2 my-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-lg px-3 py-2 group/note">
      <div className="flex items-start gap-2">
        <StickyNoteIcon className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          {editing ? (
            <div>
              <textarea
                ref={textareaRef}
                value={editText}
                onChange={(e) => {
                  setEditText(e.target.value);
                  if (textareaRef.current) {
                    textareaRef.current.style.height = 'auto';
                    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); }
                  if (e.key === 'Escape') { setEditing(false); setEditText(annotation.text); }
                }}
                className="w-full text-sm text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none overflow-hidden"
                rows={1}
                placeholder="Type your note..."
              />
              <div className="flex items-center gap-2 mt-1">
                <button onClick={handleSave} className="text-xs text-amber-600 dark:text-amber-400 hover:underline">Save</button>
                <button onClick={() => { setEditing(false); setEditText(annotation.text); }} className="text-xs text-slate-400 hover:underline">Cancel</button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
              {annotation.text || <span className="italic text-slate-400">Empty note</span>}
            </p>
          )}
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover/note:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={() => { setEditing(true); setEditText(annotation.text); }}
            className="p-1 text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 rounded transition-colors"
            title="Edit note">
            <PencilIcon className="h-3 w-3" />
          </button>
          <button
            onClick={() => onDelete(annotation.id)}
            className="p-1 text-slate-400 hover:text-red-500 dark:hover:text-red-400 rounded transition-colors"
            title="Delete note">
            <Trash2Icon className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

interface SegmentRowProps {
  segment: TranscriptSegment;
  isActive: boolean;
  isMobile: boolean;
  isSelected: boolean;
  isBookmarked: boolean;
  speakerColors: Record<string, string>;
  allSpeakers: string[];
  nextSegmentId: string | null;
  notesAfter: TranscriptAnnotation[];
  onSeek: (time: number) => void;
  onUpdateSegment: (id: string, newText: string) => void;
  onMergeSegments: (firstId: string, secondId: string) => void;
  onSplitSegment: (id: string, splitPosition: number) => void;
  onChangeSegmentSpeaker?: (segmentId: string, newSpeaker: string) => void;
  onAddSpeakerFromDropdown?: (segmentId: string, name: string) => void;
  onToggleSelect: (id: string) => void;
  onToggleBookmark: (segmentId: string) => void;
  onAddNote: (segmentId: string) => void;
  onUpdateNote: (annotationId: string, text: string) => void;
  onDeleteNote: (annotationId: string) => void;
  onDeleteSegment: (segmentId: string) => void;
}

const SegmentRow = React.memo(function SegmentRow({
  segment,
  isActive,
  isMobile,
  isSelected,
  isBookmarked,
  speakerColors,
  allSpeakers,
  nextSegmentId,
  notesAfter,
  onSeek,
  onUpdateSegment,
  onMergeSegments,
  onSplitSegment,
  onChangeSegmentSpeaker,
  onAddSpeakerFromDropdown,
  onToggleSelect,
  onToggleBookmark,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onDeleteSegment,
}: SegmentRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [addingSpeakerInDropdown, setAddingSpeakerInDropdown] = useState(false);
  const [newSpeakerName, setNewSpeakerName] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const newSpeakerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      textareaRef.current.focus();
    }
  }, [isEditing]);

  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditValue(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, []);

  useEffect(() => {
    if (addingSpeakerInDropdown && newSpeakerInputRef.current) {
      newSpeakerInputRef.current.focus();
    }
  }, [addingSpeakerInDropdown]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        setAddingSpeakerInDropdown(false);
        setNewSpeakerName('');
      }
    };
    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  const handleEditStart = useCallback(() => {
    setIsEditing(true);
    setEditValue(segment.text);
  }, [segment.text]);

  const handleSave = useCallback(() => {
    if (editValue.trim() && editValue.trim() !== segment.text) {
      onUpdateSegment(segment.id, editValue.trim());
    }
    setIsEditing(false);
  }, [editValue, segment.id, segment.text, onUpdateSegment]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      setIsEditing(false);
    }
  }, [handleSave]);

  const handleSplit = useCallback(() => {
    const text = segment.text;
    const midpoint = Math.floor(text.length / 2);
    let splitAt = midpoint;
    for (let i = 0; i <= 20; i++) {
      if (midpoint + i < text.length && text[midpoint + i] === ' ') {
        splitAt = midpoint + i;
        break;
      }
      if (midpoint - i >= 0 && text[midpoint - i] === ' ') {
        splitAt = midpoint - i;
        break;
      }
    }
    onSplitSegment(segment.id, splitAt);
  }, [segment.id, segment.text, onSplitSegment]);

  const handleAddNewSpeaker = useCallback(() => {
    const trimmed = newSpeakerName.trim();
    if (!trimmed) {
      setAddingSpeakerInDropdown(false);
      setNewSpeakerName('');
      return;
    }
    if (onAddSpeakerFromDropdown) {
      onAddSpeakerFromDropdown(segment.id, trimmed);
    }
    setShowDropdown(false);
    setAddingSpeakerInDropdown(false);
    setNewSpeakerName('');
  }, [newSpeakerName, segment.id, onAddSpeakerFromDropdown]);

  const speakerColorBorder = getSpeakerColorFromMap(segment.speaker, speakerColors).border;

  return (
    <>
      <div
        data-active={isActive || undefined}
        className={`flex gap-1 sm:gap-4 group transition-colors py-2 sm:p-2 sm:-mx-2 rounded-lg ${isActive ? 'bg-indigo-50/50 dark:bg-indigo-950/30' : ''}`}
      >
        <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-1">
          {isMobile && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(segment.id)}
              className="h-4 w-4 text-indigo-600 border-slate-300 dark:border-slate-600 rounded cursor-pointer flex-shrink-0 mb-0.5"
            />
          )}
          <button
            onClick={() => onSeek(segment.startTime)}
            className={`text-[10px] sm:text-xs font-medium tabular-nums hover:underline w-10 sm:w-16 text-center sm:text-right ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`}
          >
            {formatDuration(segment.startTime)}
          </button>
        </div>

        <div className={`flex-1 border-l-2 pl-2 sm:pl-4 min-w-0 ${speakerColorBorder}`}>
          <div className="flex items-center justify-between mb-1">
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => {
                  setShowDropdown(prev => !prev);
                  setAddingSpeakerInDropdown(false);
                  setNewSpeakerName('');
                }}
                className="flex items-center gap-1 font-semibold text-sm text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 active:text-indigo-700 transition-colors rounded px-1.5 py-1 -mx-1.5 -my-1 hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700"
                title="Click to change speaker">
                {segment.speaker}
                <ChevronDownIcon className="h-3 w-3 opacity-60 sm:opacity-0 sm:group-hover:opacity-60 transition-opacity" />
              </button>
              {showDropdown && (
                <div
                  className="absolute left-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-30 min-w-[180px] py-1">
                  {allSpeakers.map((speaker) => (
                    <button
                      key={speaker}
                      onClick={() => {
                        if (onChangeSegmentSpeaker && speaker !== segment.speaker) {
                          onChangeSegmentSpeaker(segment.id, speaker);
                        }
                        setShowDropdown(false);
                      }}
                      className={`w-full text-left px-3 py-2.5 sm:py-1.5 text-sm flex items-center gap-2 transition-colors ${speaker === segment.speaker ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-medium' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 active:bg-slate-100 dark:active:bg-slate-600'}`}>
                      <span className={`w-2 h-2 rounded-full ${getSpeakerColorFromMap(speaker, speakerColors).bg}`} />
                      {speaker}
                    </button>
                  ))}
                  <div className="border-t border-slate-100 dark:border-slate-700 mt-1 pt-1">
                    {addingSpeakerInDropdown ?
                      <div className="px-2 py-1 flex items-center gap-1">
                        <input
                          ref={newSpeakerInputRef}
                          type="text"
                          value={newSpeakerName}
                          onChange={(e) => setNewSpeakerName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAddNewSpeaker();
                            if (e.key === 'Escape') {
                              setAddingSpeakerInDropdown(false);
                              setNewSpeakerName('');
                            }
                          }}
                          placeholder="Speaker name"
                          className="flex-1 text-base sm:text-sm text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-700 border border-emerald-300 dark:border-emerald-600 rounded-lg px-2 py-1.5 sm:py-0.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-slate-400"
                        />
                        <button
                          onClick={handleAddNewSpeaker}
                          className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 active:bg-emerald-800 transition-colors flex-shrink-0"
                          aria-label="Add speaker"
                        >
                          <CheckIcon className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => { setAddingSpeakerInDropdown(false); setNewSpeakerName(''); }}
                          className="p-1.5 bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-500 active:bg-slate-400 transition-colors flex-shrink-0"
                          aria-label="Cancel"
                        >
                          <XIcon className="h-3.5 w-3.5" />
                        </button>
                      </div> :
                      <button
                        onClick={() => setAddingSpeakerInDropdown(true)}
                        className="w-full text-left px-3 py-2.5 sm:py-1.5 text-sm flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                      >
                        <PlusIcon className="h-3.5 w-3.5" />
                        Add Speaker
                      </button>
                    }
                  </div>
                </div>
              )}
            </div>
            <div className={`flex items-center gap-1 transition-opacity ${isBookmarked ? 'opacity-100' : 'sm:opacity-0 sm:group-hover:opacity-100'}`}>
              <button
                onClick={() => onToggleBookmark(segment.id)}
                className={`p-1.5 sm:p-1 rounded transition-colors ${isBookmarked ? 'text-amber-500 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500 hover:text-amber-500 dark:hover:text-amber-400'} hover:bg-amber-50 dark:hover:bg-amber-950/50`}
                title={isBookmarked ? 'Remove bookmark' : 'Bookmark this segment'}
                aria-label="Toggle bookmark">
                <BookmarkIcon className="h-3.5 w-3.5" fill={isBookmarked ? 'currentColor' : 'none'} />
              </button>
              <button
                onClick={() => onAddNote(segment.id)}
                className="p-1.5 sm:p-1 text-slate-400 dark:text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50 rounded transition-colors"
                title="Add a note after this segment"
                aria-label="Add note">
                <StickyNoteIcon className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={handleSplit}
                className="p-1.5 sm:p-1 text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 active:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 active:bg-indigo-100 dark:active:bg-indigo-950/70 rounded transition-colors"
                title="Split this section"
                aria-label="Split section">
                <SplitIcon className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onDeleteSegment(segment.id)}
                className="p-1.5 sm:p-1 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded transition-colors"
                title="Delete this segment"
                aria-label="Delete segment">
                <Trash2Icon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {isEditing ?
          <div className="relative">
              <textarea
              ref={textareaRef}
              value={editValue}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              onBlur={handleSave}
              className="w-full text-sm sm:text-base text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-700 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none overflow-hidden"
              rows={1} />
              <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                Press Enter to save, Shift+Enter for new line
              </div>
            </div> :
          <p
            onClick={handleEditStart}
            className="text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed cursor-text hover:bg-white dark:hover:bg-slate-800 hover:shadow-sm rounded px-1 -mx-1 transition-all">
              {segment.text}
            </p>
          }
        </div>
      </div>

      {notesAfter.map(note => (
        <InlineNote
          key={note.id}
          annotation={note}
          onUpdate={onUpdateNote}
          onDelete={onDeleteNote}
        />
      ))}

      {!isMobile && nextSegmentId &&
      <div className="flex items-center pl-14 sm:pl-20 pr-2 -my-0.5">
          <div className="flex-1 flex items-center justify-center">
            <button
            onClick={() => onMergeSegments(segment.id, nextSegmentId)}
            className="flex items-center gap-1.5 px-2.5 py-0.5 text-xs text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-full transition-all opacity-0 hover:opacity-100 focus:opacity-100"
            title="Merge with next section"
            aria-label="Merge sections">
              <MergeIcon className="h-3 w-3" />
              <span>Merge</span>
            </button>
          </div>
        </div>
      }
    </>
  );
});

interface TranscriptTextProps {
  segments: TranscriptSegment[];
  currentTime: number;
  isPlaying?: boolean;
  onSeek: (time: number) => void;
  onUpdateSegment: (id: string, newText: string) => void;
  onMergeSegments: (firstId: string, secondId: string) => void;
  onSplitSegment: (id: string, splitPosition: number) => void;
  allSpeakers?: string[];
  onChangeSegmentSpeaker?: (segmentId: string, newSpeaker: string) => void;
  speakerColors?: Record<string, string>;
  onAddSpeakerFromDropdown?: (segmentId: string, name: string) => void;
  annotations?: TranscriptAnnotation[];
  onToggleBookmark?: (segmentId: string) => void;
  onAddNote?: (segmentId: string) => void;
  onUpdateNote?: (annotationId: string, text: string) => void;
  onDeleteNote?: (annotationId: string) => void;
  onDeleteSegment?: (segmentId: string) => void;
  showBookmarksOnly?: boolean;
}
export const TranscriptText = React.memo(function TranscriptText({
  segments,
  currentTime,
  isPlaying = false,
  onSeek,
  onUpdateSegment,
  onMergeSegments,
  onSplitSegment,
  allSpeakers = [],
  onChangeSegmentSpeaker,
  speakerColors = {},
  onAddSpeakerFromDropdown,
  annotations = [],
  onToggleBookmark,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onDeleteSegment,
  showBookmarksOnly = false,
}: TranscriptTextProps) {
  const [userScrolled, setUserScrolled] = useState(false);
  const userScrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAutoScrolling = useRef(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleMergeSelected = useCallback(() => {
    if (selectedIds.size < 2) return;
    const sorted = segments
      .filter(s => selectedIds.has(s.id))
      .sort((a, b) => a.startTime - b.startTime);
    onMergeSegments(sorted[0].id, sorted[1].id);
    const remaining = new Set(selectedIds);
    remaining.delete(sorted[0].id);
    remaining.delete(sorted[1].id);
    setSelectedIds(remaining);
  }, [selectedIds, segments, onMergeSegments]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const activeSegmentId = useMemo(() => {
    for (let i = segments.length - 1; i >= 0; i--) {
      if (currentTime >= segments[i].startTime && currentTime < segments[i].endTime) {
        return segments[i].id;
      }
    }
    return null;
  }, [segments, currentTime]);

  useEffect(() => {
    if (!isPlaying || userScrolled) return;
    if (!activeSegmentId || !scrollContainerRef.current) return;
    const el = scrollContainerRef.current.querySelector('[data-active]');
    if (el) {
      isAutoScrolling.current = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => { isAutoScrolling.current = false; }, 500);
    }
  }, [activeSegmentId, isPlaying, userScrolled]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleUserInteraction = () => {
      if (isAutoScrolling.current) return;
      if (!isPlaying) return;
      setUserScrolled(true);
      if (userScrollTimeout.current) clearTimeout(userScrollTimeout.current);
      userScrollTimeout.current = setTimeout(() => {
        setUserScrolled(false);
      }, 5000);
    };
    container.addEventListener('scroll', handleUserInteraction, { passive: true });
    container.addEventListener('touchstart', handleUserInteraction, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleUserInteraction);
      container.removeEventListener('touchstart', handleUserInteraction);
      if (userScrollTimeout.current) clearTimeout(userScrollTimeout.current);
    };
  }, [isPlaying]);

  useEffect(() => {
    if (isPlaying) {
      setUserScrolled(false);
    }
  }, [isPlaying]);

  const bookmarkedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const a of annotations) {
      if (a.type === 'bookmark') ids.add(a.segmentId);
    }
    return ids;
  }, [annotations]);

  const notesBySegment = useMemo(() => {
    const map: Record<string, TranscriptAnnotation[]> = {};
    for (const a of annotations) {
      if (a.type === 'note') {
        if (!map[a.segmentId]) map[a.segmentId] = [];
        map[a.segmentId].push(a);
      }
    }
    return map;
  }, [annotations]);

  const displaySegments = useMemo(() => {
    if (!showBookmarksOnly) return segments;
    return segments.filter(s => bookmarkedIds.has(s.id));
  }, [segments, showBookmarksOnly, bookmarkedIds]);

  const handleToggleBookmark = useCallback((segmentId: string) => {
    onToggleBookmark?.(segmentId);
  }, [onToggleBookmark]);

  const handleAddNote = useCallback((segmentId: string) => {
    onAddNote?.(segmentId);
  }, [onAddNote]);

  const handleUpdateNote = useCallback((annotationId: string, text: string) => {
    onUpdateNote?.(annotationId, text);
  }, [onUpdateNote]);

  const handleDeleteNote = useCallback((annotationId: string) => {
    onDeleteNote?.(annotationId);
  }, [onDeleteNote]);

  const handleDeleteSegment = useCallback((segmentId: string) => {
    onDeleteSegment?.(segmentId);
  }, [onDeleteSegment]);

  if (segments.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-slate-500 dark:text-slate-400">
        No transcription data available yet.
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden relative">
      {selectedIds.size >= 2 && (
        <div className="flex-shrink-0 bg-indigo-50 dark:bg-indigo-950/30 border-b border-indigo-200 dark:border-indigo-800 px-4 py-2 flex items-center justify-between z-10">
          <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
            {selectedIds.size} segments selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleMergeSelected}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-md transition-colors shadow-sm"
            >
              <MergeIcon className="h-3.5 w-3.5" />
              Merge Selected
            </button>
            <button
              onClick={clearSelection}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors"
            >
              <XIcon className="h-3 w-3" />
              Cancel
            </button>
          </div>
        </div>
      )}

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overscroll-contain px-2 sm:px-8 py-3 sm:py-6 space-y-0 sm:space-y-1">
        {displaySegments.map((segment, index) => {
          const nextSegment = index < displaySegments.length - 1 ? displaySegments[index + 1] : null;
          const segNotes = notesBySegment[segment.id] || [];
          const isBookmarked = bookmarkedIds.has(segment.id);
          return (
            <SegmentRow
              key={segment.id}
              segment={segment}
              isActive={activeSegmentId === segment.id}
              isMobile={isMobile}
              isSelected={selectedIds.has(segment.id)}
              isBookmarked={isBookmarked}
              speakerColors={speakerColors}
              allSpeakers={allSpeakers}
              nextSegmentId={nextSegment?.id || null}
              notesAfter={segNotes}
              onSeek={onSeek}
              onUpdateSegment={onUpdateSegment}
              onMergeSegments={onMergeSegments}
              onSplitSegment={onSplitSegment}
              onChangeSegmentSpeaker={onChangeSegmentSpeaker}
              onAddSpeakerFromDropdown={onAddSpeakerFromDropdown}
              onToggleSelect={toggleSelect}
              onToggleBookmark={handleToggleBookmark}
              onAddNote={handleAddNote}
              onUpdateNote={handleUpdateNote}
              onDeleteNote={handleDeleteNote}
              onDeleteSegment={handleDeleteSegment}
            />
          );
        })}
      </div>
    </div>
  );
});
