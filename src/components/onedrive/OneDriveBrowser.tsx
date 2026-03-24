import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  XIcon,
  FolderIcon,
  FileAudioIcon,
  FileVideoIcon,
  ChevronRightIcon,
  ArrowLeftIcon,
  Loader2Icon,
  CloudIcon,
  UsersIcon,
  FileTextIcon,
  GavelIcon,
  MicIcon,
  ShieldIcon,
  FileIcon as FileAudioIconAlt,
  ChevronDownIcon,
  LinkIcon,
  CheckCircleIcon,
} from 'lucide-react';
import { api } from '../../utils/api';
import { toast } from 'sonner';
import { useTranscripts } from '../../hooks/useTranscripts';

interface ConnectedFolder {
  id: string;
  onedrive_folder_id: string;
  folder_name: string;
  folder_path: string;
  created_at: string;
}

interface OneDriveBrowserProps {
  onClose: () => void;
  initialFolderId?: string;
  restrictToFolder?: boolean;
  onFoldersChanged?: () => void;
}

interface OneDriveItem {
  id: string;
  name: string;
  isFolder: boolean;
  isMedia: boolean;
  size: number;
  lastModified: string;
  mimeType: string | null;
  childCount: number;
}

interface BreadcrumbItem {
  id: string;
  name: string;
}

const RECORDING_TYPES = [
  { value: 'deposition', label: 'Deposition', icon: FileTextIcon },
  { value: 'court_hearing', label: 'Court Hearing', icon: GavelIcon },
  { value: 'recorded_statement', label: 'Recorded Statement', icon: MicIcon },
  { value: 'police_interrogation', label: 'Police Interrogation', icon: ShieldIcon },
  { value: 'other', label: 'Other', icon: FileAudioIconAlt },
];

const SPEAKER_OPTIONS = [
  { value: null, label: 'Auto-detect' },
  { value: 2, label: '2 speakers' },
  { value: 3, label: '3 speakers' },
  { value: 4, label: '4 speakers' },
  { value: 5, label: '5 speakers' },
  { value: 6, label: '6+ speakers' },
];

const PRACTICE_AREAS = [
  { value: 'personal_injury', label: 'Personal Injury' },
  { value: 'family_law', label: 'Family Law' },
  { value: 'criminal_defense', label: 'Criminal Defense' },
  { value: 'workers_comp', label: "Workers' Comp" },
  { value: 'insurance_defense', label: 'Insurance Defense' },
  { value: 'employment_law', label: 'Employment Law' },
  { value: 'medical_malpractice', label: 'Medical Malpractice' },
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'immigration', label: 'Immigration' },
  { value: 'general_litigation', label: 'General Litigation' },
];

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function isVideoFile(name: string): boolean {
  return /\.(mp4|mov|avi|mkv|wmv|flv|3gp|3g2|m4v|mpg|mpeg|ts|mts|vob|ogv)$/i.test(name);
}

export function OneDriveBrowser({ onClose, initialFolderId, restrictToFolder, onFoldersChanged }: OneDriveBrowserProps) {
  const { refreshData } = useTranscripts();
  const [loading, setLoading] = useState(true);
  const [folders, setFolders] = useState<OneDriveItem[]>([]);
  const [mediaFiles, setMediaFiles] = useState<OneDriveItem[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([]);
  const [folderStack, setFolderStack] = useState<string[]>(initialFolderId ? [initialFolderId] : []);
  const [selectedFile, setSelectedFile] = useState<OneDriveItem | null>(null);
  const [transcribing, setTranscribing] = useState<Set<string>>(new Set());
  const [expectedSpeakers, setExpectedSpeakers] = useState<number | null>(null);
  const [recordingType, setRecordingType] = useState<string>('deposition');
  const [practiceArea, setPracticeArea] = useState<string>('personal_injury');
  const [showOptions, setShowOptions] = useState(false);
  const [connectedFolderIds, setConnectedFolderIds] = useState<Set<string>>(new Set());
  const [connectingFolder, setConnectingFolder] = useState<string | null>(null);

  const currentFolderId = folderStack.length > 0 ? folderStack[folderStack.length - 1] : undefined;

  useEffect(() => {
    api.onedrive.connectedFolders()
      .then((list: ConnectedFolder[]) => {
        setConnectedFolderIds(new Set(list.map(f => f.onedrive_folder_id)));
      })
      .catch(() => {});
  }, []);

  const loadFolder = useCallback(async (folderId?: string) => {
    setLoading(true);
    try {
      const data = await api.onedrive.browse(folderId);
      setFolders(data.folders);
      setMediaFiles(data.mediaFiles);
      setBreadcrumb(data.breadcrumb || []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load OneDrive contents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFolder(currentFolderId);
  }, [currentFolderId, loadFolder]);

  const navigateToFolder = (folderId: string) => {
    setFolderStack((prev) => [...prev, folderId]);
    setSelectedFile(null);
  };

  const navigateBack = () => {
    setFolderStack((prev) => prev.slice(0, -1));
    setSelectedFile(null);
  };

  const navigateToBreadcrumb = (index: number) => {
    if (index < 0) {
      setFolderStack([]);
    } else {
      const crumb = breadcrumb[index];
      if (crumb?.id) {
        const existingIdx = folderStack.indexOf(crumb.id);
        if (existingIdx >= 0) {
          setFolderStack(folderStack.slice(0, existingIdx + 1));
        }
      }
    }
    setSelectedFile(null);
  };

  const handleTranscribe = async (file: OneDriveItem) => {
    setTranscribing((prev) => new Set([...prev, file.id]));
    try {
      await api.onedrive.transcribe(
        file.id,
        file.name,
        undefined,
        expectedSpeakers,
        recordingType,
        practiceArea
      );
      toast.success(`Transcription started: ${file.name}`);
      setTimeout(() => refreshData(), 2000);
    } catch (err: any) {
      toast.error(err.message || 'Failed to start transcription');
    } finally {
      setTranscribing((prev) => {
        const next = new Set(prev);
        next.delete(file.id);
        return next;
      });
    }
  };

  const handleConnectFolder = async (folder: OneDriveItem) => {
    setConnectingFolder(folder.id);
    try {
      const folderPath = breadcrumb.map(b => b.name).join('/');
      await api.onedrive.addConnectedFolder(folder.id, folder.name, folderPath ? `${folderPath}/${folder.name}` : folder.name);
      setConnectedFolderIds(prev => new Set([...prev, folder.id]));
      toast.success(`Connected folder: ${folder.name}`);
      onFoldersChanged?.();
    } catch (err: any) {
      toast.error(err.message || 'Failed to connect folder');
    } finally {
      setConnectingFolder(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm p-0 sm:p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white dark:bg-slate-900 rounded-t-xl sm:rounded-xl shadow-2xl w-full sm:max-w-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: '85vh' }}>

        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <CloudIcon className="h-5 w-5 text-blue-500" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              OneDrive
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-1 px-4 sm:px-6 py-2 border-b border-slate-100 dark:border-slate-800 overflow-x-auto text-sm">
          {!restrictToFolder && (
            <button
              onClick={() => navigateToBreadcrumb(-1)}
              className="text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap flex-shrink-0">
              My Files
            </button>
          )}
          {breadcrumb.map((crumb, i) => {
            const initialStackIndex = restrictToFolder && initialFolderId ? folderStack.indexOf(initialFolderId) : -1;
            const showCrumb = !restrictToFolder || i >= initialStackIndex;
            if (!showCrumb) return null;
            return (
              <React.Fragment key={i}>
                {(i > 0 || !restrictToFolder) && (
                  <ChevronRightIcon className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                )}
                {i === breadcrumb.length - 1 ? (
                  <span className="text-slate-700 dark:text-slate-300 whitespace-nowrap flex-shrink-0">
                    {crumb.name}
                  </span>
                ) : (
                  <button
                    onClick={() => navigateToBreadcrumb(i)}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap flex-shrink-0">
                    {crumb.name}
                  </button>
                )}
              </React.Fragment>
            );
          })}
        </div>

        <div className="px-4 sm:px-6 py-2 border-b border-slate-100 dark:border-slate-800">
          <button
            onClick={() => setShowOptions(!showOptions)}
            className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
            <ChevronDownIcon className={`h-3.5 w-3.5 transition-transform ${showOptions ? 'rotate-180' : ''}`} />
            Transcription Options
          </button>
          {showOptions && (
            <div className="mt-3 space-y-3 pb-1">
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">
                  Recording Type
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {RECORDING_TYPES.map((rt) => {
                    const Icon = rt.icon;
                    return (
                      <button
                        key={rt.value}
                        onClick={() => setRecordingType(rt.value)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border transition-colors ${
                          recordingType === rt.value
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                        }`}>
                        <Icon className="h-3 w-3" />
                        {rt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">
                    Speakers
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {SPEAKER_OPTIONS.map((opt) => (
                      <button
                        key={opt.label}
                        onClick={() => setExpectedSpeakers(opt.value)}
                        className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                          expectedSpeakers === opt.value
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                        }`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">
                  Area of Law
                </label>
                <div className="relative">
                  <select
                    value={practiceArea}
                    onChange={(e) => setPracticeArea(e.target.value)}
                    className="w-full appearance-none px-2.5 py-1.5 pr-7 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    {PRACTICE_AREAS.map((pa) => (
                      <option key={pa.value} value={pa.value}>{pa.label}</option>
                    ))}
                  </select>
                  <ChevronDownIcon className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2Icon className="h-6 w-6 animate-spin text-indigo-500" />
              <span className="ml-3 text-sm text-slate-500 dark:text-slate-400">Loading...</span>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {folderStack.length > 0 && !(restrictToFolder && folderStack.length === 1 && folderStack[0] === initialFolderId) && (
                <button
                  onClick={navigateBack}
                  className="w-full flex items-center gap-3 px-4 sm:px-6 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left">
                  <ArrowLeftIcon className="h-4 w-4 text-slate-400" />
                  <span className="text-sm text-slate-500 dark:text-slate-400">Back</span>
                </button>
              )}

              {!restrictToFolder && folders.map((folder) => {
                const isConnected = connectedFolderIds.has(folder.id);
                const isConnecting = connectingFolder === folder.id;
                return (
                  <div
                    key={folder.id}
                    className="flex items-center gap-3 px-4 sm:px-6 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                    <button
                      onClick={() => navigateToFolder(folder.id)}
                      className="flex-1 flex items-center gap-3 text-left min-w-0">
                      <FolderIcon className="h-5 w-5 text-amber-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {folder.name}
                        </p>
                        {folder.childCount > 0 && (
                          <p className="text-xs text-slate-400">
                            {folder.childCount} item{folder.childCount !== 1 ? 's' : ''}
                          </p>
                        )}
                      </div>
                      <ChevronRightIcon className="h-4 w-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-500 dark:group-hover:text-slate-400 transition-colors" />
                    </button>
                    {isConnected ? (
                      <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 flex-shrink-0">
                        <CheckCircleIcon className="h-3.5 w-3.5" />
                        Linked
                      </span>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleConnectFolder(folder); }}
                        disabled={isConnecting}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                        title="Link this folder to sidebar">
                        {isConnecting ? (
                          <Loader2Icon className="h-3 w-3 animate-spin" />
                        ) : (
                          <LinkIcon className="h-3 w-3" />
                        )}
                        Link
                      </button>
                    )}
                  </div>
                );
              })}

              {mediaFiles.map((file) => {
                const isVideo = isVideoFile(file.name);
                const isBeingTranscribed = transcribing.has(file.id);
                const isSelected = selectedFile?.id === file.id;

                return (
                  <div
                    key={file.id}
                    className={`flex items-center gap-3 px-4 sm:px-6 py-3 transition-colors ${
                      isSelected ? 'bg-indigo-50 dark:bg-indigo-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}>
                    <button
                      onClick={() => setSelectedFile(isSelected ? null : file)}
                      className="flex-1 flex items-center gap-3 text-left min-w-0">
                      {isVideo ? (
                        <FileVideoIcon className="h-5 w-5 text-purple-500 flex-shrink-0" />
                      ) : (
                        <FileAudioIcon className="h-5 w-5 text-indigo-500 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {file.name}
                        </p>
                        <p className="text-xs text-slate-400">
                          {formatFileSize(file.size)}
                          {file.lastModified && (
                            <> &middot; {new Date(file.lastModified).toLocaleDateString()}</>
                          )}
                        </p>
                      </div>
                    </button>
                    <button
                      onClick={() => handleTranscribe(file)}
                      disabled={isBeingTranscribed}
                      className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors">
                      {isBeingTranscribed ? (
                        <>
                          <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                          Starting...
                        </>
                      ) : (
                        'Transcribe'
                      )}
                    </button>
                  </div>
                );
              })}

              {!loading && folders.length === 0 && mediaFiles.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                  <CloudIcon className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-3" />
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    No media files found
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    Navigate to a folder containing audio or video files
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-4 sm:px-6 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {mediaFiles.length} media file{mediaFiles.length !== 1 ? 's' : ''}
            {folders.length > 0 && `, ${folders.length} folder${folders.length !== 1 ? 's' : ''}`}
          </p>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
}
