import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api, setToken, clearToken, isAuthenticated } from '../utils/api';

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
    if (!isAuthenticated()) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const maxRetries = 3;

    const tryLoadUser = async (attempt: number): Promise<void> => {
      try {
        const userData = await api.auth.me();
        if (!cancelled) {
          setUser(userData);
          setLoading(false);
        }
      } catch (err: any) {
        if (cancelled) return;
        const msg = (err?.message || '').toLowerCase();
        const isAuthError =
          msg.includes('invalid') ||
          msg.includes('expired') ||
          msg.includes('authentication required') ||
          msg.includes('token required') ||
          msg.includes('unauthorized');

        if (isAuthError) {
          clearToken();
          setUser(null);
          setLoading(false);
        } else if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 1500 * attempt));
          if (!cancelled) return tryLoadUser(attempt + 1);
        } else {
          setLoading(false);
        }
      }
    };

    tryLoadUser(1);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const handleTokenCleared = () => setUser(null);
    window.addEventListener('auth_token_cleared', handleTokenCleared);
    return () => window.removeEventListener('auth_token_cleared', handleTokenCleared);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.auth.login(email, password);
    setToken(data.token);
    setUser(data.user);
  }, []);

  const register = useCallback(async (email: string, password: string, fullName: string) => {
    const data = await api.auth.register(email, password, fullName);
    setToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    clearToken();
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
