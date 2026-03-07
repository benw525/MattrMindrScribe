import React, { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { UploadIcon, XIcon, UsersIcon } from 'lucide-react';
import { useTranscripts } from '../../hooks/useTranscripts';
import { toast } from 'sonner';

interface UploadDropzoneProps {
  onClose: () => void;
}

const SPEAKER_OPTIONS = [
  { value: null, label: 'Auto-detect' },
  { value: 2, label: '2 speakers' },
  { value: 3, label: '3 speakers' },
  { value: 4, label: '4 speakers' },
  { value: 5, label: '5 speakers' },
  { value: 6, label: '6+ speakers' },
];

export function UploadDropzone({ onClose }: UploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [expectedSpeakers, setExpectedSpeakers] = useState<number | null>(null);
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
    startBackgroundUpload(file, undefined, undefined, expectedSpeakers);
    toast.success(`Upload started: ${file.name}`);
    onClose();
  };

  const MEDIA_EXTENSIONS = /\.(mp3|wav|m4a|ogg|flac|aac|webm|wma|amr|opus|aiff|aif|au|ra|ram|mp4|mov|avi|mkv|wmv|flv|3gp|3g2|m4v|mpg|mpeg|ts|mts|vob|ogv)$/i;

  const isMediaFile = (file: File) => {
    if (file.type.includes('audio') || file.type.includes('video')) return true;
    if (MEDIA_EXTENSIONS.test(file.name)) return true;
    return false;
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && isMediaFile(file)) {
      startUpload(file);
    }
  }, [expectedSpeakers]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && isMediaFile(file)) {
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
          <div className="mb-4">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              <UsersIcon className="h-4 w-4" />
              Number of Speakers
            </label>
            <div className="flex flex-wrap gap-2">
              {SPEAKER_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => setExpectedSpeakers(opt.value)}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors touch-action-manipulation ${
                    expectedSpeakers === opt.value
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-indigo-400 dark:hover:border-indigo-500'
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
              Specifying speakers improves diarization accuracy
            </p>
          </div>
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
              <input type="file" className="hidden" accept="audio/*,video/*,.mp3,.wav,.m4a,.ogg,.flac,.aac,.webm,.wma,.amr,.opus,.aiff,.aif,.mp4,.mov,.avi,.mkv,.wmv,.flv,.3gp,.3g2,.m4v,.mpg,.mpeg,.ts,.mts,.vob,.ogv" onChange={handleFileSelect} />
            </label>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
