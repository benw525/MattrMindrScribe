import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { XIcon, MicIcon, PauseIcon, PlayIcon, SquareIcon, AlertCircleIcon } from 'lucide-react';

interface AudioRecorderProps {
  onRecordingComplete: (file: File) => void;
  onClose: () => void;
}

type RecorderState = 'idle' | 'requesting' | 'recording' | 'paused' | 'denied' | 'error';

export function AudioRecorder({ onRecordingComplete, onClose }: AudioRecorderProps) {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedElapsedRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    mediaRecorderRef.current = null;
    analyserRef.current = null;
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const updateAudioLevel = useCallback(() => {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.fftSize);
    analyserRef.current.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const val = (data[i] - 128) / 128;
      sum += val * val;
    }
    const rms = Math.sqrt(sum / data.length);
    const level = Math.min(1, rms * 4);
    setAudioLevel(level);
    animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
  }, []);

  const startRecording = useCallback(async () => {
    setState('requesting');
    setErrorMessage('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const now = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        const filename = `Recording_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}.webm`;
        const file = new File([blob], filename, { type: mimeType });
        cleanup();
        onRecordingComplete(file);
      };

      recorder.start(1000);
      startTimeRef.current = Date.now();
      pausedElapsedRef.current = 0;

      timerRef.current = setInterval(() => {
        setElapsed(pausedElapsedRef.current + (Date.now() - startTimeRef.current));
      }, 100);

      updateAudioLevel();
      setState('recording');
    } catch (err: any) {
      cleanup();
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setState('denied');
      } else {
        setState('error');
        setErrorMessage(err.message || 'Could not access microphone');
      }
    }
  }, [cleanup, onRecordingComplete, updateAudioLevel]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && state === 'recording') {
      mediaRecorderRef.current.pause();
      pausedElapsedRef.current += Date.now() - startTimeRef.current;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      setAudioLevel(0);
      setState('paused');
    }
  }, [state]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && state === 'paused') {
      mediaRecorderRef.current.resume();
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setElapsed(pausedElapsedRef.current + (Date.now() - startTimeRef.current));
      }, 100);
      updateAudioLevel();
      setState('recording');
    }
  }, [state, updateAudioLevel]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && (state === 'recording' || state === 'paused')) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      mediaRecorderRef.current.stop();
    }
  }, [state]);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      if (mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    }
    cleanup();
    onClose();
  }, [cleanup, onClose]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const levelBars = 24;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm p-0 sm:p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white dark:bg-slate-900 rounded-t-xl sm:rounded-xl shadow-2xl w-full sm:max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Record Audio
          </h2>
          <button
            onClick={cancelRecording}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 sm:p-8 flex flex-col items-center">
          {(state === 'denied' || state === 'error') && (
            <div className="w-full mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
              <div className="flex items-start gap-3">
                <AlertCircleIcon className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-800 dark:text-red-300">
                    {state === 'denied' ? 'Microphone Access Denied' : 'Microphone Error'}
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    {state === 'denied'
                      ? 'Please allow microphone access in your browser settings and try again.'
                      : errorMessage || 'An unexpected error occurred.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {(state === 'idle' || state === 'requesting' || state === 'denied' || state === 'error') && (
            <div className="flex flex-col items-center">
              <div className="w-24 h-24 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-6">
                <MicIcon className="h-10 w-10 text-slate-400 dark:text-slate-500" />
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 text-center">
                Click the button below to start recording from your microphone.
              </p>
              <button
                onClick={startRecording}
                disabled={state === 'requesting'}
                className="flex items-center gap-2 px-6 py-3 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-medium rounded-full transition-colors shadow-lg shadow-red-500/25">
                <MicIcon className="h-5 w-5" />
                {state === 'requesting' ? 'Requesting access...' : 'Start Recording'}
              </button>
            </div>
          )}

          {(state === 'recording' || state === 'paused') && (
            <div className="flex flex-col items-center w-full">
              <div className="relative w-24 h-24 mb-6 flex items-center justify-center">
                {state === 'recording' && (
                  <motion.div
                    animate={{ scale: [1, 1.15, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute inset-0 rounded-full bg-red-500/20" />
                )}
                <div className={`relative w-20 h-20 rounded-full flex items-center justify-center ${
                  state === 'recording' ? 'bg-red-500' : 'bg-amber-500'
                }`}>
                  <MicIcon className="h-8 w-8 text-white" />
                </div>
              </div>

              <div className="text-4xl font-mono font-bold text-slate-900 dark:text-white mb-2 tabular-nums">
                {formatTime(elapsed)}
              </div>
              <div className={`text-xs font-medium uppercase tracking-wider mb-6 ${
                state === 'recording' ? 'text-red-500' : 'text-amber-500'
              }`}>
                {state === 'recording' ? 'Recording' : 'Paused'}
              </div>

              <div className="w-full flex items-end justify-center gap-1 h-10 mb-8 px-4">
                {Array.from({ length: levelBars }).map((_, i) => {
                  const distance = Math.abs(i - levelBars / 2) / (levelBars / 2);
                  const barLevel = state === 'recording'
                    ? Math.max(0.08, audioLevel * (1 - distance * 0.7))
                    : 0.08;
                  return (
                    <div
                      key={i}
                      className={`flex-1 rounded-full transition-all duration-75 ${
                        state === 'recording' ? 'bg-red-400 dark:bg-red-500' : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                      style={{ height: `${barLevel * 100}%`, minHeight: '3px' }}
                    />
                  );
                })}
              </div>

              <div className="flex items-center gap-4">
                <button
                  onClick={cancelRecording}
                  className="px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                  Cancel
                </button>
                {state === 'recording' ? (
                  <button
                    onClick={pauseRecording}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors">
                    <PauseIcon className="h-4 w-4" />
                    Pause
                  </button>
                ) : (
                  <button
                    onClick={resumeRecording}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors">
                    <PlayIcon className="h-4 w-4" />
                    Resume
                  </button>
                )}
                <button
                  onClick={stopRecording}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors shadow-sm">
                  <SquareIcon className="h-4 w-4" />
                  Stop
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
