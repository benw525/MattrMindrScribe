import { createReadStream, createWriteStream } from 'fs';
import { stat, mkdir } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import https from 'https';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';

const AUPHONIC_BASE_URL = 'https://auphonic.com/api';
const POLL_INITIAL_INTERVAL_MS = 5_000;
const POLL_MAX_INTERVAL_MS = 30_000;
const POLL_BACKOFF_FACTOR = 1.5;
const POLL_MAX_WAIT_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;
const UPLOAD_TIMEOUT_MS = 60 * 60 * 1000;
const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;

export function auphonicConfigured(): boolean {
  return !!process.env.AUPHONIC_API_KEY;
}

function getApiKey(): string {
  const key = process.env.AUPHONIC_API_KEY;
  if (!key) throw new Error('AUPHONIC_API_KEY is not configured');
  return key;
}

function authHeader(): Record<string, string> {
  return { Authorization: `Bearer ${getApiKey()}` };
}

function timeoutSignal(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

interface AuphonicProductionResponse {
  status_code: number;
  error_code: string | null;
  error_message: string;
  data: {
    uuid: string;
    status: number;
    status_string: string;
    output_files?: Array<{
      format: string;
      download_url: string;
      filename: string;
    }>;
  };
}

async function createProduction(title: string): Promise<string> {
  const res = await fetch(`${AUPHONIC_BASE_URL}/productions.json`, {
    method: 'POST',
    headers: {
      ...authHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      metadata: { title },
      output_files: [{ format: 'wav', ending: 'wav', split_on_chapters: false, mono_mixdown: false }],
      algorithms: {
        denoise: true,
        denoise_method: 'speech_isolation',
        denoiseamount: 100,
        remove_noise: 100,
        remove_reverb: 80,
        remove_breaths: 50,
        leveler: true,
        leveler_mode: 'moderate',
        filtering: true,
        voice_autoeq: true,
        normloudness: true,
        loudnesstarget: -16,
        maxpeak: -1,
      },
    }),
    signal: timeoutSignal(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Auphonic create production failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as AuphonicProductionResponse;
  if (json.error_code) {
    throw new Error(`Auphonic create production error: ${json.error_message}`);
  }

  const uuid = json.data.uuid;
  console.log(`[Auphonic] Production created: ${uuid}`);
  return uuid;
}

function httpsUploadMultipart(
  url: string,
  headers: Record<string, string>,
  boundary: string,
  headerBytes: Buffer,
  footerBytes: Buffer,
  filePath: string,
  fileSize: number,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const totalLength = headerBytes.length + fileSize + footerBytes.length;

    const reqOptions: https.RequestOptions = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': String(totalLength),
      },
      timeout: timeoutMs,
    };

    const req = https.request(reqOptions, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (!res.statusCode || res.statusCode >= 400) {
          reject(new Error(`Auphonic upload failed (${res.statusCode}): ${body}`));
          return;
        }
        resolve(body);
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error(`Auphonic upload timed out after ${timeoutMs / 1000}s`));
    });

    req.write(headerBytes);

    const fileStream = createReadStream(filePath);
    fileStream.on('data', (chunk: Buffer) => {
      const canContinue = req.write(chunk);
      if (!canContinue) {
        fileStream.pause();
        req.once('drain', () => fileStream.resume());
      }
    });
    fileStream.on('end', () => {
      req.write(footerBytes);
      req.end();
    });
    fileStream.on('error', (err) => {
      req.destroy(err);
      reject(err);
    });
  });
}

async function uploadFileToProduction(productionUuid: string, filePath: string): Promise<void> {
  const fileStats = await stat(filePath);
  const fileSizeMB = (fileStats.size / 1024 / 1024).toFixed(1);
  console.log(`[Auphonic] Uploading ${fileSizeMB} MB to production ${productionUuid}...`);

  const boundary = `----AuphonicBoundary${randomUUID().replace(/-/g, '')}`;
  const fileName = path.basename(filePath);

  const headerBytes = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="input_file"; filename="${fileName}"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n`
  );
  const footerBytes = Buffer.from(`\r\n--${boundary}--\r\n`);

  const uploadUrl = `${AUPHONIC_BASE_URL}/production/${productionUuid}/upload.json`;

  await httpsUploadMultipart(
    uploadUrl,
    authHeader(),
    boundary,
    headerBytes,
    footerBytes,
    filePath,
    fileStats.size,
    UPLOAD_TIMEOUT_MS,
  );

  console.log(`[Auphonic] Upload complete`);
}

async function startProduction(productionUuid: string): Promise<void> {
  const res = await fetch(`${AUPHONIC_BASE_URL}/production/${productionUuid}/start.json`, {
    method: 'POST',
    headers: authHeader(),
    signal: timeoutSignal(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Auphonic start failed (${res.status}): ${text}`);
  }

  console.log(`[Auphonic] Production started`);
}

function computeBackoffMs(pollCount: number): number {
  const interval = POLL_INITIAL_INTERVAL_MS * Math.pow(POLL_BACKOFF_FACTOR, pollCount - 1);
  const jitter = Math.random() * 1000;
  return Math.min(interval + jitter, POLL_MAX_INTERVAL_MS);
}

async function pollUntilDone(
  productionUuid: string,
  checkCancelled?: () => Promise<void>,
): Promise<AuphonicProductionResponse['data']> {
  const startTime = Date.now();
  let pollCount = 0;

  while (Date.now() - startTime < POLL_MAX_WAIT_MS) {
    if (checkCancelled) await checkCancelled();

    pollCount++;
    const backoffMs = computeBackoffMs(pollCount);
    await new Promise((resolve) => setTimeout(resolve, backoffMs));

    let res: Response;
    try {
      res = await fetch(`${AUPHONIC_BASE_URL}/production/${productionUuid}.json`, {
        headers: authHeader(),
        signal: timeoutSignal(30_000),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[Auphonic] Status poll ${pollCount} network error: ${message}, retrying...`);
      continue;
    }

    if (!res.ok) {
      console.warn(`[Auphonic] Status poll ${pollCount} failed (${res.status}), retrying...`);
      continue;
    }

    const json = (await res.json()) as AuphonicProductionResponse;
    const status = json.data.status;
    const statusString = json.data.status_string;

    if (status === 3) {
      console.log(`[Auphonic] Production complete (poll ${pollCount})`);
      return json.data;
    }

    if (status === 2 || status === 11 || status === 13) {
      throw new Error(`Auphonic production failed with status: ${statusString} (${status})`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(`[Auphonic] Status: ${statusString} (${status}) — poll ${pollCount}, ${elapsed}s elapsed, next poll in ${(backoffMs / 1000).toFixed(1)}s`);
  }

  throw new Error(`Auphonic production timed out after ${POLL_MAX_WAIT_MS / 60000} minutes`);
}

function httpsDownload(url: string, headers: Record<string, string>, destPath: string, timeoutMs: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const reqOptions: https.RequestOptions = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers,
      timeout: timeoutMs,
    };

    const req = https.request(reqOptions, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        httpsDownload(res.headers.location, headers, destPath, timeoutMs).then(resolve, reject);
        return;
      }

      if (!res.statusCode || res.statusCode >= 400) {
        reject(new Error(`Auphonic download failed (${res.statusCode})`));
        return;
      }

      const writeStream = createWriteStream(destPath);
      let downloaded = 0;
      let lastLog = Date.now();

      const progress = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          downloaded += chunk.length;
          const now = Date.now();
          if (now - lastLog > 10000) {
            console.log(`[Auphonic] Download: ${(downloaded / 1024 / 1024).toFixed(1)} MB`);
            lastLog = now;
          }
          callback(null, chunk);
        },
      });

      pipeline(res, progress, writeStream)
        .then(() => resolve(downloaded))
        .catch(reject);
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error(`Auphonic download timed out after ${timeoutMs / 1000}s`));
    });
    req.end();
  });
}

async function downloadResultFile(
  productionData: AuphonicProductionResponse['data'],
): Promise<string> {
  const outputFiles = productionData.output_files || [];
  const wavFile = outputFiles.find((f) => f.format === 'wav') || outputFiles[0];

  if (!wavFile) {
    throw new Error('Auphonic production has no output files');
  }

  const downloadUrl = wavFile.download_url;
  console.log(`[Auphonic] Downloading cleaned audio (${wavFile.format})...`);

  const tempDir = path.join(tmpdir(), `auphonic_${randomUUID()}`);
  await mkdir(tempDir, { recursive: true });
  const outPath = path.join(tempDir, `cleaned.${wavFile.format || 'wav'}`);

  const downloaded = await httpsDownload(downloadUrl, authHeader(), outPath, DOWNLOAD_TIMEOUT_MS);
  console.log(`[Auphonic] Downloaded cleaned audio: ${(downloaded / 1024 / 1024).toFixed(1)} MB → ${outPath}`);

  return outPath;
}

export interface AuphonicResult {
  cleanedFilePath: string;
  productionUuid: string;
  durationSeconds: number;
}

export async function cleanAudioWithAuphonic(
  sourceFilePath: string,
  title: string,
  checkCancelled?: () => Promise<void>,
): Promise<AuphonicResult> {
  getApiKey();

  const startTime = Date.now();

  const productionUuid = await createProduction(title);

  if (checkCancelled) await checkCancelled();
  await uploadFileToProduction(productionUuid, sourceFilePath);

  if (checkCancelled) await checkCancelled();
  await startProduction(productionUuid);

  const productionData = await pollUntilDone(productionUuid, checkCancelled);

  const cleanedFilePath = await downloadResultFile(productionData);

  const durationSeconds = (Date.now() - startTime) / 1000;
  console.log(`[Auphonic] Audio cleanup complete in ${durationSeconds.toFixed(1)}s`);

  return {
    cleanedFilePath,
    productionUuid,
    durationSeconds,
  };
}
