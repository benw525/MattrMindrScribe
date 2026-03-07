import React, { useRef, useCallback, useState } from 'react';
import { PlayIcon, PauseIcon, Undo2Icon, Redo2Icon } from 'lucide-react';
import { formatDuration } from '../../utils/formatters';

interface AudioPlayerProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  onTogglePlay: () => void;
  onSkip: (seconds: number) => void;
  onSeek: (time: number) => void;
  onRateChange: (rate: number) => void;
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function AudioPlayer({
  isPlaying,
  currentTime,
  duration,
  playbackRate,
  onTogglePlay,
  onSkip,
  onSeek,
  onRateChange
}: AudioPlayerProps) {
  const progressPercent = duration > 0 ? currentTime / duration * 100 : 0;
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPercent, setDragPercent] = useState(0);

  const getPercentFromEvent = useCallback((clientX: number) => {
    if (!progressBarRef.current) return 0;
    const rect = progressBarRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const percent = getPercentFromEvent(e.clientX);
    setIsDragging(true);
    setDragPercent(percent * 100);
    onSeek(percent * duration);
  }, [duration, onSeek, getPercentFromEvent]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const percent = getPercentFromEvent(e.clientX);
    setDragPercent(percent * 100);
    onSeek(percent * duration);
  }, [isDragging, duration, onSeek, getPercentFromEvent]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const displayPercent = isDragging ? dragPercent : progressPercent;

  return (
    <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-3 sm:px-6 py-3 sm:py-4 flex flex-col gap-2 sm:gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] dark:shadow-none z-10">
      <div className="flex items-center gap-2 sm:gap-4">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 w-10 text-right tabular-nums">
          {formatDuration(isDragging ? (dragPercent / 100) * duration : currentTime)}
        </span>
        <div
          ref={progressBarRef}
          className="flex-1 relative cursor-pointer touch-none select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div className="h-6 flex items-center">
            <div className="w-full h-1.5 sm:h-2 bg-slate-200 dark:bg-slate-700 rounded-full relative">
              <div
                className="absolute top-0 left-0 h-full bg-indigo-600 dark:bg-indigo-500 rounded-full transition-[width] duration-75"
                style={{ width: `${displayPercent}%` }}
              />
            </div>
          </div>
          <div
            className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 sm:w-3.5 sm:h-3.5 bg-white border-2 border-indigo-600 dark:border-indigo-500 rounded-full shadow-md transition-opacity ${isDragging ? 'opacity-100 scale-110' : 'opacity-0 sm:group-hover:opacity-100'}`}
            style={{ left: `calc(${displayPercent}% - 8px)` }}
          />
        </div>
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 w-10 tabular-nums">
          {formatDuration(duration)}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-0.5 sm:gap-1">
          {SPEED_OPTIONS.map((speed) =>
            <button
              key={speed}
              onClick={() => onRateChange(speed)}
              className={`min-w-[36px] sm:min-w-[40px] py-1.5 text-xs font-medium rounded-md transition-colors text-center ${playbackRate === speed ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700'}`}
              aria-label={`Set playback speed to ${speed}x`}
            >
              {speed}x
            </button>
          )}
        </div>

        <div className="flex items-center gap-4 sm:gap-5">
          <button
            onClick={() => onSkip(-15)}
            className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white active:text-indigo-600 transition-colors rounded-full active:bg-indigo-50 dark:active:bg-indigo-950/30"
            aria-label="Skip back 15 seconds"
          >
            <Undo2Icon className="h-5 w-5" />
          </button>

          <button
            onClick={onTogglePlay}
            className="h-12 w-12 bg-indigo-600 text-white rounded-full flex items-center justify-center hover:bg-indigo-700 active:bg-indigo-800 active:scale-95 transition-all shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ?
              <PauseIcon className="h-6 w-6" /> :
              <PlayIcon className="h-6 w-6 ml-0.5" />
            }
          </button>

          <button
            onClick={() => onSkip(15)}
            className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white active:text-indigo-600 transition-colors rounded-full active:bg-indigo-50 dark:active:bg-indigo-950/30"
            aria-label="Skip forward 15 seconds"
          >
            <Redo2Icon className="h-5 w-5" />
          </button>
        </div>

        <div className="hidden sm:block w-[200px]" />
        <div className="block sm:hidden w-4" />
      </div>
    </div>
  );
}
