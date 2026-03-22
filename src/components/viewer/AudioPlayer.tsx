import React, { useRef, useCallback, useState } from 'react';
import { PlayIcon, PauseIcon, ChevronUpIcon, RewindIcon } from 'lucide-react';
import { formatDuration } from '../../utils/formatters';

interface AudioPlayerProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  rewindSpeed: number;
  onTogglePlay: () => void;
  onToggleRewind: () => void;
  onSkip: (seconds: number) => void;
  onSeek: (time: number) => void;
  onRateChange: (rate: number) => void;
}

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3];

export function AudioPlayer({
  isPlaying,
  currentTime,
  duration,
  playbackRate,
  rewindSpeed,
  onTogglePlay,
  onToggleRewind,
  onSkip,
  onSeek,
  onRateChange
}: AudioPlayerProps) {
  const progressPercent = duration > 0 ? currentTime / duration * 100 : 0;
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPercent, setDragPercent] = useState(0);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const speedMenuRef = useRef<HTMLDivElement>(null);

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

  const skipBtnClass = "relative p-1.5 sm:p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white active:text-indigo-600 transition-colors rounded-full active:bg-indigo-50 dark:active:bg-indigo-950/30 flex flex-col items-center justify-center";

  return (
    <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-3 sm:px-6 py-2 sm:py-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pb-3 flex flex-col gap-1.5 sm:gap-2 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] dark:shadow-none z-10 flex-shrink-0">
      <div className="flex items-center gap-2 sm:gap-4">
        <span className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 w-[46px] sm:w-10 text-right tabular-nums flex-shrink-0">
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
          <div className="h-8 sm:h-6 flex items-center">
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
        <span className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 w-[46px] sm:w-10 tabular-nums flex-shrink-0">
          {formatDuration(duration)}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <div className="relative sm:hidden flex-shrink-0" ref={speedMenuRef}>
          <button
            onClick={() => setShowSpeedMenu(!showSpeedMenu)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 active:bg-slate-200 dark:active:bg-slate-700 transition-colors"
          >
            {playbackRate}x
            <ChevronUpIcon className={`h-3 w-3 transition-transform ${showSpeedMenu ? '' : 'rotate-180'}`} />
          </button>
          {showSpeedMenu && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowSpeedMenu(false)} />
              <div className="absolute bottom-full left-0 mb-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-40 py-1 min-w-[100px]">
                {SPEED_OPTIONS.map((speed) => (
                  <button
                    key={speed}
                    onClick={() => {
                      onRateChange(speed);
                      setShowSpeedMenu(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm font-medium transition-colors ${
                      playbackRate === speed
                        ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                        : 'text-slate-700 dark:text-slate-300 active:bg-slate-100 dark:active:bg-slate-700'
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="hidden sm:flex items-center gap-1">
          {SPEED_OPTIONS.map((speed) =>
            <button
              key={speed}
              onClick={() => onRateChange(speed)}
              className={`min-w-[36px] py-1 text-xs font-medium rounded-md transition-colors text-center ${playbackRate === speed ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              aria-label={`Set playback speed to ${speed}x`}
            >
              {speed}x
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => onSkip(-30)}
            className={skipBtnClass}
            aria-label="Skip back 30 seconds"
          >
            <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.5 2v6h6" />
              <path d="M2.5 8a10 10 0 1 1 1.46 5" />
            </svg>
            <span className="text-[9px] sm:text-[10px] font-bold leading-none -mt-0.5">30</span>
          </button>

          <button
            onClick={() => onSkip(-10)}
            className={skipBtnClass}
            aria-label="Skip back 10 seconds"
          >
            <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.5 2v6h6" />
              <path d="M2.5 8a10 10 0 1 1 1.46 5" />
            </svg>
            <span className="text-[9px] sm:text-[10px] font-bold leading-none -mt-0.5">10</span>
          </button>

          <button
            onClick={() => onSkip(-5)}
            className={skipBtnClass}
            aria-label="Skip back 5 seconds"
          >
            <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.5 2v6h6" />
              <path d="M2.5 8a10 10 0 1 1 1.46 5" />
            </svg>
            <span className="text-[9px] sm:text-[10px] font-bold leading-none -mt-0.5">5</span>
          </button>

          <button
            onClick={onToggleRewind}
            className={`relative p-1.5 sm:p-2 rounded-full transition-colors ${
              rewindSpeed > 0
                ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white active:text-indigo-600 active:bg-indigo-50 dark:active:bg-indigo-950/30'
            }`}
            aria-label={rewindSpeed > 0 ? `Rewinding at ${rewindSpeed}x` : 'Rewind'}
          >
            <RewindIcon className="h-4 w-4 sm:h-5 sm:w-5" />
            {rewindSpeed > 0 && (
              <span className="absolute -top-1 -right-1 text-[9px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 rounded-full px-1">
                {rewindSpeed}x
              </span>
            )}
          </button>

          <button
            onClick={onTogglePlay}
            className="h-11 w-11 sm:h-12 sm:w-12 bg-indigo-600 text-white rounded-full flex items-center justify-center hover:bg-indigo-700 active:bg-indigo-800 active:scale-95 transition-all shadow-md focus:outline-none mx-1"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ?
              <PauseIcon className="h-5 w-5 sm:h-6 sm:w-6" /> :
              <PlayIcon className="h-5 w-5 sm:h-6 sm:w-6 ml-0.5" />
            }
          </button>

          <button
            onClick={() => onSkip(5)}
            className={skipBtnClass}
            aria-label="Skip forward 5 seconds"
          >
            <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6" />
              <path d="M21.5 8a10 10 0 1 0-1.46 5" />
            </svg>
            <span className="text-[9px] sm:text-[10px] font-bold leading-none -mt-0.5">5</span>
          </button>

          <button
            onClick={() => onSkip(10)}
            className={skipBtnClass}
            aria-label="Skip forward 10 seconds"
          >
            <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6" />
              <path d="M21.5 8a10 10 0 1 0-1.46 5" />
            </svg>
            <span className="text-[9px] sm:text-[10px] font-bold leading-none -mt-0.5">10</span>
          </button>

          <button
            onClick={() => onSkip(30)}
            className={skipBtnClass}
            aria-label="Skip forward 30 seconds"
          >
            <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6" />
              <path d="M21.5 8a10 10 0 1 0-1.46 5" />
            </svg>
            <span className="text-[9px] sm:text-[10px] font-bold leading-none -mt-0.5">30</span>
          </button>
        </div>

        <div className="hidden sm:block w-[200px]" />
        <div className="block sm:hidden w-[52px]" />
      </div>
    </div>
  );
}
