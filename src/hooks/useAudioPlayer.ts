import { useState, useEffect, useCallback, useRef } from 'react';

async function getMediaUrl(fileUrl: string): Promise<string | null> {
  const token = localStorage.getItem('token');
  if (!token || !fileUrl) return null;

  const filename = fileUrl.split('/').pop();
  if (!filename) return null;

  try {
    const res = await fetch('/api/media/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ filename }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return `/api/media/${filename}?token=${encodeURIComponent(data.token)}`;
  } catch {
    return null;
  }
}

export function useAudioPlayer(totalDuration: number, fileUrl?: string) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasRealAudio = useRef(false);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!fileUrl) return;
    let cancelled = false;
    getMediaUrl(fileUrl).then((url) => {
      if (!cancelled && url) setMediaUrl(url);
    });
    return () => { cancelled = true; };
  }, [fileUrl]);

  useEffect(() => {
    if (!mediaUrl) return;

    const audio = new Audio();
    audio.preload = 'auto';
    audio.src = mediaUrl;
    audioRef.current = audio;
    hasRealAudio.current = true;

    audio.addEventListener('timeupdate', () => {
      setCurrentTime(audio.currentTime);
    });

    audio.addEventListener('ended', () => {
      setIsPlaying(false);
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
  }, [mediaUrl]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

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
  }, [isPlaying]);

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
    seek,
    setPlaybackRate,
    audioRef,
    mediaUrl,
  };
}
