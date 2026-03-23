import React, { useState, useEffect, useCallback } from 'react';
import { XIcon, ShareIcon, TrashIcon } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../utils/api';

interface Share {
  id: string;
  email: string;
  name: string;
  permission: 'view' | 'edit';
  created_at: string;
}

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  resourceType: 'transcript' | 'folder';
  resourceId: string;
  resourceName: string;
}

export function ShareModal({ isOpen, onClose, resourceType, resourceId, resourceName }: ShareModalProps) {
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState<'view' | 'edit'>('view');
  const [shares, setShares] = useState<Share[]>([]);
  const [loading, setLoading] = useState(false);

  const loadShares = useCallback(async () => {
    try {
      const data = await api.getSharesByResource(resourceType, resourceId);
      setShares(data);
    } catch {}
  }, [resourceType, resourceId]);

  useEffect(() => {
    if (isOpen) loadShares();
  }, [isOpen, loadShares]);

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    try {
      await api.createShare(email.trim(), resourceType, resourceId, permission);
      toast.success(`Shared with ${email.trim()}`);
      setEmail('');
      loadShares();
    } catch (err: any) {
      toast.error(err.message || 'Failed to share');
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (shareId: string, shareEmail: string) => {
    try {
      await api.revokeShare(shareId);
      toast.success(`Revoked access for ${shareEmail}`);
      loadShares();
    } catch (err: any) {
      toast.error(err.message || 'Failed to revoke');
    }
  };

  const handleUpdatePermission = async (shareId: string, newPermission: 'view' | 'edit') => {
    try {
      await api.updateSharePermission(shareId, newPermission);
      loadShares();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update permission');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <ShareIcon className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Share</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md">
            <XIcon className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
            Share "{resourceName}" with another user
          </p>

          <form onSubmit={handleShare} className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter email address"
              className="flex-1 px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <select
              value={permission}
              onChange={(e) => setPermission(e.target.value as 'view' | 'edit')}
              className="px-2 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="view">View</option>
              <option value="edit">Edit</option>
            </select>
            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Share
            </button>
          </form>
        </div>

        {shares.length > 0 && (
          <div className="px-5 pb-4 flex-1 overflow-y-auto">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Shared with
            </p>
            <div className="space-y-2">
              {shares.map((share) => (
                <div
                  key={share.id}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {share.name || share.email}
                    </p>
                    {share.name && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{share.email}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <select
                      value={share.permission}
                      onChange={(e) => handleUpdatePermission(share.id, e.target.value as 'view' | 'edit')}
                      className="text-xs px-1.5 py-1 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                    >
                      <option value="view">View</option>
                      <option value="edit">Edit</option>
                    </select>
                    <button
                      onClick={() => handleRevoke(share.id, share.email)}
                      className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                      title="Revoke access"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
