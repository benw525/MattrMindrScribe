import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { XIcon, PlayIcon, PauseIcon, ChevronUpIcon } from 'lucide-react';
import { useTranscripts } from '../hooks/useTranscripts';
import { formatDuration } from '../utils/formatters';
import { api } from '../utils/api';

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export function VideoPresentModePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { transcripts } = useTranscripts();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [directTranscript, setDirectTranscript] = useState<any>(null);

  const transcript = transcripts.find((t) => t.id === id) || directTranscript;

  useEffect(() => {
    if (!id || transcript) return;
    api.getTranscript(id).then(setDirectTranscript).catch(() => {});
  }, [id, transcript]);

  useEffect(() => {
    if (!transcript?.file_url) return;
    const token = localStorage.getItem('auth_token');
    if (!token) return;
    fetch('/api/media/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ filename: transcript.file_url }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.mediaUrl) setMediaUrl(data.mediaUrl);
        else {
          const mf = data.mediaFilename || transcript.file_url.split('/').pop();
          setMediaUrl(`/api/media/${mf}?token=${encodeURIComponent(data.token)}`);
        }
      })
      .catch(() => {});
  }, [transcript?.file_url]);

  const resetControlsTimeout = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  }, [isPlaying]);

  useEffect(() => {
    const handleMouseMove = () => resetControlsTimeout();
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [resetControlsTimeout]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onDurationChange = () => setDuration(video.duration || 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
    };
  }, [mediaUrl]);

  const togglePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }, []);

  const seekTo = useCallback((time: number) => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = Math.max(0, Math.min(time, video.duration || 0));
      setCurrentTime(video.currentTime);
    }
  }, []);

  const changeRate = useCallback((rate: number) => {
    const video = videoRef.current;
    if (video) video.playbackRate = rate;
    setPlaybackRate(rate);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case 'Escape':
          navigate(`/app/transcript/${id}`);
          break;
        case ' ':
          e.preventDefault();
          togglePlayPause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seekTo((videoRef.current?.currentTime || 0) - 10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          seekTo((videoRef.current?.currentTime || 0) + 30);
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [id, navigate, togglePlayPause, seekTo]);

  useEffect(() => {
    if (!isPlaying || !containerRef.current) return;
    const activeElement = containerRef.current.querySelector('[data-active="true"]');
    if (activeElement) {
      activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentTime, isPlaying]);

  const isDark = document.documentElement.classList.contains('dark') ||
    localStorage.getItem('mms-theme') === 'dark';

  if (!transcript) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex items-center justify-center z-50">
        <div className="h-8 w-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={`fixed inset-0 ${isDark ? 'bg-slate-950 text-slate-200' : 'bg-white text-slate-800'} z-50 flex flex-col h-dvh overflow-hidden font-sans`}>
      <div
        className={`absolute top-0 left-0 right-0 h-1 z-20 ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}
      >
        <div
          className="h-full bg-indigo-600 transition-[width] duration-100"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className={`transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'} absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 ${isDark ? 'bg-gradient-to-b from-slate-950/90 to-transparent' : 'bg-gradient-to-b from-white/90 to-transparent'}`}>
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlayPause}
            className="h-10 w-10 rounded-full bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-500 transition-colors"
          >
            {isPlaying ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5 ml-0.5" />}
          </button>
          <div>
            <h1 className={`text-base font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {transcript.filename}
            </h1>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {formatDuration(currentTime)} / {formatDuration(duration)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowSpeedMenu(!showSpeedMenu)}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700'}`}
            >
              {playbackRate}x
              <ChevronUpIcon className={`h-3 w-3 transition-transform ${showSpeedMenu ? '' : 'rotate-180'}`} />
            </button>
            {showSpeedMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowSpeedMenu(false)} />
                <div className={`absolute top-full right-0 mt-1 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} border rounded-lg shadow-xl z-40 py-1 min-w-[80px]`}>
                  {SPEED_OPTIONS.map((speed) => (
                    <button
                      key={speed}
                      onClick={() => { changeRate(speed); setShowSpeedMenu(false); }}
                      className={`w-full text-left px-3 py-1.5 text-sm font-medium transition-colors ${
                        playbackRate === speed
                          ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                          : isDark ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => navigate(`/app/transcript/${id}`)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-900'}`}
          >
            <XIcon className="h-4 w-4" />
            Exit
          </button>
        </div>
      </div>

      <div className="flex-shrink-0 w-full max-h-[55vh] bg-black flex items-center justify-center">
        {mediaUrl && (
          <video
            ref={videoRef}
            src={mediaUrl}
            className="max-w-full max-h-[55vh] w-auto"
            playsInline
          />
        )}
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-6 md:px-16 lg:px-32 py-8 scroll-smooth"
      >
        <div className="max-w-3xl mx-auto space-y-6">
          {transcript.segments?.map((segment: any) => {
            const isActive = currentTime >= segment.startTime && currentTime < segment.endTime;
            return (
              <div
                key={segment.id}
                data-active={isActive}
                onClick={() => seekTo(segment.startTime)}
                className={`cursor-pointer rounded-lg p-4 transition-all duration-300 ${
                  isActive
                    ? isDark
                      ? 'bg-indigo-950/40 border border-indigo-500/30'
                      : 'bg-indigo-50 border border-indigo-200'
                    : isDark
                      ? 'hover:bg-slate-800/50'
                      : 'hover:bg-slate-50'
                } ${isActive ? 'opacity-100 scale-100' : 'opacity-60 scale-[0.98]'}`}
              >
                <div className="flex items-baseline gap-3 mb-1">
                  <span className={`text-sm font-bold tracking-wide ${isActive ? 'text-indigo-400' : isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    {segment.speaker}
                  </span>
                  <span className={`text-xs tabular-nums ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                    {formatDuration(segment.startTime)}
                  </span>
                </div>
                <p className={`text-xl md:text-2xl leading-relaxed font-medium ${
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

      <div className={`absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t ${isDark ? 'from-slate-950' : 'from-white'} to-transparent pointer-events-none`} />
    </div>
  );
}
