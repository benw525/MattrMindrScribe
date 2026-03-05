import { useContext } from 'react';
import { TranscriptContext } from '../contexts/TranscriptContext';

export function useTranscripts() {
  const context = useContext(TranscriptContext);
  if (context === undefined) {
    throw new Error('useTranscripts must be used within a TranscriptProvider');
  }
  return context;
}