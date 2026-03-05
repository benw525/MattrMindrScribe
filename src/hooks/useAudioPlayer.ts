import { useState, useEffect, useCallback } from 'react';

export function useAudioPlayer(totalDuration: number) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  const togglePlayPause = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const skip = useCallback(
    (seconds: number) => {
      setCurrentTime((prev) => {
        const newTime = prev + seconds;
        return Math.max(0, Math.min(newTime, totalDuration));
      });
    },
    [totalDuration]
  );

  const seek = useCallback(
    (time: number) => {
      setCurrentTime(Math.max(0, Math.min(time, totalDuration)));
    },
    [totalDuration]
  );

  // Simulate playback
  useEffect(() => {
    let interval: number;
    if (isPlaying) {
      interval = window.setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= totalDuration) {
            setIsPlaying(false);
            return totalDuration;
          }
          return prev + 0.1 * playbackRate;
        });
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isPlaying, playbackRate, totalDuration]);

  return {
    isPlaying,
    currentTime,
    playbackRate,
    togglePlayPause,
    skip,
    seek,
    setPlaybackRate
  };
}