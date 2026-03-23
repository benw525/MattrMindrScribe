import { useState, useEffect, useCallback, useRef } from 'react';

export interface PresentState {
  transcriptId: string;
  currentTime: number;
  isPlaying: boolean;
  playbackRate: number;
  duration: number;
  filename: string;
  mediaType: string;
  mediaUrl: string | null;
  segments: any[];
}

export type PresentCommand =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'toggle' }
  | { type: 'seek'; time: number }
  | { type: 'skip'; seconds: number }
  | { type: 'rate'; rate: number }
  | { type: 'request_state' };

const CHANNEL_NAME = 'mms-present-sync';

export function usePresentBroadcaster(transcriptId: string | undefined) {
  const channelRef = useRef<BroadcastChannel | null>(null);
  const commandHandlerRef = useRef<((cmd: PresentCommand) => void) | null>(null);

  useEffect(() => {
    if (!transcriptId) return;
    const ch = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = ch;

    ch.onmessage = (e) => {
      if (e.data?.type === 'command' && e.data.transcriptId === transcriptId) {
        commandHandlerRef.current?.(e.data.command);
      }
    };

    return () => {
      ch.close();
      channelRef.current = null;
    };
  }, [transcriptId]);

  const broadcast = useCallback((state: PresentState) => {
    channelRef.current?.postMessage({ type: 'state', state });
  }, []);

  const onCommand = useCallback((handler: (cmd: PresentCommand) => void) => {
    commandHandlerRef.current = handler;
  }, []);

  return { broadcast, onCommand };
}

export function usePresentReceiver(transcriptId: string | undefined) {
  const [state, setState] = useState<PresentState | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (!transcriptId) return;
    const ch = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = ch;

    ch.onmessage = (e) => {
      if (e.data?.type === 'state') {
        setState(e.data.state);
      }
    };

    ch.postMessage({
      type: 'command',
      transcriptId,
      command: { type: 'request_state' } as PresentCommand,
    });

    return () => {
      ch.close();
      channelRef.current = null;
    };
  }, [transcriptId]);

  const sendCommand = useCallback((cmd: PresentCommand) => {
    if (!transcriptId) return;
    channelRef.current?.postMessage({ type: 'command', transcriptId, command: cmd });
  }, [transcriptId]);

  return { state, sendCommand };
}
