import React, { useRef, useEffect, useCallback } from 'react';
import { PlayIcon, PauseIcon } from 'lucide-react';
import { formatDuration } from '../../utils/formatters';

interface VideoPlayerProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  mediaUrl?: string | null;
}

export function VideoPlayer({
  isPlaying,
  currentTime,
  duration,
  onTogglePlay,
  onSeek,
  mediaUrl,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isSeeking = useRef(false);
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !mediaUrl) return;
    video.src = mediaUrl;
  }, [mediaUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !video.src) return;

    if (isPlaying) {
      video.play().catch(console.error);
    } else {
      video.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || isSeeking.current) return;
    if (Math.abs(video.currentTime - currentTime) > 1) {
      video.currentTime = currentTime;
    }
  }, [currentTime]);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || isSeeking.current) return;
    onSeek(video.currentTime);
  }, [onSeek]);

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    const seekTime = percent * duration;
    isSeeking.current = true;
    if (videoRef.current) {
      videoRef.current.currentTime = seekTime;
    }
    onSeek(seekTime);
    setTimeout(() => { isSeeking.current = false; }, 100);
  };

  return (
    <div className="bg-slate-900 rounded-xl overflow-hidden shadow-lg flex flex-col">
      <div
        className="relative bg-black flex items-center justify-center group cursor-pointer aspect-video"
        onClick={onTogglePlay}
      >
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          playsInline
          preload="auto"
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => {
            if (isPlaying) onTogglePlay();
          }}
        />

        {!isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-16 w-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white transition-transform group-hover:scale-110">
              <PlayIcon className="h-8 w-8 ml-1" />
            </div>
          </div>
        )}
      </div>

      <div className="bg-slate-900 px-4 py-3 flex items-center gap-4">
        <button
          onClick={onTogglePlay}
          className="text-white hover:text-indigo-400 transition-colors"
        >
          {isPlaying ? (
            <PauseIcon className="h-5 w-5" />
          ) : (
            <PlayIcon className="h-5 w-5" />
          )}
        </button>

        <span className="text-xs font-medium text-slate-400 w-10 text-right">
          {formatDuration(currentTime)}
        </span>

        <div
          className="flex-1 h-1.5 bg-slate-700 rounded-full cursor-pointer relative group"
          onClick={handleProgressBarClick}
        >
          <div
            className="absolute top-0 left-0 h-full bg-indigo-500 rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <span className="text-xs font-medium text-slate-400 w-10">
          {formatDuration(duration)}
        </span>
      </div>
    </div>
  );
}
