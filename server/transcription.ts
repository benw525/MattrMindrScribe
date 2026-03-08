import { spawn } from 'child_process';
import { readFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import OpenAI, { toFile } from 'openai';
import pool from './db.js';
import { isR2Url, getR2KeyFromUrl, downloadFromR2 } from './r2.js';
import { diarizeWithAssemblyAI, mapDiarizationToSegments } from './diarization.js';
import { refineSpeakersWithGPT } from './speakerRefinement.js';

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

async function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    let output = '';
    proc.stdout.on('data', (data) => { output += data.toString(); });
    proc.stderr.on('data', () => {});
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffprobe exited with code ${code}`));
      const duration = parseFloat(output.trim());
      if (isNaN(duration)) return reject(new Error('Could not parse duration'));
      resolve(duration);
    });
    proc.on('error', reject);
  });
}

async function convertToWav(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-y',
      '-thread_queue_size', '512',
      '-i', inputPath,
      '-vn', '-ar', '16000', '-ac', '1',
      '-threads', '0',
      '-filter_threads', '0',
      '-filter_complex_threads', '0',
      '-max_muxing_queue_size', '9999',
      '-acodec', 'pcm_s16le', '-f', 'wav',
      outputPath,
    ]);
    proc.stderr.on('data', () => {});
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg exited with code ${code}`));
      resolve();
    });
    proc.on('error', reject);
  });
}

async function splitWavIntoChunks(wavPath: string, workDir: string): Promise<{ path: string; offsetSec: number }[]> {
  const { size } = await import('fs').then(fs => fs.statSync(wavPath));

  if (size <= MAX_CHUNK_SIZE) {
    return [{ path: wavPath, offsetSec: 0 }];
  }

  const bytesPerSec = 16000 * 2;
  const chunkDurationSec = Math.floor(MAX_CHUNK_SIZE / bytesPerSec);
  const totalDuration = await getAudioDuration(wavPath);
  const chunks: { path: string; offsetSec: number }[] = [];

  let start = 0;
  let chunkIndex = 0;

  while (start < totalDuration) {
    const overlapStart = Math.max(0, start - 1);
    const chunkPath = path.join(workDir, `chunk_${chunkIndex}.wav`);

    await new Promise<void>((resolve, reject) => {
      const proc = spawn('ffmpeg', [
        '-y', '-i', wavPath,
        '-ss', overlapStart.toString(),
        '-t', (chunkDurationSec + (start > 0 ? 1 : 0)).toString(),
        '-ar', '16000', '-ac', '1', '-threads', '0', '-acodec', 'pcm_s16le', '-f', 'wav',
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
  const buffer = await readFile(filePath);
  const file = await toFile(buffer, 'audio.wav');

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

    if (seg.startTime < prev.endTime) {
      seg.startTime = prev.endTime;
    }

    deduped.push(seg);
  }

  return deduped;
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
  let r2TempPath: string | null = null;

  const pipelineLog: Record<string, any> = {
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
      'SELECT file_url, type, filename, expected_speakers FROM transcripts WHERE id = $1',
      [transcriptId]
    );

    if (rows.length === 0) throw new Error('Transcript not found');

    const { file_url, filename, expected_speakers } = rows[0];
    const expectedSpeakers = expected_speakers ? parseInt(expected_speakers) : null;
    let sourcePath: string;

    await checkCancelled();

    if (isR2Url(file_url)) {
      const r2Key = getR2KeyFromUrl(file_url);
      console.log(`[Transcription] Downloading from R2: ${r2Key}`);
      sourcePath = await downloadFromR2(r2Key);
      r2TempPath = sourcePath;
    } else {
      sourcePath = path.join(process.cwd(), file_url.startsWith('/') ? file_url.slice(1) : file_url);
    }

    if (!existsSync(sourcePath)) {
      throw new Error(`Source file not found: ${sourcePath}`);
    }

    await mkdir(workDir, { recursive: true });

    console.log(`[Transcription] Starting for "${filename}" (${transcriptId})${expectedSpeakers ? ` — expecting ${expectedSpeakers} speakers` : ''}`);

    const duration = await getAudioDuration(sourcePath);
    console.log(`[Transcription] Duration: ${duration.toFixed(1)}s`);

    await checkCancelled();

    let diarizationError: string | null = null;
    let refinementError: string | null = null;

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
      const wavPath = path.join(workDir, 'converted.wav');
      console.log(`[Transcription] Converting to WAV...`);
      await convertToWav(sourcePath, wavPath);

      const chunks = await splitWavIntoChunks(wavPath, workDir);
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
      const allSegments = chunkResults.flatMap(r => r.segments);
      return { segments: deduplicateSegments(allSegments), chunks: chunks.length };
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

    let allSegments: TranscriptSegment[];

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

    try {
      console.log(`[Transcription] Step 3: GPT-5.4 speaker refinement...`);
      allSegments = await refineSpeakersWithGPT(allSegments, expectedSpeakers);
      const uniqueSpeakers = new Set(allSegments.map(s => s.speaker));
      pipelineLog.refinement = {
        status: 'success',
        speakersAfterRefinement: uniqueSpeakers.size,
      };
    } catch (err: any) {
      console.error(`[Transcription] GPT refinement failed (non-fatal):`, err.message);
      refinementError = err.message;
      pipelineLog.refinement = { status: 'error', error: err.message };
    }

    await savePipelineLog();

    await checkCancelled();

    pipelineLog.completedAt = new Date().toISOString();

    await pool.query('DELETE FROM transcript_segments WHERE transcript_id = $1', [transcriptId]);

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
      await pool.query(
        `INSERT INTO transcript_segments (transcript_id, start_time, end_time, speaker, text, segment_order)
         VALUES ${placeholders.join(', ')}`,
        values
      );
    }

    await pool.query(
      `UPDATE transcripts SET status = 'completed', duration = $1, error_message = NULL, pipeline_log = $2::jsonb, updated_at = NOW()
       WHERE id = $3`,
      [duration, JSON.stringify(pipelineLog), transcriptId]
    );

    console.log(`[Transcription] Completed for "${filename}" — ${allSegments.length} segment(s)`);
  } catch (err: any) {
    if (err instanceof TranscriptionCancelledError) {
      console.log(`[Transcription] ${err.message} — stopping pipeline`);
    } else {
      console.error(`[Transcription] Error for ${transcriptId}:`, err.message);
      pipelineLog.completedAt = new Date().toISOString();
      pipelineLog.fatalError = err.message;
      try {
        await pool.query(
          `UPDATE transcripts SET status = 'error', error_message = $1, pipeline_log = $2::jsonb, updated_at = NOW() WHERE id = $3`,
          [err.message, JSON.stringify(pipelineLog), transcriptId]
        );
      } catch {
      }
    }
  } finally {
    await cleanupDir(workDir);
    if (r2TempPath) {
      try {
        const tempDir = path.dirname(r2TempPath);
        await cleanupDir(tempDir);
      } catch {}
    }
  }
}
