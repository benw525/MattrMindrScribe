import { spawn } from 'child_process';
import { readFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import OpenAI, { toFile } from 'openai';
import pool from './db.js';
import { isCloudStorageUrl, getKeyFromStorageUrl, downloadFromS3 } from './s3.js';
import { diarizeWithAssemblyAI, mapDiarizationToSegments } from './diarization.js';
import { refineSpeakersWithGPT } from './speakerRefinement.js';
import { cleanAudioWithAuphonic, auphonicConfigured } from './auphonic.js';

const whisperClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MAX_CHUNK_SIZE = 24 * 1024 * 1024;

interface TranscriptSegment {
  speaker: string;
  text: string;
  startTime: number;
  endTime: number;
}

function runFfprobe(args: string[]): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', args);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });
    proc.on('close', (code) => resolve({ stdout, stderr, code }));
    proc.on('error', reject);
  });
}

async function getAudioDuration(filePath: string): Promise<number | null> {
  const strategies = [
    {
      name: 'format metadata',
      args: ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath],
    },
    {
      name: 'stream metadata',
      args: ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath],
    },
    {
      name: 'full file scan',
      args: ['-v', 'error', '-analyzeduration', '2147483647', '-probesize', '2147483647', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath],
    },
  ];

  for (const strategy of strategies) {
    try {
      const result = await runFfprobe(strategy.args);
      if (result.code !== 0) {
        console.warn(`[Duration] Strategy "${strategy.name}" exited with code ${result.code}: ${result.stderr.trim()}`);
        continue;
      }
      const duration = parseFloat(result.stdout.trim());
      if (!isNaN(duration) && duration > 0) {
        console.log(`[Duration] Resolved via "${strategy.name}": ${duration.toFixed(1)}s`);
        return duration;
      }
      console.warn(`[Duration] Strategy "${strategy.name}" returned unparseable output: "${result.stdout.trim()}"`);
    } catch (err: any) {
      console.warn(`[Duration] Strategy "${strategy.name}" failed: ${err.message}`);
    }
  }

  console.warn(`[Duration] All strategies failed for ${filePath} — continuing without duration`);
  return null;
}

async function splitAudioIntoChunks(
  sourcePath: string,
  workDir: string,
  totalDuration: number | null,
): Promise<{ path: string; offsetSec: number }[]> {
  const fs = await import('fs');
  const fileSize = fs.statSync(sourcePath).size;

  if (fileSize <= MAX_CHUNK_SIZE) {
    return [{ path: sourcePath, offsetSec: 0 }];
  }

  if (!totalDuration || totalDuration <= 0) {
    totalDuration = 3600;
    console.warn(`[Transcription] Unknown duration, assuming ${totalDuration}s for chunking`);
  }

  const MP3_BITRATE = 64000;
  const OUTPUT_BYTES_PER_SEC = MP3_BITRATE / 8;
  const TARGET_CHUNK_BYTES = 20 * 1024 * 1024;
  const chunkDurationSec = Math.floor(TARGET_CHUNK_BYTES / OUTPUT_BYTES_PER_SEC);
  const chunks: { path: string; offsetSec: number }[] = [];

  console.log(`[Transcription] Splitting ${(fileSize / 1024 / 1024).toFixed(1)}MB source into ~${Math.ceil(totalDuration / chunkDurationSec)} MP3 chunks of ~${chunkDurationSec}s each (no WAV conversion)`);

  let start = 0;
  let chunkIndex = 0;

  while (start < totalDuration) {
    const overlapStart = Math.max(0, start - 1);
    const duration = chunkDurationSec + (start > 0 ? 1 : 0);
    const chunkPath = path.join(workDir, `chunk_${chunkIndex}.mp3`);

    await new Promise<void>((resolve, reject) => {
      const proc = spawn('ffmpeg', [
        '-y',
        '-ss', overlapStart.toString(),
        '-i', sourcePath,
        '-t', duration.toString(),
        '-vn', '-ar', '16000', '-ac', '1',
        '-b:a', '64k',
        '-f', 'mp3',
        chunkPath,
      ]);
      proc.stderr.on('data', () => {});
      proc.on('close', (code) => {
        if (code !== 0) return reject(new Error(`ffmpeg chunk split failed with code ${code}`));
        resolve();
      });
      proc.on('error', reject);
    });

    chunks.push({ path: chunkPath, offsetSec: overlapStart });
    start += chunkDurationSec;
    chunkIndex++;
  }

  return chunks;
}

async function transcribeChunk(filePath: string, offsetSec: number = 0): Promise<TranscriptSegment[]> {
  const MAX_ATTEMPTS = 4;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const buffer = await readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mimeFile = ext === '.mp3' ? 'audio.mp3' : ext === '.m4a' ? 'audio.m4a' : ext === '.mp4' ? 'audio.mp4' : ext === '.webm' ? 'audio.webm' : ext === '.ogg' ? 'audio.ogg' : 'audio.wav';
      const file = await toFile(buffer, mimeFile);

      const response = await whisperClient.audio.transcriptions.create({
        file,
        model: 'whisper-1',
        response_format: 'verbose_json',
        timestamp_granularities: ['segment'],
      });

      const segments = ((response as any).segments || []).map((s: any) => ({
        speaker: 'Speaker 1',
        text: (s.text || '').trim(),
        startTime: Math.round((s.start + offsetSec) * 100) / 100,
        endTime: Math.round((s.end + offsetSec) * 100) / 100,
      }));

      return segments.filter((s: TranscriptSegment) => s.text.length > 0);
    } catch (err: any) {
      lastError = err;
      const errStr = `${err.message || ''} ${err.code || ''} ${err.status || ''}`;
      const isRetryable = /connection|ECONNRESET|ETIMEDOUT|socket|network|timeout|503|502|429/i.test(errStr);
      if (!isRetryable || attempt === MAX_ATTEMPTS) {
        throw err;
      }
      const jitter = 0.8 + Math.random() * 0.4;
      const delaySec = Math.round(Math.pow(2, attempt) * 2 * jitter);
      console.log(`[Transcription] Chunk failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${err.message} — retrying in ${delaySec}s...`);
      await new Promise(resolve => setTimeout(resolve, delaySec * 1000));
    }
  }

  throw lastError!;
}

function textSimilarity(a: string, b: string): number {
  const wordsA = a.toLowerCase().split(/\s+/);
  const wordsB = b.toLowerCase().split(/\s+/);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  const setB = new Set(wordsB);
  const overlap = wordsA.filter(w => setB.has(w)).length;
  return overlap / Math.max(wordsA.length, wordsB.length);
}

function deduplicateSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
  if (segments.length === 0) return [];

  segments.sort((a, b) => {
    if (a.startTime !== b.startTime) return a.startTime - b.startTime;
    if (a.endTime !== b.endTime) return a.endTime - b.endTime;
    return 0;
  });

  const seen = new Set<string>();
  const firstPass: TranscriptSegment[] = [];
  for (const seg of segments) {
    const key = `${seg.startTime}|${seg.endTime}|${seg.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    firstPass.push(seg);
  }

  const deduped: TranscriptSegment[] = [firstPass[0]];

  for (let i = 1; i < firstPass.length; i++) {
    const seg = firstPass[i];
    const prev = deduped[deduped.length - 1];

    if (Math.abs(seg.startTime - prev.startTime) < 1.5 && textSimilarity(seg.text, prev.text) > 0.7) continue;
    if (seg.startTime < prev.endTime - 0.5 && textSimilarity(seg.text, prev.text) > 0.7) continue;

    const wordCount = seg.text.trim().split(/\s+/).length;
    if (wordCount <= 3 && Math.abs(seg.startTime - prev.startTime) < 5 && textSimilarity(seg.text, prev.text) > 0.9) continue;

    let isDuplicateOfRecent = false;
    const lookback = Math.min(10, deduped.length);
    for (let j = deduped.length - 1; j >= deduped.length - lookback; j--) {
      const recent = deduped[j];
      if (
        Math.abs(seg.startTime - recent.startTime) < 2 &&
        Math.abs(seg.endTime - recent.endTime) < 2 &&
        textSimilarity(seg.text, recent.text) > 0.85
      ) {
        isDuplicateOfRecent = true;
        break;
      }
    }
    if (isDuplicateOfRecent) continue;

    if (seg.startTime < prev.endTime) {
      seg.startTime = prev.endTime;
    }

    deduped.push(seg);
  }

  return deduped;
}

function removeHallucinatedSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
  if (segments.length < 3) return segments;

  const result: TranscriptSegment[] = [];
  let i = 0;
  let totalRemoved = 0;

  while (i < segments.length) {
    const current = segments[i];
    const currentText = current.text.trim().toLowerCase();
    const currentWordCount = currentText.split(/\s+/).length;

    if (currentWordCount > 3) {
      result.push(current);
      i++;
      continue;
    }

    let runEnd = i + 1;
    while (runEnd < segments.length) {
      const next = segments[runEnd];
      const nextText = next.text.trim().toLowerCase();
      if (nextText !== currentText) break;
      runEnd++;
    }

    const runLength = runEnd - i;

    if (runLength >= 3) {
      let isUniformSpacing = true;
      if (runLength >= 3) {
        const gaps: number[] = [];
        for (let j = i; j < runEnd - 1; j++) {
          gaps.push(segments[j + 1].startTime - segments[j].startTime);
        }
        const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        const maxDeviation = Math.max(...gaps.map(g => Math.abs(g - avgGap)));
        isUniformSpacing = avgGap > 0 && maxDeviation <= 0.5;
      }

      if (isUniformSpacing) {
        result.push(current);
        totalRemoved += runLength - 1;
        i = runEnd;
        continue;
      }
    }

    for (let j = i; j < runEnd; j++) {
      result.push(segments[j]);
    }
    i = runEnd;
  }

  if (totalRemoved > 0) {
    console.log(`[Transcription] Removed ${totalRemoved} hallucinated repeat segments`);
  }

  return result;
}

function assignSpeakers(segments: TranscriptSegment[]): TranscriptSegment[] {
  if (segments.length === 0) return [];

  let currentSpeaker = 1;
  let maxSpeaker = 1;

  for (let i = 0; i < segments.length; i++) {
    if (i === 0) {
      segments[i].speaker = 'Speaker 1';
      continue;
    }

    const gap = segments[i].startTime - segments[i - 1].endTime;
    if (gap > 2.0 && maxSpeaker < 10) {
      currentSpeaker = currentSpeaker === 1 ? 2 : 1;
      if (currentSpeaker > maxSpeaker) maxSpeaker = currentSpeaker;
    }
    segments[i].speaker = `Speaker ${currentSpeaker}`;
  }

  return segments;
}

async function cleanupDir(dirPath: string): Promise<void> {
  try {
    const { rmSync } = await import('fs');
    if (existsSync(dirPath)) {
      rmSync(dirPath, { recursive: true, force: true });
    }
  } catch {}
}

export async function deduplicateExistingSegments(transcriptId: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT start_time, end_time, speaker, text 
     FROM transcript_segments 
     WHERE transcript_id = $1 
     ORDER BY segment_order`,
    [transcriptId]
  );

  if (rows.length === 0) return 0;

  const segments: TranscriptSegment[] = rows.map((r: any) => ({
    speaker: r.speaker,
    text: r.text,
    startTime: parseFloat(r.start_time),
    endTime: parseFloat(r.end_time),
  }));

  const originalCount = segments.length;
  let deduped = deduplicateSegments(segments);
  deduped = removeHallucinatedSegments(deduped);
  deduped = assignSpeakers(deduped);

  if (deduped.length === originalCount) return 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM transcript_segments WHERE transcript_id = $1', [transcriptId]);

    const BATCH_SIZE = 200;
    for (let b = 0; b < deduped.length; b += BATCH_SIZE) {
      const batch = deduped.slice(b, b + BATCH_SIZE);
      const values: any[] = [];
      const placeholders: string[] = [];
      for (let i = 0; i < batch.length; i++) {
        const seg = batch[i];
        const offset = i * 6;
        placeholders.push(`($${offset+1}, $${offset+2}, $${offset+3}, $${offset+4}, $${offset+5}, $${offset+6})`);
        values.push(transcriptId, seg.startTime, seg.endTime, seg.speaker, seg.text, b + i);
      }
      await client.query(
        `INSERT INTO transcript_segments (transcript_id, start_time, end_time, speaker, text, segment_order)
         VALUES ${placeholders.join(', ')}`,
        values
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  console.log(`[Dedup] Reduced ${originalCount} segments to ${deduped.length} for transcript ${transcriptId}`);
  return originalCount - deduped.length;
}

class TranscriptionCancelledError extends Error {
  constructor(transcriptId: string) {
    super(`Transcription cancelled — transcript ${transcriptId} was deleted`);
    this.name = 'TranscriptionCancelledError';
  }
}

async function isTranscriptDeleted(transcriptId: string): Promise<boolean> {
  const { rows } = await pool.query('SELECT id FROM transcripts WHERE id = $1', [transcriptId]);
  return rows.length === 0;
}

export async function processTranscription(transcriptId: string): Promise<void> {
  const workDir = path.join(tmpdir(), `transcription_${randomUUID()}`);
  let cloudTempPath: string | null = null;
  let auphonicCleanedPath: string | null = null;

  const pipelineLog: Record<string, any> = {
    auphonic: { status: 'pending' },
    whisper: { status: 'pending' },
    diarization: { status: 'pending' },
    refinement: { status: 'pending' },
    startedAt: new Date().toISOString(),
  };

  const savePipelineLog = async () => {
    try {
      await pool.query(
        `UPDATE transcripts SET pipeline_log = $1::jsonb, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(pipelineLog), transcriptId]
      );
    } catch (e: any) {
      console.error('[Pipeline Log] Failed to save:', e.message);
    }
  };

  const checkCancelled = async () => {
    if (await isTranscriptDeleted(transcriptId)) {
      throw new TranscriptionCancelledError(transcriptId);
    }
  };

  try {
    await pool.query(
      `UPDATE transcripts SET status = 'processing', updated_at = NOW() WHERE id = $1`,
      [transcriptId]
    );

    const { rows } = await pool.query(
      'SELECT file_url, type, filename, expected_speakers, recording_type, pipeline_log FROM transcripts WHERE id = $1',
      [transcriptId]
    );

    if (rows.length === 0) throw new Error('Transcript not found');

    const { file_url, filename, expected_speakers, recording_type, pipeline_log: existingLog } = rows[0];
    let expectedSpeakers = expected_speakers ? parseInt(expected_speakers) : null;
    const recordingType: string | null = recording_type || null;

    if (!expectedSpeakers && recordingType === 'deposition') {
      expectedSpeakers = 5;
      console.log(`[Transcription] Deposition recording type detected — auto-setting expected speakers to 5`);
    }

    const canResume = existingLog?.whisper?.status === 'success';
    const { rows: existingSegments } = await pool.query(
      'SELECT start_time AS "startTime", end_time AS "endTime", speaker, text FROM transcript_segments WHERE transcript_id = $1 ORDER BY segment_order',
      [transcriptId]
    );
    const hasCheckpoint = canResume && existingSegments.length > 0;

    let allSegments: TranscriptSegment[];
    let duration: number | null = null;
    let diarizationError: string | null = null;
    let refinementError: string | null = null;

    if (hasCheckpoint) {
      console.log(`[Transcription] Resuming for "${filename}" (${transcriptId}) — ${existingSegments.length} segments from previous run, skipping to refinement`);
      allSegments = existingSegments as TranscriptSegment[];
      pipelineLog.auphonic = existingLog.auphonic || { status: 'skipped', reason: 'Resumed from checkpoint' };
      pipelineLog.whisper = existingLog.whisper;
      pipelineLog.diarization = existingLog.diarization;
      pipelineLog.resumed = true;

      if (existingLog.diarization?.status === 'error') {
        diarizationError = existingLog.diarization.error;
      }
    } else {
      let sourcePath: string;

      await checkCancelled();

      if (isCloudStorageUrl(file_url)) {
        const storageKey = getKeyFromStorageUrl(file_url);
        console.log(`[Transcription] Downloading from S3: ${storageKey}`);
        sourcePath = await downloadFromS3(storageKey);
        cloudTempPath = sourcePath;
      } else {
        sourcePath = path.join(process.cwd(), file_url.startsWith('/') ? file_url.slice(1) : file_url);
      }

      if (!existsSync(sourcePath)) {
        throw new Error(`Source file not found: ${sourcePath}`);
      }

      await mkdir(workDir, { recursive: true });

      console.log(`[Transcription] Starting for "${filename}" (${transcriptId})${expectedSpeakers ? ` — expecting ${expectedSpeakers} speakers` : ''}`);

      if (auphonicConfigured) {
        try {
          console.log(`[Transcription] Step 0: Auphonic audio cleanup...`);
          pipelineLog.auphonic = { status: 'processing', startedAt: new Date().toISOString() };
          await savePipelineLog();

          const auphonicResult = await cleanAudioWithAuphonic(sourcePath, filename || `transcript_${transcriptId}`, checkCancelled);
          auphonicCleanedPath = auphonicResult.cleanedFilePath;
          sourcePath = auphonicResult.cleanedFilePath;
          pipelineLog.auphonic = {
            status: 'success',
            productionUuid: auphonicResult.productionUuid,
            durationSeconds: auphonicResult.durationSeconds,
          };
          console.log(`[Transcription] Auphonic cleanup complete — using cleaned audio for pipeline`);
        } catch (err: any) {
          console.error(`[Transcription] Auphonic cleanup failed (non-fatal):`, err.message);
          pipelineLog.auphonic = { status: 'error', error: err.message };
        }
        await savePipelineLog();
      } else {
        pipelineLog.auphonic = { status: 'skipped', reason: 'API key not configured' };
      }

      await checkCancelled();

      duration = await getAudioDuration(sourcePath);
      if (duration !== null) {
        console.log(`[Transcription] Duration: ${duration.toFixed(1)}s`);
      } else {
        console.warn(`[Transcription] Could not determine duration — will calculate from segments after transcription`);
      }

      await checkCancelled();

      console.log(`[Transcription] Starting AssemblyAI diarization with original file + WAV conversion in parallel...`);

      const diarizationPromise = (async () => {
        try {
          if (!process.env.ASSEMBLYAI_API_KEY) {
            console.log('[Transcription] AssemblyAI not configured, skipping diarization');
            pipelineLog.diarization = { status: 'skipped', reason: 'API key not configured' };
            return null;
          }
          return await diarizeWithAssemblyAI(sourcePath, expectedSpeakers);
        } catch (err: any) {
          console.error(`[Transcription] AssemblyAI diarization failed (non-fatal):`, err.message);
          diarizationError = err.message;
          return null;
        }
      })();

      const whisperPromise = (async () => {
        const chunks = await splitAudioIntoChunks(sourcePath, workDir, duration);
        console.log(`[Transcription] Processing ${chunks.length} chunk(s)...`);

        await checkCancelled();

        const WHISPER_CONCURRENCY = 3;
        const chunkResults: { index: number; segments: TranscriptSegment[] }[] = [];

        for (let batchStart = 0; batchStart < chunks.length; batchStart += WHISPER_CONCURRENCY) {
          const batch = chunks.slice(batchStart, batchStart + WHISPER_CONCURRENCY);

          const batchPromises = batch.map(async (chunk, batchIdx) => {
            const globalIdx = batchStart + batchIdx;
            await checkCancelled();
            console.log(`[Transcription] Transcribing chunk ${globalIdx + 1}/${chunks.length}...`);
            try {
              const segments = await transcribeChunk(chunk.path, chunk.offsetSec);
              return { index: globalIdx, segments };
            } catch (err: any) {
              console.error(`[Transcription] Chunk ${globalIdx + 1} failed:`, err.message);
              throw new Error(`Transcription failed on chunk ${globalIdx + 1}: ${err.message}`);
            }
          });

          const batchResults = await Promise.all(batchPromises);
          chunkResults.push(...batchResults);
        }

        chunkResults.sort((a, b) => a.index - b.index);
        const allSegs = chunkResults.flatMap(r => r.segments);
        return { segments: removeHallucinatedSegments(deduplicateSegments(allSegs)), chunks: chunks.length };
      })();

      let whisperSegments: TranscriptSegment[];
      let diarizationLabels: any;

      try {
        const [whisperResult, diarizationResult] = await Promise.all([whisperPromise, diarizationPromise]);
        whisperSegments = whisperResult.segments;
        diarizationLabels = diarizationResult;
        pipelineLog.whisper = {
          status: 'success',
          segments: whisperSegments.length,
          chunks: whisperResult.chunks,
        };
      } catch (err: any) {
        pipelineLog.whisper = { status: 'error', error: err.message };
        await savePipelineLog();
        throw err;
      }

      if (diarizationError) {
        pipelineLog.diarization = { status: 'error', error: diarizationError };
      }

      await savePipelineLog();

      if (diarizationLabels && diarizationLabels.length > 0) {
        console.log(`[Transcription] Mapping AssemblyAI speaker labels onto ${whisperSegments.length} Whisper segments...`);
        allSegments = mapDiarizationToSegments(whisperSegments, diarizationLabels);
        const uniqueSpeakers = new Set(allSegments.map(s => s.speaker));
        pipelineLog.diarization = {
          status: 'success',
          utterances: diarizationLabels.length,
          speakersDetected: uniqueSpeakers.size,
        };
      } else if (!diarizationError) {
        if (pipelineLog.diarization.status !== 'skipped') {
          pipelineLog.diarization = { status: 'skipped', reason: 'No utterances returned' };
        }
        console.log(`[Transcription] No diarization data, falling back to heuristic speaker assignment`);
        allSegments = assignSpeakers(whisperSegments);
      } else {
        allSegments = assignSpeakers(whisperSegments);
      }

      await checkCancelled();

      console.log(`[Transcription] Saving checkpoint (${allSegments.length} segments before refinement)...`);
      const checkpointClient = await pool.connect();
      try {
        await checkpointClient.query('BEGIN');
        await checkpointClient.query('DELETE FROM transcript_segments WHERE transcript_id = $1', [transcriptId]);
        const BATCH_SIZE = 200;
        for (let b = 0; b < allSegments.length; b += BATCH_SIZE) {
          const batch = allSegments.slice(b, b + BATCH_SIZE);
          const values: any[] = [];
          const placeholders: string[] = [];
          for (let i = 0; i < batch.length; i++) {
            const seg = batch[i];
            const offset = i * 6;
            placeholders.push(`($${offset+1}, $${offset+2}, $${offset+3}, $${offset+4}, $${offset+5}, $${offset+6})`);
            values.push(transcriptId, seg.startTime, seg.endTime, seg.speaker, seg.text, b + i);
          }
          await checkpointClient.query(
            `INSERT INTO transcript_segments (transcript_id, start_time, end_time, speaker, text, segment_order)
             VALUES ${placeholders.join(', ')}`,
            values
          );
        }
        await checkpointClient.query(
          `UPDATE transcripts SET pipeline_log = $1::jsonb, updated_at = NOW() WHERE id = $2`,
          [JSON.stringify(pipelineLog), transcriptId]
        );
        await checkpointClient.query('COMMIT');
        console.log(`[Transcription] Checkpoint saved successfully`);
      } catch (cpErr) {
        await checkpointClient.query('ROLLBACK');
        console.error(`[Transcription] Checkpoint save failed:`, cpErr);
      } finally {
        checkpointClient.release();
      }
    }

    await checkCancelled();

    try {
      console.log(`[Transcription] Step 3: Claude Opus 4.6 speaker refinement...`);
      allSegments = await refineSpeakersWithGPT(allSegments, expectedSpeakers, recordingType);
      const uniqueSpeakers = [...new Set(allSegments.map(s => s.speaker))];
      const hasGenericLabels = uniqueSpeakers.some(s => /^Speaker\s*\d+$/i.test(s));
      console.log(`[Transcription] Refinement complete: ${uniqueSpeakers.length} speakers: ${uniqueSpeakers.join(', ')}${hasGenericLabels ? ' [WARNING: generic labels remain]' : ''}`);
      pipelineLog.refinement = {
        status: 'success',
        speakersAfterRefinement: uniqueSpeakers.length,
        speakerNames: uniqueSpeakers,
        hasGenericLabels,
      };
    } catch (err: any) {
      console.error(`[Transcription] GPT refinement failed (non-fatal):`, err.message);
      refinementError = err.message;
      pipelineLog.refinement = { status: 'error', error: err.message };
    }

    await savePipelineLog();

    await checkCancelled();

    pipelineLog.completedAt = new Date().toISOString();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM transcript_segments WHERE transcript_id = $1', [transcriptId]);

      const BATCH_SIZE = 200;
      for (let b = 0; b < allSegments.length; b += BATCH_SIZE) {
        const batch = allSegments.slice(b, b + BATCH_SIZE);
        const values: any[] = [];
        const placeholders: string[] = [];
        for (let i = 0; i < batch.length; i++) {
          const seg = batch[i];
          const offset = i * 6;
          placeholders.push(`($${offset+1}, $${offset+2}, $${offset+3}, $${offset+4}, $${offset+5}, $${offset+6})`);
          values.push(transcriptId, seg.startTime, seg.endTime, seg.speaker, seg.text, b + i);
        }
        await client.query(
          `INSERT INTO transcript_segments (transcript_id, start_time, end_time, speaker, text, segment_order)
           VALUES ${placeholders.join(', ')}`,
          values
        );
      }

      if (duration === null && allSegments.length > 0) {
        duration = Math.max(...allSegments.map(s => s.endTime));
        console.log(`[Transcription] Duration estimated from segments: ${duration.toFixed(1)}s`);
      }

      await client.query(
        `UPDATE transcripts SET status = 'completed', duration = $1, error_message = NULL, pipeline_log = $2::jsonb, updated_at = NOW()
         WHERE id = $3`,
        [duration ?? 0, JSON.stringify(pipelineLog), transcriptId]
      );
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    console.log(`[Transcription] Completed for "${filename}" — ${allSegments.length} segment(s)`);
  } catch (err: any) {
    if (err instanceof TranscriptionCancelledError) {
      console.log(`[Transcription] ${err.message} — stopping pipeline`);
    } else {
      const isNoSpace = err.code === 'ENOSPC' || err.message?.includes('ENOSPC') || err.message?.toLowerCase().includes('no space left on device');
      const errorMessage = isNoSpace
        ? 'Disk full — not enough space to process this file. Please free up disk space and retry.'
        : err.message;
      console.error(`[Transcription] Error for ${transcriptId}:`, errorMessage);
      pipelineLog.completedAt = new Date().toISOString();
      pipelineLog.fatalError = errorMessage;
      try {
        await pool.query(
          `UPDATE transcripts SET status = 'error', error_message = $1, pipeline_log = $2::jsonb, updated_at = NOW() WHERE id = $3`,
          [errorMessage, JSON.stringify(pipelineLog), transcriptId]
        );
      } catch {
      }
    }
  } finally {
    await cleanupDir(workDir);
    if (cloudTempPath) {
      try {
        const tempDir = path.dirname(cloudTempPath);
        await cleanupDir(tempDir);
      } catch {}
    }
    if (auphonicCleanedPath) {
      try {
        const auphonicDir = path.dirname(auphonicCleanedPath);
        await cleanupDir(auphonicDir);
      } catch {}
    }
  }
}
