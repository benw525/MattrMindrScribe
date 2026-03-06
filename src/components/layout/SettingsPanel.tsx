import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  XIcon,
  SunIcon,
  MoonIcon,
  MailIcon,
  KeyIcon,
  ShieldCheckIcon,
  LinkIcon,
  LogOutIcon } from
'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../utils/api';
import { toast } from 'sonner';

interface SettingsPanelProps {
  onClose: () => void;
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error('Please fill in all fields');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('New password must be at least 6 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    setIsLoading(true);
    try {
      await api.auth.changePassword(currentPassword, newPassword);
      toast.success('Password changed successfully');
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to change password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[60]" onClick={onClose} />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Change Password
            </h3>
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded transition-colors">
              <XIcon className="h-4 w-4" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="p-5 space-y-4" noValidate>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Current Password
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Enter current password" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                New Password
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Enter new password (min. 6 characters)" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Confirm new password" />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-70 text-white text-sm font-medium py-2 rounded-lg transition-colors">
                {isLoading ? 'Changing...' : 'Change Password'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium py-2 rounded-lg transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </>
  );
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const [showChangePassword, setShowChangePassword] = useState(false);

  const initials = user?.fullName
    ? user.fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '??';

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.15 }}
        className="absolute bottom-full left-0 right-0 mb-2 mx-2 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden">

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

        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
              {initials}
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">
                {user?.fullName || 'User'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                {user?.role || 'Member'}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <MailIcon className="h-3.5 w-3.5" />
              {user?.email || 'No email'}
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
            Security
          </p>
          <div className="space-y-1.5">
            <button
              onClick={() => {
                onClose();
                setShowChangePassword(true);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-left">
              <KeyIcon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
              Change Password
            </button>
            <button
              onClick={() => {
                toast.info('Two-factor authentication is coming soon.');
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-left">
              <ShieldCheckIcon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
              Add Authenticator
            </button>
          </div>
        </div>

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

        <div className="px-4 py-3">
          <button
            onClick={() => {
              logout();
              onClose();
              window.location.href = '/login';
            }}
            className="w-full flex items-center gap-2 text-left text-xs font-medium text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 transition-colors py-1">
            <LogOutIcon className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </motion.div>

      <AnimatePresence>
        {showChangePassword && (
          <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
        )}
      </AnimatePresence>
    </>
  );
}
