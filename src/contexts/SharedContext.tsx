import React, { createContext, useState, useCallback, useEffect, useMemo, ReactNode } from 'react';
import { SharedTranscriptItem, SharedFolderItem } from '../types/transcript';
import { api, isAuthenticated } from '../utils/api';

interface SharedContextType {
  sharedTranscripts: SharedTranscriptItem[];
  sharedFolders: SharedFolderItem[];
  loading: boolean;
  refreshSharedData: () => Promise<void>;
  loadFolderTranscripts: (folderId: string) => Promise<any[]>;
  folderTranscripts: Record<string, any[]>;
}

export const SharedContext = createContext<SharedContextType | undefined>(undefined);

export function SharedProvider({ children }: { children: ReactNode }) {
  const [sharedTranscripts, setSharedTranscripts] = useState<SharedTranscriptItem[]>([]);
  const [sharedFolders, setSharedFolders] = useState<SharedFolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [folderTranscripts, setFolderTranscripts] = useState<Record<string, any[]>>({});

  const refreshSharedData = useCallback(async () => {
    if (!isAuthenticated()) {
      setLoading(false);
      return;
    }
    try {
      const data = await api.shares.sharedWithMe();
      setSharedTranscripts(data.transcripts || []);
      setSharedFolders(data.folders || []);
    } catch (err) {
      console.error('Failed to load shared data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSharedData();
  }, [refreshSharedData]);

  const loadFolderTranscripts = useCallback(async (folderId: string) => {
    try {
      const transcripts = await api.shares.sharedFolderTranscripts(folderId);
      setFolderTranscripts(prev => ({ ...prev, [folderId]: transcripts }));
      return transcripts;
    } catch (err) {
      console.error('Failed to load shared folder transcripts:', err);
      return [];
    }
  }, []);

  const contextValue = useMemo(() => ({
    sharedTranscripts,
    sharedFolders,
    loading,
    refreshSharedData,
    loadFolderTranscripts,
    folderTranscripts,
  }), [sharedTranscripts, sharedFolders, loading, refreshSharedData, loadFolderTranscripts, folderTranscripts]);

  return (
    <SharedContext.Provider value={contextValue}>
      {children}
    </SharedContext.Provider>
  );
}
