import React, { useState, useEffect, useCallback } from 'react';
import { XIcon, UserPlusIcon, TrashIcon, ChevronDownIcon } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../utils/api';
import { ShareInfo } from '../../types/transcript';

interface ShareModalProps {
  resourceType: 'transcript' | 'folder';
  resourceId: string;
  resourceName: string;
  onClose: () => void;
}

export function ShareModal({ resourceType, resourceId, resourceName, onClose }: ShareModalProps) {
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState<'view' | 'edit'>('view');
  const [shares, setShares] = useState<ShareInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadShares = useCallback(async () => {
    try {
      const data = await api.shares.listForResource(resourceType, resourceId);
      setShares(data);
    } catch (err) {
      console.error('Failed to load shares:', err);
    } finally {
      setLoading(false);
    }
  }, [resourceType, resourceId]);

  useEffect(() => {
    loadShares();
  }, [loadShares]);

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setSubmitting(true);
    try {
      const result = await api.shares.create(email.trim(), resourceType, resourceId, permission);
      toast.success(result.message || "If this user has a Scribe account, they'll receive access.");
      setEmail('');
      loadShares();
    } catch (err: any) {
      toast.error(err.message || 'Failed to share');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdatePermission = async (shareId: string, newPermission: 'view' | 'edit') => {
    try {
      await api.shares.updatePermission(shareId, newPermission);
      setShares(prev => prev.map(s => s.id === shareId ? { ...s, permission: newPermission } : s));
      toast.success('Permission updated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update permission');
    }
  };

  const handleRevoke = async (shareId: string) => {
    try {
      await api.shares.revoke(shareId);
      setShares(prev => prev.filter(s => s.id !== shareId));
      toast.success('Access revoked');
    } catch (err: any) {
      toast.error(err.message || 'Failed to revoke access');
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 max-w-md w-full" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Share {resourceType === 'folder' ? 'Folder' : 'Transcript'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5 max-w-[280px]">
                {resourceName}
              </p>
            </div>
            <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded transition-colors">
              <XIcon className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleShare} className="px-5 py-4 border-b border-slate-200 dark:border-slate-700">
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Enter email address"
                className="flex-1 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white text-sm rounded-lg px-3 py-2 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 border border-slate-200 dark:border-slate-600"
                autoFocus
              />
              <div className="relative">
                <select
                  value={permission}
                  onChange={e => setPermission(e.target.value as 'view' | 'edit')}
                  className="appearance-none bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white text-sm rounded-lg pl-3 pr-7 py-2 border border-slate-200 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="view">View</option>
                  <option value="edit">Edit</option>
                </select>
                <ChevronDownIcon className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting || !email.trim()}
              className="mt-3 w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors"
            >
              <UserPlusIcon className="h-4 w-4" />
              {submitting ? 'Sharing...' : 'Share'}
            </button>
          </form>

          <div className="px-5 py-4 max-h-60 overflow-y-auto">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
              People with access
            </p>
            {loading ? (
              <div className="flex justify-center py-4">
                <div className="h-5 w-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : shares.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-3">Not shared with anyone yet</p>
            ) : (
              <div className="space-y-2">
                {shares.map(share => (
                  <div key={share.id} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                    <div className="h-8 w-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {share.fullName ? share.fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '??'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{share.fullName}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{share.email}</p>
                    </div>
                    <div className="relative flex-shrink-0">
                      <select
                        value={share.permission}
                        onChange={e => handleUpdatePermission(share.id, e.target.value as 'view' | 'edit')}
                        className="appearance-none bg-transparent text-xs font-medium text-slate-600 dark:text-slate-300 pr-5 pl-1 py-1 rounded cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
                      >
                        <option value="view">View</option>
                        <option value="edit">Edit</option>
                      </select>
                      <ChevronDownIcon className="absolute right-0.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
                    </div>
                    <button
                      onClick={() => handleRevoke(share.id)}
                      className="flex-shrink-0 p-1 text-slate-400 hover:text-red-500 rounded transition-colors"
                      title="Remove access"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {resourceType === 'folder' && (
            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Sharing a folder includes all current and future transcripts inside it.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
