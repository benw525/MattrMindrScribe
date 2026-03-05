import React, { useCallback, useState, useEffect, createContext, ReactNode } from 'react';
import { Transcript, Folder } from '../types/transcript';
import { api, isAuthenticated } from '../utils/api';

interface TranscriptContextType {
  transcripts: Transcript[];
  folders: Folder[];
  loading: boolean;
  addTranscript: (transcript: Transcript) => void;
  uploadFile: (file: File, description?: string, folderId?: string) => Promise<void>;
  updateTranscript: (id: string, updates: Partial<Transcript>) => void;
  deleteTranscripts: (ids: string[]) => void;
  addFolder: (name: string, caseNumber: string, parentId?: string | null) => void;
  deleteFolder: (id: string) => void;
  renameFolder: (id: string, newName: string) => void;
  moveTranscripts: (ids: string[], folderId: string | null) => void;
  refreshData: () => Promise<void>;
}

export const TranscriptContext = createContext<TranscriptContextType | undefined>(undefined);

export function TranscriptProvider({ children }: { children: ReactNode }) {
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshData = useCallback(async () => {
    if (!isAuthenticated()) {
      setLoading(false);
      return;
    }
    try {
      const [transcriptsData, foldersData] = await Promise.all([
        api.transcripts.list(),
        api.folders.list(),
      ]);
      setTranscripts(transcriptsData);
      setFolders(foldersData);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const addTranscript = useCallback((transcript: Transcript) => {
    setTranscripts((prev) => [transcript, ...prev]);
  }, []);

  const uploadFile = useCallback(async (file: File, description?: string, folderId?: string) => {
    const newTranscript = await api.transcripts.upload(file, description, folderId);
    setTranscripts((prev) => [newTranscript, ...prev]);
  }, []);

  const updateTranscript = useCallback(async (id: string, updates: Partial<Transcript>) => {
    try {
      const updated = await api.transcripts.update(id, updates);
      setTranscripts((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (err) {
      console.error('Failed to update transcript:', err);
    }
  }, []);

  const deleteTranscripts = useCallback(async (ids: string[]) => {
    try {
      await api.transcripts.delete(ids);
      setTranscripts((prev) => prev.filter((t) => !ids.includes(t.id)));
    } catch (err) {
      console.error('Failed to delete transcripts:', err);
    }
  }, []);

  const addFolder = useCallback(async (name: string, caseNumber: string, parentId: string | null = null) => {
    try {
      const newFolder = await api.folders.create(name, caseNumber, parentId);
      setFolders((prev) => [...prev, newFolder]);
    } catch (err) {
      console.error('Failed to create folder:', err);
    }
  }, []);

  const deleteFolder = useCallback(async (id: string) => {
    try {
      await api.folders.delete(id);
      setFolders((prev) => prev.filter((f) => f.id !== id));
      setTranscripts((prev) =>
        prev.map((t) => (t.folderId === id ? { ...t, folderId: null } : t))
      );
    } catch (err) {
      console.error('Failed to delete folder:', err);
    }
  }, []);

  const renameFolder = useCallback(async (id: string, newName: string) => {
    try {
      const updated = await api.folders.update(id, { name: newName });
      setFolders((prev) => prev.map((f) => (f.id === id ? updated : f)));
    } catch (err) {
      console.error('Failed to rename folder:', err);
    }
  }, []);

  const moveTranscripts = useCallback(async (ids: string[], folderId: string | null) => {
    try {
      await api.folders.moveTranscripts(ids, folderId);
      setTranscripts((prev) =>
        prev.map((t) => (ids.includes(t.id) ? { ...t, folderId } : t))
      );
    } catch (err) {
      console.error('Failed to move transcripts:', err);
    }
  }, []);

  return (
    <TranscriptContext.Provider
      value={{
        transcripts,
        folders,
        loading,
        addTranscript,
        uploadFile,
        updateTranscript,
        deleteTranscripts,
        addFolder,
        deleteFolder,
        renameFolder,
        moveTranscripts,
        refreshData,
      }}>
      {children}
    </TranscriptContext.Provider>
  );
}
