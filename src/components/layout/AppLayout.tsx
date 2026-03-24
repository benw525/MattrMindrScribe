import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MenuIcon } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { UploadDropzone } from '../upload/UploadDropzone';
import { UploadProgress } from '../upload/UploadProgress';
import { AudioRecorder } from '../upload/AudioRecorder';
import { RecordingMetadata } from '../upload/RecordingMetadata';
import { OneDriveBrowser } from '../onedrive/OneDriveBrowser';
import { Logo } from '../brand/Logo';
import { api } from '../../utils/api';
import { toast } from 'sonner';

interface ConnectedFolder {
  id: string;
  onedrive_folder_id: string;
  folder_name: string;
  folder_path: string;
  created_at: string;
}

export function AppLayout() {
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isRecorderOpen, setIsRecorderOpen] = useState(false);
  const [isOneDriveOpen, setIsOneDriveOpen] = useState(false);
  const [oneDriveBrowseFolderId, setOneDriveBrowseFolderId] = useState<string | undefined>(undefined);
  const [onedriveConnected, setOnedriveConnected] = useState(false);
  const [connectedFolders, setConnectedFolders] = useState<ConnectedFolder[]>([]);
  const [recordedFile, setRecordedFile] = useState<File | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const loadConnectedFolders = useCallback(() => {
    api.onedrive.connectedFolders()
      .then((list: ConnectedFolder[]) => setConnectedFolders(list))
      .catch(() => setConnectedFolders([]));
  }, []);

  useEffect(() => {
    api.onedrive.status()
      .then((data: any) => {
        const connected = !!data?.connected;
        setOnedriveConnected(connected);
        if (connected) loadConnectedFolders();
      })
      .catch(() => setOnedriveConnected(false));
  }, [loadConnectedFolders]);

  useEffect(() => {
    const onedrive = searchParams.get('onedrive');
    if (onedrive === 'connected') {
      toast.success('OneDrive connected successfully!');
      setOnedriveConnected(true);
      loadConnectedFolders();
      setSearchParams({}, { replace: true });
    } else if (onedrive === 'error') {
      const msg = searchParams.get('message') || 'Failed to connect';
      toast.error(`OneDrive: ${msg}`);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  return (
    <div className="flex h-dvh w-full bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Desktop Sidebar */}
      {!sidebarHidden &&
      <div className="hidden md:flex">
          <Sidebar
          onUploadClick={() => setIsUploadOpen(true)}
          onRecordClick={() => setIsRecorderOpen(true)}
          onOneDriveClick={() => { setOneDriveBrowseFolderId(undefined); setIsOneDriveOpen(true); }}
          onOneDriveFolderClick={(folderId) => { setOneDriveBrowseFolderId(folderId); setIsOneDriveOpen(true); }}
          selectedFolderId={selectedFolderId}
          onSelectFolder={setSelectedFolderId}
          onedriveConnected={onedriveConnected}
          connectedFolders={connectedFolders}
          onRefreshConnectedFolders={loadConnectedFolders}
          onOnedriveStatusChange={(connected) => {
            setOnedriveConnected(connected);
            if (!connected) setConnectedFolders([]);
            else loadConnectedFolders();
          }} />

        </div>
      }

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {mobileMenuOpen &&
        <>
            <motion.div
            initial={{
              opacity: 0
            }}
            animate={{
              opacity: 1
            }}
            exit={{
              opacity: 0
            }}
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setMobileMenuOpen(false)} />

            <motion.div
            initial={{
              x: '-100%'
            }}
            animate={{
              x: 0
            }}
            exit={{
              x: '-100%'
            }}
            transition={{
              type: 'spring',
              damping: 25,
              stiffness: 250
            }}
            className="fixed inset-y-0 left-0 z-50 md:hidden">

              <Sidebar
              onUploadClick={() => {
                setIsUploadOpen(true);
                setMobileMenuOpen(false);
              }}
              onRecordClick={() => {
                setIsRecorderOpen(true);
                setMobileMenuOpen(false);
              }}
              onOneDriveClick={() => {
                setOneDriveBrowseFolderId(undefined);
                setIsOneDriveOpen(true);
                setMobileMenuOpen(false);
              }}
              onOneDriveFolderClick={(folderId) => {
                setOneDriveBrowseFolderId(folderId);
                setIsOneDriveOpen(true);
                setMobileMenuOpen(false);
              }}
              selectedFolderId={selectedFolderId}
              onSelectFolder={setSelectedFolderId}
              onClose={() => setMobileMenuOpen(false)}
              isMobile
              onedriveConnected={onedriveConnected}
              connectedFolders={connectedFolders}
              onRefreshConnectedFolders={loadConnectedFolders}
              onOnedriveStatusChange={(connected) => {
                setOnedriveConnected(connected);
                if (!connected) setConnectedFolders([]);
                else loadConnectedFolders();
              }} />

            </motion.div>
          </>
        }
      </AnimatePresence>

      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Mobile Top Bar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            aria-label="Open menu">

            <MenuIcon className="h-5 w-5" />
          </button>
          <Logo variant="full" size={24} className="dark:hidden" />
          <Logo
            variant="full"
            size={24}
            inverted
            className="hidden dark:flex" />

        </div>

        <Outlet
          context={{
            selectedFolderId,
            sidebarHidden,
            setSidebarHidden
          }} />

      </main>

      {isUploadOpen &&
      <UploadDropzone onClose={() => setIsUploadOpen(false)} />
      }

      {isRecorderOpen && !recordedFile &&
      <AudioRecorder
        onRecordingComplete={(file) => {
          setIsRecorderOpen(false);
          setRecordedFile(file);
        }}
        onClose={() => setIsRecorderOpen(false)} />
      }

      {recordedFile &&
      <RecordingMetadata
        file={recordedFile}
        onClose={() => setRecordedFile(null)}
        onComplete={() => setRecordedFile(null)} />
      }

      <UploadProgress />

      <AnimatePresence>
        {isOneDriveOpen && (
          <OneDriveBrowser
            onClose={() => { setIsOneDriveOpen(false); setOneDriveBrowseFolderId(undefined); }}
            initialFolderId={oneDriveBrowseFolderId}
            restrictToFolder={!!oneDriveBrowseFolderId}
            onFoldersChanged={loadConnectedFolders} />
        )}
      </AnimatePresence>
    </div>);

}