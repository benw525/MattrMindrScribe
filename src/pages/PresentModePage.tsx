import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { XIcon, PlayIcon, PauseIcon } from 'lucide-react';
import { useTranscripts } from '../hooks/useTranscripts';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { Transcript } from '../types/transcript';
import { api } from '../utils/api';
import { formatDuration } from '../utils/formatters';
export function PresentModePage() {
  const { id } = useParams<{
    id: string;
  }>();
  const navigate = useNavigate();
  const { transcripts } = useTranscripts();
  const containerRef = useRef<HTMLDivElement>(null);
  const [directTranscript, setDirectTranscript] = useState<Transcript | null>(null);
  const [directFetchedId, setDirectFetchedId] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const contextTranscript = transcripts.find((t) => t.id === id);
  const transcript = contextTranscript || (directTranscript && directTranscript.id === id ? directTranscript : null);

  useEffect(() => {
    if (!id || contextTranscript || directFetchedId === id) return;
    setDirectFetchedId(id);
    setFetchError(false);
    api.transcripts.get(id)
      .then((t: Transcript) => setDirectTranscript(t))
      .catch(() => setFetchError(true));
  }, [id, contextTranscript, directFetchedId]);

  const {
    isPlaying,
    currentTime,
    playbackRate,
    rewindSpeed,
    fastForwardSpeed,
    togglePlayPause,
    toggleRewind,
    toggleFastForward,
    skip,
    seek,
    setPlaybackRate,
  } = useAudioPlayer(
    transcript?.duration || 0,
    transcript?.fileUrl,
    transcript?.type
  );
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        navigate(`/app/transcript/${id}`, { state: { resumeTime: currentTimeRef.current } });
      } else if (e.key === ' ') {
        e.preventDefault();
        togglePlayPause();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        skip(-5);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        skip(5);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [id, navigate, togglePlayPause, skip]);

  useEffect(() => {
    if (!isPlaying || !containerRef.current) return;
    const activeElement = containerRef.current.querySelector(
      '[data-active="true"]'
    );
    if (activeElement) {
      activeElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, [currentTime, isPlaying]);

  const progressPercent = (transcript?.duration || 0) > 0
    ? (currentTime / (transcript?.duration || 1)) * 100
    : 0;

  if (fetchError) {
    return (
      <div className="fixed inset-0 bg-white dark:bg-slate-950 z-50 flex flex-col items-center justify-center gap-4">
        <div className="text-red-500 dark:text-red-400 text-lg">Failed to load transcript</div>
        <button
          onClick={() => navigate(`/app`)}
          className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  if (!transcript) {
    return (
      <div className="fixed inset-0 bg-white dark:bg-slate-950 z-50 flex items-center justify-center">
        <div className="text-slate-400 dark:text-slate-500 text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-200 z-50 flex flex-col h-dvh overflow-hidden font-sans">
      <div className="flex items-center justify-between p-4 sm:p-6 bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm absolute top-0 left-0 right-0 z-10">
        <div className="flex items-center gap-4">
          <button
            onClick={togglePlayPause}
            className="h-12 w-12 rounded-full bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-500 transition-colors">
            {isPlaying ?
            <PauseIcon className="h-6 w-6" /> :
            <PlayIcon className="h-6 w-6 ml-1" />
            }
          </button>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
              {transcript.filename}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {formatDuration(currentTime)} / {formatDuration(transcript.duration)}
              <span className="ml-2 text-xs bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded">{playbackRate}x</span>
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate(`/app/transcript/${id}`, { state: { resumeTime: currentTimeRef.current } })}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-900 dark:text-white transition-colors">
          <XIcon className="h-5 w-5" />
          Exit (Esc)
        </button>
      </div>

      <div className="absolute top-[76px] sm:top-[84px] left-0 right-0 z-10">
        <div
          className="h-1 bg-slate-200 dark:bg-slate-700 cursor-pointer relative group"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            seek(percent * (transcript?.duration || 0));
          }}
        >
          <div
            className="absolute top-0 left-0 h-full bg-indigo-600 dark:bg-indigo-500 transition-[width] duration-75"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto pt-28 sm:pt-32 pb-32 px-8 md:px-24 lg:px-48 scroll-smooth">
        <div className="max-w-4xl mx-auto space-y-12">
          {transcript.segments.map((segment) => {
            const isActive =
            currentTime >= segment.startTime && currentTime < segment.endTime;
            return (
              <div
                key={segment.id}
                data-active={isActive}
                className={`transition-all duration-500 cursor-pointer ${isActive ? 'opacity-100 scale-100' : 'opacity-40 scale-95'}`}
                onClick={() => seek(segment.startTime)}>
                <div className="flex items-baseline gap-4 mb-2">
                  <span
                    className={`text-lg font-bold tracking-wider ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`}>
                    {segment.speaker}
                  </span>
                  <span className="text-xs text-slate-400 dark:text-slate-600 tabular-nums">
                    {formatDuration(segment.startTime)}
                  </span>
                </div>
                <p
                  className={`text-3xl md:text-4xl leading-relaxed font-medium ${isActive ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-300'}`}>
                  {segment.text}
                </p>
              </div>);
          })}
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white dark:from-slate-950 to-transparent pointer-events-none" />
    </div>);
}