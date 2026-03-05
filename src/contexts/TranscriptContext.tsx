import React, { useCallback, useState, createContext } from 'react';
import { Transcript, Folder } from '../types/transcript';
import { mockTranscripts, mockFolders } from '../data/mockTranscripts';
interface TranscriptContextType {
  transcripts: Transcript[];
  folders: Folder[];
  addTranscript: (transcript: Transcript) => void;
  updateTranscript: (id: string, updates: Partial<Transcript>) => void;
  deleteTranscripts: (ids: string[]) => void;
  addFolder: (
  name: string,
  caseNumber: string,
  parentId?: string | null)
  => void;
  deleteFolder: (id: string) => void;
  renameFolder: (id: string, newName: string) => void;
  moveTranscripts: (ids: string[], folderId: string | null) => void;
}
export const TranscriptContext = createContext<
  TranscriptContextType | undefined>(
  undefined);
export function TranscriptProvider({ children }: {children: ReactNode;}) {
  const [transcripts, setTranscripts] = useState<Transcript[]>(mockTranscripts);
  const [folders, setFolders] = useState<Folder[]>(mockFolders);
  const addTranscript = useCallback((transcript: Transcript) => {
    setTranscripts((prev) => [transcript, ...prev]);
    // Simulate processing pipeline
    setTimeout(() => {
      setTranscripts((prev) =>
      prev.map((t) =>
      t.id === transcript.id ?
      {
        ...t,
        status: 'processing'
      } :
      t
      )
      );
      setTimeout(() => {
        setTranscripts((prev) =>
        prev.map((t) =>
        t.id === transcript.id ?
        {
          ...t,
          status: 'completed',
          segments: [
          {
            id: Date.now().toString(),
            startTime: 0,
            endTime: 10,
            speaker: 'SPEAKER 1',
            text: 'This is a simulated transcription result.'
          }]

        } :
        t
        )
        );
      }, 5000);
    }, 2000);
  }, []);
  const updateTranscript = useCallback(
    (id: string, updates: Partial<Transcript>) => {
      setTranscripts((prev) =>
      prev.map((t) =>
      t.id === id ?
      {
        ...t,
        ...updates,
        updatedAt: new Date().toISOString()
      } :
      t
      )
      );
    },
    []
  );
  const deleteTranscripts = useCallback((ids: string[]) => {
    setTranscripts((prev) => prev.filter((t) => !ids.includes(t.id)));
  }, []);
  const addFolder = useCallback(
    (name: string, caseNumber: string, parentId: string | null = null) => {
      const newFolder: Folder = {
        id: `f-${Date.now()}`,
        name,
        caseNumber,
        parentId
      };
      setFolders((prev) => [...prev, newFolder]);
    },
    []
  );
  const deleteFolder = useCallback((id: string) => {
    // Collect all descendant folder IDs recursively
    const getDescendantIds = (
    parentId: string,
    allFolders: Folder[])
    : string[] => {
      const children = allFolders.filter((f) => f.parentId === parentId);
      return children.reduce<string[]>(
        (acc, child) => [
        ...acc,
        child.id,
        ...getDescendantIds(child.id, allFolders)],

        []
      );
    };
    setFolders((prev) => {
      const idsToDelete = [id, ...getDescendantIds(id, prev)];
      // Move transcripts from all deleted folders to unfiled
      setTranscripts((prevT) =>
      prevT.map((t) =>
      t.folderId && idsToDelete.includes(t.folderId) ?
      {
        ...t,
        folderId: null
      } :
      t
      )
      );
      return prev.filter((f) => !idsToDelete.includes(f.id));
    });
  }, []);
  const renameFolder = useCallback((id: string, newName: string) => {
    setFolders((prev) =>
    prev.map((f) =>
    f.id === id ?
    {
      ...f,
      name: newName
    } :
    f
    )
    );
  }, []);
  const moveTranscripts = useCallback(
    (ids: string[], folderId: string | null) => {
      setTranscripts((prev) =>
      prev.map((t) =>
      ids.includes(t.id) ?
      {
        ...t,
        folderId,
        updatedAt: new Date().toISOString()
      } :
      t
      )
      );
    },
    []
  );
  return (
    <TranscriptContext.Provider
      value={{
        transcripts,
        folders,
        addTranscript,
        updateTranscript,
        deleteTranscripts,
        addFolder,
        deleteFolder,
        renameFolder,
        moveTranscripts
      }}>

      {children}
    </TranscriptContext.Provider>);

}