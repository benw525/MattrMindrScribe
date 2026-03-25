import React, { useState, useEffect, useCallback } from 'react';
import { ArchiveIcon, RotateCcwIcon, Trash2Icon, FolderIcon, FileIcon, LoaderIcon } from 'lucide-react';
import { api } from '../utils/api';
import { Transcript, Folder } from '../types/transcript';
import { toast } from 'sonner';
import { useTranscripts } from '../hooks/useTranscripts';

export default function ArchivesPage() {
  const [archivedTranscripts, setArchivedTranscripts] = useState<Transcript[]>([]);
  const [archivedFolders, setArchivedFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTranscriptIds, setSelectedTranscriptIds] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<'transcripts' | 'folders'>('transcripts');
  const { refreshData } = useTranscripts();

  const fetchArchived = useCallback(async () => {
    setLoading(true);
    try {
      const [transcripts, folders] = await Promise.all([
        api.transcripts.archived(),
        api.folders.archived(),
      ]);
      setArchivedTranscripts(transcripts);
      setArchivedFolders(folders);
    } catch (err) {
      console.error('Failed to fetch archived items:', err);
      toast.error('Failed to load archives');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchArchived();
  }, [fetchArchived]);

  const handleRestoreTranscripts = async () => {
    if (selectedTranscriptIds.size === 0) return;
    try {
      await api.transcripts.restore(Array.from(selectedTranscriptIds));
      toast.success(`Restored ${selectedTranscriptIds.size} transcript(s)`);
      setSelectedTranscriptIds(new Set());
      refreshData();
      fetchArchived();
    } catch (err) {
      toast.error('Failed to restore transcripts');
    }
  };

  const handlePermanentDeleteTranscripts = async () => {
    if (selectedTranscriptIds.size === 0) return;
    const confirmed = window.confirm(
      `Permanently delete ${selectedTranscriptIds.size} transcript(s)? This cannot be undone.`
    );
    if (!confirmed) return;
    try {
      await api.transcripts.permanentDelete(Array.from(selectedTranscriptIds));
      toast.success(`Permanently deleted ${selectedTranscriptIds.size} transcript(s)`);
      setSelectedTranscriptIds(new Set());
      fetchArchived();
    } catch (err) {
      toast.error('Failed to delete transcripts');
    }
  };

  const handleRestoreFolder = async (folderId: string) => {
    try {
      await api.folders.restore(folderId);
      toast.success('Folder restored');
      refreshData();
      fetchArchived();
    } catch (err) {
      toast.error('Failed to restore folder');
    }
  };

  const handlePermanentDeleteFolder = async (folderId: string) => {
    const confirmed = window.confirm(
      'Permanently delete this folder and all its transcripts? This cannot be undone.'
    );
    if (!confirmed) return;
    try {
      await api.folders.permanentDelete(folderId);
      toast.success('Folder permanently deleted');
      fetchArchived();
    } catch (err) {
      toast.error('Failed to delete folder');
    }
  };

  const toggleTranscriptSelection = (id: string) => {
    setSelectedTranscriptIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllTranscripts = () => {
    if (selectedTranscriptIds.size === archivedTranscripts.length) {
      setSelectedTranscriptIds(new Set());
    } else {
      setSelectedTranscriptIds(new Set(archivedTranscripts.map((t) => t.id)));
    }
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <LoaderIcon className="h-8 w-8 text-slate-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-900">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-3 mb-6">
          <ArchiveIcon className="h-6 w-6 text-slate-400" />
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Archives</h1>
        </div>

        <div className="flex gap-1 mb-6 bg-slate-200 dark:bg-slate-800 rounded-lg p-1 w-fit">
          <button
            onClick={() => setTab('transcripts')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === 'transcripts'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}>
            Transcripts
            {archivedTranscripts.length > 0 && (
              <span className="ml-2 bg-slate-300 dark:bg-slate-600 text-slate-700 dark:text-slate-300 py-0.5 px-2 rounded-full text-xs">
                {archivedTranscripts.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('folders')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === 'folders'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}>
            Folders
            {archivedFolders.length > 0 && (
              <span className="ml-2 bg-slate-300 dark:bg-slate-600 text-slate-700 dark:text-slate-300 py-0.5 px-2 rounded-full text-xs">
                {archivedFolders.length}
              </span>
            )}
          </button>
        </div>

        {tab === 'transcripts' && (
          <>
            {archivedTranscripts.length > 0 && (
              <div className="flex items-center gap-3 mb-4">
                <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedTranscriptIds.size === archivedTranscripts.length && archivedTranscripts.length > 0}
                    onChange={selectAllTranscripts}
                    className="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
                  />
                  Select all
                </label>
                {selectedTranscriptIds.size > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleRestoreTranscripts}
                      className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-1.5 rounded-md transition-colors">
                      <RotateCcwIcon className="h-3.5 w-3.5" />
                      Restore ({selectedTranscriptIds.size})
                    </button>
                    <button
                      onClick={handlePermanentDeleteTranscripts}
                      className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-3 py-1.5 rounded-md transition-colors">
                      <Trash2Icon className="h-3.5 w-3.5" />
                      Delete Permanently ({selectedTranscriptIds.size})
                    </button>
                  </div>
                )}
              </div>
            )}

            {archivedTranscripts.length === 0 ? (
              <div className="text-center py-16">
                <ArchiveIcon className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                <p className="text-slate-500 dark:text-slate-400">No archived transcripts</p>
              </div>
            ) : (
              <div className="space-y-2">
                {archivedTranscripts.map((t) => (
                  <div
                    key={t.id}
                    className={`bg-white dark:bg-slate-800 rounded-lg border transition-colors p-4 flex items-center gap-4 ${
                      selectedTranscriptIds.has(t.id)
                        ? 'border-indigo-500 dark:border-indigo-400'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}>
                    <input
                      type="checkbox"
                      checked={selectedTranscriptIds.has(t.id)}
                      onChange={() => toggleTranscriptSelection(t.id)}
                      className="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 flex-shrink-0"
                    />
                    <FileIcon className="h-5 w-5 text-slate-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {t.filename}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {formatFileSize(t.fileSize)} · Archived {formatDate(t.archivedAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={async () => {
                          try {
                            await api.transcripts.restore([t.id]);
                            toast.success('Transcript restored');
                            refreshData();
                            fetchArchived();
                          } catch { toast.error('Failed to restore'); }
                        }}
                        className="p-2 text-slate-400 hover:text-indigo-500 transition-colors rounded-md hover:bg-slate-100 dark:hover:bg-slate-700"
                        title="Restore">
                        <RotateCcwIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={async () => {
                          if (!window.confirm('Permanently delete this transcript? This cannot be undone.')) return;
                          try {
                            await api.transcripts.permanentDelete([t.id]);
                            toast.success('Transcript permanently deleted');
                            fetchArchived();
                          } catch { toast.error('Failed to delete'); }
                        }}
                        className="p-2 text-slate-400 hover:text-red-500 transition-colors rounded-md hover:bg-slate-100 dark:hover:bg-slate-700"
                        title="Delete permanently">
                        <Trash2Icon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'folders' && (
          <>
            {archivedFolders.length === 0 ? (
              <div className="text-center py-16">
                <ArchiveIcon className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                <p className="text-slate-500 dark:text-slate-400">No archived folders</p>
              </div>
            ) : (
              <div className="space-y-2">
                {archivedFolders.map((f) => (
                  <div
                    key={f.id}
                    className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-4">
                    <FolderIcon className="h-5 w-5 text-slate-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {f.name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {f.caseNumber !== 'N/A' ? `Case: ${f.caseNumber} · ` : ''}
                        Archived {formatDate(f.archivedAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleRestoreFolder(f.id)}
                        className="flex items-center gap-1.5 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium px-3 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                        <RotateCcwIcon className="h-3.5 w-3.5" />
                        Restore
                      </button>
                      <button
                        onClick={() => handlePermanentDeleteFolder(f.id)}
                        className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600 font-medium px-3 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                        <Trash2Icon className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}