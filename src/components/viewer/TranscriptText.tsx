import React, { useEffect, useState, useRef, Fragment, useCallback } from 'react';
import { MergeIcon, SplitIcon, ChevronDownIcon, PlusIcon, CheckIcon, XIcon } from 'lucide-react';
import { TranscriptSegment } from '../../types/transcript';
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
}
export function TranscriptText({
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
  onAddSpeakerFromDropdown
}: TranscriptTextProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [speakerDropdownId, setSpeakerDropdownId] = useState<string | null>(null);
  const [addingSpeakerInDropdown, setAddingSpeakerInDropdown] = useState(false);
  const [newSpeakerName, setNewSpeakerName] = useState('');
  const [userScrolled, setUserScrolled] = useState(false);
  const userScrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const newSpeakerInputRef = useRef<HTMLInputElement>(null);
  const activeSegmentRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (editingId && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      textareaRef.current.focus();
    }
  }, [editingId, editValue]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setSpeakerDropdownId(null);
        setAddingSpeakerInDropdown(false);
        setNewSpeakerName('');
      }
    };
    if (speakerDropdownId) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [speakerDropdownId]);

  useEffect(() => {
    if (addingSpeakerInDropdown && newSpeakerInputRef.current) {
      newSpeakerInputRef.current.focus();
    }
  }, [addingSpeakerInDropdown]);

  useEffect(() => {
    if (!isPlaying || editingId || userScrolled) return;
    if (activeSegmentRef.current && scrollContainerRef.current) {
      isAutoScrolling.current = true;
      activeSegmentRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      setTimeout(() => { isAutoScrolling.current = false; }, 500);
    }
  }, [currentTime, isPlaying, editingId, userScrolled]);

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
      if (midpoint + i < segment.text.length && segment.text[midpoint + i] === ' ') {
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
    return getSpeakerColorFromMap(speaker, speakerColors).border;
  };

  const getSpeakerDotColor = (speaker: string) => {
    return getSpeakerColorFromMap(speaker, speakerColors).bg;
  };

  const handleAddNewSpeaker = (segmentId: string) => {
    const trimmed = newSpeakerName.trim();
    if (!trimmed) {
      setAddingSpeakerInDropdown(false);
      setNewSpeakerName('');
      return;
    }
    if (onAddSpeakerFromDropdown) {
      onAddSpeakerFromDropdown(segmentId, trimmed);
    }
    setSpeakerDropdownId(null);
    setAddingSpeakerInDropdown(false);
    setNewSpeakerName('');
  };

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
        {segments.map((segment, index) => {
          const isActive = currentTime >= segment.startTime && currentTime < segment.endTime;
          const isEditing = editingId === segment.id;
          const speakerColor = getSpeakerColor(segment.speaker);
          const nextSegment = index < segments.length - 1 ? segments[index + 1] : null;
          const showDropdown = speakerDropdownId === segment.id;
          const isSelected = selectedIds.has(segment.id);
          return (
            <Fragment key={segment.id}>
              <div
                ref={isActive ? activeSegmentRef : undefined}
                className={`flex gap-1 sm:gap-4 group transition-colors py-2 sm:p-2 sm:-mx-2 rounded-lg ${isActive ? 'bg-indigo-50/50 dark:bg-indigo-950/30' : ''}`}
              >
                <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-1">
                  {isMobile && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(segment.id)}
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

                <div className={`flex-1 border-l-2 pl-2 sm:pl-4 min-w-0 ${speakerColor}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="relative">
                      <button
                        onClick={() => {
                          setSpeakerDropdownId(showDropdown ? null : segment.id);
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
                          ref={dropdownRef}
                          className="absolute left-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-30 min-w-[180px] py-1">
                          {allSpeakers.map((speaker) => (
                            <button
                              key={speaker}
                              onClick={() => {
                                if (onChangeSegmentSpeaker && speaker !== segment.speaker) {
                                  onChangeSegmentSpeaker(segment.id, speaker);
                                }
                                setSpeakerDropdownId(null);
                              }}
                              className={`w-full text-left px-3 py-2.5 sm:py-1.5 text-sm flex items-center gap-2 transition-colors ${speaker === segment.speaker ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-medium' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 active:bg-slate-100 dark:active:bg-slate-600'}`}>
                              <span className={`w-2 h-2 rounded-full ${getSpeakerDotColor(speaker)}`} />
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
                                    if (e.key === 'Enter') handleAddNewSpeaker(segment.id);
                                    if (e.key === 'Escape') {
                                      setAddingSpeakerInDropdown(false);
                                      setNewSpeakerName('');
                                    }
                                  }}
                                  placeholder="Speaker name"
                                  className="flex-1 text-sm text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-700 border border-emerald-300 dark:border-emerald-600 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder:text-slate-400"
                                />
                                <button
                                  onClick={() => handleAddNewSpeaker(segment.id)}
                                  className="p-0.5 text-emerald-600 hover:text-emerald-700"
                                >
                                  <CheckIcon className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => { setAddingSpeakerInDropdown(false); setNewSpeakerName(''); }}
                                  className="p-0.5 text-slate-400 hover:text-slate-600"
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
                    <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleSplit(segment)}
                        className="p-1.5 sm:p-1 text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 active:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 active:bg-indigo-100 dark:active:bg-indigo-950/70 rounded transition-colors"
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
                      className="w-full text-sm sm:text-base text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-700 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none overflow-hidden"
                      rows={1} />
                      <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                        Press Enter to save, Shift+Enter for new line
                      </div>
                    </div> :
                  <p
                    onClick={() => handleEditStart(segment)}
                    className="text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed cursor-text hover:bg-white dark:hover:bg-slate-800 hover:shadow-sm rounded px-1 -mx-1 transition-all">
                      {segment.text}
                    </p>
                  }
                </div>
              </div>

              {!isMobile && nextSegment &&
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
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
