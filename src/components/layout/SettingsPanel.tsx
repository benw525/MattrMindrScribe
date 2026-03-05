import React from 'react';
import { motion } from 'framer-motion';
import {
  XIcon,
  SunIcon,
  MoonIcon,
  MailIcon,
  BriefcaseIcon,
  KeyIcon,
  ShieldCheckIcon,
  LinkIcon } from
'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import { toast } from 'sonner';
interface SettingsPanelProps {
  onClose: () => void;
}
export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { theme, setTheme } = useTheme();
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <motion.div
        initial={{
          opacity: 0,
          y: 8
        }}
        animate={{
          opacity: 1,
          y: 0
        }}
        exit={{
          opacity: 0,
          y: 8
        }}
        transition={{
          duration: 0.15
        }}
        className="absolute bottom-full left-0 right-0 mb-2 mx-2 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden">

        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Settings
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded transition-colors">

            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Profile */}
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
              JD
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">
                Jane Doe
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Attorney
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <MailIcon className="h-3.5 w-3.5" />
              jane.doe@lawfirm.com
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <BriefcaseIcon className="h-3.5 w-3.5" />
              Doe & Associates LLP
            </div>
          </div>
        </div>

        {/* Security */}
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
            Security
          </p>
          <div className="space-y-1.5">
            <button
              onClick={() => {
                toast.info('Change password dialog would open here');
                onClose();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-left">

              <KeyIcon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
              Change Password
            </button>
            <button
              onClick={() => {
                toast.info('Authenticator setup would open here');
                onClose();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-left">

              <ShieldCheckIcon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
              Add Authenticator
            </button>
          </div>
        </div>

        {/* Theme */}
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
            Appearance
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setTheme('light')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${theme === 'light' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 ring-1 ring-indigo-300 dark:ring-indigo-700' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'}`}>

              <SunIcon className="h-4 w-4" />
              Light
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${theme === 'dark' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 ring-1 ring-indigo-300 dark:ring-indigo-700' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'}`}>

              <MoonIcon className="h-4 w-4" />
              Dark
            </button>
          </div>
        </div>

        {/* Integrations */}
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
            Integrations
          </p>
          <button
            onClick={() => {
              toast.info('MattrMindr linking flow would open here');
              onClose();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors text-left">

            <LinkIcon className="h-4 w-4" />
            Link to MattrMindr
          </button>
        </div>

        {/* Sign Out */}
        <div className="px-4 py-3">
          <button className="w-full text-left text-xs font-medium text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 transition-colors py-1">
            Sign Out
          </button>
        </div>
      </motion.div>
    </>);

}