import React, { useEffect, useState, useRef, useCallback, Children } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
  ChevronDownIcon,
  LinkIcon,
  PinIcon,
  SearchIcon,
  LoaderIcon,
  SendIcon,
  MicIcon } from
'lucide-react';
import { toast } from 'sonner';
import { useTranscripts } from '../../hooks/useTranscripts';
import { useAuth } from '../../contexts/AuthContext';
import { SettingsPanel, ChangePasswordModal } from './SettingsPanel';
import { Logo } from '../brand/Logo';
import { Folder } from '../../types/transcript';
import { api } from '../../utils/api';

interface MattrMindrCase {
  id: string;
  name: string;
  caseNumber: string;
  pinned: boolean;
}

interface SendConflict {
  transcriptId: string;
  filename: string;
  existingFileId: string;
}
interface SidebarProps {
  onUploadClick: () => void;
  onRecordClick: () => void;
  selectedFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  onClose?: () => void;
  isMobile?: boolean;
}
export function Sidebar({
  onUploadClick,
  onRecordClick,
  selectedFolderId,
  onSelectFolder,
  onClose,
  isMobile
}: SidebarProps) {
  const { folders, transcripts, addFolder, deleteFolder, renameFolder } =
  useTranscripts();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isDashboard = location.pathname === '/app' || location.pathname === '/app/';
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [creatingParentId, setCreatingParentId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [newCaseNumber, setNewCaseNumber] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [menuFolderId, setMenuFolderId] = useState<string | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [mattrmindrConnected, setMattrmindrConnected] = useState(false);
  const [createTab, setCreateTab] = useState<'new' | 'mattrmindr'>('new');
  const [caseSearchQuery, setCaseSearchQuery] = useState('');
  const [caseSearchResults, setCaseSearchResults] = useState<MattrMindrCase[]>([]);
  const [caseSearchLoading, setCaseSearchLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [sendingFolderId, setSendingFolderId] = useState<string | null>(null);
  const [sendConflicts, setSendConflicts] = useState<SendConflict[]>([]);
  const [sendConflictFolderId, setSendConflictFolderId] = useState<string | null>(null);
  const [selectedReplacements, setSelectedReplacements] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.mattrmindr.status().then((res) => {
      setMattrmindrConnected(!!res?.connected);
    }).catch(() => {
      setMattrmindrConnected(false);
    });
  }, []);

  const handleCaseSearch = useCallback((query: string) => {
    setCaseSearchQuery(query);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setCaseSearchResults([]);
      setCaseSearchLoading(false);
      return;
    }
    setCaseSearchLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.mattrmindr.searchCases(query);
        const cases: MattrMindrCase[] = res.cases || [];
        cases.sort((a: MattrMindrCase, b: MattrMindrCase) => {
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          return 0;
        });
        setCaseSearchResults(cases);
      } catch {
        setCaseSearchResults([]);
      } finally {
        setCaseSearchLoading(false);
      }
    }, 300);
  }, []);

  const handleSelectCase = useCallback(async (c: MattrMindrCase) => {
    try {
      await addFolder(c.name, c.caseNumber, creatingParentId, c.id, c.name);
      if (creatingParentId) {
        setExpandedFolders((prev) => new Set([...prev, creatingParentId]));
      }
      setIsCreatingFolder(false);
      setCreatingParentId(null);
      setCaseSearchQuery('');
      setCaseSearchResults([]);
      setCreateTab('new');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create folder from case');
    }
  }, [addFolder, creatingParentId]);

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
  const handleCreateFolder = async () => {
    if (newFolderName.trim()) {
      try {
        await addFolder(
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
      } catch (err: any) {
        toast.error(err?.message || 'Failed to create folder');
      }
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
    onSelectFolder(folderId);
    if (!isDashboard) navigate('/app');
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
  const handleSendToMattrMindr = async (folderId: string) => {
    setMenuFolderId(null);
    setSendingFolderId(folderId);
    try {
      const result = await api.mattrmindr.sendToCase(folderId);
      if (result.status === 'conflicts') {
        setSendConflicts(result.conflicts);
        setSendConflictFolderId(folderId);
        setSelectedReplacements(new Set(result.conflicts.map((c: SendConflict) => c.transcriptId)));
      } else if (result.status === 'sent') {
        const succeeded = result.results.filter((r: any) => r.success).length;
        const failed = result.results.filter((r: any) => !r.success).length;
        if (failed > 0) {
          toast.warning(`Sent ${succeeded} file(s) to MattrMindr. ${failed} failed.`);
        } else {
          toast.success(`Sent ${succeeded} file(s) to MattrMindr successfully!`);
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to send to MattrMindr');
    } finally {
      setSendingFolderId(null);
    }
  };
  const handleConfirmSend = async () => {
    if (!sendConflictFolderId) return;
    setSendingFolderId(sendConflictFolderId);
    try {
      const replaceFileIds: Record<string, string> = {};
      for (const conflict of sendConflicts) {
        if (selectedReplacements.has(conflict.transcriptId)) {
          replaceFileIds[conflict.transcriptId] = conflict.existingFileId;
        }
      }
      const result = await api.mattrmindr.confirmSend(sendConflictFolderId, replaceFileIds as any);
      const succeeded = result.results.filter((r: any) => r.success).length;
      const failed = result.results.filter((r: any) => !r.success).length;
      if (failed > 0) {
        toast.warning(`Sent ${succeeded} file(s) to MattrMindr. ${failed} failed.`);
      } else {
        toast.success(`Sent ${succeeded} file(s) to MattrMindr successfully!`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to send to MattrMindr');
    } finally {
      setSendingFolderId(null);
      setSendConflicts([]);
      setSendConflictFolderId(null);
      setSelectedReplacements(new Set());
    }
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
              {folder.mattrmindrCaseId && (
                <LinkIcon className="h-3 w-3 text-indigo-400 flex-shrink-0" />
              )}
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
              {folder.mattrmindrCaseId && mattrmindrConnected &&
              <button
                onClick={() => handleSendToMattrMindr(folder.id)}
                disabled={sendingFolderId === folder.id}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-indigo-300 hover:bg-slate-700 hover:text-indigo-200 transition-colors disabled:opacity-50">
                {sendingFolderId === folder.id ?
                  <LoaderIcon className="h-3.5 w-3.5 animate-spin" /> :
                  <SendIcon className="h-3.5 w-3.5" />
                }
                Send to MattrMindr
              </button>
              }
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

      <div className="px-4 mb-6 flex gap-2">
        <button
          onClick={() => {
            onUploadClick();
            if (isMobile && onClose) onClose();
          }}
          className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2.5 rounded-md font-medium flex items-center justify-center gap-2 transition-colors shadow-sm text-sm">
          <UploadIcon className="h-4 w-4" />
          Upload
        </button>
        <button
          onClick={() => {
            onRecordClick();
            if (isMobile && onClose) onClose();
          }}
          className="bg-red-500 hover:bg-red-600 text-white px-3 py-2.5 rounded-md font-medium flex items-center justify-center gap-2 transition-colors shadow-sm text-sm">
          <MicIcon className="h-4 w-4" />
          Record
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
            {mattrmindrConnected && (
              <div className="flex rounded-md overflow-hidden border border-slate-700 mb-1">
                <button
                  onClick={() => setCreateTab('new')}
                  className={`flex-1 text-xs font-medium py-1.5 transition-colors ${createTab === 'new' ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-white'}`}>
                  New Folder
                </button>
                <button
                  onClick={() => setCreateTab('mattrmindr')}
                  className={`flex-1 text-xs font-medium py-1.5 transition-colors ${createTab === 'mattrmindr' ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-white'}`}>
                  MattrMindr Case
                </button>
              </div>
            )}

            {createTab === 'new' ? (
              <>
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
                      setCreateTab('new');
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 text-slate-400 hover:text-white text-xs font-medium py-1.5 rounded-md hover:bg-slate-700 transition-colors">
                    <XIcon className="h-3.5 w-3.5" />
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="relative">
                  <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={caseSearchQuery}
                    onChange={(e) => handleCaseSearch(e.target.value)}
                    placeholder="Search cases..."
                    className="w-full bg-slate-700 text-white text-sm rounded-md pl-8 pr-3 py-1.5 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 border-none"
                    autoFocus />
                  {caseSearchLoading && (
                    <LoaderIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 animate-spin" />
                  )}
                </div>
                {caseSearchResults.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-md border border-slate-700 bg-slate-750">
                    {caseSearchResults.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => handleSelectCase(c)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-700 transition-colors border-b border-slate-700 last:border-b-0">
                        {c.pinned && <PinIcon className="h-3 w-3 text-amber-400 flex-shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <div className="text-white truncate">{c.name}</div>
                          <div className="text-slate-400 truncate">{c.caseNumber}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {caseSearchQuery.trim() && !caseSearchLoading && caseSearchResults.length === 0 && (
                  <p className="text-xs text-slate-500 text-center py-2">No cases found</p>
                )}
                <button
                  onClick={() => {
                    setIsCreatingFolder(false);
                    setCreatingParentId(null);
                    setCaseSearchQuery('');
                    setCaseSearchResults([]);
                    setCreateTab('new');
                  }}
                  className="w-full flex items-center justify-center gap-1.5 text-slate-400 hover:text-white text-xs font-medium py-1.5 rounded-md hover:bg-slate-700 transition-colors">
                  <XIcon className="h-3 w-3" />
                  Cancel
                </button>
              </>
            )}
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
            {user?.fullName ? user.fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '??'}
          </div>
          <div className="flex flex-col text-left">
            <span className="text-sm font-medium text-white">{user?.fullName || 'User'}</span>
            <span className="text-xs text-slate-500 capitalize">{user?.role || 'Member'}</span>
          </div>
        </button>

        <AnimatePresence>
          {showSettings &&
          <SettingsPanel
            onClose={() => setShowSettings(false)}
            onChangePassword={() => setShowChangePassword(true)} />
          }
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showChangePassword && (
          <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
        )}
      </AnimatePresence>

      {sendConflicts.length > 0 && sendConflictFolderId && (
        <>
          <div className="fixed inset-0 bg-black/60 z-50" onClick={() => {
            setSendConflicts([]);
            setSendConflictFolderId(null);
            setSelectedReplacements(new Set());
          }} />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 max-w-md w-full p-5">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
                Files Already Exist in MattrMindr
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                The following files already exist in the linked case. Select which ones you want to replace:
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto mb-4">
                {sendConflicts.map((conflict) => (
                  <label key={conflict.transcriptId} className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700">
                    <input
                      type="checkbox"
                      checked={selectedReplacements.has(conflict.transcriptId)}
                      onChange={(e) => {
                        const next = new Set(selectedReplacements);
                        if (e.target.checked) {
                          next.add(conflict.transcriptId);
                        } else {
                          next.delete(conflict.transcriptId);
                        }
                        setSelectedReplacements(next);
                      }}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-xs text-slate-700 dark:text-slate-300 truncate">{conflict.filename}</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleConfirmSend}
                  disabled={sendingFolderId !== null}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium py-2 rounded-lg transition-colors">
                  {sendingFolderId ? 'Sending...' : `Send ${selectedReplacements.size > 0 ? `& Replace ${selectedReplacements.size}` : 'All'}`}
                </button>
                <button
                  onClick={() => {
                    setSendConflicts([]);
                    setSendConflictFolderId(null);
                    setSelectedReplacements(new Set());
                  }}
                  className="flex-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-xs font-medium py-2 rounded-lg transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>);

}