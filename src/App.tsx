import React, { useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { TranscriptProvider } from './contexts/TranscriptContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { AppLayout } from './components/layout/AppLayout';
import { DashboardPage } from './pages/DashboardPage';
import { TranscriptViewerPage } from './pages/TranscriptViewerPage';
import { PresentModePage } from './pages/PresentModePage';
import { AuthPage } from './pages/AuthPage';
import { LandingPage } from './pages/LandingPage';

function MobileResumeHandler() {
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
      } else if (document.visibilityState === 'visible') {
        const root = document.getElementById('root');
        if (root) {
          root.style.display = 'none';
          root.offsetHeight;
          root.style.display = '';
        }

        if (hiddenAt.current) {
          const elapsed = Date.now() - hiddenAt.current;
          if (elapsed > 30000) {
            window.location.reload();
          }
          hiddenAt.current = null;
        }
      }
    };

    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        window.location.reload();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);

  return null;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="h-8 w-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export function App() {
  return (
    <ThemeProvider>
      <MobileResumeHandler />
      <AuthProvider>
        <TranscriptProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<AuthPage />} />
              <Route
                path="/app"
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }>
                <Route index element={<DashboardPage />} />
                <Route path="transcript/:id" element={<TranscriptViewerPage />} />
              </Route>
              <Route
                path="/app/transcript/:id/present"
                element={
                  <ProtectedRoute>
                    <PresentModePage />
                  </ProtectedRoute>
                } />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
          <Toaster position="bottom-right" richColors />
        </TranscriptProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
