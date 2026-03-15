import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api, isAuthenticated, clearAuthState } from '../utils/api';

interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
  subscriptionTier: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => void;
  isLoggedIn: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.auth.me()
      .then(userData => setUser(userData))
      .catch(() => {
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handleTokenCleared = () => setUser(null);
    window.addEventListener('auth_token_cleared', handleTokenCleared);
    return () => window.removeEventListener('auth_token_cleared', handleTokenCleared);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.auth.login(email, password);
    setUser(data.user);
  }, []);

  const register = useCallback(async (email: string, password: string, fullName: string) => {
    const data = await api.auth.register(email, password, fullName);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {}
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, isLoggedIn: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
