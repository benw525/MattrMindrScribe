import React, { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { UploadIcon, XIcon } from 'lucide-react';
import { useTranscripts } from '../../hooks/useTranscripts';
import { toast } from 'sonner';

interface UploadDropzoneProps {
  onClose: () => void;
}

export function UploadDropzone({ onClose }: UploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const { startBackgroundUpload } = useTranscripts();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const startUpload = (file: File) => {
    startBackgroundUpload(file);
    toast.success(`Upload started: ${file.name}`);
    onClose();
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type.includes('audio') || file.type.includes('video'))) {
      startUpload(file);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && (file.type.includes('audio') || file.type.includes('video'))) {
      startUpload(file);
    } else if (file) {
      toast.error('Please select an audio or video file');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm p-0 sm:p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white dark:bg-slate-900 rounded-t-xl sm:rounded-xl shadow-2xl w-full sm:max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Upload Media
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
            <XIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4 sm:p-6">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 sm:p-10 text-center transition-colors ${
              isDragging
                ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30'
                : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}>
            <div className="mx-auto w-16 h-16 rounded-full bg-white dark:bg-slate-800 shadow-sm flex items-center justify-center mb-4">
              <UploadIcon className={`h-8 w-8 ${isDragging ? 'text-indigo-600' : 'text-slate-400 dark:text-slate-500'}`} />
            </div>
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-1">
              Click or drag file to this area
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              Support for a single audio or video file.
            </p>
            <label className="cursor-pointer inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
              Select File
              <input type="file" className="hidden" accept="audio/*,video/*" onChange={handleFileSelect} />
            </label>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
