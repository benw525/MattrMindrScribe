import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MenuIcon } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { UploadDropzone } from '../upload/UploadDropzone';
import { UploadProgress } from '../upload/UploadProgress';
import { Logo } from '../brand/Logo';
export function AppLayout() {
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Desktop Sidebar */}
      {!sidebarHidden &&
      <div className="hidden md:flex">
          <Sidebar
          onUploadClick={() => setIsUploadOpen(true)}
          selectedFolderId={selectedFolderId}
          onSelectFolder={setSelectedFolderId} />

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
              selectedFolderId={selectedFolderId}
              onSelectFolder={setSelectedFolderId}
              onClose={() => setMobileMenuOpen(false)}
              isMobile />

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

      <UploadProgress />
    </div>);

}