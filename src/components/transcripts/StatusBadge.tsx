import React from 'react';
import { motion } from 'framer-motion';
interface StatusBadgeProps {
  status: 'pending' | 'processing' | 'completed' | 'error';
}
export function StatusBadge({ status }: StatusBadgeProps) {
  const config = {
    pending: {
      color:
      'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800',
      label: 'Pending'
    },
    processing: {
      color:
      'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800',
      label: 'Processing'
    },
    completed: {
      color:
      'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
      label: 'Completed'
    },
    error: {
      color:
      'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800',
      label: 'Error'
    }
  };
  const { color, label } = config[status];
  return (
    <div
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border flex-shrink-0 ${color}`}>

      {status === 'processing' &&
      <motion.div
        className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400 mr-1.5"
        animate={{
          opacity: [1, 0.4, 1]
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: 'easeInOut'
        }} />

      }
      {status === 'pending' &&
      <div className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 mr-1.5" />
      }
      {status === 'error' &&
      <div className="w-1.5 h-1.5 rounded-full bg-red-500 dark:bg-red-400 mr-1.5" />
      }
      {label}
    </div>);

}