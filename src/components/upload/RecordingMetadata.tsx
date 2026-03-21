import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { XIcon, UsersIcon, MicIcon, FileAudioIcon, GavelIcon, ShieldIcon, FileTextIcon, ChevronDownIcon, UploadIcon, CameraIcon } from 'lucide-react';
import { useTranscripts } from '../../hooks/useTranscripts';
import { toast } from 'sonner';

interface RecordingMetadataProps {
  file: File;
  onClose: () => void;
  onComplete: () => void;
}

const SPEAKER_OPTIONS = [
  { value: null, label: 'Auto-detect' },
  { value: 2, label: '2 speakers' },
  { value: 3, label: '3 speakers' },
  { value: 4, label: '4 speakers' },
  { value: 5, label: '5 speakers' },
  { value: 6, label: '6+ speakers' },
];

const RECORDING_TYPES = [
  { value: 'deposition', label: 'Deposition', icon: FileTextIcon },
  { value: 'court_hearing', label: 'Court Hearing', icon: GavelIcon },
  { value: 'recorded_statement', label: 'Recorded Statement', icon: MicIcon },
  { value: 'police_interrogation', label: 'Police Interrogation', icon: ShieldIcon },
  { value: 'body_cam', label: 'Body Cam', icon: CameraIcon },
  { value: 'other', label: 'Other', icon: FileAudioIcon },
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

export function RecordingMetadata({ file, onClose, onComplete }: RecordingMetadataProps) {
  const [expectedSpeakers, setExpectedSpeakers] = useState<number | null>(null);
  const [recordingType, setRecordingType] = useState<string>('deposition');
  const [practiceArea, setPracticeArea] = useState<string>('personal_injury');
  const { startBackgroundUpload } = useTranscripts();

  const handleSubmit = () => {
    startBackgroundUpload(file, undefined, undefined, expectedSpeakers, recordingType, practiceArea);
    toast.success(`Upload started: ${file.name}`);
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm p-0 sm:p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white dark:bg-slate-900 rounded-t-xl sm:rounded-xl shadow-2xl w-full sm:max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Recording Details
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5">
          <div className="border-2 border-indigo-300 dark:border-indigo-600 rounded-xl p-4 bg-indigo-50 dark:bg-indigo-950/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center flex-shrink-0">
                <MicIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                  {file.name}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {(file.size / (1024 * 1024)).toFixed(1)} MB
                </p>
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
              Recording Type
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {RECORDING_TYPES.map((rt) => {
                const Icon = rt.icon;
                return (
                  <button
                    key={rt.value}
                    onClick={() => setRecordingType(rt.value)}
                    className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors touch-action-manipulation ${
                      recordingType === rt.value
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-indigo-400 dark:hover:border-indigo-500'
                    }`}>
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{rt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
              Area of Law
            </label>
            <div className="relative">
              <select
                value={practiceArea}
                onChange={(e) => setPracticeArea(e.target.value)}
                className="w-full appearance-none px-3 py-2 pr-8 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
                {PRACTICE_AREAS.map((pa) => (
                  <option key={pa.value} value={pa.value}>{pa.label}</option>
                ))}
              </select>
              <ChevronDownIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div>
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
        </div>

        <div className="px-4 sm:px-6 py-4 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={handleSubmit}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm">
            <UploadIcon className="h-4 w-4" />
            Upload & Transcribe
          </button>
        </div>
      </motion.div>
    </div>
  );
}
