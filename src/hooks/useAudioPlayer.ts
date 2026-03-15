import { useState, useEffect, useCallback, useRef } from 'react';

async function getMediaUrl(fileUrl: string): Promise<string | null> {
  if (!fileUrl) return null;

  try {
    const csrfMatch = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
    const csrfToken = csrfMatch ? decodeURIComponent(csrfMatch[1]) : null;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
    const res = await fetch('/api/media/token', {
      method: 'POST',
      headers,
      credentials: 'include',
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

export function useAudioPlayer(totalDuration: number, fileUrl?: string, mediaType?: string) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasRealAudio = useRef(false);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const isVideo = mediaType === 'video';

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
  }, [mediaUrl, isVideo]);

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
