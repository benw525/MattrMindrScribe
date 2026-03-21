# MattrMindrScribe — Audio Pipeline Enhancement Implementation

## Overview

You are implementing two enhancements to the MattrMindrScribe transcription pipeline:

1. **Auphonic Audio Cleaning** — A new preprocessing step that sends audio through Auphonic's API to remove background noise, normalize volume across speakers, and enhance speech clarity before transcription.
2. **Enriched AssemblyAI → Claude Opus Refinement** — Expanding the AssemblyAI transcription config to capture additional intelligence (sentiment analysis, entity detection, word-level confidence), then passing all of that enriched data to Claude Opus for speaker identification, radio transmission tagging, and transcript refinement.

The current pipeline is: **Whisper (STT) → AssemblyAI (diarization) → Claude Opus (speaker ID + refinement)**

The new pipeline will be: **Auphonic (audio cleaning) → Whisper (STT) → AssemblyAI (diarization + enrichment) → Claude Opus (speaker ID + radio tagging + refinement)**

---

## Architecture Context

- **Stack**: React/Next.js frontend, Node.js/Express backend, PostgreSQL database
- **Deployment**: AWS EC2 + RDS PostgreSQL + S3
- **Process Manager**: PM2
- **Existing relevant files**:
  - `server/index.ts` — App entry point, loads `dotenv/config` at line 1
  - `server/transcription.ts` — Main pipeline orchestration, handles upload → processing → result storage
  - `server/auphonic.ts` — Existing Auphonic integration (needs modification)
- **Key environment variables already in use**: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `ASSEMBLYAI_API_KEY`, `AUPHONIC_API_KEY`

---

## PART 1: Auphonic Audio Cleaning

### 1.1 Environment Variables

Add to `.env`:

```
AUPHONIC_API_KEY=<already exists>
AUPHONIC_PRESET_UUID=<leave blank initially — will be set after first preset creation>
```

### 1.2 Auphonic Service Implementation

Modify or replace `server/auphonic.ts` with a service that handles:

#### HTTP Client

- Use `axios` instead of Node.js native `fetch()` for all Auphonic API calls
- Reason: Node.js `fetch()` (undici-based) strips the `Authorization` header on HTTP redirects. Auphonic's API may redirect, and their download endpoints definitely redirect (3XX). Axios preserves auth headers across redirects by default.
- Set `maxRedirects: 5` on all axios requests to Auphonic

#### Preset Creation

Create a function that creates an Auphonic preset via `POST https://auphonic.com/api/presets.json` with these settings:

**For general legal audio (depositions, hearings, recorded statements):**

```json
{
  "preset_name": "Legal Transcription - Standard",
  "algorithms": {
    "denoise": true,
    "denoise_method": "speech_isolation",
    "denoiseamount": 100,
    "remove_noise": 100,
    "remove_reverb": 80,
    "remove_breaths": 50,
    "leveler": true,
    "leveler_mode": "moderate",
    "filtering": true,
    "voice_autoeq": true,
    "normloudness": true,
    "loudnesstarget": -16,
    "maxpeak": -1
  },
  "output_files": [
    {
      "format": "wav",
      "ending": "wav",
      "split_on_chapters": false,
      "mono_mixdown": false
    }
  ]
}
```

**For body camera / dash camera footage:**

```json
{
  "preset_name": "Legal Transcription - Body Cam",
  "algorithms": {
    "denoise": true,
    "denoise_method": "dynamic_denoise",
    "denoiseamount": 75,
    "remove_noise": 75,
    "remove_reverb": 60,
    "remove_breaths": 0,
    "leveler": true,
    "leveler_mode": "moderate",
    "filtering": true,
    "voice_autoeq": true,
    "normloudness": true,
    "loudnesstarget": -16,
    "maxpeak": -1
  },
  "output_files": [
    {
      "format": "wav",
      "ending": "wav",
      "split_on_chapters": false,
      "mono_mixdown": false
    }
  ]
}
```

Key differences for body cam: uses `dynamic_denoise` instead of `speech_isolation` (less aggressive, fewer artifacts on already-degraded audio), noise removal at 75% instead of 100%, reverb at 60%, and breath removal disabled (breathing overlaps with speech starts on body cam audio).

Store the preset UUID after creation. Reuse it for subsequent productions. The preset only needs to be created once.

#### Audio Submission

Submit audio for cleaning via Auphonic's Simple API:

```
POST https://auphonic.com/api/simple/productions.json
Content-Type: multipart/form-data

Fields:
  preset: <preset UUID>
  title: matter-<matterId>-<timestamp>
  input_file: <audio file>
  action: start
```

This uploads the file and starts processing in a single request. Returns a production UUID.

Auth header: `Authorization: Bearer <AUPHONIC_API_KEY>`

#### Polling for Completion

After submission, poll for completion. This is critical — the current implementation polls too aggressively and times out before Auphonic finishes processing.

**Polling configuration:**

```
Poll interval: 15 seconds
Maximum timeout: 30 minutes (1,800,000 ms)
```

**Auphonic production status codes:**

```
0 = Incomplete
1 = Not Started
2 = Waiting (queued)
3 = Done ← download the result
4 = Error ← log error, handle failure
5 = Encoding (almost done, keep polling)
9 = Processing (in progress, keep polling)
```

Only exit the polling loop on status 3 (Done) or status 4 (Error). All other statuses mean "keep waiting."

Log each poll with the current status and elapsed time so progress is visible in PM2 logs:

```
[Auphonic] Status: Processing (9) — poll 5, 75s elapsed, next poll in 15s
[Auphonic] Status: Encoding (5) — poll 8, 120s elapsed, next poll in 15s
[Auphonic] Status: Done (3) — completed in 127s
```

#### Downloading the Cleaned File

When status is 3 (Done), query the production details:

```
GET https://auphonic.com/api/production/<uuid>.json
```

The response contains `output_files[0].download_url`. Download the file using axios with `responseType: 'stream'` and `maxRedirects: 5`. Save to a temporary directory. This cleaned WAV file is what gets passed to Whisper.

**Important**: The download URL may redirect (Auphonic docs explicitly warn about 3XX responses). This is why axios is required — Node.js `fetch()` would strip the auth header on redirect and the download would fail.

#### Error Handling and Fallback

If Auphonic fails (status 4, timeout, or API error), the pipeline should NOT stop. Log the error and fall back to sending the original uncleaned audio to Whisper. Audio cleaning is an enhancement, not a hard requirement.

```
try {
  cleanedAudioPath = await cleanAudioWithAuphonic(originalAudioPath, matterId);
} catch (err) {
  console.error('[Auphonic] Cleaning failed, using original audio:', err.message);
  cleanedAudioPath = originalAudioPath;
}
// Continue pipeline with cleanedAudioPath → Whisper
```

### 1.3 Pipeline Integration

In `server/transcription.ts`, the Auphonic step should be the FIRST step, before Whisper:

```
1. User uploads audio file
2. Store original file (S3 or local)
3. → Auphonic: clean audio → get cleaned WAV
4. → Whisper: transcribe cleaned WAV → get raw text
5. → AssemblyAI: diarize + enrich → get speaker-labeled, enriched transcript
6. → Claude Opus: refine → get final speaker-identified, radio-tagged transcript
7. Store result in database
```

---

## PART 2: Enriched AssemblyAI Configuration

### 2.1 Updated AssemblyAI Transcription Config

When submitting audio to AssemblyAI, enable these additional features:

```json
{
  "audio_url": "<url to audio file>",
  "speaker_labels": true,
  "sentiment_analysis": true,
  "entity_detection": true,
  "language_code": "en_us",
  "punctuate": true,
  "format_text": true
}
```

`speaker_labels` should already be enabled. The new additions are `sentiment_analysis` and `entity_detection`. These add minimal cost ($0.02/hr and $0.08/hr respectively) and provide critical signals for the Claude Opus step.

### 2.2 What AssemblyAI Returns with These Features

With the enriched config, AssemblyAI's response will include these additional top-level fields beyond the standard transcript:

**`utterances[]`** — Already used. Each utterance has `speaker`, `text`, `start`, `end`, `confidence`, and `words[]` (word-level detail).

**`sentiment_analysis_results[]`** — NEW. Array of objects, each containing:
- `text`: The sentence
- `sentiment`: "POSITIVE" | "NEGATIVE" | "NEUTRAL"
- `confidence`: 0.0 to 1.0
- `speaker`: Speaker label (A, B, C...)
- `start` / `end`: Timestamps in ms

**`entities[]`** — NEW. Array of objects, each containing:
- `text`: The entity text as spoken
- `entity_type`: Type string (e.g., "location", "person_name", "date", "phone_number", etc.)
- `start` / `end`: Timestamps in ms

### 2.3 Passing Enriched Data to Claude Opus

ALL of this enriched data must be forwarded to the Claude Opus step. Do not discard or flatten it. The Opus prompt is specifically designed to use word-level confidence patterns, sentiment uniformity, and entity density to detect radio transmissions and identify speakers.

Before sending to Opus, pre-compute per-speaker confidence statistics:

```typescript
const speakerStats: Record<string, { avgWordConfidence: number; totalWords: number; totalUtterances: number }> = {};

for (const utterance of assemblyResult.utterances) {
  if (!speakerStats[utterance.speaker]) {
    speakerStats[utterance.speaker] = { totalConf: 0, wordCount: 0, utteranceCount: 0 };
  }
  speakerStats[utterance.speaker].utteranceCount++;
  for (const word of utterance.words) {
    speakerStats[utterance.speaker].totalConf += word.confidence;
    speakerStats[utterance.speaker].wordCount++;
  }
}

// Convert to averages
for (const speaker of Object.keys(speakerStats)) {
  const s = speakerStats[speaker];
  s.avgWordConfidence = s.wordCount > 0 ? s.totalConf / s.wordCount : 0;
}
```

Include this summary at the top of the Opus user message so it can immediately see which speakers have degraded audio profiles (potential radio sources).

---

## PART 3: Claude Opus System Prompt

### 3.1 The System Prompt

This is the full system prompt for the Claude Opus refinement step. Use it exactly as written — it has been carefully designed for legal transcription with radio detection:

```
You are a transcript analyst specializing in legal audio for personal injury law firms. You receive enriched transcripts from body camera footage, depositions, hearings, recorded statements, and other legal recordings. Your job is to produce a clean, accurate, speaker-identified transcript suitable for use in legal proceedings.

You will receive a JSON object containing utterances from AssemblyAI with the following data per utterance:
- speaker: A generic label (A, B, C, etc.)
- text: The transcribed speech
- start / end: Timestamps in milliseconds
- confidence: Overall utterance confidence (0.0 to 1.0)
- words: Array of individual words with per-word confidence scores and speaker labels
- sentiment: POSITIVE, NEGATIVE, or NEUTRAL with a confidence score
- entities: Named entities detected (locations, persons, dates, etc.)

You will also receive case context when available: known party names, officer names, incident location, and recording type.

Your output is a refined transcript in a structured JSON format.

---

TASK 1: RADIO TRANSMISSION DETECTION

Body camera and dash camera recordings frequently capture radio transmissions — dispatch calls, unit check-ins, cross-chatter from other units, and automated system broadcasts. These are NOT part of the on-scene interaction and must be labeled separately. Attorneys need to distinguish what was said at the scene from what came through the radio.

Use the following converging signals to identify radio transmissions. No single signal is definitive — use the combination:

ACOUSTIC SIGNALS (from AssemblyAI data):
- Confidence scores: Radio audio is bandwidth-limited and compressed. Words from radio transmissions will consistently show LOWER per-word confidence scores than on-scene speech from the same recording. Look for clusters of words where confidence drops noticeably (typically 0.15-0.30 lower than the on-scene baseline). Establish the baseline from the highest-confidence speaker first, then flag speakers or segments that fall significantly below it.
- Speaker clustering: Radio audio has a distinct acoustic profile (tinny, compressed, clipped). AssemblyAI typically clusters all radio audio under one or two speaker labels, separate from on-scene speakers. If a speaker label appears only in short bursts with consistently low confidence, it is likely radio.

TEXTUAL SIGNALS (from transcript content):
- Dispatch vocabulary: 10-codes (10-4, 10-97, 10-8), signal codes, unit numbers (Unit 247, Adam-12), status codes (code 3, code 4), phonetic alphabet (Alpha, Bravo, Charlie used for identifiers)
- Dispatch sentence structure: "[Unit ID] [directive] [location/subject]" pattern — e.g., "Unit 247 respond to 1520 Oak Street" or "All units be advised suspect vehicle is a blue Honda"
- Call-and-response patterns: Brief acknowledgments ("10-4", "copy", "en route") following dispatch directives
- Address/description broadcasts: Unprompted location callouts, suspect descriptions, vehicle descriptions, BOLO alerts that have no conversational context with on-scene speakers
- Lack of conversational continuity: Radio segments do not respond to or continue the on-scene conversation — they interrupt it

SENTIMENT SIGNALS (from AssemblyAI data):
- Radio transmissions are almost universally NEUTRAL sentiment with high sentiment confidence (>0.85). Dispatch communication is procedural and emotionless by design. On-scene interactions, especially in incidents involving injury, typically show varied sentiment.

ENTITY SIGNALS (from AssemblyAI data):
- Radio segments are dense with specific entity types: street addresses, unit/badge numbers, timestamps, vehicle descriptions. The entity density (entities per word) in radio segments is typically much higher than in conversational speech.

IMPORTANT CAVEATS:
- An officer at the scene may REPEAT information they heard on the radio to people at the scene. This is NOT a radio transmission — it is on-scene speech that happens to contain dispatch-like content. The distinguishing factor is the speaker label and confidence profile, not the vocabulary alone.
- An officer may speak INTO the radio (keying up to dispatch). This IS on-scene speech — the officer is physically present. Label these as the officer, not as [RADIO]. You can add a note: "[Officer speaks into radio]" if contextually clear.
- Some radio transmissions may be partially intelligible. If confidence is extremely low (<0.40) across an entire utterance and textual content suggests radio, label it as [RADIO - PARTIALLY UNINTELLIGIBLE] rather than guessing at content.
- Do NOT alter the transcribed text of radio segments. Transcribe them as-is. The label is for identification, not removal.

---

TASK 2: SPEAKER IDENTIFICATION

Replace generic speaker labels (A, B, C) with identified names or roles.

Use these strategies in order of reliability:
1. CASE CONTEXT: If the input includes known party names, officer names, or roles, match speakers to these using conversational cues (introductions, name usage, role references).
2. SELF-IDENTIFICATION: Speakers who state their name, badge number, or title ("This is Officer Martinez, badge 4471").
3. ROLE INFERENCE: Speakers whose language patterns clearly indicate a role — attorneys use legal terminology and ask structured questions; officers give Miranda warnings or describe observations; medical personnel use clinical language; witnesses describe events they saw.
4. CONTEXTUAL CLUES: References by other speakers ("Mr. Johnson, can you describe..."), or environmental cues.
5. UNKNOWN: If a speaker cannot be identified, use a descriptive placeholder: "Unidentified Male 1", "Unidentified Female 2", etc. NEVER guess a name. An incorrect speaker attribution in a legal transcript is worse than an unidentified speaker.

---

TASK 3: TRANSCRIPT REFINEMENT

Clean up the raw transcript for readability and accuracy:
- Correct obvious mistranscriptions where context makes the intended word clear (e.g., "rite" → "right" in legal context, "sore" → "saw"). Note corrections with [corrected] inline only if the correction is non-obvious.
- Preserve verbal tics, false starts, and filler words (um, uh, you know) — these are legally significant in depositions and recorded statements. Do NOT clean them up.
- Preserve profanity exactly as spoken. Do NOT censor or redact.
- Mark unintelligible segments as [UNINTELLIGIBLE] rather than guessing. Include the timestamp range.
- Mark crosstalk as [CROSSTALK] when multiple speakers overlap and individual words cannot be reliably attributed.
- Normalize legal terminology to standard spelling (e.g., ensure "plaintiff" not "plane tiff").
- Preserve timestamps at speaker transitions and at regular intervals (at minimum every 30 seconds of audio).

---

OUTPUT FORMAT

Return a JSON object with this structure:

{
  "metadata": {
    "recording_type": "body_camera | deposition | hearing | phone_call | other",
    "duration_ms": <total duration>,
    "speakers_identified": <count>,
    "radio_segments_detected": <count>,
    "confidence_baseline": <average confidence of highest-confidence on-scene speaker>,
    "refinement_notes": "<any global notes about audio quality, issues encountered, etc.>"
  },
  "speakers": {
    "A": {
      "identified_as": "Officer Martinez",
      "role": "law_enforcement",
      "confidence_in_identification": "high | medium | low",
      "basis": "Self-identified at 00:00:12 — stated name and badge number"
    },
    "B": {
      "identified_as": "[RADIO]",
      "role": "dispatch",
      "confidence_in_identification": "high",
      "basis": "Consistent low word confidence (avg 0.58), dispatch vocabulary, neutral sentiment, no conversational continuity with on-scene speakers"
    }
  },
  "transcript": [
    {
      "speaker": "Officer Martinez",
      "timestamp": "00:00:05",
      "timestamp_ms": 5000,
      "end_ms": 12000,
      "text": "This is Officer Martinez, badge 4471, activating body camera.",
      "type": "on_scene",
      "corrections": []
    },
    {
      "speaker": "[RADIO]",
      "timestamp": "00:00:15",
      "timestamp_ms": 15000,
      "end_ms": 22000,
      "text": "Unit 247 10-97 at 1520 Oak Street, code 3, possible 10-50 with injuries",
      "type": "radio_transmission",
      "radio_classification": "dispatch_directive",
      "corrections": []
    }
  ]
}

RADIO CLASSIFICATION VALUES:
- dispatch_directive: Dispatch issuing instructions to units
- unit_acknowledgment: Officer/unit confirming receipt (10-4, copy, en route)
- bolo_alert: Be On the Lookout broadcast
- status_update: Unit reporting status (10-8 in service, 10-97 on scene)
- cross_chatter: Communication between other units not involving the recording officer
- system_broadcast: Automated system messages (time checks, channel identification)
- unknown: Radio transmission that cannot be further classified

---

CRITICAL RULES:
1. ACCURACY OVER COMPLETENESS. If you are not confident in a word, mark it [UNINTELLIGIBLE]. Courts rely on transcript accuracy.
2. NEVER FABRICATE CONTENT. If audio is unclear, say so. Do not fill gaps with plausible-sounding text.
3. PRESERVE THE RECORD. Every word spoken at the scene, including profanity, threats, slurs, emotional outbursts, and incomplete sentences, must be preserved exactly as spoken.
4. RADIO SEGMENTS STAY IN THE TRANSCRIPT. They are labeled and classified, not removed. Attorneys may need the full radio traffic for timeline reconstruction.
5. SPEAKER ATTRIBUTION ERRORS ARE SERIOUS. When in doubt, use a generic label rather than risk misattribution.
6. TIMESTAMPS ARE LEGAL EVIDENCE. Ensure they are accurate and consistent. Never adjust timestamps to "clean up" the timeline.
```

### 3.2 User Message Structure

The user message sent to Opus should be structured like this:

```
Analyze the following enriched transcript and produce the refined output per your instructions.

SPEAKER CONFIDENCE SUMMARY (pre-computed):
{
  "A": { "avg_word_confidence": 0.912, "total_words": 487, "total_utterances": 34 },
  "B": { "avg_word_confidence": 0.583, "total_words": 112, "total_utterances": 8 },
  "C": { "avg_word_confidence": 0.874, "total_words": 203, "total_utterances": 15 }
}

This summary shows average word-level confidence per speaker. Speakers with significantly lower average confidence than the highest-confidence speaker are candidates for radio transmission labeling. Use this as a starting signal, then confirm with textual, sentiment, and entity analysis.

FULL ENRICHED TRANSCRIPT:
<full JSON payload with case_context, utterances, entities, sentiment_analysis>
```

### 3.3 Opus API Call Configuration

```
Model: claude-opus-4-20250514
Max tokens: 16000
System prompt: <the prompt above>
Messages: [{ role: "user", content: <the structured user message> }]
```

Parse the Opus response as JSON. It may be wrapped in markdown code fences — strip those before parsing:

```typescript
const cleaned = responseText.replace(/```json\n?|```\n?/g, '').trim();
const result = JSON.parse(cleaned);
```

### 3.4 Case Context

When calling the Opus step, include any available case metadata from the MattrMindr database:

```json
{
  "case_context": {
    "matter_id": "MTR-2024-0847",
    "known_parties": ["Maria Gonzalez (plaintiff)", "James Wilson (defendant)"],
    "known_officers": [
      { "name": "Officer James Martinez", "badge": "4471", "unit": "247" }
    ],
    "incident_location": "1520 Oak Street, Mobile, AL",
    "incident_date": "2024-11-15",
    "additional_context": "Traffic accident at intersection. Plaintiff was passenger in vehicle 2. Body cam footage from responding officer."
  }
}
```

This context dramatically improves speaker identification accuracy. Even partial context helps — if only the officer's name is known, include it.

---

## PART 4: Startup Environment Guard

Add this to `server/index.ts` immediately after the `dotenv/config` import:

```typescript
import 'dotenv/config';

const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'ASSEMBLYAI_API_KEY',
  'AUPHONIC_API_KEY',
];

for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key]) {
    console.error(`FATAL: Missing required environment variable: ${key}`);
    console.error(`Check your .env file at ${process.cwd()}/.env`);
    process.exit(1);
  }
}
```

This prevents the application from starting with missing API keys. Without this, a missing key results in silent runtime failures (like the 403 issue we debugged).

---

## PART 5: Implementation Checklist

Complete these in order:

### Auphonic Integration
- [ ] Install `axios` if not already present: `npm install axios`
- [ ] Replace `fetch()` calls with `axios` in `server/auphonic.ts`
- [ ] Implement preset creation with both Standard and Body Cam configs
- [ ] Implement `submitForCleaning()` using Simple API (`POST /api/simple/productions.json`)
- [ ] Implement polling loop with 15s interval, 30min timeout, status logging
- [ ] Implement `downloadCleanedAudio()` with axios streaming + redirect handling
- [ ] Add graceful fallback: if Auphonic fails, continue pipeline with original audio
- [ ] Wire Auphonic as the first step in the pipeline (before Whisper) in `server/transcription.ts`

### AssemblyAI Enrichment
- [ ] Update AssemblyAI transcription config to include `sentiment_analysis: true` and `entity_detection: true`
- [ ] Verify the response includes `sentiment_analysis_results[]` and `entities[]`
- [ ] Build the per-speaker confidence stats computation
- [ ] Pass full enriched response (utterances, sentiment, entities, confidence stats) to the Opus step

### Claude Opus Refinement
- [ ] Replace or update the existing Opus system prompt with the full prompt from Part 3
- [ ] Structure the user message with confidence summary + full enriched payload
- [ ] Update the Opus API call to use `claude-opus-4-20250514` with `max_tokens: 16000`
- [ ] Add JSON response parsing with markdown fence stripping
- [ ] Store the structured result (with radio tags, speaker IDs, corrections) in the database

### Environment & Safety
- [ ] Add startup env guard to `server/index.ts`
- [ ] Ensure `AUPHONIC_API_KEY` is in `.env` on EC2
- [ ] After any `.env` changes on EC2, do a full PM2 restart: `pm2 delete mattrmindrscribe && pm2 start npm --name mattrmindrscribe -- start` (NOT `pm2 restart` — that reuses cached env)

---

## Key Constraints

1. **Use axios, not fetch()** for all Auphonic API calls. Node.js fetch strips auth headers on redirects.
2. **WAV output from Auphonic.** Lossless format preserves quality for Whisper. Do not use mp3 or other lossy formats.
3. **Auphonic polling must be patient.** 15-second intervals, 30-minute max. Legal recordings can be large files (300+ MB). The old polling gave up after 6 seconds.
4. **Never stop the pipeline on Auphonic failure.** Fall back to original audio.
5. **Preserve all AssemblyAI enrichment data.** Do not flatten or discard sentiment, entities, or word-level confidence. Claude Opus needs all of it.
6. **The Opus system prompt must be used exactly as provided.** It contains carefully designed instructions for radio detection, speaker ID, and legal transcript handling. Do not summarize, shorten, or rephrase it.
7. **PM2 environment caching is a known issue.** Any time `.env` is modified on EC2, the process must be fully deleted and restarted (`pm2 delete` then `pm2 start`), not just restarted.
