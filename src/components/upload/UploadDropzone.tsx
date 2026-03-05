import React, { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { UploadIcon, XIcon, FileAudioIcon, CheckIcon } from 'lucide-react';
import { useTranscripts } from '../../hooks/useTranscripts';
interface UploadDropzoneProps {
  onClose: () => void;
}
export function UploadDropzone({ onClose }: UploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const { addTranscript } = useTranscripts();
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);
  const simulateUpload = (file: File) => {
    setIsUploading(true);
    let progress = 0;
    const interval = setInterval(() => {
      progress += 5;
      setUploadProgress(progress);
      if (progress >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          addTranscript({
            id: `t-${Date.now()}`,
            filename: file.name,
            description: '',
            status: 'pending',
            type: file.type.includes('video') ? 'video' : 'audio',
            duration: 0,
            fileSize: file.size,
            fileUrl: URL.createObjectURL(file),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            folderId: null,
            segments: [],
            versions: []
          });
          onClose();
        }, 500);
      }
    }, 150);
  };
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type.includes('audio') || file.type.includes('video'))) {
      simulateUpload(file);
    }
  }, []);
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) simulateUpload(file);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm p-0 sm:p-4">
      <motion.div
        initial={{
          opacity: 0,
          scale: 0.95,
          y: 20
        }}
        animate={{
          opacity: 1,
          scale: 1,
          y: 0
        }}
        exit={{
          opacity: 0,
          scale: 0.95,
          y: 20
        }}
        className="bg-white dark:bg-slate-900 rounded-t-xl sm:rounded-xl shadow-2xl w-full sm:max-w-lg overflow-hidden">

        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Upload Media
          </h2>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">

            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6">
          {!isUploading ?
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 sm:p-10 text-center transition-colors ${isDragging ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30' : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>

              <div className="mx-auto w-16 h-16 rounded-full bg-white dark:bg-slate-800 shadow-sm flex items-center justify-center mb-4">
                <UploadIcon
                className={`h-8 w-8 ${isDragging ? 'text-indigo-600' : 'text-slate-400 dark:text-slate-500'}`} />

              </div>
              <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-1">
                Click or drag file to this area
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                Support for a single audio or video file.
              </p>

              <label className="cursor-pointer inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                Select File
                <input
                type="file"
                className="hidden"
                accept="audio/*,video/*"
                onChange={handleFileSelect} />

              </label>
            </div> :

          <div className="py-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="h-12 w-12 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
                  <FileAudioIcon className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                    Uploading file...
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {uploadProgress}% complete
                  </p>
                </div>
                {uploadProgress === 100 &&
              <CheckIcon className="h-6 w-6 text-emerald-500" />
              }
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
                <motion.div
                className="bg-indigo-600 dark:bg-indigo-500 h-2.5 rounded-full"
                initial={{
                  width: 0
                }}
                animate={{
                  width: `${uploadProgress}%`
                }}
                transition={{
                  ease: 'linear'
                }} />

              </div>
            </div>
          }
        </div>
      </motion.div>
    </div>);

}