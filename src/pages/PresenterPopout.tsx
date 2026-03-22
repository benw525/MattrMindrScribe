import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  PlayIcon,
  PauseIcon,
  EyeIcon,
  EyeOffIcon,
  GripHorizontalIcon,
} from 'lucide-react';
import { usePresentReceiver } from '../hooks/usePresentSync';
import { formatDuration } from '../utils/formatters';

export function PresenterPopout() {
  const { id } = useParams<{ id: string }>();
  const { state, sendCommand } = usePresentReceiver(id);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isSeeking = useRef(false);
  const [showText, setShowText] = useState(true);
  const [videoHeight, setVideoHeight] = useState(45);
  const isDraggingRef = useRef(false);
  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem('mms-theme');
    if (stored === 'dark') return true;
    if (stored === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDark]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'mms-theme') {
        setIsDark(e.newValue === 'dark');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const isVideo = state?.mediaType === 'video';

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !state?.mediaUrl || !isVideo) return;
    if (video.src !== state.mediaUrl) {
      video.src = state.mediaUrl;
    }
  }, [state?.mediaUrl, isVideo]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideo || !video.src) return;
    if (state?.isPlaying) {
      video.play().catch(console.error);
    } else {
      video.pause();
    }
  }, [state?.isPlaying, isVideo]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideo) return;
    video.playbackRate = state?.playbackRate || 1;
  }, [state?.playbackRate, isVideo]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideo || isSeeking.current) return;
    const ct = state?.currentTime ?? 0;
    if (Math.abs(video.currentTime - ct) > 0.5) {
      video.currentTime = ct;
    }
  }, [state?.currentTime, isVideo]);

  useEffect(() => {
    if (!state?.isPlaying || !scrollContainerRef.current) return;
    const activeElement = scrollContainerRef.current.querySelector(
      '[data-active="true"]'
    );
    if (activeElement) {
      activeElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [state?.currentTime, state?.isPlaying]);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const percent = (e.clientY / window.innerHeight) * 100;
      setVideoHeight(Math.max(15, Math.min(85, percent)));
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

  useEffect(() => {
    if (state?.filename) {
      document.title = `Presenter — ${state.filename}`;
    }
  }, [state?.filename]);

  const currentTime = state?.currentTime ?? 0;
  const duration = state?.duration ?? 0;
  const segments = state?.segments ?? [];
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (!state) {
    return (
      <div className="fixed inset-0 bg-white dark:bg-slate-950 z-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-slate-400 dark:text-slate-500 text-lg mb-2">Waiting for connection...</div>
          <p className="text-slate-500 dark:text-slate-600 text-sm">Open a transcript in the main app to begin</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-200 z-50 flex flex-col h-dvh overflow-hidden font-sans">
      {isVideo && (
        <>
          <div className="relative bg-black flex-shrink-0" style={{ height: `${videoHeight}vh` }}>
            <video
              ref={videoRef}
              className="w-full h-full object-contain"
              playsInline
              preload="auto"
              onClick={() => sendCommand({ action: 'toggle' })}
            />
            {!state.isPlaying && (
              <div
                className="absolute inset-0 flex items-center justify-center cursor-pointer"
                onClick={() => sendCommand({ action: 'toggle' })}
              >
                <div className="h-20 w-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white transition-transform hover:scale-110">
                  <PlayIcon className="h-10 w-10 ml-1" />
                </div>
              </div>
            )}
          </div>

          <div
            className="flex-shrink-0 h-2 bg-slate-200 dark:bg-slate-800 cursor-row-resize flex items-center justify-center hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors group"
            onMouseDown={handleResizeMouseDown}
          >
            <GripHorizontalIcon className="h-4 w-4 text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300" />
          </div>
        </>
      )}

      <div className="flex-shrink-0 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => sendCommand({ action: 'toggle' })}
              className="h-8 w-8 bg-indigo-600 text-white rounded-full flex items-center justify-center hover:bg-indigo-500 transition-colors"
            >
              {state.isPlaying ?
                <PauseIcon className="h-4 w-4" /> :
                <PlayIcon className="h-4 w-4 ml-0.5" />
              }
            </button>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate max-w-xs">
              {state.filename}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums">
              {formatDuration(currentTime)} / {formatDuration(duration)}
            </span>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 rounded">
              {state.playbackRate}x
            </span>
            {isVideo && (
              <button
                onClick={() => setShowText(!showText)}
                className="p-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                title={showText ? 'Hide transcript' : 'Show transcript'}
              >
                {showText ? <EyeIcon className="h-4 w-4" /> : <EyeOffIcon className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>

        <div
          className="h-1 bg-slate-200 dark:bg-slate-700 cursor-pointer relative group"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            sendCommand({ action: 'seek', value: percent * duration });
          }}
        >
          <div
            className="absolute top-0 left-0 h-full bg-indigo-600 dark:bg-indigo-500 transition-[width] duration-75"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {(showText || !isVideo) && (
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto scroll-smooth"
        >
          <div className="max-w-4xl mx-auto px-6 md:px-12 py-8 space-y-8">
            {segments.map((segment) => {
              const isActive =
                currentTime >= segment.startTime && currentTime < segment.endTime;
              return (
                <div
                  key={segment.id}
                  data-active={isActive}
                  className={`transition-all duration-500 cursor-pointer ${
                    isActive ? 'opacity-100 scale-100' : 'opacity-40 scale-[0.98]'
                  }`}
                  onClick={() => sendCommand({ action: 'seek', value: segment.startTime })}
                >
                  <div className="flex items-baseline gap-3 mb-1">
                    <span
                      className={`text-sm font-bold tracking-wider uppercase ${
                        isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {segment.speaker}
                    </span>
                    <span className="text-xs text-slate-400 dark:text-slate-600 tabular-nums">
                      {formatDuration(segment.startTime)}
                    </span>
                  </div>
                  <p
                    className={`text-xl md:text-2xl lg:text-3xl leading-relaxed font-medium ${
                      isActive
                        ? 'text-slate-900 dark:text-white'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {segment.text}
                  </p>
                </div>
              );
            })}
            <div className="h-32" />
          </div>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-white dark:from-slate-950 to-transparent pointer-events-none" />
    </div>
  );
}
