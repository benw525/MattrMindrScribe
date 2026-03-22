import React, { Component, useEffect, useRef } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { TranscriptProvider } from './contexts/TranscriptContext';
import { SharedProvider } from './contexts/SharedContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { AppLayout } from './components/layout/AppLayout';
import { DashboardPage } from './pages/DashboardPage';
import { TranscriptViewerPage } from './pages/TranscriptViewerPage';
import { PresentModePage } from './pages/PresentModePage';
import { VideoPresentModePage } from './pages/VideoPresentModePage';
import { AuthPage } from './pages/AuthPage';
import { LandingPage } from './pages/LandingPage';

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
          <div className="text-center space-y-4 p-8">
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Something went wrong</h1>
            <p className="text-slate-600 dark:text-slate-400">The page encountered an error.</p>
            <button
              onClick={() => { this.setState({ hasError: false }); window.location.href = '/app'; }}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

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
    <ErrorBoundary>
      <ThemeProvider>
        <MobileResumeHandler />
        <AuthProvider>
          <TranscriptProvider>
            <SharedProvider>
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
                  <Route
                    path="/app/transcript/:id/video-present"
                    element={
                      <ProtectedRoute>
                        <VideoPresentModePage />
                      </ProtectedRoute>
                    } />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </BrowserRouter>
              <Toaster position="bottom-right" richColors />
            </SharedProvider>
          </TranscriptProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
