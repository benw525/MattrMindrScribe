import { createReadStream, createWriteStream } from 'fs';
import { stat, mkdir } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';

const AUPHONIC_BASE_URL = 'https://auphonic.com/api';
const POLL_INTERVAL_MS = 10_000;
const POLL_MAX_WAIT_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;
const UPLOAD_TIMEOUT_MS = 60 * 60 * 1000;
const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;

export const auphonicConfigured = !!process.env.AUPHONIC_API_KEY;

function authHeader(): Record<string, string> {
  return { Authorization: `bearer ${process.env.AUPHONIC_API_KEY}` };
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
      output_files: [{ format: 'wav', ending: 'wav' }],
      algorithms: {
        denoise: true,
        denoiseamount: 0,
        dehum: 'auto',
        loudnesstarget: -16,
        leveler: true,
        normloudness: true,
        filtering: true,
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

  const totalLength = headerBytes.length + fileStats.size + footerBytes.length;

  async function* multipartStream() {
    yield headerBytes;
    const fileStream = createReadStream(filePath);
    for await (const chunk of fileStream) {
      yield chunk;
    }
    yield footerBytes;
  }

  const bodyStream = Readable.from(multipartStream());

  const res = await fetch(`${AUPHONIC_BASE_URL}/production/${productionUuid}/upload.json`, {
    method: 'POST',
    headers: {
      ...authHeader(),
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(totalLength),
    },
    body: bodyStream as any,
    duplex: 'half' as any,
    signal: timeoutSignal(UPLOAD_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Auphonic upload failed (${res.status}): ${text}`);
  }

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

async function pollUntilDone(
  productionUuid: string,
  checkCancelled?: () => Promise<void>,
): Promise<AuphonicProductionResponse['data']> {
  const startTime = Date.now();
  let pollCount = 0;

  while (Date.now() - startTime < POLL_MAX_WAIT_MS) {
    if (checkCancelled) await checkCancelled();

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    pollCount++;

    let res: Response;
    try {
      res = await fetch(`${AUPHONIC_BASE_URL}/production/${productionUuid}.json`, {
        headers: authHeader(),
        signal: timeoutSignal(30_000),
      });
    } catch (err: any) {
      console.warn(`[Auphonic] Status poll ${pollCount} network error: ${err.message}, retrying...`);
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

    if (status === 2 || status === 9 || status === 11 || status === 13) {
      throw new Error(`Auphonic production failed with status: ${statusString} (${status})`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(`[Auphonic] Status: ${statusString} (${status}) — poll ${pollCount}, ${elapsed}s elapsed`);
  }

  throw new Error(`Auphonic production timed out after ${POLL_MAX_WAIT_MS / 60000} minutes`);
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

  const res = await fetch(downloadUrl, {
    redirect: 'follow',
    headers: authHeader(),
    signal: timeoutSignal(DOWNLOAD_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Auphonic download failed (${res.status})`);
  }

  const tempDir = path.join(tmpdir(), `auphonic_${randomUUID()}`);
  await mkdir(tempDir, { recursive: true });
  const outPath = path.join(tempDir, `cleaned.${wavFile.format || 'wav'}`);

  const writeStream = createWriteStream(outPath);
  const bodyStream = Readable.fromWeb(res.body as any);

  let downloaded = 0;
  let lastLog = Date.now();
  const progress = new Transform({
    transform(chunk, _encoding, callback) {
      downloaded += chunk.length;
      const now = Date.now();
      if (now - lastLog > 10000) {
        console.log(`[Auphonic] Download: ${(downloaded / 1024 / 1024).toFixed(1)} MB`);
        lastLog = now;
      }
      callback(null, chunk);
    },
  });

  await pipeline(bodyStream, progress, writeStream);
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
  if (!process.env.AUPHONIC_API_KEY) {
    throw new Error('AUPHONIC_API_KEY is not configured');
  }

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
