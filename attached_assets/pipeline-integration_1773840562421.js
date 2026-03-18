const { Queue, Worker } = require('bullmq');
const AuphonicService = require('./auphonic-service');
const createWebhookRouter = require('./auphonic-webhook');

/**
 * Pipeline Integration Example
 *
 * Shows how the Auphonic audio cleaning step fits into your full
 * transcription pipeline:
 *
 *   1. AUPHONIC  — Clean/enhance audio (noise removal, leveling, EQ)
 *   2. WHISPER   — Voice-to-text transcription
 *   3. ASSEMBLY  — Speaker diarization (who spoke when)
 *   4. CLAUDE    — Speaker identification + transcript refinement
 *
 * This file wires up the BullMQ queues and workers for steps 1-2.
 * Steps 3-4 follow the same pattern with their own workers.
 */

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------

const REDIS_CONNECTION = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
};

const AUPHONIC_CONFIG = {
  apiKey: process.env.AUPHONIC_API_KEY,
  webhookUrl: process.env.AUPHONIC_WEBHOOK_URL, // e.g. https://yourdomain.com/webhooks/auphonic
  outputDir: process.env.CLEANED_AUDIO_DIR || './cleaned-audio',
  presetUuid: process.env.AUPHONIC_PRESET_UUID || null, // Set after first run
};

// ---------------------------------------------------------------------------
// SERVICES + QUEUES
// ---------------------------------------------------------------------------

const auphonicService = new AuphonicService(AUPHONIC_CONFIG);

// Single queue handles all transcription pipeline jobs, differentiated by job name
const transcriptionQueue = new Queue('transcription-pipeline', {
  connection: REDIS_CONNECTION,
});

// ---------------------------------------------------------------------------
// WORKER: AUPHONIC AUDIO CLEANING (Step 1)
// ---------------------------------------------------------------------------

const auphonicWorker = new Worker(
  'transcription-pipeline',
  async (job) => {
    // Only process auphonic-clean jobs in this worker
    if (job.name !== 'auphonic-clean') return;

    const { matterId, audioFilePath, originalFilename } = job.data;

    console.log(`[Pipeline] Step 1: Cleaning audio for matter ${matterId}`);

    // Submit to Auphonic — returns immediately, processing is async
    const result = await auphonicService.submitForCleaning(audioFilePath, matterId);

    console.log(`[Pipeline] Auphonic production ${result.productionUuid} started`);
    console.log(`[Pipeline] Status page: ${result.statusPage}`);

    // Store the production UUID so we can track it
    // The webhook handler (auphonic-webhook.js) picks up from here
    // when Auphonic calls back with the completed file
    return {
      productionUuid: result.productionUuid,
      statusPage: result.statusPage,
      matterId,
    };
  },
  {
    connection: REDIS_CONNECTION,
    concurrency: 5, // Process up to 5 files simultaneously
  }
);

// ---------------------------------------------------------------------------
// WORKER: WHISPER TRANSCRIPTION (Step 2)
// ---------------------------------------------------------------------------

const whisperWorker = new Worker(
  'transcription-pipeline',
  async (job) => {
    if (job.name !== 'whisper-transcribe') return;

    const { matterId, audioFilePath } = job.data;

    console.log(`[Pipeline] Step 2: Whisper transcription for matter ${matterId}`);

    // ── YOUR EXISTING WHISPER CODE GOES HERE ──
    // const transcript = await whisperService.transcribe(audioFilePath);

    // Example: queue the next step (AssemblyAI diarization)
    // await transcriptionQueue.add('assembly-diarize', {
    //   matterId,
    //   audioFilePath,
    //   transcript,
    //   pipelineStage: 'assembly',
    // });

    // return { matterId, transcript };
  },
  {
    connection: REDIS_CONNECTION,
    concurrency: 3,
  }
);

// ---------------------------------------------------------------------------
// WORKER: FAILURE HANDLER
// ---------------------------------------------------------------------------

const failureWorker = new Worker(
  'transcription-pipeline',
  async (job) => {
    if (job.name !== 'auphonic-failure') return;

    const { matterId, productionUuid, error } = job.data;

    console.error(`[Pipeline] Auphonic failed for matter ${matterId}: ${error}`);

    // ── YOUR ERROR HANDLING ──
    // Options:
    //   1. Retry with different denoise method (dynamic_denoise instead of speech_isolation)
    //   2. Skip cleaning and send raw audio to Whisper
    //   3. Notify the user / update matter status in your DB
    //
    // Example: fallback to raw audio
    // await transcriptionQueue.add('whisper-transcribe', {
    //   matterId,
    //   audioFilePath: job.data.originalFilePath, // original uncleaned file
    //   skippedCleaning: true,
    // });
  },
  {
    connection: REDIS_CONNECTION,
    concurrency: 1,
  }
);

// ---------------------------------------------------------------------------
// ERROR LOGGING
// ---------------------------------------------------------------------------

[auphonicWorker, whisperWorker, failureWorker].forEach((worker) => {
  worker.on('failed', (job, err) => {
    console.error(`[Pipeline] Job ${job?.name} failed:`, err.message);
  });
});

// ---------------------------------------------------------------------------
// EXPRESS APP SETUP (mount the webhook)
// ---------------------------------------------------------------------------

function mountWebhook(app) {
  const webhookRouter = createWebhookRouter(auphonicService, transcriptionQueue);
  app.use('/webhooks', webhookRouter);
  console.log('[Pipeline] Auphonic webhook mounted at POST /webhooks/auphonic');
}

// ---------------------------------------------------------------------------
// ENTRY POINT: Start a new transcription job
// ---------------------------------------------------------------------------

/**
 * Call this when a user uploads an audio file to kick off the pipeline.
 *
 * @param {string} matterId       — Internal case/matter ID
 * @param {string} audioFilePath  — Path to the uploaded audio file
 */
async function startTranscriptionPipeline(matterId, audioFilePath) {
  const job = await transcriptionQueue.add(
    'auphonic-clean',
    {
      matterId,
      audioFilePath,
      originalFilename: require('path').basename(audioFilePath),
      submittedAt: new Date().toISOString(),
    },
    {
      attempts: 2,
      backoff: { type: 'exponential', delay: 10000 },
      removeOnComplete: true,
    }
  );

  console.log(`[Pipeline] Started pipeline for matter ${matterId} — job ${job.id}`);
  return job.id;
}

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------

module.exports = {
  auphonicService,
  transcriptionQueue,
  mountWebhook,
  startTranscriptionPipeline,
};
