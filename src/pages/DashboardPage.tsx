import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArchiveIcon, FileIcon, FolderInputIcon } from 'lucide-react';
import { useTranscripts } from '../hooks/useTranscripts';
import { TranscriptCard } from '../components/transcripts/TranscriptCard';
import { SearchBar } from '../components/transcripts/SearchBar';
import { toast } from 'sonner';

interface SelectionBarProps {
  selectedCount: number;
  showMoveMenu: boolean;
  onToggleMoveMenu: () => void;
  onBatchMove: (folderId: string | null) => void;
  onBatchDelete: () => void;
  onCancel: () => void;
  folders: { id: string; name: string }[];
}

function SelectionBar({ selectedCount, showMoveMenu, onToggleMoveMenu, onBatchMove, onBatchDelete, onCancel, folders }: SelectionBarProps) {
  const [bottomOffset, setBottomOffset] = useState(8);

  const updatePosition = useCallback(() => {
    if (window.visualViewport) {
      const vvHeight = window.visualViewport.height;
      const windowHeight = window.innerHeight;
      const diff = windowHeight - vvHeight;
      setBottomOffset(diff > 0 ? diff + 8 : 8);
    }
  }, []);

  useEffect(() => {
    updatePosition();
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', updatePosition);
      vv.addEventListener('scroll', updatePosition);
      return () => {
        vv.removeEventListener('resize', updatePosition);
        vv.removeEventListener('scroll', updatePosition);
      };
    }
  }, [updatePosition]);

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      style={{ bottom: `${bottomOffset}px` }}
      className="fixed left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 md:ml-32 bg-slate-900 dark:bg-slate-800 text-white px-4 sm:px-6 py-3 sm:py-4 rounded-xl shadow-2xl flex items-center justify-center gap-3 sm:gap-6 z-20 sm:w-auto">
      <span className="font-medium text-sm sm:text-base whitespace-nowrap">
        {selectedCount} selected
      </span>
      <div className="h-6 w-px bg-slate-700" />
      <div className="relative">
        <button
          onClick={onToggleMoveMenu}
          className="flex items-center gap-2 text-slate-300 hover:text-white font-medium transition-colors text-sm">
          <FolderInputIcon className="h-4 w-4" />
          Move
        </button>
        {showMoveMenu &&
          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-800 dark:bg-slate-700 border border-slate-700 dark:border-slate-600 rounded-lg shadow-xl py-1 min-w-[200px]">
            <button
              onClick={() => onBatchMove(null)}
              className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 dark:hover:bg-slate-600 hover:text-white transition-colors">
              Unfiled (No Folder)
            </button>
            <div className="h-px bg-slate-700 dark:bg-slate-600 my-1" />
            {folders.map((folder) =>
              <button
                key={folder.id}
                onClick={() => onBatchMove(folder.id)}
                className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 dark:hover:bg-slate-600 hover:text-white transition-colors">
                {folder.name}
              </button>
            )}
          </div>
        }
      </div>
      <button
        onClick={onBatchDelete}
        className="flex items-center gap-2 text-red-400 hover:text-red-300 font-medium transition-colors text-sm">
        <ArchiveIcon className="h-4 w-4" />
        Archive
      </button>
      <button
        onClick={onCancel}
        className="text-slate-400 hover:text-white text-xs sm:text-sm font-medium ml-2 sm:ml-4 transition-colors">
        Cancel
      </button>
    </motion.div>
  );
}

export function DashboardPage() {
  const { transcripts, folders, deleteTranscripts, moveTranscripts } =
  useTranscripts();
  const { selectedFolderId } = useOutletContext<{
    selectedFolderId: string | null;
  }>();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const filteredTranscripts = useMemo(() => {
    return transcripts.filter((t) => {
      const matchesFolder = selectedFolderId ?
      t.folderId === selectedFolderId :
      true;
      const matchesSearch =
      t.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesFolder && matchesSearch;
    });
  }, [transcripts, selectedFolderId, searchQuery]);
  const handleSelect = (id: string, selected: boolean) => {
    const newSelected = new Set(selectedIds);
    if (selected) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedIds(newSelected);
  };
  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    deleteTranscripts(Array.from(selectedIds));
    toast.success(`Archived ${selectedIds.size} transcript(s)`);
    setSelectedIds(new Set());
  };
  const handleBatchMove = (folderId: string | null) => {
    if (selectedIds.size === 0) return;
    moveTranscripts(Array.from(selectedIds), folderId);
    const folderName = folderId ?
    folders.find((f) => f.id === folderId)?.name || 'folder' :
    'All Transcripts';
    toast.success(`Moved ${selectedIds.size} transcript(s) to ${folderName}`);
    setSelectedIds(new Set());
    setShowMoveMenu(false);
  };
  const selectionMode = selectedIds.size > 0;
  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950">
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sticky top-0 z-10">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            Transcripts
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Manage and review your case recordings
          </p>
        </div>
        <SearchBar value={searchQuery} onChange={setSearchQuery} />
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-8">
        {filteredTranscripts.length > 0 ?
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 sm:gap-4 pb-24">
            {filteredTranscripts.map((transcript) =>
          <TranscriptCard
            key={transcript.id}
            transcript={transcript}
            isSelected={selectedIds.has(transcript.id)}
            onSelect={handleSelect}
            selectionMode={selectionMode} />

          )}
          </div> :

        <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto">
            <div className="h-16 w-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
              <FileIcon className="h-8 w-8 text-slate-400 dark:text-slate-500" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
              No transcripts found
            </h3>
            <p className="text-slate-500 dark:text-slate-400">
              {searchQuery ?
            'Try adjusting your search terms or filters.' :
            'Upload an audio or video file to get started with AI transcription.'}
            </p>
          </div>
        }
      </div>

      <AnimatePresence>
        {selectionMode &&
        <SelectionBar
          selectedCount={selectedIds.size}
          showMoveMenu={showMoveMenu}
          onToggleMoveMenu={() => setShowMoveMenu(!showMoveMenu)}
          onBatchMove={handleBatchMove}
          onBatchDelete={handleBatchDelete}
          onCancel={() => { setSelectedIds(new Set()); setShowMoveMenu(false); }}
          folders={folders} />
        }
      </AnimatePresence>
    </div>);

}