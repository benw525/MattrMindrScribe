# MattrMindrScribe

A legal transcript management application with AI-powered transcription, case management, and Stripe payments.

## Project Overview

A full-stack application for managing legal case recordings/transcripts. Features include:
- Front-facing marketing/landing page with pricing tiers
- User authentication (register, login, JWT-based)
- Transcript listing with status indicators (Completed, Processing, Pending, Error)
- Case and folder organization
- Audio/video file upload with background upload (non-blocking progress indicator) and 3-step AI transcription pipeline: (1) OpenAI Whisper for text+timestamps, (2) AssemblyAI for speaker diarization, (3) Claude Opus 4.6 for speaker refinement; optional expected speaker count at upload; recording type selector (Deposition, Court Hearing, Recorded Statement, Police Interrogation, Other) + area of law dropdown (10 practice areas); supports extensive audio/video formats (mp3, wav, m4a, ogg, flac, aac, wma, amr, opus, aiff, mp4, mov, avi, mkv, wmv, flv, 3gp, mpg, etc.)
- AI Summarize: practice-area-specific transcript analysis via 10 legal agent bots (Personal Injury, Family Law, Criminal Defense, Workers' Comp, Insurance Defense, Employment Law, Medical Malpractice, Real Estate, Immigration, General Litigation); streams response in real-time via SSE
- Synced audio player for recordings
- Version history for transcripts (persisted to DB, loaded on page open)
- Per-segment speaker reassignment (click speaker name to change via dropdown)
- Present mode for hearings
- Admin user with unlimited access

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite 5, Tailwind CSS
- **Backend**: Express.js (v5), TypeScript, tsx
- **Database**: PostgreSQL (Replit built-in)
- **Cloud Storage**: Cloudflare R2 (S3-compatible, via @aws-sdk/client-s3)
- **Auth**: JWT (jsonwebtoken + bcryptjs)
- **File Upload**: Presigned URL direct-to-R2 uploads (bypasses proxy size limits); Multer fallback for non-R2 local storage
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
- `server/transcription.ts` - AI transcription pipeline (ffmpeg conversion, chunking, Whisper API, 3-step diarization, R2 download support); includes deduplication with short-segment proximity check and hallucination detection (removes consecutive identical short-phrase runs with uniform spacing)
- `server/diarization.ts` - AssemblyAI speaker diarization (upload audio, get speaker labels, map onto Whisper segments)
- `server/speakerRefinement.ts` - Claude Opus 4 speaker refinement via Anthropic streaming API; simplified, concise prompts that leverage Claude's natural understanding of legal proceedings; two-pass deposition refinement: Pass 1 identifies speaker roster from first 80 segments, Pass 2 uses roster for full transcript refinement; Claude returns `{segments: [{label, text}], identifications}` — both corrected speaker labels AND cleaned text (punctuation, time formatting, capitalization) while preserving filler words verbatim; SINGLE_CALL_LIMIT=800, BATCH_SIZE=700 (respects Claude Opus 4's 32K max output token limit); Q&A post-processing corrects short misattributed utterances using examiner/deponent alternation logic; conditionally sends only the matching recording-type section to Claude; post-batch normalization eliminates generic "Speaker N" leakage; auto-defaults 5 expected speakers for depositions
- `server/routes/folders.ts` - Folder CRUD + move transcripts + MattrMindr case linking
- `server/routes/mattrmindr.ts` - MattrMindr integration API (connect, disconnect, status, case search proxy, send files)
- `server/routes/external.ts` - External API for inbound integrations (auth, receive files for transcription, transcription status)
- `server/replit_integrations/` - OpenAI AI Integrations (audio, chat, image, batch utilities)

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
- `POST /api/transcripts/presigned-upload` - Get presigned R2 URL for direct browser upload
- `POST /api/transcripts/confirm-upload` - Confirm upload completion, create transcript record, start transcription
- `POST /api/transcripts/upload` - Legacy upload via server (fallback, limited by proxy body size)
- `GET /api/transcripts/:id/status` - Poll transcription status
- `POST /api/transcripts/:id/retranscribe` - Re-run transcription
- `GET /api/transcripts/:id/export/:format` - Export transcript (txt, docx, pdf)
- `PATCH /api/transcripts/:id` - Update transcript
- `DELETE /api/transcripts` - Batch delete transcripts
- `POST /api/transcripts/:id/versions` - Create version snapshot
- `GET /api/transcripts/:id/versions` - List versions
- `GET /api/transcripts/agents` - List available AI legal summary agents
- `POST /api/transcripts/:id/summarize` - Generate AI summary (SSE streaming, body: {agentType})
- `POST /api/transcripts/:id/merge-speaker` - Merge one speaker into another (body: {fromSpeaker, toSpeaker}); creates version snapshot, transactional
- `GET /api/transcripts/:id/summaries` - List past summaries for a transcript
- `GET /api/folders` - List folders
- `POST /api/folders` - Create folder
- `PATCH /api/folders/:id` - Update folder
- `DELETE /api/folders/:id` - Delete folder
- `POST /api/folders/move-transcripts` - Move transcripts
- `POST /api/mattrmindr/connect` - Connect to MattrMindr (baseUrl, email, password)
- `GET /api/mattrmindr/status` - Get MattrMindr connection status
- `DELETE /api/mattrmindr/disconnect` - Disconnect MattrMindr
- `GET /api/mattrmindr/cases?q=` - Search MattrMindr cases (proxied)
- `POST /api/mattrmindr/send/:folderId` - Send folder contents to linked MattrMindr case
- `POST /api/mattrmindr/send/:folderId/confirm` - Confirm send with file replacements
- `POST /api/external/auth` - External auth (for MattrMindr inbound connections)
- `POST /api/external/receive` - Receive file URL from MattrMindr for transcription
- `GET /api/external/transcripts/:id/status` - Poll transcription status (for external callers)
- `POST /api/media/token` - Get short-lived media access token (authenticated)
- `GET /api/media/:filename?token=` - Serve media file with secure token

## Database Schema (PostgreSQL)

- `users` - User accounts with Stripe customer/subscription IDs
- `folders` - Case folders with hierarchy support
- `transcripts` - Media files and transcription metadata
- `transcript_segments` - Individual transcription segments
- `transcript_versions` - Version snapshots
- `transcript_summaries` - AI-generated legal summaries (per-agent, per-transcript)
- `transcripts.pipeline_log` - JSONB column storing per-step results (whisper, diarization, refinement) with status, stats, and errors
- `mattrmindr_connections` - MattrMindr integration connections (one per user, stores base_url, email, auth_token)
- `folders.mattrmindr_case_id` / `folders.mattrmindr_case_name` - Links a folder to a MattrMindr case

## Cloudflare R2 Storage

- Files are uploaded to R2 when configured (env vars: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL)
- DB `file_url` column stores `r2://uploads/<uuid>.<ext>` for R2 files, `/uploads/<filename>` for local files
- `server/r2.ts` exports: `uploadToR2`, `uploadFileToR2`, `getPresignedUploadUrl`, `downloadFromR2`, `streamFromR2`, `deleteFromR2`, `isR2Url`, `getR2KeyFromUrl`, `getR2PublicUrl`
- R2 bucket has CORS configured to allow browser direct uploads (AllowedOrigins: *, AllowedMethods: GET/PUT/POST/HEAD)
- Media serving: `/api/media/token` returns presigned R2 download URLs for R2 files (browser loads directly from R2, bypassing proxy size limits) or generates short-lived tokens for local files; `/api/media/:filename` serves local files via proxy
- Transcription pipeline downloads R2 files to temp dir before processing, cleans up after
- Falls back to local disk storage when R2 is not configured
- Bucket name is normalized to lowercase (R2 requirement)

## MattrMindr Integration

- MattrMindrScribe connects to an external MattrMindr case management server via API
- Connection: User provides MattrMindr URL, email, password in Settings; backend authenticates and stores the token
- Case linking: When creating a folder, users can search MattrMindr cases and link the folder to a case
- Sending: Folders linked to a case have a "Send to MattrMindr" option that sends all completed transcripts (with segments, versions, summaries, pipeline log) to the MattrMindr case
- Conflict detection: If a file with the same name exists in MattrMindr, user is prompted to choose which files to replace
- Inbound: MattrMindr can send files to MattrMindrScribe for transcription via `POST /api/external/receive` (provides a download URL, Scribe fetches and runs the pipeline); MattrMindr polls status via `GET /api/external/transcripts/:id/status`
- API contract for MattrMindr is documented in `mattrmindr-api-contract.md` (covers both outbound and inbound directions)
- All MattrMindr API calls are proxied through the backend (server-to-server), no direct browser-to-MattrMindr requests

## Development

- Frontend: Vite dev server on port 5000 (0.0.0.0)
- Backend: Express on port 3000 (localhost)
- Vite proxies `/api` and `/uploads` to backend
- `npm run dev` starts both servers

## Mobile Responsiveness

- Global: `touch-action: manipulation` on buttons/links to prevent double-tap zoom; `-webkit-tap-highlight-color: transparent` for clean taps
- AudioPlayer: Pointer events for drag-to-scrub on progress bar; speed is a dropdown menu on mobile (all 8 options), inline buttons on desktop; compact padding for mobile
- TranscriptText: Checkbox-based merge on mobile (select 2+ segments, merge bar appears at top); inline merge buttons only on desktop; split button always visible; `overscroll-contain` for smooth scroll; touchstart detection pauses auto-scroll
- TranscriptToolbar: p-2 minimum touch targets on mobile; active states for visual feedback
- Side panels (VersionHistory, AISummaryPanel): Full-width on mobile
- Speaker manager popup: Bottom sheet on mobile (fixed inset-x-0 bottom-0), dropdown on desktop
- Speaker bar: Horizontally scrollable with `flex-nowrap` + `whitespace-nowrap` + `flex-shrink-0` on all items; no wrapping

## Deployment

- Target: vm (always-on) — required because transcription pipelines run 20-30+ minutes; autoscale would kill them via SIGTERM
- Build: `npm run build`
- Run: `npm run start`
- In production, server runs on port 5000, serves static dist/ files
- Startup recovery: on boot, any transcripts stuck in "processing" for 30+ minutes are reset to "error" so users can retry

## Admin Accounts

Both accounts are seeded automatically on server startup (see `seedAdminAccounts()` in `server/index.ts`):

- Email: benw52592@gmail.com — Role: admin, Tier: unlimited
- Email: dcrdn@proton.me — Role: admin, Tier: unlimited
