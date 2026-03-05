import React, { useEffect, useState, useRef, Children } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import {
  FolderIcon,
  UploadIcon,
  LayoutDashboardIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
  CheckIcon,
  MoreHorizontalIcon,
  EditIcon,
  FolderPlusIcon,
  ChevronRightIcon,
  ChevronDownIcon } from
'lucide-react';
import { useTranscripts } from '../../hooks/useTranscripts';
import { SettingsPanel } from './SettingsPanel';
import { Logo } from '../brand/Logo';
import { Folder } from '../../types/transcript';
interface SidebarProps {
  onUploadClick: () => void;
  selectedFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  onClose?: () => void;
  isMobile?: boolean;
}
export function Sidebar({
  onUploadClick,
  selectedFolderId,
  onSelectFolder,
  onClose,
  isMobile
}: SidebarProps) {
  const { folders, transcripts, addFolder, deleteFolder, renameFolder } =
  useTranscripts();
  const location = useLocation();
  const isDashboard = location.pathname === '/';
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [creatingParentId, setCreatingParentId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [newCaseNumber, setNewCaseNumber] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [menuFolderId, setMenuFolderId] = useState<string | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const menuRef = useRef<HTMLDivElement>(null);
  // Close menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuFolderId(null);
      }
    };
    if (menuFolderId) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuFolderId]);
  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      addFolder(
        newFolderName.trim(),
        newCaseNumber.trim() || 'N/A',
        creatingParentId
      );
      if (creatingParentId) {
        setExpandedFolders((prev) => new Set([...prev, creatingParentId]));
      }
      setNewFolderName('');
      setNewCaseNumber('');
      setIsCreatingFolder(false);
      setCreatingParentId(null);
    }
  };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCreateFolder();
    if (e.key === 'Escape') {
      setIsCreatingFolder(false);
      setCreatingParentId(null);
      setNewFolderName('');
      setNewCaseNumber('');
    }
  };
  const handleRenameKeyDown = (e: React.KeyboardEvent, folderId: string) => {
    if (e.key === 'Enter') {
      if (renameValue.trim()) renameFolder(folderId, renameValue.trim());
      setRenamingFolderId(null);
    }
    if (e.key === 'Escape') setRenamingFolderId(null);
  };
  const handleNavClick = (folderId: string | null) => {
    if (!isDashboard) window.location.href = '/';
    onSelectFolder(folderId);
    if (isMobile && onClose) onClose();
  };
  const toggleExpand = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);else
      next.add(folderId);
      return next;
    });
  };
  const startCreateSubfolder = (parentId: string) => {
    setCreatingParentId(parentId);
    setIsCreatingFolder(true);
    setNewFolderName('');
    setNewCaseNumber('');
    setMenuFolderId(null);
    setExpandedFolders((prev) => new Set([...prev, parentId]));
  };
  const startRename = (folder: Folder) => {
    setRenamingFolderId(folder.id);
    setRenameValue(folder.name);
    setMenuFolderId(null);
  };
  const handleDeleteFromMenu = (folderId: string) => {
    if (selectedFolderId === folderId) onSelectFolder(null);
    deleteFolder(folderId);
    setMenuFolderId(null);
  };
  // Get children of a folder
  const getChildren = (parentId: string | null) =>
  folders.filter((f) => f.parentId === parentId);
  const getTranscriptCount = (folderId: string): number => {
    const direct = transcripts.filter((t) => t.folderId === folderId).length;
    const childFolders = folders.filter((f) => f.parentId === folderId);
    const childCount = childFolders.reduce(
      (sum, cf) => sum + getTranscriptCount(cf.id),
      0
    );
    return direct + childCount;
  };
  const renderFolder = (folder: Folder, depth: number = 0) => {
    const children = getChildren(folder.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedFolders.has(folder.id);
    const count = getTranscriptCount(folder.id);
    const isRenaming = renamingFolderId === folder.id;
    const isMenuOpen = menuFolderId === folder.id;
    const isCreatingHere = isCreatingFolder && creatingParentId === folder.id;
    return (
      <div key={folder.id}>
        <div className="relative group flex items-center">
          {/* Expand/collapse toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand(folder.id);
            }}
            className={`flex-shrink-0 w-5 h-5 flex items-center justify-center text-slate-500 hover:text-slate-300 transition-colors ${!hasChildren && !isCreatingHere ? 'invisible' : ''}`}
            style={{
              marginLeft: `${depth * 12}px`
            }}>

            {(hasChildren || isCreatingHere) && (
            isExpanded ?
            <ChevronDownIcon className="h-3 w-3" /> :

            <ChevronRightIcon className="h-3 w-3" />)
            }
          </button>

          {isRenaming ?
          <div className="flex-1 flex items-center gap-1 mx-1">
              <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => handleRenameKeyDown(e, folder.id)}
              onBlur={() => {
                if (renameValue.trim())
                renameFolder(folder.id, renameValue.trim());
                setRenamingFolderId(null);
              }}
              className="flex-1 bg-slate-700 text-white text-sm rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 border-none"
              autoFocus />

            </div> :

          <button
            onClick={() => handleNavClick(folder.id)}
            className={`flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md text-sm font-medium transition-colors min-w-0 ${selectedFolderId === folder.id && isDashboard ? 'bg-slate-800 text-white' : 'hover:bg-slate-800 hover:text-white'}`}>

              <FolderIcon className="h-4 w-4 text-slate-400 flex-shrink-0" />
              <span className="truncate text-left flex-1">{folder.name}</span>
              <span className="text-xs text-slate-500 flex-shrink-0">
                {count}
              </span>
            </button>
          }

          {/* Context menu trigger */}
          {!isRenaming &&
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuFolderId(isMenuOpen ? null : folder.id);
            }}
            className="flex-shrink-0 p-1 text-slate-600 hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity rounded"
            aria-label="Folder options">

              <MoreHorizontalIcon className="h-3.5 w-3.5" />
            </button>
          }

          {/* Context menu dropdown */}
          {isMenuOpen &&
          <div
            ref={menuRef}
            className="absolute right-0 top-full mt-1 bg-slate-800 dark:bg-slate-750 border border-slate-700 rounded-lg shadow-xl py-1 min-w-[160px] z-30">

              <button
              onClick={() => startRename(folder)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 hover:text-white transition-colors">

                <EditIcon className="h-3.5 w-3.5" />
                Rename Folder
              </button>
              <button
              onClick={() => startCreateSubfolder(folder.id)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 hover:text-white transition-colors">

                <FolderPlusIcon className="h-3.5 w-3.5" />
                Create Subfolder
              </button>
              <div className="h-px bg-slate-700 my-1" />
              <button
              onClick={() => handleDeleteFromMenu(folder.id)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-slate-700 hover:text-red-300 transition-colors">

                <TrashIcon className="h-3.5 w-3.5" />
                Delete Folder
              </button>
            </div>
          }
        </div>

        {/* Subfolder creation form */}
        {isCreatingHere && isExpanded &&
        <div
          className="ml-5 mt-1 mb-1"
          style={{
            paddingLeft: `${(depth + 1) * 12}px`
          }}>

            <div className="bg-slate-800 rounded-lg p-2.5 space-y-1.5">
              <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Subfolder name"
              className="w-full bg-slate-700 text-white text-xs rounded-md px-2.5 py-1.5 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 border-none"
              autoFocus />

              <div className="flex items-center gap-1.5">
                <button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
                className="flex-1 flex items-center justify-center gap-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-medium py-1 rounded-md transition-colors">

                  <CheckIcon className="h-3 w-3" />
                  Create
                </button>
                <button
                onClick={() => {
                  setIsCreatingFolder(false);
                  setCreatingParentId(null);
                  setNewFolderName('');
                  setNewCaseNumber('');
                }}
                className="flex-1 flex items-center justify-center gap-1 text-slate-400 hover:text-white text-xs font-medium py-1 rounded-md hover:bg-slate-700 transition-colors">

                  <XIcon className="h-3 w-3" />
                  Cancel
                </button>
              </div>
            </div>
          </div>
        }

        {/* Children */}
        {isExpanded && children.map((child) => renderFolder(child, depth + 1))}
      </div>);

  };
  const rootFolders = getChildren(null);
  return (
    <div
      className={`${isMobile ? 'w-72' : 'w-64'} bg-slate-900 dark:bg-slate-950 text-slate-300 flex flex-col h-full border-r border-slate-800 dark:border-slate-800`}>

      <div className="p-5 flex items-center justify-between">
        <Logo variant="full" size={28} inverted />
        {isMobile && onClose &&
        <button
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-white transition-colors">

            <XIcon className="h-5 w-5" />
          </button>
        }
      </div>

      <div className="px-4 mb-6">
        <button
          onClick={() => {
            onUploadClick();
            if (isMobile && onClose) onClose();
          }}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-md font-medium flex items-center justify-center gap-2 transition-colors shadow-sm">

          <UploadIcon className="h-4 w-4" />
          Upload File
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 space-y-1">
        <button
          onClick={() => handleNavClick(null)}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${selectedFolderId === null && isDashboard ? 'bg-slate-800 text-white' : 'hover:bg-slate-800 hover:text-white'}`}>

          <LayoutDashboardIcon className="h-4 w-4" />
          All Transcripts
          <span className="ml-auto bg-slate-800 text-slate-400 py-0.5 px-2 rounded-full text-xs">
            {transcripts.length}
          </span>
        </button>

        <div className="pt-6 pb-2 flex items-center justify-between px-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Cases & Folders
          </p>
          <button
            onClick={() => {
              setIsCreatingFolder(true);
              setCreatingParentId(null);
            }}
            className="text-slate-500 hover:text-indigo-400 transition-colors p-0.5 rounded hover:bg-slate-800"
            aria-label="Create new folder">

            <PlusIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Root-level folder creation form */}
        {isCreatingFolder && creatingParentId === null &&
        <div className="mx-1 mb-2 bg-slate-800 rounded-lg p-3 space-y-2">
            <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Folder name"
            className="w-full bg-slate-700 text-white text-sm rounded-md px-3 py-1.5 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 border-none"
            autoFocus />

            <input
            type="text"
            value={newCaseNumber}
            onChange={(e) => setNewCaseNumber(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Case number (optional)"
            className="w-full bg-slate-700 text-white text-sm rounded-md px-3 py-1.5 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 border-none" />

            <div className="flex items-center gap-2">
              <button
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim()}
              className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white text-xs font-medium py-1.5 rounded-md transition-colors">

                <CheckIcon className="h-3.5 w-3.5" />
                Create
              </button>
              <button
              onClick={() => {
                setIsCreatingFolder(false);
                setCreatingParentId(null);
                setNewFolderName('');
                setNewCaseNumber('');
              }}
              className="flex-1 flex items-center justify-center gap-1.5 text-slate-400 hover:text-white text-xs font-medium py-1.5 rounded-md hover:bg-slate-700 transition-colors">

                <XIcon className="h-3.5 w-3.5" />
                Cancel
              </button>
            </div>
          </div>
        }

        {/* Folder tree */}
        <div className="space-y-0.5 px-1">
          {rootFolders.map((folder) => renderFolder(folder))}
        </div>
      </nav>

      <div className="p-4 border-t border-slate-800 relative">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="w-full flex items-center gap-3 hover:bg-slate-800 rounded-lg p-1 -m-1 transition-colors">

          <div className="h-8 w-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            JD
          </div>
          <div className="flex flex-col text-left">
            <span className="text-sm font-medium text-white">Jane Doe</span>
            <span className="text-xs text-slate-500">Attorney</span>
          </div>
        </button>

        <AnimatePresence>
          {showSettings &&
          <SettingsPanel onClose={() => setShowSettings(false)} />
          }
        </AnimatePresence>
      </div>
    </div>);

}