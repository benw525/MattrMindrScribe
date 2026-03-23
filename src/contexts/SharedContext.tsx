import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { api } from '../utils/api';
import { useAuth } from './AuthContext';

interface SharedItem {
  share_id: string;
  permission: 'view' | 'edit';
  resource_type: 'transcript' | 'folder';
  resource_id: string;
  resource_name: string;
  media_type: string | null;
  owner_email: string;
  owner_name: string;
  created_at: string;
}

interface SharedContextValue {
  sharedItems: SharedItem[];
  loading: boolean;
  refresh: () => void;
}

const SharedContext = createContext<SharedContextValue>({
  sharedItems: [],
  loading: false,
  refresh: () => {},
});

export function SharedProvider({ children }: { children: React.ReactNode }) {
  const [sharedItems, setSharedItems] = useState<SharedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const { isLoggedIn } = useAuth();

  const refresh = useCallback(async () => {
    if (!isLoggedIn) return;
    setLoading(true);
    try {
      const items = await api.getSharedWithMe();
      setSharedItems(items);
    } catch {
      setSharedItems([]);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <SharedContext.Provider value={{ sharedItems, loading, refresh }}>
      {children}
    </SharedContext.Provider>
  );
}

export function useShared() {
  return useContext(SharedContext);
}
