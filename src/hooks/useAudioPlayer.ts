import { useState, useEffect, useCallback, useRef } from 'react';

async function getMediaUrl(fileUrl: string): Promise<string | null> {
  const token = localStorage.getItem('auth_token');
  if (!token || !fileUrl) return null;

  try {
    const res = await fetch('/api/media/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ filename: fileUrl }),
    });
    if (!res.ok) return null;
    const data = await res.json();

    if (data.mediaUrl) {
      return data.mediaUrl;
    }

    const mediaFilename = data.mediaFilename || fileUrl.split('/').pop();
    return `/api/media/${mediaFilename}?token=${encodeURIComponent(data.token)}`;
  } catch {
    return null;
  }
}

const SPEED_LEVELS = [0, 2, 4, 8, 16];

export function useAudioPlayer(totalDuration: number, fileUrl?: string, mediaType?: string) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const [rewindSpeed, setRewindSpeed] = useState(0);
  const [fastForwardSpeed, setFastForwardSpeed] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasRealAudio = useRef(false);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const isVideo = mediaType === 'video';
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!fileUrl) return;
    let cancelled = false;
    getMediaUrl(fileUrl).then((url) => {
      if (!cancelled && url) setMediaUrl(url);
    });
    return () => { cancelled = true; };
  }, [fileUrl]);

  useEffect(() => {
    if (!mediaUrl || isVideo) return;

    const audio = new Audio();
    audio.preload = 'auto';
    audio.src = mediaUrl;
    audioRef.current = audio;
    hasRealAudio.current = true;

    let lastUpdateTime = 0;
    audio.addEventListener('timeupdate', () => {
      const now = Date.now();
      if (now - lastUpdateTime >= 500) {
        lastUpdateTime = now;
        setCurrentTime(audio.currentTime);
      }
    });

    audio.addEventListener('ended', () => {
      setCurrentTime(audio.currentTime);
      setIsPlaying(false);
    });

    audio.addEventListener('pause', () => {
      setCurrentTime(audio.currentTime);
    });

    audio.addEventListener('error', () => {
      hasRealAudio.current = false;
    });

    return () => {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
      hasRealAudio.current = false;
    };
  }, [mediaUrl, isVideo]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const activeSpeed = rewindSpeed || fastForwardSpeed;
    if (activeSpeed === 0) return;

    const direction = rewindSpeed > 0 ? -1 : 1;
    const rate = SPEED_LEVELS[activeSpeed] || 2;

    intervalRef.current = setInterval(() => {
      const audio = audioRef.current;
      if (audio && hasRealAudio.current) {
        const newTime = Math.max(0, Math.min(audio.currentTime + direction * rate * 0.1, totalDuration));
        audio.currentTime = newTime;
        setCurrentTime(newTime);
      } else {
        setCurrentTime((prev) => Math.max(0, Math.min(prev + direction * rate * 0.1, totalDuration)));
      }
    }, 100);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [rewindSpeed, fastForwardSpeed, totalDuration]);

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (audio && hasRealAudio.current) {
      if (isPlaying) {
        audio.pause();
      } else {
        audio.play().catch(console.error);
      }
    }
    setIsPlaying((prev) => !prev);
    setRewindSpeed(0);
    setFastForwardSpeed(0);
  }, [isPlaying]);

  const toggleRewind = useCallback(() => {
    setFastForwardSpeed(0);
    setRewindSpeed((prev) => (prev + 1) % SPEED_LEVELS.length);
  }, []);

  const toggleFastForward = useCallback(() => {
    setRewindSpeed(0);
    setFastForwardSpeed((prev) => (prev + 1) % SPEED_LEVELS.length);
  }, []);

  const skip = useCallback(
    (seconds: number) => {
      const audio = audioRef.current;
      if (audio && hasRealAudio.current) {
        audio.currentTime = Math.max(0, Math.min(audio.currentTime + seconds, totalDuration));
      }
      setCurrentTime((prev) => Math.max(0, Math.min(prev + seconds, totalDuration)));
    },
    [totalDuration]
  );

  const skipBackward = useCallback((seconds: number = 10) => skip(-seconds), [skip]);
  const skipForward = useCallback((seconds: number = 30) => skip(seconds), [skip]);

  const seek = useCallback(
    (time: number) => {
      const clamped = Math.max(0, Math.min(time, totalDuration));
      const audio = audioRef.current;
      if (audio && hasRealAudio.current) {
        audio.currentTime = clamped;
      }
      setCurrentTime(clamped);
    },
    [totalDuration]
  );

  const setPlaybackRate = useCallback((rate: number) => {
    setPlaybackRateState(rate);
  }, []);

  return {
    isPlaying,
    currentTime,
    playbackRate,
    togglePlayPause,
    skip,
    skipBackward,
    skipForward,
    seek,
    setPlaybackRate,
    audioRef,
    mediaUrl,
    rewindSpeed,
    fastForwardSpeed,
    toggleRewind,
    toggleFastForward,
  };
}
