import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { PlayIcon, PauseIcon } from 'lucide-react';
import { usePresentReceiver } from '../hooks/usePresentSync';
import { formatDuration } from '../utils/formatters';

export function PresenterPopout() {
  const { id } = useParams<{ id: string }>();
  const { state, sendCommand } = usePresentReceiver(id);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoHeight, setVideoHeight] = useState(50);
  const [showText, setShowText] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    return localStorage.getItem('mms-theme') === 'dark';
  });

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'mms-theme') {
        setIsDark(e.newValue === 'dark');
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    if (state?.filename) {
      document.title = state.filename;
    }
  }, [state?.filename]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !state) return;

    if (Math.abs(video.currentTime - state.currentTime) > 0.5) {
      video.currentTime = state.currentTime;
    }

    if (state.isPlaying && video.paused) {
      video.play().catch(() => {});
    } else if (!state.isPlaying && !video.paused) {
      video.pause();
    }

    if (video.playbackRate !== state.playbackRate) {
      video.playbackRate = state.playbackRate;
    }
  }, [state?.currentTime, state?.isPlaying, state?.playbackRate]);

  useEffect(() => {
    if (!state?.isPlaying || !containerRef.current) return;
    const activeEl = containerRef.current.querySelector('[data-active="true"]');
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [state?.currentTime, state?.isPlaying]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault();
        sendCommand({ type: 'toggle' });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sendCommand]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const startY = e.clientY;
    const startHeight = videoHeight;

    const onMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientY - startY;
      const vh = window.innerHeight;
      const newHeight = Math.max(20, Math.min(80, startHeight + (delta / vh) * 100));
      setVideoHeight(newHeight);
    };

    const onUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [videoHeight]);

  const isVideoMode = state?.mediaType === 'video';

  if (!state) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center ${isDark ? 'bg-slate-950 text-white' : 'bg-white text-slate-900'}`}>
        <div className="h-8 w-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Waiting for main window...</p>
      </div>
    );
  }

  const progressPercent = state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;

  return (
    <div className={`h-dvh flex flex-col overflow-hidden ${isDark ? 'bg-slate-950 text-slate-200' : 'bg-white text-slate-800'}`}>
      <div className={`w-full h-1 flex-shrink-0 ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
        <div className="h-full bg-indigo-600 transition-[width] duration-100" style={{ width: `${progressPercent}%` }} />
      </div>

      {isVideoMode && state.mediaUrl && (
        <>
          <div
            className="flex-shrink-0 bg-black flex items-center justify-center overflow-hidden"
            style={{ height: `${videoHeight}vh` }}
          >
            <video
              ref={videoRef}
              src={state.mediaUrl}
              className="max-w-full max-h-full w-auto"
              playsInline
              muted
            />
          </div>
          <div
            onMouseDown={handleDragStart}
            className={`flex-shrink-0 h-2 cursor-row-resize flex items-center justify-center ${isDark ? 'bg-slate-800 hover:bg-slate-700' : 'bg-slate-200 hover:bg-slate-300'} transition-colors`}
          >
            <div className={`w-8 h-0.5 rounded ${isDark ? 'bg-slate-600' : 'bg-slate-400'}`} />
          </div>
          <div className={`flex items-center justify-between px-4 py-1.5 flex-shrink-0 ${isDark ? 'bg-slate-900/50' : 'bg-slate-50'}`}>
            <button
              onClick={() => sendCommand({ type: 'toggle' })}
              className="h-8 w-8 rounded-full bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-500"
            >
              {state.isPlaying ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4 ml-0.5" />}
            </button>
            <button
              onClick={() => setShowText(!showText)}
              className={`text-xs font-medium px-2 py-1 rounded ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}
            >
              {showText ? 'Hide Text' : 'Show Text'}
            </button>
          </div>
        </>
      )}

      {!isVideoMode && (
        <div className={`flex items-center gap-3 px-6 py-3 flex-shrink-0 ${isDark ? 'bg-slate-900/80' : 'bg-slate-50'}`}>
          <button
            onClick={() => sendCommand({ type: 'toggle' })}
            className="h-10 w-10 rounded-full bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-500"
          >
            {state.isPlaying ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5 ml-0.5" />}
          </button>
          <div>
            <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{state.filename}</p>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {formatDuration(state.currentTime)} / {formatDuration(state.duration)}
            </p>
          </div>
        </div>
      )}

      {(showText || !isVideoMode) && (
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto px-6 md:px-16 lg:px-24 py-8 scroll-smooth"
        >
          <div className="max-w-4xl mx-auto space-y-8">
            {state.segments?.map((segment: any) => {
              const isActive = state.currentTime >= segment.startTime && state.currentTime < segment.endTime;
              return (
                <div
                  key={segment.id}
                  data-active={isActive}
                  onClick={() => sendCommand({ type: 'seek', time: segment.startTime })}
                  className={`cursor-pointer transition-all duration-500 ${isActive ? 'opacity-100 scale-100' : 'opacity-40 scale-95'}`}
                >
                  <div className="flex items-baseline gap-3 mb-1">
                    <span className={`text-base font-bold tracking-wider ${isActive ? 'text-indigo-400' : isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                      {segment.speaker}
                    </span>
                  </div>
                  <p className={`text-2xl md:text-3xl leading-relaxed font-medium ${
                    isActive
                      ? isDark ? 'text-white' : 'text-slate-900'
                      : isDark ? 'text-slate-300' : 'text-slate-600'
                  }`}>
                    {segment.text}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
