import { useState, useEffect, useCallback, useRef } from 'react';

async function getMediaUrl(fileUrl: string): Promise<string | null> {
  const token = localStorage.getItem('auth_token');
  if (!token || !fileUrl) {
    console.log('[Media] Skipped: no token or fileUrl', { hasToken: !!token, fileUrl });
    return null;
  }

  console.log('[Media] Requesting media token for:', fileUrl);
  try {
    const res = await fetch('/api/media/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ filename: fileUrl }),
    });
    if (!res.ok) {
      console.error('[Media] Token request failed:', res.status, await res.text().catch(() => ''));
      return null;
    }
    const data = await res.json();

    if (data.mediaUrl) {
      console.log('[Media] Got presigned URL (length:', data.mediaUrl.length, ')');
      return data.mediaUrl;
    }

    const mediaFilename = data.mediaFilename || fileUrl.split('/').pop();
    const url = `/api/media/${mediaFilename}?token=${encodeURIComponent(data.token)}`;
    console.log('[Media] Got local media URL:', url);
    return url;
  } catch (err) {
    console.error('[Media] Token request error:', err);
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
    if (!fileUrl) {
      console.log('[Media] useAudioPlayer: no fileUrl, skipping fetch');
      return;
    }
    let cancelled = false;
    getMediaUrl(fileUrl).then((url) => {
      if (!cancelled && url) {
        console.log('[Media] useAudioPlayer: setting mediaUrl');
        setMediaUrl(url);
      } else if (!cancelled && !url) {
        console.warn('[Media] useAudioPlayer: getMediaUrl returned null');
      }
    });
    return () => { cancelled = true; };
  }, [fileUrl]);

  useEffect(() => {
    if (!mediaUrl || isVideo) return;

    console.log('[Media] Loading audio element');
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
      console.error('[Media] Audio element error:', audio.error?.code, audio.error?.message);
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
