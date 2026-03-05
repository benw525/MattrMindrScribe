# MattrMindScribe

A legal transcript management application built with React, TypeScript, Vite, and Tailwind CSS.

## Project Overview

A dashboard for managing and reviewing legal case recordings/transcripts. Features include:
- Transcript listing with status indicators (Completed, Processing, Pending, Error)
- Case and folder organization
- Audio player for recordings
- File upload functionality
- Dark theme UI

## Tech Stack

- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite 5
- **Styling**: Tailwind CSS
- **Routing**: React Router DOM v6
- **Animation**: Framer Motion
- **Icons**: Lucide React
- **Notifications**: Sonner

## Project Structure

- `src/pages/` - Main page components (Dashboard, TranscriptViewer, PresentMode, Auth)
- `src/components/` - Reusable UI components (brand, layout, transcripts, upload, viewer)
- `src/contexts/` - React contexts (Theme, Transcript)
- `src/hooks/` - Custom hooks (useAudioPlayer, useTheme, useTranscripts)
- `src/data/` - Mock data for transcripts
- `src/types/` - TypeScript type definitions
- `src/utils/` - Utility functions

## Development

- Dev server runs on port 5000 (0.0.0.0)
- `npm run dev` - Start development server
- `npm run build` - Build for production

## Deployment

Configured as a static site deployment:
- Build command: `npm run build`
- Public directory: `dist`
