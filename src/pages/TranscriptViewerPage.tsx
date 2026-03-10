import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  useParams,
  useNavigate,
  Link,
  useOutletContext } from
'react-router-dom';
import { ChevronLeftIcon, EditIcon, CheckIcon, XIcon, PlusIcon, Trash2Icon, PaletteIcon, UsersIcon, MergeIcon } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useTranscripts } from '../hooks/useTranscripts';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { StatusBadge } from '../components/transcripts/StatusBadge';
import { MetadataEditor } from '../components/viewer/MetadataEditor';
import { TranscriptToolbar } from '../components/viewer/TranscriptToolbar';
import { TranscriptText } from '../components/viewer/TranscriptText';
import { AudioPlayer } from '../components/viewer/AudioPlayer';
import { VideoPlayer } from '../components/viewer/VideoPlayer';
import { VersionHistory } from '../components/viewer/VersionHistory';
import { AISummarizeModal } from '../components/viewer/AISummarizeModal';
import { AISummaryPanel } from '../components/viewer/AISummaryPanel';
import { PipelineSummary } from '../components/viewer/PipelineSummary';
import { TranscriptSegment, TranscriptVersion } from '../types/transcript';
import { api } from '../utils/api';
interface UndoEntry {
  segments: TranscriptSegment[];
  description: string;
}

const SPEAKER_COLOR_OPTIONS = [
  { name: 'Blue', bg: 'bg-blue-500', border: 'border-blue-500', text: 'text-blue-600 dark:text-blue-400' },
  { name: 'Purple', bg: 'bg-purple-500', border: 'border-purple-500', text: 'text-purple-600 dark:text-purple-400' },
  { name: 'Emerald', bg: 'bg-emerald-500', border: 'border-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  { name: 'Amber', bg: 'bg-amber-500', border: 'border-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  { name: 'Rose', bg: 'bg-rose-500', border: 'border-rose-500', text: 'text-rose-600 dark:text-rose-400' },
  { name: 'Cyan', bg: 'bg-cyan-500', border: 'border-cyan-500', text: 'text-cyan-600 dark:text-cyan-400' },
  { name: 'Orange', bg: 'bg-orange-500', border: 'border-orange-500', text: 'text-orange-600 dark:text-orange-400' },
  { name: 'Indigo', bg: 'bg-indigo-500', border: 'border-indigo-500', text: 'text-indigo-600 dark:text-indigo-400' },
  { name: 'Pink', bg: 'bg-pink-500', border: 'border-pink-500', text: 'text-pink-600 dark:text-pink-400' },
  { name: 'Teal', bg: 'bg-teal-500', border: 'border-teal-500', text: 'text-teal-600 dark:text-teal-400' },
];

function getDefaultColorIndex(speaker: string): number {
  let hash = 0;
  for (let i = 0; i < speaker.length; i++) {
    hash = speaker.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % SPEAKER_COLOR_OPTIONS.length;
}

function getSpeakerColorObj(speaker: string, colorMap: Record<string, string>) {
  const colorName = colorMap[speaker];
  if (colorName) {
    const found = SPEAKER_COLOR_OPTIONS.find(c => c.name === colorName);
    if (found) return found;
  }
  return SPEAKER_COLOR_OPTIONS[getDefaultColorIndex(speaker)];
}
export function TranscriptViewerPage() {
  const { id } = useParams<{
    id: string;
  }>();
  const navigate = useNavigate();
  const { transcripts, updateTranscript, refreshData, loading: transcriptsLoading } = useTranscripts();
  const { sidebarHidden, setSidebarHidden } = useOutletContext<{
    selectedFolderId: string | null;
    sidebarHidden: boolean;
    setSidebarHidden: (v: boolean) => void;
  }>();
  const [showHistory, setShowHistory] = useState(false);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [transcriptWidthPercent, setTranscriptWidthPercent] = useState(66);
  const isDraggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [speakerEditValue, setSpeakerEditValue] = useState('');
  const [versions, setVersions] = useState<TranscriptVersion[]>([]);
  const [customSpeakers, setCustomSpeakers] = useState<string[]>([]);
  const [speakerColors, setSpeakerColors] = useState<Record<string, string>>({});
  const [showSpeakerManager, setShowSpeakerManager] = useState(false);
  const [colorPickerSpeaker, setColorPickerSpeaker] = useState<string | null>(null);
  const [mergingSpeaker, setMergingSpeaker] = useState<string | null>(null);
  const [mergeLoading, setMergeLoading] = useState(false);
  const speakerManagerRef = useRef<HTMLDivElement>(null);
  const [mobileShowVideo, setMobileShowVideo] = useState(false);
  const [showSummarizeModal, setShowSummarizeModal] = useState(false);
  const [showPipeline, setShowPipeline] = useState(false);
  const [showSummaryPanel, setShowSummaryPanel] = useState(false);
  const [agents, setAgents] = useState<{ id: string; name: string; icon: string; description: string; subTypes: { id: string; name: string; description: string }[] }[]>([]);
  const [summaries, setSummaries] = useState<{ id: string; agentType: string; subType: string | null; subTypeName: string | null; summary: string; modelUsed: string; createdAt: string }[]>([]);
  const [loadingAgentId, setLoadingAgentId] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingAgentType, setStreamingAgentType] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const transcript = transcripts.find((t) => t.id === id);

  useEffect(() => {
    if (!id) return;
    api.transcripts.getVersions(id).then((v: TranscriptVersion[]) => {
      setVersions(v || []);
    }).catch(() => {});
    api.transcripts.getSummaries(id).then((s: any[]) => {
      setSummaries(s || []);
    }).catch(() => {});
  }, [id]);

  useEffect(() => {
    api.transcripts.getAgents().then((a: any[]) => {
      setAgents(a || []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (speakerManagerRef.current && !speakerManagerRef.current.contains(e.target as Node)) {
        setShowSpeakerManager(false);
        setEditingSpeaker(null);
        setColorPickerSpeaker(null);
      }
    };
    if (showSpeakerManager) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSpeakerManager]);

  const {
    isPlaying,
    currentTime,
    playbackRate,
    togglePlayPause,
    skip,
    seek,
    setPlaybackRate,
    audioRef,
    mediaUrl,
  } = useAudioPlayer(transcript?.duration || 0, transcript?.fileUrl, transcript?.type);
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percent = Math.max(30, Math.min(80, x / rect.width * 100));
      setTranscriptWidthPercent(percent);
    };
    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);
  if (!transcript) {
    if (transcriptsLoading) {
      return (
        <div className="flex-1 flex items-center justify-center bg-slate-50 dark:bg-slate-950">
          <div className="h-8 w-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>);
    }
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
          Transcript not found
        </h2>
        <button
          onClick={() => navigate('/app')}
          className="text-indigo-600 dark:text-indigo-400 hover:underline">
          Return to Dashboard
        </button>
      </div>);
  }
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDescriptionRef = useRef<string | null>(null);

  const autoSave = useCallback((description: string) => {
    if (!transcript) return;
    pendingDescriptionRef.current = description;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(async () => {
      try {
        const desc = pendingDescriptionRef.current || description;
        const newVersion = await api.transcripts.createVersion(transcript.id, desc);
        setVersions((prev) => [newVersion, ...prev]);
        pendingDescriptionRef.current = null;
      } catch (err) {
        console.error('Autosave failed:', err);
      }
    }, 1500);
  }, [transcript?.id]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const pushUndo = (description: string) => {
    setUndoStack((prev) => [
    ...prev,
    {
      segments: [...transcript.segments],
      description
    }]
    );
  };
  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    updateTranscript(transcript.id, {
      segments: last.segments
    });
    setUndoStack((prev) => prev.slice(0, -1));
    autoSave(`Undo: ${last.description}`);
    toast.success(`Undone: ${last.description}`);
  };
  const handleSave = async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    try {
      const newVersion = await api.transcripts.createVersion(transcript.id, 'Manual save');
      setVersions((prev) => [newVersion, ...prev]);
      setUndoStack([]);
      toast.success('Transcript saved');
    } catch (err) {
      console.error('Failed to save version:', err);
      toast.error('Failed to save version');
    }
  };
  const handleUpdateSegment = (segmentId: string, newText: string) => {
    const oldSegment = transcript.segments.find((s) => s.id === segmentId);
    if (!oldSegment || oldSegment.text === newText) return;
    pushUndo('Edit segment text');
    const newSegments = transcript.segments.map((s) =>
    s.id === segmentId ?
    {
      ...s,
      text: newText
    } :
    s
    );
    updateTranscript(transcript.id, {
      segments: newSegments
    });
    autoSave('Edit segment text');
  };
  const handleMergeSegments = (firstId: string, secondId: string) => {
    const firstIdx = transcript.segments.findIndex((s) => s.id === firstId);
    const secondIdx = transcript.segments.findIndex((s) => s.id === secondId);
    if (firstIdx === -1 || secondIdx === -1) return;
    const first = transcript.segments[firstIdx];
    const second = transcript.segments[secondIdx];
    pushUndo('Merge sections');
    const merged: TranscriptSegment = {
      id: first.id,
      startTime: first.startTime,
      endTime: second.endTime,
      speaker: first.speaker,
      text: `${first.text} ${second.text}`
    };
    const newSegments = [...transcript.segments];
    newSegments.splice(firstIdx, 2, merged);
    updateTranscript(transcript.id, {
      segments: newSegments
    });
    autoSave('Merge sections');
    toast.success('Sections merged');
  };
  const handleSplitSegment = (segmentId: string, splitPosition: number) => {
    const idx = transcript.segments.findIndex((s) => s.id === segmentId);
    if (idx === -1) return;
    const segment = transcript.segments[idx];
    if (splitPosition <= 0 || splitPosition >= segment.text.length) return;
    pushUndo('Split section');
    const firstText = segment.text.slice(0, splitPosition).trim();
    const secondText = segment.text.slice(splitPosition).trim();
    const midTime =
    segment.startTime + (segment.endTime - segment.startTime) / 2;
    const firstHalf: TranscriptSegment = {
      id: segment.id,
      startTime: segment.startTime,
      endTime: midTime,
      speaker: segment.speaker,
      text: firstText
    };
    const secondHalf: TranscriptSegment = {
      id: `${segment.id}-split-${Date.now()}`,
      startTime: midTime,
      endTime: segment.endTime,
      speaker: segment.speaker,
      text: secondText
    };
    const newSegments = [...transcript.segments];
    newSegments.splice(idx, 1, firstHalf, secondHalf);
    updateTranscript(transcript.id, {
      segments: newSegments
    });
    autoSave('Split section');
    toast.success('Section split');
  };
  const segmentSpeakers = Array.from(
    new Set(transcript.segments.map((s) => s.speaker))
  );
  const uniqueSpeakers = Array.from(
    new Set([...segmentSpeakers, ...customSpeakers])
  );
  const handleAddSpeaker = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (uniqueSpeakers.includes(trimmed)) {
      return;
    }
    setCustomSpeakers(prev => [...prev, trimmed]);
  };

  const handleRemoveSpeaker = (speaker: string) => {
    const isUsedInSegments = segmentSpeakers.includes(speaker);
    if (isUsedInSegments) {
      setMergingSpeaker(speaker);
      setColorPickerSpeaker(null);
      setEditingSpeaker(null);
      return;
    }
    setCustomSpeakers(prev => prev.filter(s => s !== speaker));
    setSpeakerColors(prev => {
      const next = { ...prev };
      delete next[speaker];
      return next;
    });
    toast.success(`Removed speaker "${speaker}"`);
  };

  const handleMergeSpeaker = async (fromSpeaker: string, toSpeaker: string) => {
    if (!id || !fromSpeaker || !toSpeaker || fromSpeaker === toSpeaker) return;
    setMergeLoading(true);
    try {
      const result = await api.transcripts.mergeSpeaker(id, fromSpeaker, toSpeaker);
      await refreshData();
      setMergingSpeaker(null);
      setSpeakerColors(prev => {
        const next = { ...prev };
        delete next[fromSpeaker];
        return next;
      });
      setCustomSpeakers(prev => prev.filter(s => s !== fromSpeaker));
      toast.success(`Merged "${fromSpeaker}" into "${toSpeaker}" (${result.mergedCount} segments)`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to merge speaker');
    } finally {
      setMergeLoading(false);
    }
  };

  const handleRenameSpeaker = (oldName: string, newName: string) => {
    if (!newName.trim() || newName.trim() === oldName) {
      setEditingSpeaker(null);
      return;
    }
    const trimmed = newName.trim();
    if (uniqueSpeakers.includes(trimmed)) {
      toast.error(`Speaker "${trimmed}" already exists`);
      return;
    }
    pushUndo(`Rename speaker "${oldName}"`);
    const newSegments = transcript.segments.map((s) =>
      s.speaker === oldName ? { ...s, speaker: trimmed } : s
    );
    updateTranscript(transcript.id, { segments: newSegments });
    setCustomSpeakers(prev => prev.map(s => s === oldName ? trimmed : s));
    setSpeakerColors(prev => {
      if (prev[oldName]) {
        const next = { ...prev, [trimmed]: prev[oldName] };
        delete next[oldName];
        return next;
      }
      return prev;
    });
    setEditingSpeaker(null);
    autoSave(`Rename speaker "${oldName}"`);
    toast.success(`Renamed "${oldName}" to "${trimmed}"`);
  };

  const handleChangeSpeakerColor = (speaker: string, colorName: string) => {
    setSpeakerColors(prev => ({ ...prev, [speaker]: colorName }));
    setColorPickerSpeaker(null);
  };

  const handleChangeSegmentSpeaker = (segmentId: string, newSpeaker: string) => {
    const segment = transcript.segments.find((s) => s.id === segmentId);
    if (!segment || segment.speaker === newSpeaker) return;
    pushUndo(`Change speaker for segment`);
    const newSegments = transcript.segments.map((s) =>
      s.id === segmentId ? { ...s, speaker: newSpeaker } : s
    );
    updateTranscript(transcript.id, { segments: newSegments });
    autoSave('Change speaker');
    toast.success(`Changed speaker to "${newSpeaker}"`);
  };

  const getSpeakerDotColor = (speaker: string) => {
    return getSpeakerColorObj(speaker, speakerColors).bg;
  };

  const getSpeakerBorderColor = (speaker: string) => {
    return getSpeakerColorObj(speaker, speakerColors).border;
  };
  const handleSelectAgent = async (agentId: string, subTypeId: string) => {
    if (!transcript) return;
    setLoadingAgentId(agentId);
    setStreamingContent('');
    setStreamingAgentType(agentId);
    setIsStreaming(true);
    setShowSummarizeModal(false);
    setShowSummaryPanel(true);
    setShowHistory(false);

    try {
      const response = await api.transcripts.summarize(transcript.id, agentId, subTypeId);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Summary failed');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                setStreamingContent(prev => prev + data.content);
              }
              if (data.done && data.summary) {
                setSummaries(prev => [data.summary, ...prev]);
              }
              if (data.error) {
                toast.error(data.error);
              }
            } catch {}
          }
        }
      }

      toast.success('Summary generated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate summary');
    } finally {
      setLoadingAgentId(null);
      setIsStreaming(false);
      setStreamingAgentType(null);
      setStreamingContent('');
    }
  };

  const agentNames: Record<string, string> = {};
  agents.forEach(a => { agentNames[a.id] = a.name; });

  const handleRevertVersion = (versionId: string) => {
    const version = versions.find((v) => v.id === versionId);
    if (version) {
      pushUndo('Revert to version');
      updateTranscript(transcript.id, {
        segments: version.segments
      });
      autoSave('Revert to version');
      toast.success('Reverted to previous version');
      setShowHistory(false);
    }
  };
  const isProcessing =
  transcript.status === 'processing' || transcript.status === 'pending';
  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-slate-950 relative overflow-hidden">
      {/* Top Bar */}
      <header className="flex-shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 z-10">
        <div className="px-3 sm:px-6 py-2 sm:py-2.5 flex items-center gap-2 sm:gap-4">
          <Link
            to="/app"
            className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors flex-shrink-0">
            <ChevronLeftIcon className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <MetadataEditor
              transcript={transcript}
              onUpdate={(updates) => updateTranscript(transcript.id, updates)} />
            <div className="hidden sm:block flex-shrink-0">
              <StatusBadge status={transcript.status} />
            </div>
          </div>
        </div>
        <div className="flex items-center px-3 sm:px-6 pb-2 overflow-x-auto no-scrollbar">
          <TranscriptToolbar
            transcriptId={transcript.id}
            onToggleHistory={() => setShowHistory(!showHistory)}
            onSave={handleSave}
            onUndo={handleUndo}
            canUndo={undoStack.length > 0}
            sidebarHidden={sidebarHidden}
            onToggleSidebar={() => setSidebarHidden(!sidebarHidden)}
            onAISummarize={() => setShowSummarizeModal(true)}
            onShowPipeline={() => setShowPipeline(true)}
            hasPipelineIssue={!!(transcript.pipelineLog && (
              transcript.pipelineLog.whisper?.status === 'error' ||
              transcript.pipelineLog.diarization?.status === 'error' ||
              transcript.pipelineLog.refinement?.status === 'error' ||
              transcript.pipelineLog.fatalError
            ))}
            onShowSummaries={() => setShowSummaryPanel(true)}
            summaryCount={summaries.length} />
        </div>
      </header>

      {/* Speaker Bar */}
      {!isProcessing && transcript.segments.length > 0 &&
      <div className="flex-shrink-0 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/50 px-3 sm:px-6 py-2 sm:py-2.5">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar flex-nowrap">
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mr-1 flex-shrink-0">
              Speakers
            </span>
            {uniqueSpeakers.map((speaker) => {
              const isEditing = editingSpeaker === speaker;
              return isEditing ? (
                <span key={speaker} className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-indigo-400 dark:border-indigo-600 rounded-full pl-2.5 pr-1 py-0.5 flex-shrink-0">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${getSpeakerDotColor(speaker)}`} />
                  <input
                    type="text"
                    value={speakerEditValue}
                    onChange={(e) => setSpeakerEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameSpeaker(speaker, speakerEditValue);
                      if (e.key === 'Escape') setEditingSpeaker(null);
                    }}
                    className="w-28 text-base sm:text-xs font-medium text-slate-800 dark:text-slate-200 bg-transparent border-none focus:outline-none py-0.5"
                    autoFocus
                  />
                  <button
                    onClick={() => handleRenameSpeaker(speaker, speakerEditValue)}
                    className="p-0.5 text-emerald-600 hover:text-emerald-700 rounded-full transition-colors"
                    title="Save"
                  >
                    <CheckIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setEditingSpeaker(null)}
                    className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-full transition-colors"
                    title="Cancel"
                  >
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                </span>
              ) : (
                <button
                  key={speaker}
                  onClick={() => { setEditingSpeaker(speaker); setSpeakerEditValue(speaker); }}
                  className="flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap flex-shrink-0 hover:border-indigo-400 dark:hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
                  title="Click to rename">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${getSpeakerDotColor(speaker)}`} />
                  {speaker}
                </button>
              );
            })}
            <div className="relative flex-shrink-0">
              <button
                onClick={() => {
                  setShowSpeakerManager(!showSpeakerManager);
                  setEditingSpeaker(null);
                  setColorPickerSpeaker(null);
                  setMergingSpeaker(null);
                }}
                className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-600 rounded-full px-2.5 py-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:border-indigo-400 dark:hover:border-indigo-600 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors whitespace-nowrap"
                title="Manage speakers">
                <UsersIcon className="h-3 w-3" />
                <span className="hidden sm:inline">Manage</span>
              </button>

              {showSpeakerManager &&
                <div
                  ref={speakerManagerRef}
                  className="fixed inset-x-0 bottom-0 sm:absolute sm:inset-auto sm:left-0 sm:top-full sm:mt-2 bg-white dark:bg-slate-800 border-t sm:border border-slate-200 dark:border-slate-700 rounded-t-2xl sm:rounded-xl shadow-xl z-40 sm:w-80 max-h-[70vh] sm:max-h-none"
                >
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Manage Speakers</h3>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Rename, recolor, add or remove speakers</p>
                    </div>
                    <button
                      onClick={() => {
                        setShowSpeakerManager(false);
                        setEditingSpeaker(null);
                        setColorPickerSpeaker(null);
                      }}
                      className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors flex-shrink-0 -mr-1"
                    >
                      <XIcon className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="max-h-64 overflow-y-auto py-1">
                    {uniqueSpeakers.map((speaker) => {
                      const colorObj = getSpeakerColorObj(speaker, speakerColors);
                      const isEditing = editingSpeaker === speaker;
                      const isColorPicking = colorPickerSpeaker === speaker;
                      const hasSegments = segmentSpeakers.includes(speaker);
                      const isMerging = mergingSpeaker === speaker;
                      return (
                        <div key={speaker} className="px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-750">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setColorPickerSpeaker(isColorPicking ? null : speaker)}
                              className="flex-shrink-0 p-0.5 rounded-full hover:ring-2 hover:ring-indigo-300 transition-all"
                              title="Change color"
                            >
                              <div className={`w-3.5 h-3.5 rounded-full ${colorObj.bg}`} />
                            </button>
                            {isEditing ?
                              <div className="flex-1 flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={speakerEditValue}
                                  onChange={(e) => setSpeakerEditValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleRenameSpeaker(speaker, speakerEditValue);
                                    if (e.key === 'Escape') setEditingSpeaker(null);
                                  }}
                                  className="flex-1 text-base sm:text-sm text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-700 border border-indigo-300 dark:border-indigo-600 rounded-lg px-2 py-1.5 sm:py-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleRenameSpeaker(speaker, speakerEditValue)}
                                  className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 active:bg-emerald-800 transition-colors flex-shrink-0"
                                  aria-label="Save"
                                >
                                  <CheckIcon className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => setEditingSpeaker(null)}
                                  className="p-1.5 bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-500 active:bg-slate-400 transition-colors flex-shrink-0"
                                  aria-label="Cancel"
                                >
                                  <XIcon className="h-3.5 w-3.5" />
                                </button>
                              </div> :
                              <>
                                <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-300">{speaker}</span>
                                <button
                                  onClick={() => {
                                    setEditingSpeaker(speaker);
                                    setSpeakerEditValue(speaker);
                                    setColorPickerSpeaker(null);
                                    setMergingSpeaker(null);
                                  }}
                                  className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded transition-colors"
                                  title="Rename"
                                >
                                  <EditIcon className="h-3.5 w-3.5" />
                                </button>
                                {hasSegments ?
                                  <button
                                    onClick={() => handleRemoveSpeaker(speaker)}
                                    className="p-1 text-slate-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/30 rounded transition-colors"
                                    title="Merge into another speaker"
                                  >
                                    <MergeIcon className="h-3.5 w-3.5" />
                                  </button> :
                                  <button
                                    onClick={() => handleRemoveSpeaker(speaker)}
                                    className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded transition-colors"
                                    title="Remove speaker"
                                  >
                                    <Trash2Icon className="h-3.5 w-3.5" />
                                  </button>
                                }
                              </>
                            }
                          </div>
                          {isColorPicking &&
                            <div className="flex flex-wrap gap-1.5 mt-2 ml-6">
                              {SPEAKER_COLOR_OPTIONS.map((c) => (
                                <button
                                  key={c.name}
                                  onClick={() => handleChangeSpeakerColor(speaker, c.name)}
                                  className={`w-5 h-5 rounded-full ${c.bg} transition-transform hover:scale-125 ${colorObj.name === c.name ? 'ring-2 ring-offset-1 ring-slate-400 dark:ring-offset-slate-800' : ''}`}
                                  title={c.name}
                                />
                              ))}
                            </div>
                          }
                          {isMerging &&
                            <div className="mt-2 ml-6 p-2 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                              <p className="text-xs text-orange-700 dark:text-orange-400 mb-2">Merge all segments from "{speaker}" into:</p>
                              <div className="flex flex-col gap-1">
                                {uniqueSpeakers.filter(s => s !== speaker).map(target => (
                                  <button
                                    key={target}
                                    onClick={() => handleMergeSpeaker(speaker, target)}
                                    disabled={mergeLoading}
                                    className="flex items-center gap-2 px-2 py-1.5 text-left text-sm rounded-md hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors disabled:opacity-50"
                                  >
                                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${getSpeakerColorObj(target, speakerColors).bg}`} />
                                    <span className="text-slate-700 dark:text-slate-300">{target}</span>
                                  </button>
                                ))}
                              </div>
                              <button
                                onClick={() => setMergingSpeaker(null)}
                                className="mt-2 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-400"
                              >
                                Cancel
                              </button>
                            </div>
                          }
                        </div>
                      );
                    })}
                  </div>
                  <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-700">
                    {editingSpeaker === '__new__' ?
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={speakerEditValue}
                          onChange={(e) => setSpeakerEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleAddSpeaker(speakerEditValue);
                              setEditingSpeaker(null);
                              setSpeakerEditValue('');
                            }
                            if (e.key === 'Escape') {
                              setEditingSpeaker(null);
                              setSpeakerEditValue('');
                            }
                          }}
                          placeholder="New speaker name"
                          className="flex-1 text-base sm:text-sm text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-700 border border-emerald-300 dark:border-emerald-600 rounded-lg px-3 py-2 sm:py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-slate-400"
                          autoFocus
                        />
                        <button
                          onClick={() => {
                            handleAddSpeaker(speakerEditValue);
                            setEditingSpeaker(null);
                            setSpeakerEditValue('');
                          }}
                          className="p-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 active:bg-emerald-800 transition-colors flex-shrink-0"
                          aria-label="Add speaker"
                        >
                          <CheckIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => { setEditingSpeaker(null); setSpeakerEditValue(''); }}
                          className="p-2 bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-500 active:bg-slate-400 transition-colors flex-shrink-0"
                          aria-label="Cancel"
                        >
                          <XIcon className="h-4 w-4" />
                        </button>
                      </div> :
                      <button
                        onClick={() => {
                          setEditingSpeaker('__new__');
                          setSpeakerEditValue('');
                          setColorPickerSpeaker(null);
                        }}
                        className="flex items-center gap-1.5 w-full text-sm text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 py-1 transition-colors"
                      >
                        <PlusIcon className="h-3.5 w-3.5" />
                        Add Speaker
                      </button>
                    }
                  </div>
                </div>
              }
            </div>
          </div>
        </div>
      }

      {/* Mobile video/transcript toggle for video types */}
      {!isProcessing && transcript.type === 'video' &&
      <div className="md:hidden flex-shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex">
            <button
            onClick={() => setMobileShowVideo(false)}
            className={`flex-1 py-2.5 text-xs font-semibold text-center transition-colors ${!mobileShowVideo ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>

              Transcript
            </button>
            <button
            onClick={() => setMobileShowVideo(true)}
            className={`flex-1 py-2.5 text-xs font-semibold text-center transition-colors ${mobileShowVideo ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>

              Video
            </button>
          </div>
        </div>
      }

      {/* Main Content Area */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden relative">
        {isProcessing ?
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950">
            <div className="animate-pulse flex flex-col items-center">
              <div className="h-12 w-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mb-4">
                <div className="h-6 w-6 border-4 border-indigo-600 dark:border-indigo-400 border-t-transparent rounded-full animate-spin" />
              </div>
              <h3 className="text-lg font-medium text-slate-900 dark:text-white">
                Processing Transcript...
              </h3>
              <p className="text-slate-500 dark:text-slate-400 mt-2">
                This happens securely in the background.
              </p>
            </div>
          </div> :

        <>
            {/* Desktop layout */}
            <div className="hidden md:flex flex-1 h-full">
              {/* Transcript Text Column */}
              <div
              className="flex flex-col h-full border-r border-slate-200 dark:border-slate-800"
              style={{
                width:
                transcript.type === 'video' ?
                `${transcriptWidthPercent}%` :
                '100%'
              }}>

                <TranscriptText
                segments={transcript.segments}
                currentTime={currentTime}
                isPlaying={isPlaying}
                onSeek={seek}
                onUpdateSegment={handleUpdateSegment}
                onMergeSegments={handleMergeSegments}
                onSplitSegment={handleSplitSegment}
                allSpeakers={uniqueSpeakers}
                onChangeSegmentSpeaker={handleChangeSegmentSpeaker}
                speakerColors={speakerColors}
                onAddSpeakerFromDropdown={(segmentId, name) => {
                  if (!uniqueSpeakers.includes(name)) {
                    setCustomSpeakers(prev => [...prev, name]);
                  }
                  handleChangeSegmentSpeaker(segmentId, name);
                }} />

              </div>

              {/* Draggable Resize Handle */}
              {transcript.type === 'video' &&
            <div
              onMouseDown={handleMouseDown}
              className="w-1.5 flex-shrink-0 cursor-col-resize bg-slate-200 dark:bg-slate-700 hover:bg-indigo-400 active:bg-indigo-500 transition-colors relative group z-10"
              title="Drag to resize">

                  <div className="absolute inset-y-0 -left-1 -right-1" />
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-slate-400 dark:bg-slate-500 group-hover:bg-white transition-colors" />
                </div>
            }

              {/* Video Player Column */}
              {transcript.type === 'video' &&
            <div
              className="bg-slate-50 dark:bg-slate-900 p-6 flex flex-col overflow-y-auto"
              style={{
                width: `${100 - transcriptWidthPercent}%`
              }}>

                  <div className="sticky top-6">
                    <VideoPlayer
                  isPlaying={isPlaying}
                  currentTime={currentTime}
                  duration={transcript.duration}
                  onTogglePlay={togglePlayPause}
                  onSeek={seek}
                  mediaUrl={mediaUrl} />

                    <div className="mt-6 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                        File Details
                      </h4>
                      <dl className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <dt className="text-slate-500 dark:text-slate-400">
                            Format
                          </dt>
                          <dd className="font-medium text-slate-900 dark:text-white">
                            MP4 Video
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-slate-500 dark:text-slate-400">
                            Resolution
                          </dt>
                          <dd className="font-medium text-slate-900 dark:text-white">
                            1080p
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-slate-500 dark:text-slate-400">
                            Audio Channels
                          </dt>
                          <dd className="font-medium text-slate-900 dark:text-white">
                            Stereo
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                </div>
            }
            </div>

            {/* Mobile layout */}
            <div className="flex md:hidden flex-1 h-full">
              {transcript.type === 'video' && mobileShowVideo ?
            <div className="flex-1 bg-slate-50 dark:bg-slate-900 p-4 overflow-y-auto">
                  <VideoPlayer
                isPlaying={isPlaying}
                currentTime={currentTime}
                duration={transcript.duration}
                onTogglePlay={togglePlayPause}
                onSeek={seek}
                mediaUrl={mediaUrl} />

                </div> :

            <div className="flex-1 flex flex-col h-full">
                  <TranscriptText
                segments={transcript.segments}
                currentTime={currentTime}
                isPlaying={isPlaying}
                onSeek={seek}
                onUpdateSegment={handleUpdateSegment}
                onMergeSegments={handleMergeSegments}
                onSplitSegment={handleSplitSegment}
                allSpeakers={uniqueSpeakers}
                onChangeSegmentSpeaker={handleChangeSegmentSpeaker}
                speakerColors={speakerColors}
                onAddSpeakerFromDropdown={(segmentId, name) => {
                  if (!uniqueSpeakers.includes(name)) {
                    setCustomSpeakers(prev => [...prev, name]);
                  }
                  handleChangeSegmentSpeaker(segmentId, name);
                }} />

                </div>
            }
            </div>
          </>
        }

        <AnimatePresence>
          {showHistory &&
          <VersionHistory
            versions={versions}
            onClose={() => setShowHistory(false)}
            onRevert={handleRevertVersion} />

          }
        </AnimatePresence>

        <AnimatePresence>
          {showSummaryPanel &&
          <AISummaryPanel
            summaries={summaries}
            streamingContent={streamingContent}
            streamingAgentType={streamingAgentType}
            isStreaming={isStreaming}
            onClose={() => setShowSummaryPanel(false)}
            agentNames={agentNames}
            onGenerateNew={() => {
              setShowSummaryPanel(false);
              setShowSummarizeModal(true);
            }} />

          }
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showSummarizeModal &&
        <AISummarizeModal
          agents={agents}
          onSelectAgent={handleSelectAgent}
          onClose={() => setShowSummarizeModal(false)}
          loadingAgentId={loadingAgentId} />

        }
      </AnimatePresence>

      {showPipeline &&
      <PipelineSummary
        pipelineLog={transcript.pipelineLog}
        transcriptStatus={transcript.status}
        errorMessage={transcript.errorMessage}
        transcriptId={transcript.id}
        onClose={() => setShowPipeline(false)}
        onRetranscribeStarted={() => refreshData()} />

      }

      {!isProcessing &&
      <AudioPlayer
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={transcript.duration}
        playbackRate={playbackRate}
        onTogglePlay={togglePlayPause}
        onSkip={skip}
        onSeek={seek}
        onRateChange={setPlaybackRate} />

      }
    </div>);

}