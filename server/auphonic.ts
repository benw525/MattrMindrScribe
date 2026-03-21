import axios, { AxiosInstance } from 'axios';
import { createReadStream, createWriteStream } from 'fs';
import { stat, mkdir } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import FormData from 'form-data';

const AUPHONIC_BASE_URL = 'https://auphonic.com/api';
const POLL_INTERVAL_MS = 15_000;
const POLL_MAX_WAIT_MS = 30 * 60 * 1000;

const presetCache: Record<string, string> = {};

export function auphonicConfigured(): boolean {
  return !!process.env.AUPHONIC_API_KEY;
}

function getApiKey(): string {
  const key = process.env.AUPHONIC_API_KEY;
  if (!key) throw new Error('AUPHONIC_API_KEY is not configured');
  return key;
}

function createClient(): AxiosInstance {
  return axios.create({
    baseURL: AUPHONIC_BASE_URL,
    headers: { Authorization: `Bearer ${getApiKey()}` },
    maxRedirects: 5,
    timeout: 10 * 60 * 1000,
  });
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

const STANDARD_PRESET = {
  preset_name: 'Legal Transcription - Standard',
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
  output_files: [
    { format: 'wav', ending: 'wav', split_on_chapters: false, mono_mixdown: false },
  ],
};

const BODY_CAM_PRESET = {
  preset_name: 'Legal Transcription - Body Cam',
  algorithms: {
    denoise: true,
    denoise_method: 'dynamic_denoise',
    denoiseamount: 75,
    remove_noise: 75,
    remove_reverb: 60,
    remove_breaths: 0,
    leveler: true,
    leveler_mode: 'moderate',
    filtering: true,
    voice_autoeq: true,
    normloudness: true,
    loudnesstarget: -16,
    maxpeak: -1,
  },
  output_files: [
    { format: 'wav', ending: 'wav', split_on_chapters: false, mono_mixdown: false },
  ],
};

async function getOrCreatePreset(recordingType: string | null): Promise<string> {
  const isBodyCam = recordingType === 'body_cam';
  const cacheKey = isBodyCam ? 'body_cam' : 'standard';

  if (process.env.AUPHONIC_PRESET_UUID && !isBodyCam) {
    return process.env.AUPHONIC_PRESET_UUID;
  }

  if (presetCache[cacheKey]) {
    return presetCache[cacheKey];
  }

  const client = createClient();
  const presetConfig = isBodyCam ? BODY_CAM_PRESET : STANDARD_PRESET;

  console.log(`[Auphonic] Creating ${cacheKey} preset...`);
  const res = await client.post('/presets.json', presetConfig);

  if (res.data.error_code) {
    throw new Error(`Auphonic preset creation error: ${res.data.error_message}`);
  }

  const uuid = res.data.data.uuid;
  presetCache[cacheKey] = uuid;
  console.log(`[Auphonic] Created ${cacheKey} preset: ${uuid}`);
  return uuid;
}

async function submitForCleaning(
  filePath: string,
  title: string,
  presetUuid: string,
): Promise<string> {
  const client = createClient();
  const fileStats = await stat(filePath);
  const fileSizeMB = (fileStats.size / 1024 / 1024).toFixed(1);
  console.log(`[Auphonic] Uploading ${fileSizeMB} MB via Simple API...`);

  const form = new FormData();
  form.append('preset', presetUuid);
  form.append('title', title);
  form.append('action', 'start');
  form.append('input_file', createReadStream(filePath));

  const res = await client.post('/simple/productions.json', form, {
    headers: {
      ...form.getHeaders(),
      Authorization: `Bearer ${getApiKey()}`,
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    timeout: 60 * 60 * 1000,
  });

  if (res.data.error_code) {
    throw new Error(`Auphonic submit error: ${res.data.error_message}`);
  }

  const uuid = res.data.data.uuid;
  console.log(`[Auphonic] Production submitted and started: ${uuid}`);
  return uuid;
}

const STATUS_LABELS: Record<number, string> = {
  0: 'Incomplete',
  1: 'Not Started',
  2: 'Waiting',
  3: 'Done',
  4: 'Error',
  5: 'Encoding',
  9: 'Processing',
};

async function pollUntilDone(
  productionUuid: string,
  checkCancelled?: () => Promise<void>,
): Promise<AuphonicProductionResponse['data']> {
  const client = createClient();
  const startTime = Date.now();
  let pollCount = 0;

  while (Date.now() - startTime < POLL_MAX_WAIT_MS) {
    if (checkCancelled) await checkCancelled();

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    pollCount++;

    let res;
    try {
      res = await client.get(`/production/${productionUuid}.json`, { timeout: 30_000 });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[Auphonic] Status poll ${pollCount} network error: ${message}, retrying...`);
      continue;
    }

    const json = res.data as AuphonicProductionResponse;
    const status = json.data.status;
    const statusLabel = STATUS_LABELS[status] || `Unknown(${status})`;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

    if (status === 3) {
      console.log(`[Auphonic] Status: Done (3) — completed in ${elapsed}s`);
      return json.data;
    }

    if (status === 4) {
      throw new Error(`Auphonic production failed with status: Error (4) — ${json.data.status_string}`);
    }

    console.log(`[Auphonic] Status: ${statusLabel} (${status}) — poll ${pollCount}, ${elapsed}s elapsed, next poll in ${POLL_INTERVAL_MS / 1000}s`);
  }

  throw new Error(`Auphonic production timed out after ${POLL_MAX_WAIT_MS / 60000} minutes`);
}

async function downloadCleanedAudio(
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

  const response = await axios.get(downloadUrl, {
    headers: { Authorization: `Bearer ${getApiKey()}` },
    responseType: 'stream',
    maxRedirects: 5,
    timeout: 30 * 60 * 1000,
  });

  const writer = createWriteStream(outPath);
  let downloaded = 0;
  let lastLog = Date.now();

  response.data.on('data', (chunk: Buffer) => {
    downloaded += chunk.length;
    const now = Date.now();
    if (now - lastLog > 10000) {
      console.log(`[Auphonic] Download: ${(downloaded / 1024 / 1024).toFixed(1)} MB`);
      lastLog = now;
    }
  });

  await new Promise<void>((resolve, reject) => {
    response.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

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
  recordingType?: string | null,
): Promise<AuphonicResult> {
  getApiKey();

  const startTime = Date.now();

  const presetUuid = await getOrCreatePreset(recordingType || null);

  if (checkCancelled) await checkCancelled();

  const productionUuid = await submitForCleaning(sourceFilePath, title, presetUuid);

  const productionData = await pollUntilDone(productionUuid, checkCancelled);

  const cleanedFilePath = await downloadCleanedAudio(productionData);

  const durationSeconds = (Date.now() - startTime) / 1000;
  console.log(`[Auphonic] Audio cleanup complete in ${durationSeconds.toFixed(1)}s`);

  return {
    cleanedFilePath,
    productionUuid,
    durationSeconds,
  };
}
