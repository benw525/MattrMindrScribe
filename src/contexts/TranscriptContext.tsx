import React, { useCallback, useState, useEffect, useRef, createContext, ReactNode } from 'react';
import { Transcript, Folder, UploadEntry } from '../types/transcript';
import { api, isAuthenticated } from '../utils/api';
import { toast } from 'sonner';

interface TranscriptContextType {
  transcripts: Transcript[];
  folders: Folder[];
  loading: boolean;
  activeUploads: UploadEntry[];
  addTranscript: (transcript: Transcript) => void;
  uploadFile: (file: File, description?: string, folderId?: string, onProgress?: (percent: number) => void) => Promise<void>;
  startBackgroundUpload: (file: File, description?: string, folderId?: string) => void;
  dismissUpload: (id: string) => void;
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
  const [activeUploads, setActiveUploads] = useState<UploadEntry[]>([]);
  const uploadIdCounter = useRef(0);

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

  const uploadFile = useCallback(async (file: File, description?: string, folderId?: string, onProgress?: (percent: number) => void) => {
    const newTranscript = await api.transcripts.upload(file, description, folderId, onProgress);
    setTranscripts((prev) => [newTranscript, ...prev]);
  }, []);

  const startBackgroundUpload = useCallback((file: File, description?: string, folderId?: string) => {
    const uploadId = `upload-${++uploadIdCounter.current}-${Date.now()}`;
    const entry: UploadEntry = {
      id: uploadId,
      filename: file.name,
      progress: 0,
      status: 'uploading',
    };
    setActiveUploads((prev) => [...prev, entry]);

    api.transcripts.upload(file, description, folderId, (percent) => {
      setActiveUploads((prev) =>
        prev.map((u) => u.id === uploadId ? { ...u, progress: percent } : u)
      );
    }).then((newTranscript) => {
      setActiveUploads((prev) =>
        prev.map((u) => u.id === uploadId ? { ...u, progress: 100, status: 'complete' as const } : u)
      );
      setTranscripts((prev) => [newTranscript, ...prev]);
      setTimeout(() => {
        setActiveUploads((prev) => prev.filter((u) => u.id !== uploadId));
      }, 3000);
    }).catch((err) => {
      const errorMsg = err.message || 'Upload failed';
      toast.error(`Upload failed: ${file.name}`);
      setActiveUploads((prev) =>
        prev.map((u) => u.id === uploadId ? { ...u, status: 'error' as const, errorMessage: errorMsg } : u)
      );
      setTimeout(() => {
        setActiveUploads((prev) => prev.filter((u) => u.id !== uploadId));
      }, 5000);
    });
  }, []);

  const dismissUpload = useCallback((id: string) => {
    setActiveUploads((prev) => prev.filter((u) => u.id !== id));
  }, []);

  const updateTranscript = useCallback(async (id: string, updates: Partial<Transcript>) => {
    const rollback = new Map<string, Transcript>();
    setTranscripts((prev) => prev.map((t) => {
      if (t.id === id) {
        rollback.set(id, t);
        return { ...t, ...updates };
      }
      return t;
    }));
    try {
      await api.transcripts.update(id, updates);
    } catch (err) {
      console.error('Failed to update transcript:', err);
      const original = rollback.get(id);
      if (original) {
        setTranscripts((prev) => prev.map((t) => (t.id === id ? original : t)));
        toast.error('Failed to save changes');
      }
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
        activeUploads,
        addTranscript,
        uploadFile,
        startBackgroundUpload,
        dismissUpload,
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
