import React from 'react';
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
const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
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
  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    onSeek(percent * duration);
  };
  return (
    <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-3 sm:px-6 py-3 sm:py-4 flex flex-col gap-2 sm:gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] dark:shadow-none z-10">
      {/* Progress Bar */}
      <div className="flex items-center gap-2 sm:gap-4">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 w-10 text-right">
          {formatDuration(currentTime)}
        </span>
        <div
          className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full cursor-pointer relative group"
          onClick={handleProgressBarClick}>

          <div
            className="absolute top-0 left-0 h-full bg-indigo-600 dark:bg-indigo-500 rounded-full group-hover:bg-indigo-500 dark:group-hover:bg-indigo-400 transition-colors"
            style={{
              width: `${progressPercent}%`
            }} />

          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white border-2 border-indigo-600 dark:border-indigo-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
            style={{
              left: `calc(${progressPercent}% - 6px)`
            }} />

        </div>
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 w-10">
          {formatDuration(duration)}
        </span>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        {/* Speed Buttons — scrollable on mobile */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-[40%] sm:max-w-none">
          {SPEED_OPTIONS.map((speed) =>
          <button
            key={speed}
            onClick={() => onRateChange(speed)}
            className={`px-1.5 sm:px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap flex-shrink-0 ${playbackRate === speed ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200'}`}
            aria-label={`Set playback speed to ${speed}x`}>

              {speed}x
            </button>
          )}
        </div>

        {/* Playback Controls */}
        <div className="flex items-center gap-3 sm:gap-5">
          <button
            onClick={() => onSkip(-15)}
            className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors focus:outline-none"
            aria-label="Skip back 15 seconds">

            <Undo2Icon className="h-5 w-5" />
          </button>

          <button
            onClick={onTogglePlay}
            className="h-10 w-10 sm:h-12 sm:w-12 bg-indigo-600 text-white rounded-full flex items-center justify-center hover:bg-indigo-700 hover:scale-105 transition-all shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            aria-label={isPlaying ? 'Pause' : 'Play'}>

            {isPlaying ?
            <PauseIcon className="h-5 w-5 sm:h-6 sm:w-6" /> :

            <PlayIcon className="h-5 w-5 sm:h-6 sm:w-6 ml-0.5" />
            }
          </button>

          <button
            onClick={() => onSkip(15)}
            className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors focus:outline-none"
            aria-label="Skip forward 15 seconds">

            <Redo2Icon className="h-5 w-5" />
          </button>
        </div>

        <div className="w-[40%] sm:w-[200px]" />
      </div>
    </div>);

}