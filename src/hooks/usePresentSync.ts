import { useEffect, useRef, useCallback, useState } from 'react';

export interface PresentState {
  transcriptId: string;
  currentTime: number;
  isPlaying: boolean;
  playbackRate: number;
  duration: number;
  filename: string;
  mediaType: string;
  mediaUrl: string | null;
  segments: { id: string; startTime: number; endTime: number; speaker: string; text: string }[];
}

export interface PresentCommand {
  type: 'command';
  action: 'play' | 'pause' | 'toggle' | 'seek' | 'skip' | 'rate' | 'request_state';
  transcriptId: string;
  value?: number;
}

const CHANNEL_NAME = 'mms-present-sync';

export function usePresentBroadcaster(transcriptId: string | undefined) {
  const channelRef = useRef<BroadcastChannel | null>(null);
  const lastStateRef = useRef<PresentState | null>(null);

  useEffect(() => {
    channelRef.current = new BroadcastChannel(CHANNEL_NAME);
    const ch = channelRef.current;

    const listener = (e: MessageEvent) => {
      if (
        e.data?.type === 'command' &&
        e.data.action === 'request_state' &&
        e.data.transcriptId === transcriptId &&
        lastStateRef.current
      ) {
        ch.postMessage({ type: 'state', ...lastStateRef.current });
      }
    };
    ch.addEventListener('message', listener);

    return () => {
      ch.removeEventListener('message', listener);
      ch.close();
      channelRef.current = null;
    };
  }, [transcriptId]);

  const broadcast = useCallback((state: PresentState) => {
    lastStateRef.current = state;
    channelRef.current?.postMessage({ type: 'state', ...state });
  }, []);

  const onCommand = useCallback((handler: (cmd: PresentCommand) => void) => {
    const ch = channelRef.current;
    if (!ch) return () => {};
    const listener = (e: MessageEvent) => {
      if (e.data?.type === 'command' && e.data.action !== 'request_state') {
        handler(e.data as PresentCommand);
      }
    };
    ch.addEventListener('message', listener);
    return () => ch.removeEventListener('message', listener);
  }, []);

  return { broadcast, onCommand };
}

export function usePresentReceiver(transcriptId: string | undefined) {
  const channelRef = useRef<BroadcastChannel | null>(null);
  const [state, setState] = useState<PresentState | null>(null);

  useEffect(() => {
    channelRef.current = new BroadcastChannel(CHANNEL_NAME);
    const ch = channelRef.current;
    ch.addEventListener('message', (e: MessageEvent) => {
      if (e.data?.type === 'state' && e.data.transcriptId === transcriptId) {
        setState(e.data as PresentState);
      }
    });

    ch.postMessage({ type: 'command', action: 'request_state', transcriptId });

    return () => {
      ch.close();
      channelRef.current = null;
    };
  }, [transcriptId]);

  const sendCommand = useCallback((cmd: Omit<PresentCommand, 'type' | 'transcriptId'>) => {
    if (!transcriptId) return;
    channelRef.current?.postMessage({ type: 'command', transcriptId, ...cmd });
  }, [transcriptId]);

  return { state, sendCommand };
}
