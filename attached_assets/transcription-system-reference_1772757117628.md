# Transcription System Reference

A comprehensive reference for the audio/video transcription pipeline used in MattrMindr. This document covers the full architecture: file ingestion, storage, processing, the OpenAI Whisper integration, API endpoints, database schema, and associated environment variables.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Environment Variables & API Keys](#environment-variables--api-keys)
3. [Database Schema](#database-schema)
4. [File Upload Flow](#file-upload-flow)
5. [Transcription Processing Pipeline](#transcription-processing-pipeline)
6. [API Endpoints](#api-endpoints)
7. [Frontend API Calls](#frontend-api-calls)
8. [R2 Cloud Storage Integration](#r2-cloud-storage-integration)
9. [Automatic Transcription from Email](#automatic-transcription-from-email)
10. [Data Formats](#data-formats)

---

## Architecture Overview

```
User uploads audio/video file
        │
        ▼
┌─────────────────────┐
│  Express Server     │
│  (multer middleware) │
│  Single or Chunked  │
└────────┬────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Storage Layer                  │
│  ┌───────────┐  ┌─────────────┐│
│  │ Cloudflare│  │ PostgreSQL  ││
│  │ R2 (S3)   │  │ BYTEA       ││
│  │ (primary) │  │ (fallback)  ││
│  └───────────┘  └─────────────┘│
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Background Processing          │
│  1. ffprobe  → get duration     │
│  2. ffmpeg   → convert to WAV   │
│     (16kHz, mono, PCM 16-bit)   │
│  3. Split into chunks if >24MB  │
│     (1-second overlap)          │
│  4. OpenAI Whisper API          │
│     (whisper-1, verbose_json)   │
│  5. Deduplicate overlap segs    │
│  6. Speaker diarization         │
│     (gap-based heuristic)       │
│  7. Save JSONB transcript       │
└─────────────────────────────────┘
```

**Key files:**
- `server/routes/transcripts.js` — All transcript endpoints and `processTranscription` logic
- `server/routes/inbound-email.js` — Auto-transcription from email attachments
- `server/r2.js` — Cloudflare R2 storage client
- `server/openai-client.js` — OpenAI client initialization
- `lextrack/src/api.js` — Frontend API wrappers

---

## Environment Variables & API Keys

### Required for Transcription

| Variable | Description | Used By |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key for Whisper speech-to-text | `server/openai-client.js` |

### Required for Cloud Storage (R2)

If these are not set, files are stored in PostgreSQL BYTEA columns instead.

| Variable | Description | Used By |
|----------|-------------|---------|
| `R2_ACCOUNT_ID` | Cloudflare Account ID | `server/r2.js` |
| `R2_ACCESS_KEY_ID` | R2 API Token Access Key | `server/r2.js` |
| `R2_SECRET_ACCESS_KEY` | R2 API Token Secret Key | `server/r2.js` |
| `R2_BUCKET_NAME` | R2 bucket name for file storage | `server/r2.js` |

### Required for Email Auto-Transcription

| Variable | Description | Used By |
|----------|-------------|---------|
| `SENDGRID_API_KEY` | SendGrid API key (Inbound Parse webhook) | `server/routes/inbound-email.js` |

### System Dependencies

| Dependency | Purpose |
|------------|---------|
| `ffmpeg` | Audio/video conversion, chunking, duration detection |
| `ffprobe` | Audio duration extraction (bundled with ffmpeg) |

### OpenAI Client Configuration

```javascript
// server/openai-client.js
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

module.exports = { openai };
```

The Whisper client is the same OpenAI client instance:

```javascript
// server/routes/transcripts.js
const { openai } = require("../openai-client");
const whisperClient = openai;
```

---

## Database Schema

### `case_transcripts` (primary table)

| Column | Type | Constraints / Default | Description |
|--------|------|----------------------|-------------|
| `id` | `SERIAL` | `PRIMARY KEY` | Unique transcript ID |
| `case_id` | `INTEGER` | `NOT NULL`, `REFERENCES cases(id) ON DELETE CASCADE` | Associated case |
| `filename` | `TEXT` | `NOT NULL` | Original filename |
| `content_type` | `TEXT` | `NOT NULL DEFAULT ''` | MIME type of uploaded file |
| `audio_data` | `BYTEA` | | Raw audio binary (fallback storage) |
| `video_data` | `BYTEA` | | Raw video binary (fallback storage) |
| `file_size` | `INTEGER` | `NOT NULL DEFAULT 0` | File size in bytes |
| `transcript` | `JSONB` | `NOT NULL DEFAULT '[]'` | Array of transcript segments |
| `status` | `TEXT` | `NOT NULL DEFAULT 'processing'` | `pending` / `processing` / `completed` / `error` |
| `error_message` | `TEXT` | | Error details if status = `error` |
| `duration_seconds` | `REAL` | | Audio duration in seconds |
| `uploaded_by` | `INTEGER` | `REFERENCES users(id)` | User who uploaded |
| `uploaded_by_name` | `TEXT` | `NOT NULL DEFAULT ''` | Display name of uploader |
| `is_video` | `BOOLEAN` | `NOT NULL DEFAULT false` | Whether file is video |
| `video_content_type` | `TEXT` | `NOT NULL DEFAULT ''` | Video MIME type |
| `r2_audio_key` | `TEXT` | `NOT NULL DEFAULT ''` | R2 object key for audio |
| `r2_video_key` | `TEXT` | `NOT NULL DEFAULT ''` | R2 object key for video |
| `folder_id` | `INTEGER` | | Folder assignment |
| `sort_order` | `INTEGER` | `DEFAULT 0` | Sort position within folder |
| `description` | `TEXT` | `DEFAULT ''` | User-editable description |
| `deleted_at` | `TIMESTAMPTZ` | `DEFAULT NULL` | Soft-delete timestamp |
| `deleted_by` | `TEXT` | `DEFAULT NULL` | Who deleted |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Upload timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Last modified |

### `transcript_folders`

| Column | Type | Constraints / Default | Description |
|--------|------|----------------------|-------------|
| `id` | `SERIAL` | `PRIMARY KEY` | Folder ID |
| `case_id` | `INTEGER` | `NOT NULL`, `REFERENCES cases(id) ON DELETE CASCADE` | Associated case |
| `name` | `TEXT` | `NOT NULL` | Folder name |
| `sort_order` | `INTEGER` | `DEFAULT 0` | Display order |
| `collapsed` | `BOOLEAN` | `DEFAULT false` | UI collapse state |
| `created_at` | `TIMESTAMP` | `DEFAULT NOW()` | Created timestamp |
| `deleted_at` | `TIMESTAMPTZ` | `DEFAULT NULL` | Soft-delete timestamp |
| `deleted_by` | `TEXT` | `DEFAULT NULL` | Who deleted |

### `transcript_history`

| Column | Type | Constraints / Default | Description |
|--------|------|----------------------|-------------|
| `id` | `SERIAL` | `PRIMARY KEY` | History entry ID |
| `transcript_id` | `INTEGER` | `NOT NULL`, `REFERENCES case_transcripts(id) ON DELETE CASCADE` | Parent transcript |
| `change_type` | `TEXT` | `NOT NULL` | Type of change (e.g., "text_edit", "speaker_change") |
| `change_description` | `TEXT` | `NOT NULL` | Human-readable description |
| `previous_state` | `JSONB` | | Snapshot of state before change |
| `changed_by` | `TEXT` | | Username who made the change |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | When change was made |

Index: `idx_transcript_history_tid` on `transcript_history(transcript_id)`

---

## File Upload Flow

### Accepted File Types

```javascript
const ALLOWED_AUDIO = [
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/wave", "audio/x-wav",
  "audio/mp4", "audio/x-m4a", "audio/m4a", "audio/aac",
  "audio/ogg", "audio/webm", "audio/flac", "audio/x-flac",
  "video/mp4", "video/webm", "video/quicktime", "video/x-msvideo",
];
```

File extensions also accepted: `.mp3`, `.wav`, `.m4a`, `.ogg`, `.flac`, `.aac`, `.webm`, `.mp4`, `.mov`, `.avi`

### Method 1: Single File Upload (files up to 500MB)

```
POST /api/transcripts/upload
Content-Type: multipart/form-data

Fields:
  - audio: <file>
  - caseId: <integer>
```

**Response:**
```json
{
  "id": 42,
  "caseId": 5,
  "filename": "interview.mp3",
  "contentType": "audio/mpeg",
  "fileSize": 15000000,
  "status": "pending",
  "transcript": [],
  "isVideo": false,
  "createdAt": "2026-03-06T12:00:00Z"
}
```

### Method 2: Chunked Upload (for large files, reliable uploads)

Chunk size: **20 MB** per chunk

#### Step 1: Initialize

```
POST /api/transcripts/upload/init
Content-Type: application/json

{
  "caseId": 5,
  "filename": "deposition.mp4",
  "contentType": "video/mp4",
  "fileSize": 250000000,
  "totalChunks": 13
}
```

**Response:**
```json
{
  "uploadId": "abc123-uuid",
  "message": "Chunked upload initialized"
}
```

If R2 is configured, this initiates an S3 multipart upload (`CreateMultipartUpload`).

#### Step 2: Upload Each Chunk

```
POST /api/transcripts/upload/chunk
Content-Type: multipart/form-data

Fields:
  - chunk: <file blob>
  - uploadId: "abc123-uuid"
  - chunkIndex: "0"
```

**Response:**
```json
{
  "message": "Chunk 0 received"
}
```

Each chunk is either stored in memory (local) or uploaded directly to R2 via `UploadPart` (keeping server memory at ~20MB regardless of file size).

#### Step 3: Complete Upload

```
POST /api/transcripts/upload/complete
Content-Type: application/json

{
  "uploadId": "abc123-uuid"
}
```

**Response:**
```json
{
  "id": 43,
  "caseId": 5,
  "filename": "deposition.mp4",
  "status": "pending"
}
```

This concatenates all chunks (or completes the R2 multipart upload), creates the database record, and triggers background processing.

---

## Transcription Processing Pipeline

The `processTranscription(transcriptId)` function runs in the background after upload.

### Step 1: Retrieve Source File

```javascript
const r2Key = rows[0].is_video ? rows[0].r2_video_key : rows[0].r2_audio_key;
if (r2Key && isR2Configured()) {
  sourceData = await downloadFromR2(r2Key);
} else {
  sourceData = rows[0].is_video ? rows[0].video_data : rows[0].audio_data;
}
```

### Step 2: Get Duration (ffprobe)

```javascript
async function getAudioDuration(filePath) {
  // Uses ffprobe to extract duration in seconds
  // Returns: float (e.g., 125.4)
}
```

### Step 3: Convert to WAV (ffmpeg)

```javascript
async function convertToWav(inputPath, outputPath) {
  // ffmpeg args: -y -i input -vn -ar 16000 -ac 1 -acodec pcm_s16le -f wav output
  // Converts any audio/video format to: 16kHz, mono, PCM 16-bit WAV
}
```

### Step 4: Chunk if Necessary

If the WAV file exceeds **24 MB** (`MAX_CHUNK_SIZE`):

```javascript
const bytesPerSec = 16000 * 2; // 16kHz * 16-bit = 32,000 bytes/sec
const chunkDurationSec = Math.floor(MAX_CHUNK_SIZE / bytesPerSec); // ~750 seconds per chunk

// Splits with 1-second overlap to prevent word loss at boundaries
const overlapStart = Math.max(0, start - 1);
```

### Step 5: Call OpenAI Whisper API

```javascript
async function transcribeFile(filePath, offsetSec = 0) {
  const buffer = await readFile(filePath);
  const { toFile } = await import("openai");
  const file = await toFile(buffer, "audio.wav");

  const response = await whisperClient.audio.transcriptions.create({
    file,
    model: "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  });

  const segments = (response.segments || []).map(s => ({
    speaker: "Speaker 1",
    text: s.text.trim(),
    startTime: Math.round((s.start + offsetSec) * 100) / 100,
    endTime: Math.round((s.end + offsetSec) * 100) / 100,
  }));
  return segments;
}
```

**Whisper API parameters:**
- `model`: `"whisper-1"`
- `response_format`: `"verbose_json"` (returns segment-level timestamps)
- `timestamp_granularities`: `["segment"]`

### Step 6: Deduplicate Overlapping Segments

When audio is chunked with 1-second overlap, duplicate segments can appear at boundaries:

```javascript
// Remove duplicate segments
for (const seg of allSegments) {
  const prev = deduped[deduped.length - 1];
  // Skip if same start time (within 1.5s) and same text
  if (Math.abs(seg.startTime - prev.startTime) < 1.5 && seg.text === prev.text) continue;
  // Skip if overlapping time and same text
  if (seg.startTime < prev.endTime - 0.5 && seg.text === prev.text) continue;
  deduped.push(seg);
}
```

### Step 7: Speaker Diarization (Heuristic)

Basic speaker assignment based on silence gaps:

```javascript
let currentSpeaker = 1;
for (let i = 0; i < allSegments.length; i++) {
  if (i === 0) { allSegments[i].speaker = "Speaker 1"; continue; }
  const gap = allSegments[i].startTime - allSegments[i - 1].endTime;
  if (gap > 2.0 && maxSpeaker < 10) {
    currentSpeaker = currentSpeaker === 1 ? 2 : 1;
  }
  allSegments[i].speaker = `Speaker ${currentSpeaker}`;
}
```

A gap of more than **2 seconds** between segments triggers a speaker change. Supports up to 10 speakers.

### Step 8: Save Results

```sql
UPDATE case_transcripts
SET transcript = $1, status = 'completed', duration_seconds = $2, updated_at = NOW()
WHERE id = $3
```

On error:
```sql
UPDATE case_transcripts
SET status = 'error', error_message = $1, updated_at = NOW()
WHERE id = $2
```

---

## API Endpoints

All endpoints require authentication via session cookie. Base path: `/api/transcripts`

### Upload & Processing

| Method | Path | Description | Body |
|--------|------|-------------|------|
| `POST` | `/upload` | Single file upload (max 500MB) | `multipart/form-data`: `audio` (file), `caseId` (int) |
| `POST` | `/upload/init` | Initialize chunked upload | JSON: `{ caseId, filename, contentType, fileSize, totalChunks }` |
| `POST` | `/upload/chunk` | Upload individual chunk | `multipart/form-data`: `chunk` (blob), `uploadId`, `chunkIndex` |
| `POST` | `/upload/complete` | Finalize chunked upload | JSON: `{ uploadId }` |

### Read & List

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `GET` | `/case/:caseId` | List transcripts for a case | Array of transcript objects (excludes full transcript text for performance) |
| `GET` | `/:id/detail` | Full transcript detail | Single transcript object with all segments |

### Edit & Update

| Method | Path | Description | Body |
|--------|------|-------------|------|
| `PUT` | `/:id` | Update transcript text, filename, or description | JSON: `{ transcript?, filename?, description? }` |
| `POST` | `/:id/suggest-name` | AI-generated name suggestion (GPT-4o-mini) | None |

### Version History

| Method | Path | Description | Body |
|--------|------|-------------|------|
| `GET` | `/:id/history` | Get version history (last 200 entries) | None |
| `POST` | `/:id/history` | Save a version snapshot | JSON: `{ changes }` |
| `POST` | `/:id/revert/:historyId` | Revert to a previous version | None |

### Download & Export

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `GET` | `/:id/download-audio` | Download original audio file | Binary (audio/*) |
| `GET` | `/:id/video` | Stream video (supports Range headers) | Binary (video/*) |
| `GET` | `/:id/export?format=txt\|docx\|pdf` | Export transcript as text, DOCX, or PDF | Binary file |

### Folder Management

| Method | Path | Description | Body |
|--------|------|-------------|------|
| `GET` | `/:caseId/folders` | List folders for a case | None |
| `POST` | `/:caseId/folders` | Create a new folder | JSON: `{ name }` |
| `PUT` | `/folders/:folderId` | Rename/update folder | JSON: `{ name?, sort_order?, collapsed? }` |
| `DELETE` | `/folders/:folderId` | Delete a folder | None |
| `PUT` | `/:id/move` | Move transcript to folder | JSON: `{ folder_id, sort_order? }` |
| `PUT` | `/reorder-folders` | Reorder all folders | JSON: `{ folders: [{ id, sort_order }] }` |

### Delete

| Method | Path | Description | Body |
|--------|------|-------------|------|
| `DELETE` | `/:id` | Soft-delete a transcript | None |
| `POST` | `/batch-delete` | Bulk soft-delete (Attorney/Admin only) | JSON: `{ ids: [int] }` |

---

## Frontend API Calls

Located in `lextrack/src/api.js`. All use session cookie authentication.

```javascript
// List transcripts for a case
apiGetTranscripts(caseId)
// GET /api/transcripts/case/{caseId}

// Get full transcript detail with segments
apiGetTranscriptDetail(id)
// GET /api/transcripts/{id}/detail

// Single file upload
apiUploadTranscript(formData)
// POST /api/transcripts/upload (multipart/form-data)

// Chunked upload with progress callback
apiUploadTranscriptChunked(file, caseId, onProgress)
// Calls: /upload/init → /upload/chunk (x N) → /upload/complete
// onProgress receives percentage (0-100)
// Chunk size: 20 MB

// Update transcript text, filename, or description
apiUpdateTranscript(id, data)
// PUT /api/transcripts/{id}

// AI name suggestion for voicemails
apiSuggestVoicemailName(id)
// POST /api/transcripts/{id}/suggest-name

// Version history
apiGetTranscriptHistory(id)
// GET /api/transcripts/{id}/history

apiSaveTranscriptHistory(id, changes)
// POST /api/transcripts/{id}/history

apiRevertTranscriptChange(transcriptId, historyId)
// POST /api/transcripts/{transcriptId}/revert/{historyId}

// Delete
apiDeleteTranscript(id)
// DELETE /api/transcripts/{id}

apiBatchDeleteTranscripts(ids)
// POST /api/transcripts/batch-delete { ids: [int] }

// Download/stream
apiDownloadTranscriptAudio(id)
// GET /api/transcripts/{id}/download-audio → Blob

apiDownloadTranscriptVideo(id)
// GET /api/transcripts/{id}/video → Blob

apiExportTranscript(id, format)
// GET /api/transcripts/{id}/export?format=txt|docx|pdf → Blob

// Folder management
apiGetTranscriptFolders(caseId)
// GET /api/transcripts/{caseId}/folders

apiUpdateTranscriptFolder(folderId, data)
// PUT /api/transcripts/folders/{folderId}

apiDeleteTranscriptFolder(folderId)
// DELETE /api/transcripts/folders/{folderId}
```

---

## R2 Cloud Storage Integration

### Functions (`server/r2.js`)

| Function | Description |
|----------|-------------|
| `isR2Configured()` | Returns `true` if R2 env vars are set |
| `uploadToR2(key, buffer, contentType)` | Upload file buffer to R2 |
| `downloadFromR2(key)` | Download file as Buffer |
| `streamFromR2(key, range)` | Stream file with optional Range header (for video seeking) |
| `deleteFromR2(key)` | Delete object from R2 |
| `getPresignedUrl(key, expiresInSeconds)` | Generate temporary signed URL |
| `createMultipartUpload(key, contentType)` | Initiate S3 multipart upload |
| `uploadPart(key, uploadId, partNumber, body)` | Upload individual part |
| `completeMultipartUpload(key, uploadId, parts)` | Finalize multipart upload |
| `abortMultipartUpload(key, uploadId)` | Cancel multipart upload |

### R2 Key Structure

| Upload Method | Audio Key | Video Key |
|---------------|-----------|-----------|
| Single upload | `transcripts/{transcriptId}/audio` | `transcripts/{transcriptId}/video` |
| Chunked upload | `transcripts/upload_{uuid}/audio` | `transcripts/upload_{uuid}/video` |

### Storage Decision Logic

```
Is R2 configured?
  ├─ YES → Upload to R2, store key in r2_audio_key / r2_video_key column
  └─ NO  → Store binary in audio_data / video_data BYTEA column
```

Read paths always check R2 first, fall back to BYTEA:
```javascript
if (r2Key && isR2Configured()) {
  data = await downloadFromR2(r2Key);  // Try R2 first
} else {
  data = row.audio_data || row.video_data;  // Fall back to database
}
```

---

## Automatic Transcription from Email

When an email arrives via the SendGrid Inbound Parse webhook (`POST /api/inbound-email`):

1. **Voicemail detection**: Subject line checked for "VOICE MESSAGE" (case-insensitive)
2. **Audio attachment filtering**: Scans attachments for audio/video MIME types
3. **Storage**: Uploads attachment to R2 (if configured) or stores in BYTEA
4. **Triggers background transcription**: Calls `processTranscription(transcriptId)`

```javascript
// server/routes/inbound-email.js
const { processTranscription } = require("./transcripts");
processTranscription(transcriptId).catch(err => {
  console.error("Background transcription from email failed:", err.message);
});
```

The email is also stored in `case_correspondence` with `is_voicemail = true` if it matches the voicemail pattern.

---

## Data Formats

### Transcript Segment (JSONB array element)

```json
{
  "speaker": "Speaker 1",
  "text": "I was at the corner of Main and 5th when I saw the defendant.",
  "startTime": 0.0,
  "endTime": 4.52
}
```

### Full Transcript Response Object

```json
{
  "id": 42,
  "caseId": 5,
  "filename": "defendant-interview.mp3",
  "contentType": "audio/mpeg",
  "fileSize": 15234567,
  "transcript": [
    {
      "speaker": "Speaker 1",
      "text": "Can you state your name for the record?",
      "startTime": 0.0,
      "endTime": 2.1
    },
    {
      "speaker": "Speaker 2",
      "text": "John Michael Smith.",
      "startTime": 4.3,
      "endTime": 5.8
    }
  ],
  "status": "completed",
  "errorMessage": null,
  "durationSeconds": 125.4,
  "uploadedBy": 1,
  "uploadedByName": "Jane Attorney",
  "description": "Initial client interview",
  "folderId": 3,
  "sortOrder": 0,
  "isVideo": false,
  "videoContentType": null,
  "createdAt": "2026-03-06T12:00:00.000Z",
  "updatedAt": "2026-03-06T12:02:15.000Z"
}
```

### Version History Entry

```json
{
  "id": 7,
  "transcriptId": 42,
  "changeType": "text_edit",
  "changeDescription": "Edited segment 3 text",
  "previousState": {
    "transcript": [...]
  },
  "changedBy": "Jane Attorney",
  "createdAt": "2026-03-06T14:30:00.000Z"
}
```

### Status Values

| Status | Description |
|--------|-------------|
| `pending` | File uploaded, waiting for processing |
| `processing` | Currently being transcribed |
| `completed` | Transcription finished successfully |
| `error` | Transcription failed (see `error_message`) |
