# MattrMindrScribe

A legal transcript management application with AI-powered transcription, case management, and Stripe payments.

## Project Overview

A full-stack application for managing legal case recordings/transcripts. Features include:
- Front-facing marketing/landing page with pricing tiers
- User authentication (register, login, JWT-based)
- Transcript listing with status indicators (Completed, Processing, Pending, Error)
- Case and folder organization
- Audio/video file upload with background upload (non-blocking progress indicator) and AI transcription pipeline (OpenAI whisper-1 with verbose_json segment timestamps)
- Synced audio player for recordings
- Version history for transcripts (persisted to DB, loaded on page open)
- Per-segment speaker reassignment (click speaker name to change via dropdown)
- Present mode for hearings
- Stripe subscription payments (Starter $29/mo, Professional $79/mo, Enterprise $199/mo)
- Admin user with unlimited access

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite 5, Tailwind CSS
- **Backend**: Express.js (v5), TypeScript, tsx
- **Database**: PostgreSQL (Replit built-in)
- **Cloud Storage**: Cloudflare R2 (S3-compatible, via @aws-sdk/client-s3)
- **Payments**: Stripe (via Replit integration + stripe-replit-sync)
- **Auth**: JWT (jsonwebtoken + bcryptjs)
- **File Upload**: Multer (memoryStorage when R2 configured, diskStorage fallback)
- **Animation**: Framer Motion
- **Icons**: Lucide React
- **Notifications**: Sonner

## Project Structure

### Frontend (src/)
- `src/pages/LandingPage.tsx` - Marketing/landing page with pricing
- `src/pages/AuthPage.tsx` - Login/register page
- `src/pages/DashboardPage.tsx` - Main app dashboard
- `src/pages/TranscriptViewerPage.tsx` - Transcript editor
- `src/pages/PresentModePage.tsx` - Presentation mode
- `src/components/` - Reusable UI components
- `src/contexts/AuthContext.tsx` - Auth state management
- `src/contexts/TranscriptContext.tsx` - Transcript/folder state management
- `src/contexts/ThemeContext.tsx` - Dark/light theme
- `src/utils/api.ts` - API client utility
- `src/hooks/useAudioPlayer.ts` - Real HTML5 audio/video playback hook with secure media token
- `src/hooks/` - Custom hooks

### Backend (server/)
- `server/index.ts` - Express server entry point (port 3000 dev, 5000 prod), media token/streaming endpoints
- `server/db.ts` - PostgreSQL connection pool
- `server/r2.ts` - Cloudflare R2 storage module (upload, download, stream, delete helpers)
- `server/middleware/auth.ts` - JWT authentication middleware
- `server/routes/auth.ts` - Auth endpoints (register, login, me, change-password)
- `server/routes/transcripts.ts` - Transcript CRUD + file upload (R2 or local) + status/retranscribe endpoints
- `server/transcription.ts` - AI transcription pipeline (ffmpeg conversion, chunking, Whisper API, speaker diarization, R2 download support)
- `server/routes/folders.ts` - Folder CRUD + move transcripts
- `server/replit_integrations/` - OpenAI AI Integrations (audio, chat, image, batch utilities)
- `server/routes/stripe.ts` - Stripe checkout, subscription, portal
- `server/stripeClient.ts` - Stripe client (Replit connector)
- `server/webhookHandlers.ts` - Stripe webhook processing
- `server/seed-products.ts` - Script to seed Stripe products

## Routes

### Frontend Routes
- `/` - Landing page (public)
- `/login` - Auth page (public)
- `/app` - Dashboard (protected)
- `/app/transcript/:id` - Transcript viewer (protected)
- `/app/transcript/:id/present` - Present mode (protected)

### API Routes
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/change-password` - Change password (authenticated)
- `GET /api/transcripts` - List user transcripts
- `POST /api/transcripts/upload` - Upload media file (triggers background AI transcription)
- `GET /api/transcripts/:id/status` - Poll transcription status
- `POST /api/transcripts/:id/retranscribe` - Re-run transcription
- `PATCH /api/transcripts/:id` - Update transcript
- `DELETE /api/transcripts` - Batch delete transcripts
- `POST /api/transcripts/:id/versions` - Create version snapshot
- `GET /api/transcripts/:id/versions` - List versions
- `GET /api/folders` - List folders
- `POST /api/folders` - Create folder
- `PATCH /api/folders/:id` - Update folder
- `DELETE /api/folders/:id` - Delete folder
- `POST /api/folders/move-transcripts` - Move transcripts
- `GET /api/stripe/products` - List Stripe products
- `POST /api/stripe/create-checkout-session` - Create Stripe checkout
- `GET /api/stripe/subscription` - Get user subscription
- `POST /api/stripe/customer-portal` - Stripe customer portal
- `POST /api/stripe/webhook` - Stripe webhook (raw body)
- `POST /api/media/token` - Get short-lived media access token (authenticated)
- `GET /api/media/:filename?token=` - Serve media file with secure token

## Database Schema (PostgreSQL)

- `users` - User accounts with Stripe customer/subscription IDs
- `folders` - Case folders with hierarchy support
- `transcripts` - Media files and transcription metadata
- `transcript_segments` - Individual transcription segments
- `transcript_versions` - Version snapshots
- `stripe.*` - Managed by stripe-replit-sync (products, prices, customers, subscriptions)

## Cloudflare R2 Storage

- Files are uploaded to R2 when configured (env vars: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL)
- DB `file_url` column stores `r2://uploads/<uuid>.<ext>` for R2 files, `/uploads/<filename>` for local files
- `server/r2.ts` exports: `uploadToR2`, `downloadFromR2`, `streamFromR2`, `deleteFromR2`, `isR2Url`, `getR2KeyFromUrl`, `getR2PublicUrl`
- Media serving: `/api/media/token` generates short-lived tokens; `/api/media/:filename` proxies/streams from R2 or serves local files
- Transcription pipeline downloads R2 files to temp dir before processing, cleans up after
- Falls back to local disk storage when R2 is not configured
- Bucket name is normalized to lowercase (R2 requirement)

## Development

- Frontend: Vite dev server on port 5000 (0.0.0.0)
- Backend: Express on port 3000 (localhost)
- Vite proxies `/api` and `/uploads` to backend
- `npm run dev` starts both servers

## Deployment

- Target: autoscale
- Build: `npm run build`
- Run: `npx tsx server/index.ts`
- In production, server runs on port 5000, serves static dist/ files

## Admin Account

- Email: benw52592@gmail.com
- Role: admin
- Subscription tier: unlimited
