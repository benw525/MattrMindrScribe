import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { XIcon, SearchIcon, LoaderIcon, PinIcon, SendIcon, CheckCircleIcon, AlertCircleIcon } from 'lucide-react';
import { api } from '../../utils/api';
import { toast } from 'sonner';

interface MattrMindrCase {
  id: string;
  name: string;
  caseNumber: string;
  pinned: boolean;
}

interface SendToMattrMindrModalProps {
  transcriptId: string;
  transcriptFilename: string;
  onClose: () => void;
  onSent: () => void;
}

export function SendToMattrMindrModal({ transcriptId, transcriptFilename, onClose, onSent }: SendToMattrMindrModalProps) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [cases, setCases] = useState<MattrMindrCase[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedCase, setSelectedCase] = useState<MattrMindrCase | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.mattrmindr.status().then((res: any) => {
      setConnected(!!res?.connected);
      if (res?.connected) {
        loadCases('');
      }
    }).catch(() => {
      setConnected(false);
    });
  }, []);

  const loadCases = useCallback((query: string) => {
    setSearchLoading(true);
    api.mattrmindr.searchCases(query).then((res: any) => {
      const results: MattrMindrCase[] = res.cases || [];
      results.sort((a: MattrMindrCase, b: MattrMindrCase) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return a.name.localeCompare(b.name);
      });
      setCases(results);
    }).catch(() => {
      setCases([]);
    }).finally(() => {
      setSearchLoading(false);
    });
  }, []);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      loadCases(query);
    }, 300);
  }, [loadCases]);

  const handleSend = async () => {
    if (!selectedCase) return;
    setSending(true);
    setError('');
    try {
      const result = await api.mattrmindr.sendTranscript(transcriptId, selectedCase.id, selectedCase.name);
      if (result.success || result.status === 'sent') {
        setSent(true);
        toast.success(`Sent "${transcriptFilename}" to ${selectedCase.name}`);
        onSent();
      } else {
        setError(result.error || 'Failed to send transcript');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to send transcript');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm p-0 sm:p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white dark:bg-slate-900 rounded-t-xl sm:rounded-xl shadow-2xl w-full sm:max-w-md overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Send to MattrMindr
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          {connected === null && (
            <div className="flex items-center justify-center py-8">
              <LoaderIcon className="h-6 w-6 text-slate-400 animate-spin" />
            </div>
          )}

          {connected === false && (
            <div className="text-center py-6">
              <AlertCircleIcon className="h-10 w-10 text-slate-400 mx-auto mb-3" />
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">
                Not connected to MattrMindr
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-500">
                Go to Settings to connect your MattrMindr account first.
              </p>
            </div>
          )}

          {sent && (
            <div className="text-center py-6">
              <CheckCircleIcon className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-900 dark:text-white mb-1">
                Sent successfully!
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                "{transcriptFilename}" has been sent to {selectedCase?.name}.
              </p>
              <button
                onClick={onClose}
                className="mt-4 px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors">
                Done
              </button>
            </div>
          )}

          {connected && !sent && (
            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Sending transcript</p>
                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{transcriptFilename}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
                  Select a case
                </label>
                <div className="relative mb-3">
                  <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    placeholder="Search cases..."
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  {searchLoading && (
                    <LoaderIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 animate-spin" />
                  )}
                </div>

                <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                  {cases.length === 0 && !searchLoading && (
                    <p className="text-xs text-slate-500 text-center py-4">
                      {searchQuery ? 'No cases found' : 'No cases available'}
                    </p>
                  )}
                  {cases.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedCase(c)}
                      className={`w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors border-b border-slate-100 dark:border-slate-800 last:border-b-0 ${
                        selectedCase?.id === c.id
                          ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}>
                      {c.pinned && <PinIcon className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{c.name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{c.caseNumber}</div>
                      </div>
                      {selectedCase?.id === c.id && (
                        <CheckCircleIcon className="h-4 w-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                  <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {connected && !sent && (
          <div className="px-4 sm:px-6 py-4 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={handleSend}
              disabled={!selectedCase || sending}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                selectedCase && !sending
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
              }`}>
              {sending ? (
                <>
                  <LoaderIcon className="h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <SendIcon className="h-4 w-4" />
                  Send to MattrMindr
                </>
              )}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
