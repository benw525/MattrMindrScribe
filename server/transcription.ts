import { spawn } from 'child_process';
import { readFile, writeFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import OpenAI, { toFile } from 'openai';
import pool from './db.js';

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
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
      '-y', '-i', inputPath,
      '-vn', '-ar', '16000', '-ac', '1',
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
        '-ar', '16000', '-ac', '1', '-acodec', 'pcm_s16le', '-f', 'wav',
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

function splitIntoSentences(text: string): string[] {
  const raw = text.match(/[^.!?]+[.!?]+[\s]*/g);
  if (!raw || raw.length === 0) return [text];
  const sentences = raw.map(s => s.trim()).filter(s => s.length > 0);
  return sentences.length > 0 ? sentences : [text];
}

async function transcribeChunk(filePath: string, offsetSec: number = 0): Promise<TranscriptSegment[]> {
  const buffer = await readFile(filePath);
  const file = await toFile(buffer, 'audio.wav');

  const response = await openai.audio.transcriptions.create({
    file,
    model: 'gpt-4o-mini-transcribe',
    response_format: 'json',
  });

  const text = response.text?.trim();
  if (!text) return [];

  const chunkDuration = await getAudioDuration(filePath);
  const sentences = splitIntoSentences(text);
  const totalChars = sentences.reduce((sum, s) => sum + s.length, 0);

  const segments: TranscriptSegment[] = [];
  let currentTime = offsetSec;

  for (const sentence of sentences) {
    const proportion = sentence.length / totalChars;
    const segDuration = chunkDuration * proportion;
    const startTime = Math.round(currentTime * 100) / 100;
    const endTime = Math.round((currentTime + segDuration) * 100) / 100;

    segments.push({
      speaker: 'Speaker 1',
      text: sentence,
      startTime,
      endTime,
    });

    currentTime += segDuration;
  }

  return segments;
}

function deduplicateSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
  if (segments.length === 0) return [];
  const deduped: TranscriptSegment[] = [segments[0]];

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    const prev = deduped[deduped.length - 1];

    if (Math.abs(seg.startTime - prev.startTime) < 1.5 && seg.text === prev.text) continue;
    if (seg.startTime < prev.endTime - 0.5 && seg.text === prev.text) continue;

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

async function cleanupFiles(files: string[]): Promise<void> {
  for (const f of files) {
    await unlink(f).catch(() => {});
  }
}

async function cleanupDir(dirPath: string): Promise<void> {
  try {
    const { readdirSync, rmSync } = await import('fs');
    if (existsSync(dirPath)) {
      rmSync(dirPath, { recursive: true, force: true });
    }
  } catch {}
}

export async function processTranscription(transcriptId: string): Promise<void> {
  const workDir = path.join(tmpdir(), `transcription_${randomUUID()}`);

  try {
    await pool.query(
      `UPDATE transcripts SET status = 'processing', updated_at = NOW() WHERE id = $1`,
      [transcriptId]
    );

    const { rows } = await pool.query(
      'SELECT file_url, type, filename FROM transcripts WHERE id = $1',
      [transcriptId]
    );

    if (rows.length === 0) throw new Error('Transcript not found');

    const { file_url, filename } = rows[0];
    const sourcePath = path.join(process.cwd(), file_url.startsWith('/') ? file_url.slice(1) : file_url);

    if (!existsSync(sourcePath)) {
      throw new Error(`Source file not found: ${sourcePath}`);
    }

    await mkdir(workDir, { recursive: true });

    console.log(`[Transcription] Starting for "${filename}" (${transcriptId})`);

    const duration = await getAudioDuration(sourcePath);
    console.log(`[Transcription] Duration: ${duration.toFixed(1)}s`);

    const wavPath = path.join(workDir, 'converted.wav');
    console.log(`[Transcription] Converting to WAV...`);
    await convertToWav(sourcePath, wavPath);

    const chunks = await splitWavIntoChunks(wavPath, workDir);
    console.log(`[Transcription] Processing ${chunks.length} chunk(s)...`);

    let allSegments: TranscriptSegment[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`[Transcription] Transcribing chunk ${i + 1}/${chunks.length}...`);

      try {
        const segments = await transcribeChunk(chunk.path, chunk.offsetSec);
        allSegments.push(...segments);
      } catch (err: any) {
        console.error(`[Transcription] Chunk ${i + 1} failed:`, err.message);
        throw new Error(`Transcription failed on chunk ${i + 1}: ${err.message}`);
      }
    }

    allSegments = deduplicateSegments(allSegments);
    allSegments = assignSpeakers(allSegments);

    if (allSegments.length > 0) {
      const lastSeg = allSegments[allSegments.length - 1];
      lastSeg.endTime = Math.round(duration * 100) / 100;
    }

    await pool.query('DELETE FROM transcript_segments WHERE transcript_id = $1', [transcriptId]);

    for (let i = 0; i < allSegments.length; i++) {
      const seg = allSegments[i];
      await pool.query(
        `INSERT INTO transcript_segments (transcript_id, start_time, end_time, speaker, text, segment_order)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [transcriptId, seg.startTime, seg.endTime, seg.speaker, seg.text, i]
      );
    }

    await pool.query(
      `UPDATE transcripts SET status = 'completed', duration = $1, error_message = NULL, updated_at = NOW()
       WHERE id = $2`,
      [duration, transcriptId]
    );

    console.log(`[Transcription] Completed for "${filename}" — ${allSegments.length} segment(s)`);
  } catch (err: any) {
    console.error(`[Transcription] Error for ${transcriptId}:`, err.message);
    await pool.query(
      `UPDATE transcripts SET status = 'error', error_message = $1, updated_at = NOW() WHERE id = $2`,
      [err.message, transcriptId]
    );
  } finally {
    await cleanupDir(workDir);
  }
}
