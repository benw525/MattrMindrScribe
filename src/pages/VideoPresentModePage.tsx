import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  XIcon,
  PlayIcon,
  PauseIcon,
  RewindIcon,
  FastForwardIcon,
  ChevronUpIcon,
} from 'lucide-react';
import { useTranscripts } from '../hooks/useTranscripts';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { formatDuration } from '../utils/formatters';

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export function VideoPresentModePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { transcripts } = useTranscripts();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isSeeking = useRef(false);
  const [showControls, setShowControls] = useState(true);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const transcript = transcripts.find((t) => t.id === id);

  useEffect(() => {
    if (transcript && transcript.type !== 'video') {
      navigate(`/app/transcript/${id}/present`, { replace: true });
    }
  }, [transcript, id, navigate]);

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
    mediaUrl,
  } = useAudioPlayer(transcript?.duration || 0, transcript?.fileUrl, transcript?.type);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        navigate(`/app/transcript/${id}`);
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
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || isSeeking.current) return;
    const isTransporting = rewindSpeed > 0 || fastForwardSpeed > 0;
    if (isTransporting || Math.abs(video.currentTime - currentTime) > 0.5) {
      video.currentTime = currentTime;
    }
  }, [currentTime, rewindSpeed, fastForwardSpeed]);

  const handleVideoTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || isSeeking.current) return;
    seek(video.currentTime);
  }, [seek]);

  useEffect(() => {
    if (!isPlaying || !scrollContainerRef.current) return;
    const activeElement = scrollContainerRef.current.querySelector(
      '[data-active="true"]'
    );
    if (activeElement) {
      activeElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentTime, isPlaying]);

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlaying) {
      setShowControls(true);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    } else {
      resetControlsTimer();
    }
  }, [isPlaying, resetControlsTimer]);

  useEffect(() => {
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, []);

  const progressPercent = (transcript?.duration || 0) > 0
    ? (currentTime / (transcript?.duration || 1)) * 100
    : 0;

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const seekTime = percent * (transcript?.duration || 0);
    isSeeking.current = true;
    if (videoRef.current) {
      videoRef.current.currentTime = seekTime;
    }
    seek(seekTime);
    setTimeout(() => { isSeeking.current = false; }, 100);
  };

  const skipBtnClass = "p-1.5 text-slate-300 hover:text-white active:text-indigo-400 transition-colors rounded-full flex flex-col items-center justify-center";

  if (!transcript) {
    return (
      <div className="fixed inset-0 bg-slate-950 z-50 flex items-center justify-center">
        <div className="text-slate-400 text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-slate-950 text-slate-200 z-50 flex flex-col h-dvh overflow-hidden font-sans"
      onMouseMove={resetControlsTimer}
    >
      <div className="flex flex-col h-full">
        <div className="relative bg-black flex-shrink-0" style={{ height: '45vh' }}>
          <video
            ref={videoRef}
            className="w-full h-full object-contain"
            playsInline
            preload="auto"
            onTimeUpdate={handleVideoTimeUpdate}
            onEnded={() => { if (isPlaying) togglePlayPause(); }}
            onClick={togglePlayPause}
          />

          {!isPlaying && (
            <div
              className="absolute inset-0 flex items-center justify-center cursor-pointer"
              onClick={togglePlayPause}
            >
              <div className="h-20 w-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white transition-transform hover:scale-110">
                <PlayIcon className="h-10 w-10 ml-1" />
              </div>
            </div>
          )}

          <div
            className={`absolute top-0 left-0 right-0 flex items-center justify-between p-4 bg-gradient-to-b from-black/70 to-transparent transition-opacity duration-300 ${
              showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold text-white truncate max-w-md">
                {transcript.filename}
              </h1>
            </div>
            <button
              onClick={() => navigate(`/app/transcript/${id}`)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors text-sm"
            >
              <XIcon className="h-4 w-4" />
              Exit (Esc)
            </button>
          </div>
        </div>

        <div
          className={`flex-shrink-0 bg-slate-900 border-t border-slate-800 transition-opacity duration-300 ${
            showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div
            className="h-1 bg-slate-700 cursor-pointer relative group"
            onClick={handleProgressClick}
          >
            <div
              className="absolute top-0 left-0 h-full bg-indigo-500 transition-[width] duration-75"
              style={{ width: `${progressPercent}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white border-2 border-indigo-500 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `calc(${progressPercent}% - 6px)` }}
            />
          </div>

          <div className="flex items-center justify-between px-4 py-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-400 tabular-nums w-12 text-right">
                {formatDuration(currentTime)}
              </span>
              <span className="text-xs text-slate-600">/</span>
              <span className="text-xs font-medium text-slate-400 tabular-nums w-12">
                {formatDuration(transcript.duration)}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button onClick={() => skip(-30)} className={skipBtnClass} aria-label="Skip back 30s">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2.5 2v6h6" /><path d="M2.5 8a10 10 0 1 1 1.46 5" />
                </svg>
                <span className="text-[9px] font-bold leading-none -mt-0.5">30</span>
              </button>

              <button onClick={() => skip(-10)} className={skipBtnClass} aria-label="Skip back 10s">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2.5 2v6h6" /><path d="M2.5 8a10 10 0 1 1 1.46 5" />
                </svg>
                <span className="text-[9px] font-bold leading-none -mt-0.5">10</span>
              </button>

              <button onClick={() => skip(-5)} className={skipBtnClass} aria-label="Skip back 5s">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2.5 2v6h6" /><path d="M2.5 8a10 10 0 1 1 1.46 5" />
                </svg>
                <span className="text-[9px] font-bold leading-none -mt-0.5">5</span>
              </button>

              <button
                onClick={toggleRewind}
                className={`relative p-1.5 rounded-full transition-colors ${
                  rewindSpeed > 0
                    ? 'text-indigo-400 bg-indigo-950/50'
                    : 'text-slate-300 hover:text-white'
                }`}
                aria-label={rewindSpeed > 0 ? `Rewinding at ${rewindSpeed}x` : 'Rewind'}
              >
                <RewindIcon className="h-4 w-4" />
                {rewindSpeed > 0 && (
                  <span className="absolute -top-1 -right-1 text-[9px] font-bold text-indigo-400 bg-indigo-950/60 rounded-full px-1">
                    {rewindSpeed}x
                  </span>
                )}
              </button>

              <button
                onClick={togglePlayPause}
                className="h-10 w-10 bg-indigo-600 text-white rounded-full flex items-center justify-center hover:bg-indigo-500 active:bg-indigo-700 active:scale-95 transition-all shadow-md mx-1"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ?
                  <PauseIcon className="h-5 w-5" /> :
                  <PlayIcon className="h-5 w-5 ml-0.5" />
                }
              </button>

              <button
                onClick={toggleFastForward}
                className={`relative p-1.5 rounded-full transition-colors ${
                  fastForwardSpeed > 0
                    ? 'text-indigo-400 bg-indigo-950/50'
                    : 'text-slate-300 hover:text-white'
                }`}
                aria-label={fastForwardSpeed > 0 ? `Fast forwarding at ${fastForwardSpeed}x` : 'Fast forward'}
              >
                <FastForwardIcon className="h-4 w-4" />
                {fastForwardSpeed > 0 && (
                  <span className="absolute -top-1 -right-1 text-[9px] font-bold text-indigo-400 bg-indigo-950/60 rounded-full px-1">
                    {fastForwardSpeed}x
                  </span>
                )}
              </button>

              <button onClick={() => skip(5)} className={skipBtnClass} aria-label="Skip forward 5s">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6" /><path d="M21.5 8a10 10 0 1 0-1.46 5" />
                </svg>
                <span className="text-[9px] font-bold leading-none -mt-0.5">5</span>
              </button>

              <button onClick={() => skip(10)} className={skipBtnClass} aria-label="Skip forward 10s">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6" /><path d="M21.5 8a10 10 0 1 0-1.46 5" />
                </svg>
                <span className="text-[9px] font-bold leading-none -mt-0.5">10</span>
              </button>

              <button onClick={() => skip(30)} className={skipBtnClass} aria-label="Skip forward 30s">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6" /><path d="M21.5 8a10 10 0 1 0-1.46 5" />
                </svg>
                <span className="text-[9px] font-bold leading-none -mt-0.5">30</span>
              </button>
            </div>

            <div className="relative">
              <button
                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className="flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-md bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
              >
                {playbackRate}x
                <ChevronUpIcon className={`h-3 w-3 transition-transform ${showSpeedMenu ? '' : 'rotate-180'}`} />
              </button>
              {showSpeedMenu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowSpeedMenu(false)} />
                  <div className="absolute bottom-full right-0 mb-2 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-40 py-1 min-w-[100px]">
                    {SPEED_OPTIONS.map((speed) => (
                      <button
                        key={speed}
                        onClick={() => {
                          setPlaybackRate(speed);
                          setShowSpeedMenu(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm font-medium transition-colors ${
                          playbackRate === speed
                            ? 'bg-indigo-950/40 text-indigo-300'
                            : 'text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto scroll-smooth"
        >
          <div className="max-w-4xl mx-auto px-6 md:px-12 py-8 space-y-8">
            {transcript.segments.map((segment) => {
              const isActive =
                currentTime >= segment.startTime && currentTime < segment.endTime;
              return (
                <div
                  key={segment.id}
                  data-active={isActive}
                  className={`transition-all duration-500 cursor-pointer ${
                    isActive ? 'opacity-100 scale-100' : 'opacity-40 scale-[0.98]'
                  }`}
                  onClick={() => {
                    seek(segment.startTime);
                    if (videoRef.current) {
                      isSeeking.current = true;
                      videoRef.current.currentTime = segment.startTime;
                      setTimeout(() => { isSeeking.current = false; }, 100);
                    }
                  }}
                >
                  <div className="flex items-baseline gap-3 mb-1">
                    <span
                      className={`text-sm font-bold tracking-wider uppercase ${
                        isActive ? 'text-indigo-400' : 'text-slate-500'
                      }`}
                    >
                      {segment.speaker}
                    </span>
                    <span className="text-xs text-slate-600 tabular-nums">
                      {formatDuration(segment.startTime)}
                    </span>
                  </div>
                  <p
                    className={`text-xl md:text-2xl leading-relaxed font-medium ${
                      isActive ? 'text-white' : 'text-slate-400'
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
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-slate-950 to-transparent pointer-events-none" />
    </div>
  );
}
