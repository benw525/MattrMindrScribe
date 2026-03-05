import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  useParams,
  useNavigate,
  Link,
  useOutletContext } from
'react-router-dom';
import { ChevronLeftIcon, EditIcon, CheckIcon, XIcon } from 'lucide-react';
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
import { TranscriptSegment } from '../types/transcript';
interface UndoEntry {
  segments: TranscriptSegment[];
  description: string;
}
export function TranscriptViewerPage() {
  const { id } = useParams<{
    id: string;
  }>();
  const navigate = useNavigate();
  const { transcripts, updateTranscript } = useTranscripts();
  const { sidebarHidden, setSidebarHidden } = useOutletContext<{
    selectedFolderId: string | null;
    sidebarHidden: boolean;
    setSidebarHidden: (v: boolean) => void;
  }>();
  const [showHistory, setShowHistory] = useState(false);
  const [isSuggestingName, setIsSuggestingName] = useState(false);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [transcriptWidthPercent, setTranscriptWidthPercent] = useState(66);
  const isDraggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [speakerEditValue, setSpeakerEditValue] = useState('');
  // Mobile: toggle between transcript and video
  const [mobileShowVideo, setMobileShowVideo] = useState(false);
  const transcript = transcripts.find((t) => t.id === id);
  const {
    isPlaying,
    currentTime,
    playbackRate,
    togglePlayPause,
    skip,
    seek,
    setPlaybackRate
  } = useAudioPlayer(transcript?.duration || 0);
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
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
          Transcript not found
        </h2>
        <button
          onClick={() => navigate('/')}
          className="text-indigo-600 dark:text-indigo-400 hover:underline">

          Return to Dashboard
        </button>
      </div>);

  }
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
    toast.success(`Undone: ${last.description}`);
  };
  const handleSave = () => {
    const newVersion = {
      id: `v-${Date.now()}`,
      createdAt: new Date().toISOString(),
      segments: [...transcript.segments],
      changeDescription: 'Manual save'
    };
    updateTranscript(transcript.id, {
      versions: [newVersion, ...transcript.versions]
    });
    setUndoStack([]);
    toast.success('Transcript saved');
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
    toast.success('Section split');
  };
  const uniqueSpeakers = Array.from(
    new Set(transcript.segments.map((s) => s.speaker))
  );
  const handleRenameSpeaker = (oldName: string, newName: string) => {
    if (!newName.trim() || newName.trim() === oldName) {
      setEditingSpeaker(null);
      return;
    }
    pushUndo(`Rename speaker "${oldName}"`);
    const newSegments = transcript.segments.map((s) =>
    s.speaker === oldName ?
    {
      ...s,
      speaker: newName.trim()
    } :
    s
    );
    updateTranscript(transcript.id, {
      segments: newSegments
    });
    setEditingSpeaker(null);
    toast.success(`Renamed "${oldName}" to "${newName.trim()}"`);
  };
  const getSpeakerDotColor = (speaker: string) => {
    const colors = [
    'bg-blue-500',
    'bg-purple-500',
    'bg-emerald-500',
    'bg-amber-500',
    'bg-rose-500'];

    let hash = 0;
    for (let i = 0; i < speaker.length; i++) {
      hash = speaker.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };
  const handleSuggestName = () => {
    setIsSuggestingName(true);
    setTimeout(() => {
      const suggestedName = `AI Suggested: ${transcript.type === 'video' ? 'Deposition' : 'Call'} Summary`;
      updateTranscript(transcript.id, {
        filename: suggestedName
      });
      setIsSuggestingName(false);
      toast.success('Name updated based on content');
    }, 1500);
  };
  const handleRevertVersion = (versionId: string) => {
    const version = transcript.versions.find((v) => v.id === versionId);
    if (version) {
      pushUndo('Revert to version');
      updateTranscript(transcript.id, {
        segments: version.segments
      });
      toast.success('Reverted to previous version');
      setShowHistory(false);
    }
  };
  const isProcessing =
  transcript.status === 'processing' || transcript.status === 'pending';
  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-slate-950 relative overflow-hidden">
      {/* Top Bar */}
      <header className="flex-shrink-0 border-b border-slate-200 dark:border-slate-800 px-3 sm:px-6 py-2 sm:py-3 flex items-center justify-between bg-white dark:bg-slate-900 z-10 gap-2">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <Link
            to="/"
            className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors flex-shrink-0">

            <ChevronLeftIcon className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <MetadataEditor
              transcript={transcript}
              onUpdate={(updates) => updateTranscript(transcript.id, updates)} />

            <div className="hidden sm:block">
              <StatusBadge status={transcript.status} />
            </div>
          </div>
        </div>

        <div className="hidden md:flex">
          <TranscriptToolbar
            transcriptId={transcript.id}
            onToggleHistory={() => setShowHistory(!showHistory)}
            onSuggestName={handleSuggestName}
            isSuggesting={isSuggestingName}
            onSave={handleSave}
            onUndo={handleUndo}
            canUndo={undoStack.length > 0}
            sidebarHidden={sidebarHidden}
            onToggleSidebar={() => setSidebarHidden(!sidebarHidden)} />

        </div>
        {/* Mobile: compact toolbar */}
        <div className="flex md:hidden items-center gap-1">
          <TranscriptToolbar
            transcriptId={transcript.id}
            onToggleHistory={() => setShowHistory(!showHistory)}
            onSuggestName={handleSuggestName}
            isSuggesting={isSuggestingName}
            onSave={handleSave}
            onUndo={handleUndo}
            canUndo={undoStack.length > 0}
            sidebarHidden={sidebarHidden}
            onToggleSidebar={() => setSidebarHidden(!sidebarHidden)} />

        </div>
      </header>

      {/* Speaker Bar */}
      {!isProcessing && transcript.segments.length > 0 &&
      <div className="flex-shrink-0 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/50 px-3 sm:px-6 py-2 sm:py-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mr-1">
              Speakers
            </span>
            {uniqueSpeakers.map((speaker) =>
          <div key={speaker} className="flex items-center">
                {editingSpeaker === speaker ?
            <div className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-700 rounded-full px-2 py-0.5 shadow-sm">
                    <div
                className={`w-2 h-2 rounded-full ${getSpeakerDotColor(speaker)}`} />

                    <input
                type="text"
                value={speakerEditValue}
                onChange={(e) => setSpeakerEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter')
                  handleRenameSpeaker(speaker, speakerEditValue);
                  if (e.key === 'Escape') setEditingSpeaker(null);
                }}
                className="text-xs font-medium text-slate-800 dark:text-slate-200 bg-transparent focus:outline-none w-28 sm:w-32"
                autoFocus />

                    <button
                onClick={() =>
                handleRenameSpeaker(speaker, speakerEditValue)
                }
                className="p-0.5 text-emerald-600 hover:text-emerald-700">

                      <CheckIcon className="h-3 w-3" />
                    </button>
                    <button
                onClick={() => setEditingSpeaker(null)}
                className="p-0.5 text-slate-400 hover:text-slate-600">

                      <XIcon className="h-3 w-3" />
                    </button>
                  </div> :

            <button
              onClick={() => {
                setEditingSpeaker(speaker);
                setSpeakerEditValue(speaker);
              }}
              className="flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:border-indigo-300 dark:hover:border-indigo-600 hover:text-indigo-700 dark:hover:text-indigo-400 transition-colors group"
              title="Click to rename speaker">

                    <div
                className={`w-2 h-2 rounded-full ${getSpeakerDotColor(speaker)}`} />

                    {speaker}
                    <EditIcon className="h-3 w-3 text-slate-300 dark:text-slate-600 group-hover:text-indigo-400 transition-colors" />
                  </button>
            }
              </div>
          )}
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
                onSeek={seek}
                onUpdateSegment={handleUpdateSegment}
                onMergeSegments={handleMergeSegments}
                onSplitSegment={handleSplitSegment} />

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
                  onSeek={seek} />

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
                onSeek={seek} />

                </div> :

            <div className="flex-1 flex flex-col h-full">
                  <TranscriptText
                segments={transcript.segments}
                currentTime={currentTime}
                onSeek={seek}
                onUpdateSegment={handleUpdateSegment}
                onMergeSegments={handleMergeSegments}
                onSplitSegment={handleSplitSegment} />

                </div>
            }
            </div>
          </>
        }

        <AnimatePresence>
          {showHistory &&
          <VersionHistory
            versions={transcript.versions}
            onClose={() => setShowHistory(false)}
            onRevert={handleRevertVersion} />

          }
        </AnimatePresence>
      </div>

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