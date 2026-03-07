import React from 'react';
import { motion } from 'framer-motion';
import { XIcon, RotateCcwIcon } from 'lucide-react';
import { TranscriptVersion } from '../../types/transcript';
import { formatRelativeDate } from '../../utils/formatters';
interface VersionHistoryProps {
  versions: TranscriptVersion[];
  onClose: () => void;
  onRevert: (versionId: string) => void;
}
export function VersionHistory({
  versions,
  onClose,
  onRevert
}: VersionHistoryProps) {
  return (
    <motion.div
      initial={{
        x: '100%'
      }}
      animate={{
        x: 0
      }}
      exit={{
        x: '100%'
      }}
      transition={{
        type: 'spring',
        damping: 25,
        stiffness: 200
      }}
      className="absolute top-0 right-0 bottom-0 w-full sm:w-80 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl z-20 flex flex-col">

      <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900">
        <h3 className="font-semibold text-slate-900 dark:text-white">
          Version History
        </h3>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">

          <XIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {(!versions || versions.length === 0) ?
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center mt-8">
            No previous versions available.
          </p> :

        versions.map((version, index) =>
        <div
          key={version.id}
          className="relative pl-4 border-l-2 border-slate-200 dark:border-slate-700 pb-4 last:border-0 last:pb-0">

              <div className="absolute -left-[9px] top-0 h-4 w-4 rounded-full border-2 border-white dark:border-slate-900 bg-slate-300 dark:bg-slate-600" />
              {index === 0 &&
          <div className="absolute -left-[9px] top-0 h-4 w-4 rounded-full border-2 border-white dark:border-slate-900 bg-indigo-500" />
          }
              <div className="-mt-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-slate-900 dark:text-white">
                    {index === 0 ? 'Current Version' : 'Previous Version'}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {formatRelativeDate(version.createdAt)}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
                  {version.changeDescription}
                </p>
                {index !== 0 &&
            <button
              onClick={() => onRevert(version.id)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded transition-colors">

                    <RotateCcwIcon className="h-3 w-3" />
                    Revert to this
                  </button>
            }
              </div>
            </div>
        )
        }
      </div>
    </motion.div>);

}