import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckIcon, AlertCircleIcon, XIcon, UploadIcon, Loader2Icon } from 'lucide-react';
import { useTranscripts } from '../../hooks/useTranscripts';

export function UploadProgress() {
  const { activeUploads, dismissUpload } = useTranscripts();

  if (activeUploads.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80">
      <AnimatePresence mode="popLayout">
        {activeUploads.map((upload) => (
          <motion.div
            key={upload.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            layout
            className="bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-3 overflow-hidden">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                {upload.status === 'uploading' && (
                  <div className="h-8 w-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                    <Loader2Icon className="h-4 w-4 text-indigo-600 dark:text-indigo-400 animate-spin" />
                  </div>
                )}
                {upload.status === 'complete' && (
                  <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <CheckIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                )}
                {upload.status === 'error' && (
                  <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <AlertCircleIcon className="h-4 w-4 text-red-600 dark:text-red-400" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                  {upload.filename}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {upload.status === 'uploading' && `Uploading... ${upload.progress}%`}
                  {upload.status === 'complete' && 'Upload complete'}
                  {upload.status === 'error' && (upload.errorMessage || 'Upload failed')}
                </p>
              </div>
              <button
                onClick={() => dismissUpload(upload.id)}
                className="flex-shrink-0 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            {upload.status === 'uploading' && (
              <div className="mt-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <motion.div
                  className="bg-indigo-600 dark:bg-indigo-500 h-1.5 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${upload.progress}%` }}
                  transition={{ ease: 'linear', duration: 0.3 }}
                />
              </div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
