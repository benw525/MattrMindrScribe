import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { TranscriptProvider } from './contexts/TranscriptContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { AppLayout } from './components/layout/AppLayout';
import { DashboardPage } from './pages/DashboardPage';
import { TranscriptViewerPage } from './pages/TranscriptViewerPage';
import { PresentModePage } from './pages/PresentModePage';
import { AuthPage } from './pages/AuthPage';
export function App() {
  return (
    <ThemeProvider>
      <TranscriptProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<AuthPage />} />
            <Route path="/" element={<AppLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="transcript/:id" element={<TranscriptViewerPage />} />
            </Route>
            <Route
              path="/transcript/:id/present"
              element={<PresentModePage />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="bottom-right" richColors />
      </TranscriptProvider>
    </ThemeProvider>);

}