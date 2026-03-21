# MattrMindrScribe

A legal transcript management application with AI-powered transcription, case management, and Stripe payments.

## Project Overview

A full-stack application for managing legal case recordings/transcripts. Features include:
- Front-facing marketing/landing page with pricing tiers
- User authentication (register, login, JWT-based)
- Transcript listing with status indicators (Completed, Processing, Pending, Error)
- Case and folder organization
- Audio/video file upload with background upload (non-blocking progress indicator) and 4-step AI transcription pipeline: (0) Auphonic audio cleanup via axios (Standard or Body Cam preset, WAV output, 15s polling, 30min timeout — optional, non-fatal), (1) OpenAI Whisper for text+timestamps, (2) AssemblyAI for speaker diarization + sentiment analysis + entity detection, (3) Claude Opus 4 enriched refinement (radio transmission detection for body cam, speaker ID, transcript cleanup with structured JSON output) with fallback to standard refinement; optional expected speaker count at upload; recording type selector (Deposition, Court Hearing, Recorded Statement, Police Interrogation, Body Cam, Other) + area of law dropdown (10 practice areas); startup env guard checks DATABASE_URL, OPENAI_API_KEY, ANTHROPIC_API_KEY, ASSEMBLYAI_API_KEY, AUPHONIC_API_KEY; supports extensive audio/video formats (mp3, wav, m4a, ogg, flac, aac, wma, amr, opus, aiff, mp4, mov, avi, mkv, wmv, flv, 3gp, mpg, etc.)
- In-browser audio recording via MediaRecorder API (WebM/opus); AudioRecorder component with start/stop/pause, live timer, real-time audio level visualization (Web Audio API AnalyserNode); recorded file feeds into same upload → transcription pipeline; RecordingMetadata modal collects recording type, practice area, and speaker count before upload
- AI Summarize: two-step practice-area-specific transcript analysis via 10 legal agent bots (Personal Injury, Family Law, Criminal Defense, Workers' Comp, Insurance Defense, Employment Law, Medical Malpractice, Real Estate, Immigration, General Litigation); each area has 7-9 recording sub-types (e.g., Plaintiff's Deposition, Body Camera Footage, Custody Evaluation) that modify the AI prompt for targeted analysis; streams response in real-time via SSE; sub-type stored in `transcript_summaries.sub_type` column
- Send individual transcript to MattrMindr from the transcript viewer: toolbar button opens case search modal, associates transcript with a case-linked folder, and sends transcript data (segments, versions, summaries, pipeline log) to the MattrMindr case
- Synced audio player for recordings
- Version history for transcripts (persisted to DB, loaded on page open)
- Per-segment speaker reassignment (click speaker name to change via dropdown)
- Present mode for hearings
- Admin user with unlimited access

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite 5, Tailwind CSS
- **Backend**: Express.js (v5), TypeScript, tsx
- **Database**: PostgreSQL (Replit built-in)
- **Cloud Storage**: Amazon S3 (via @aws-sdk/client-s3); backward-compatible with legacy R2 URLs in database
- **Auth**: JWT (jsonwebtoken + bcryptjs)
- **File Upload**: Chunked multipart direct-to-S3 uploads (15MB chunks, 5 concurrent, auto-retry with backoff); Web Worker offloads uploads to separate thread for tab-suspension resilience; falls back to main-thread upload if Workers unavailable; all presigned URLs generated upfront before upload starts; no file size limit; legacy presigned single-PUT endpoint retained for backward compat; Multer fallback for non-S3 local storage
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
- `server/s3.ts` - Amazon S3 storage module (upload, download, stream, delete, presigned URLs); backward-compatible with legacy `r2://` URLs
- `server/middleware/auth.ts` - JWT authentication middleware
- `server/routes/auth.ts` - Auth endpoints (register, login, me, change-password)
- `server/routes/transcripts.ts` - Transcript CRUD + file upload (S3 or local) + status/retranscribe endpoints
- `server/transcription.ts` - AI transcription pipeline (ffmpeg conversion, chunking, Whisper API, 3-step diarization, S3 download support); robust audio duration detection with 3 ffprobe fallback strategies (format metadata → stream metadata → full file scan) plus segment-based estimation; duration is non-blocking — pipeline continues even if all probing fails; WAV chunking uses file-size-based duration calculation (no ffprobe dependency); includes deduplication with short-segment proximity check, lookback window (10 recent segments, time+text similarity), and hallucination detection (removes consecutive identical short-phrase runs with uniform spacing); segment save wrapped in DB transaction (DELETE+INSERT+UPDATE atomically); ON CONFLICT upsert on (transcript_id, segment_order) unique index prevents duplicate rows; **resumable pipeline**: after Whisper+diarization complete, segments are checkpointed to DB before speaker refinement begins — if the server restarts mid-refinement, retry skips straight to refinement instead of re-downloading/re-transcribing (checks `pipeline_log.whisper.status === 'success'` + existing segments in `transcript_segments` table); **no WAV conversion**: chunks are split directly from source audio into MP3 (64kbps mono) using ffmpeg time-based seeking — eliminates the 50-minute WAV conversion bottleneck; chunk size calculated from output MP3 bitrate (~43 min per chunk) so a 66-min recording = 2 chunks instead of 6
- `server/auphonic.ts` - Auphonic audio cleanup pre-processing using **axios** (preserves auth headers on redirects); two presets: Standard (speech_isolation, 100% denoise) and Body Cam (dynamic_denoise, 75% denoise, no breath removal); uses Simple API (`/api/simple/productions.json`) for single-request upload+start; polling at 15s intervals with 30min timeout; downloads cleaned **WAV** via streaming; non-fatal — falls back to original audio on failure; skipped when AUPHONIC_API_KEY not set or user has not enabled Auphonic in settings
- `server/diarization.ts` - AssemblyAI speaker diarization with enrichment: uploads audio, requests `speaker_labels`, `sentiment_analysis`, `entity_detection`, `punctuate`, `format_text`; returns `EnrichedDiarizationResult` with utterances (including per-word confidence), sentiment results, and detected entities; legacy `DiarizationLabel[]` included for Whisper segment mapping
- `server/speakerRefinement.ts` - Claude Opus 4 speaker refinement via Anthropic streaming API; **enriched pipeline**: when AssemblyAI enrichment data is available, uses dedicated system prompt with radio transmission detection (dispatch vocabulary, confidence analysis, sentiment/entity signals), structured JSON output with `metadata`, `speakers`, `transcript[]` including `type` and `radio_classification` fields, `max_tokens: 16000`; pre-computes per-speaker word confidence stats; graceful fallback to standard refinement if enriched path fails; **standard pipeline**: simplified, concise prompts that leverage Claude's natural understanding of legal proceedings; two-pass deposition refinement: Pass 1 identifies speaker roster from first 80 segments, Pass 2 uses roster for full transcript refinement; Claude returns `{segments: [{label, text}], identifications}` — both corrected speaker labels AND cleaned text (punctuation, time formatting, capitalization) while preserving filler words verbatim; SINGLE_CALL_LIMIT=800, BATCH_SIZE=700 (respects Claude Opus 4's 32K max output token limit); Q&A post-processing corrects short misattributed utterances using examiner/deponent alternation logic; conditionally sends only the matching recording-type section to Claude; post-batch normalization eliminates generic "Speaker N" leakage; auto-defaults 5 expected speakers for depositions
- `server/routes/folders.ts` - Folder CRUD + move transcripts + MattrMindr case linking
- `server/routes/mattrmindr.ts` - MattrMindr integration API (connect, disconnect, status, case search proxy, send files)
- `server/routes/annotations.ts` - CRUD for transcript annotations (notes between segments, bookmarks on segments)
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
- `PATCH /api/auth/settings` - Update user settings (auphonicEnabled toggle)
- `GET /api/transcripts/:id/annotations` - List annotations (notes + bookmarks) for a transcript
- `POST /api/transcripts/:id/annotations` - Create annotation (type: note or bookmark, segmentId required)
- `PATCH /api/transcripts/:id/annotations/:annotationId` - Update annotation text
- `DELETE /api/transcripts/:id/annotations/:annotationId` - Delete annotation
- `GET /api/transcripts` - List user transcripts
- `GET /api/transcripts/:id/detail` - Get single transcript with segments (fallback for page reload)
- `POST /api/transcripts/presigned-upload` - Get presigned S3 URL for direct browser upload
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
- `GET /api/external/transcripts` - List all transcripts for API key user (lightweight metadata, no segments); auth: X-Api-Key header or JWT
- `GET /api/external/transcripts/:id/full` - Full transcript with segments, summaries, presigned media URL; auth: X-Api-Key or JWT
- `GET /api/external/transcripts/:id/media` - Presigned S3 media download URL only; auth: X-Api-Key or JWT
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

## Amazon S3 Storage

- Files are uploaded to S3 when configured (env vars: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET_NAME, S3_REGION, optional S3_PUBLIC_URL)
- DB `file_url` column stores `s3://uploads/<uuid>.<ext>` for new S3 files, `/uploads/<filename>` for local files
- Legacy `r2://` URLs from prior Cloudflare R2 storage are still recognized (backward-compatible via `isCloudStorageUrl` which matches both `s3://` and `r2://` prefixes)
- `server/s3.ts` exports: `uploadToS3`, `uploadFileToS3`, `getPresignedUploadUrl`, `downloadFromS3`, `streamFromS3`, `deleteFromS3`, `isCloudStorageUrl`, `getKeyFromStorageUrl`, `getS3PublicUrl`
- S3 bucket must have CORS configured to allow browser direct uploads (AllowedOrigins: *, AllowedMethods: GET/PUT/POST/HEAD)
- Media serving: `/api/media/token` returns presigned S3 download URLs for cloud files (browser loads directly from S3, bypassing proxy size limits) or generates short-lived tokens for local files; `/api/media/:filename` serves local files via proxy
- Transcription pipeline downloads S3 files to temp dir before processing, cleans up after
- Falls back to local disk storage when S3 is not configured

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

- Resume handler: `MobileResumeHandler` in App.tsx forces DOM repaint on `visibilitychange` (fixes blank screen when switching apps on mobile); reloads page if hidden >30s; reloads on `pageshow` with `e.persisted` (BFCache restore)
- Auth flow: 401/403 responses clear token + dispatch `auth_token_cleared` custom event (no hard redirect); `AuthContext` listens for event and nulls user; React Router `<Navigate>` handles redirect
- Global: `touch-action: manipulation` on buttons/links to prevent double-tap zoom; `-webkit-tap-highlight-color: transparent` for clean taps
- AudioPlayer: Pointer events for drag-to-scrub on progress bar; speed is a dropdown menu on mobile (all 8 options), inline buttons on desktop; compact padding for mobile
- TranscriptText: Checkbox-based merge on mobile (select 2+ segments, merge bar appears at top); inline merge buttons only on desktop; split button always visible; `overscroll-contain` for smooth scroll; touchstart detection pauses auto-scroll
- TranscriptToolbar: p-2 minimum touch targets on mobile; active states for visual feedback
- Side panels (VersionHistory, AISummaryPanel): Full-width on mobile
- Speaker manager popup: Bottom sheet on mobile (fixed inset-x-0 bottom-0), dropdown on desktop
- Speaker bar: Horizontally scrollable with `flex-nowrap` + `whitespace-nowrap` + `flex-shrink-0` on all items; no wrapping

## Deployment

### Replit (Development)
- Target: vm (always-on) — required because transcription pipelines run 20-30+ minutes; autoscale would kill them via SIGTERM
- Build: `npm run build`
- Run: `npm run start`
- In production, server runs on port 5000, serves static dist/ files
- Startup cleanup: on boot, orphaned `s3_download_*` and `transcription_*` temp directories are auto-deleted before recovery runs
- Startup recovery: on boot, transcripts stuck in "processing"/"resuming" are auto-resumed from last checkpoint via processTranscription()
- ENOSPC handling: disk-full errors during transcription are caught gracefully (status set to 'error' with clear message) instead of crashing the server
- Manual restart endpoint: `POST /api/transcripts/admin/restart-processing` with `X-Admin-Key` header; restarts all stuck transcripts from their last checkpoint; requires `ADMIN_API_KEY` env var

### AWS EC2 (Production)
- Domain: scribe.mattrmindr.com (via Cloudflare DNS)
- Server: EC2 Ubuntu instance at ip-172-31-7-111
- Process manager: PM2 (`pm2 start npm --name "mattrmindrscribe" -- run start`)
- Reverse proxy: Nginx with `client_max_body_size 2G`
- Database: PostgreSQL local, user `mattrmindr`, database `mattrmindrscribe`, auth `scram-sha-256`
- Code repo: github.com/benw525/MattrMindrScribe (git pull to deploy)
- `server/db.ts` imports `dotenv/config` directly to ensure DATABASE_URL is loaded before pool creation (ES module import hoisting)
- S3 bucket `mattrmindrscribe-files` in `us-east-2` with CORS configured for `scribe.mattrmindr.com`
- Env vars in `/home/ubuntu/mattrmindrscribe/.env`: DATABASE_URL, AWS keys, OPENAI_API_KEY, ANTHROPIC_API_KEY, ASSEMBLYAI_API_KEY, AUPHONIC_API_KEY, JWT_SECRET, ADMIN_ACCOUNTS, ADMIN_API_KEY, NODE_ENV=production, REPLIT_DEPLOYMENT=1

## External Read-Only API (Jamie's Companion App)

- Three read-only endpoints under `/api/external/` for Jamie's companion Replit app
- Auth: Static API key via `X-Api-Key` header (falls back to JWT if no API key provided)
- Env vars: `EXTERNAL_API_KEY` (the key string), `EXTERNAL_API_USER_EMAIL` (set to `jamie@mattrmindr.com`)
- User resolution is cached after first lookup (lazy singleton)
- Integration document: `MattrMindrScribe_External_API_Integration.rtf` (contains full API docs + agent prompt for companion app)
- Middleware: `authenticateApiKeyOrToken()` in `server/middleware/auth.ts`

## Admin Accounts

Both accounts are seeded automatically on server startup (see `seedAdminAccounts()` in `server/index.ts`):

- Email: benw52592@gmail.com — Role: admin, Tier: unlimited
- Email: dcrdn@proton.me — Role: admin, Tier: unlimited
