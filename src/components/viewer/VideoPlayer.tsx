import React from 'react';
import { PlayIcon, PauseIcon } from 'lucide-react';
import { formatDuration } from '../../utils/formatters';
interface VideoPlayerProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
}
export function VideoPlayer({
  isPlaying,
  currentTime,
  duration,
  onTogglePlay,
  onSeek
}: VideoPlayerProps) {
  const progressPercent = duration > 0 ? currentTime / duration * 100 : 0;
  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    onSeek(percent * duration);
  };
  return (
    <div className="bg-slate-900 rounded-xl overflow-hidden shadow-lg flex flex-col">
      {/* Video Placeholder Area — maintains 16:9 aspect ratio */}
      <div
        className="relative bg-black flex items-center justify-center group cursor-pointer aspect-video"
        onClick={onTogglePlay}>

        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

        {!isPlaying &&
        <div className="h-16 w-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white transition-transform group-hover:scale-110">
            <PlayIcon className="h-8 w-8 ml-1" />
          </div>
        }

        <div className="absolute bottom-4 left-4 right-4 text-white text-sm font-medium opacity-50">
          Simulated Video Playback
        </div>
      </div>

      {/* Minimal Controls */}
      <div className="bg-slate-900 px-4 py-3 flex items-center gap-4">
        <button
          onClick={onTogglePlay}
          className="text-white hover:text-indigo-400 transition-colors">

          {isPlaying ?
          <PauseIcon className="h-5 w-5" /> :

          <PlayIcon className="h-5 w-5" />
          }
        </button>

        <span className="text-xs font-medium text-slate-400 w-10 text-right">
          {formatDuration(currentTime)}
        </span>

        <div
          className="flex-1 h-1.5 bg-slate-700 rounded-full cursor-pointer relative group"
          onClick={handleProgressBarClick}>

          <div
            className="absolute top-0 left-0 h-full bg-indigo-500 rounded-full"
            style={{
              width: `${progressPercent}%`
            }} />

        </div>

        <span className="text-xs font-medium text-slate-400 w-10">
          {formatDuration(duration)}
        </span>
      </div>
    </div>);

}