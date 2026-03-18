const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

/**
 * AuphonicService
 *
 * Handles all interactions with the Auphonic API for audio preprocessing.
 * Designed to slot into a transcription pipeline before Whisper.
 *
 * Workflow:
 *   1. ensurePreset()    — creates or retrieves the cleaning preset
 *   2. submitForCleaning() — uploads audio + starts production
 *   3. (webhook fires when done)
 *   4. downloadCleanedAudio() — pulls the result file
 */
class AuphonicService {
  constructor({ apiKey, webhookUrl, outputDir, presetUuid = null }) {
    if (!apiKey) throw new Error('Auphonic API key is required');

    this.apiKey = apiKey;
    this.webhookUrl = webhookUrl;
    this.outputDir = outputDir || path.join(process.cwd(), 'cleaned-audio');
    this.presetUuid = presetUuid; // If you already created one manually

    this.client = axios.create({
      baseURL: 'https://auphonic.com/api',
      headers: {
        Authorization: `bearer ${this.apiKey}`,
      },
      maxRedirects: 5, // Auphonic download URLs can redirect (3XX)
    });

    // Make sure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  // ---------------------------------------------------------------------------
  // PRESET MANAGEMENT
  // ---------------------------------------------------------------------------

  /**
   * Creates a preset optimized for legal transcription preprocessing.
   *
   * Key settings:
   *   - Speech Isolation: strips everything except voice
   *   - Voice AutoEQ: normalizes frequency spectrum across speakers
   *   - Adaptive Leveler: balances volume between speakers
   *   - High-Pass Filtering: removes low-freq interference
   *   - Output: WAV (lossless — no quality loss before Whisper)
   *
   * Returns the preset UUID. Call once, then store the UUID.
   */
  async createCleaningPreset(presetName = 'Legal Transcription Preprocessing') {
    const presetConfig = {
      preset_name: presetName,
      algorithms: {
        denoise: true,
        denoise_method: 'speech_isolation', // Most aggressive — voice only
        denoiseamount: 100,                 // Full noise removal
        remove_noise: 100,
        remove_reverb: 80,                  // Reduce reverb but keep some natural room tone
        remove_breaths: 50,                 // Moderate breath reduction — don't want unnatural gaps
        leveler: true,                      // Balance volume across speakers
        leveler_mode: 'moderate',           // Don't over-compress
        filtering: true,                    // Enable adaptive high-pass + AutoEQ
        voice_autoeq: true,                 // Normalize speaker frequency profiles
        normloudness: true,                 // Normalize overall loudness
        loudnesstarget: -16,                // Standard target for speech
        maxpeak: -1,                        // True peak limit
      },
      output_files: [
        {
          format: 'wav',   // Lossless output — Whisper works best with WAV
          ending: 'wav',
          split_on_chapters: false,
          mono_mixdown: false,
        },
      ],
      // Webhook so we know when processing is done
      webhook: this.webhookUrl,
    };

    try {
      const response = await this.client.post('/presets.json', presetConfig);
      const uuid = response.data.data.uuid;
      this.presetUuid = uuid;
      console.log(`[Auphonic] Created preset: ${uuid}`);
      return uuid;
    } catch (err) {
      throw new Error(`[Auphonic] Failed to create preset: ${err.response?.data?.error_message || err.message}`);
    }
  }

  /**
   * Ensures a preset exists. Uses stored UUID if available,
   * otherwise creates a new one.
   */
  async ensurePreset() {
    if (this.presetUuid) {
      // Verify it still exists
      try {
        await this.client.get(`/preset/${this.presetUuid}.json`);
        return this.presetUuid;
      } catch {
        console.warn('[Auphonic] Stored preset not found, creating new one');
      }
    }
    return this.createCleaningPreset();
  }

  // ---------------------------------------------------------------------------
  // PRODUCTION (AUDIO CLEANING)
  // ---------------------------------------------------------------------------

  /**
   * Submits an audio file to Auphonic for cleaning.
   *
   * @param {string} filePath     — Absolute path to the audio file
   * @param {string} matterId     — Your internal case/matter ID (stored as title for tracking)
   * @param {object} [options]    — Optional overrides
   * @param {string} [options.denoiseMethod] — 'speech_isolation' | 'dynamic_denoise' | 'static_denoise'
   *
   * @returns {object} { productionUuid, statusPage }
   */
  async submitForCleaning(filePath, matterId, options = {}) {
    const presetUuid = await this.ensurePreset();

    if (!fs.existsSync(filePath)) {
      throw new Error(`[Auphonic] Audio file not found: ${filePath}`);
    }

    const form = new FormData();
    form.append('preset', presetUuid);
    form.append('title', `matter-${matterId}-${Date.now()}`);
    form.append('input_file', fs.createReadStream(filePath));
    form.append('action', 'start'); // Upload + start processing in one request

    // Allow per-submission overrides
    if (options.denoiseMethod) {
      form.append('denoise_method', options.denoiseMethod);
    }

    try {
      const response = await this.client.post('/simple/productions.json', form, {
        headers: {
          ...form.getHeaders(),
          Authorization: `bearer ${this.apiKey}`,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      const production = response.data.data;

      console.log(`[Auphonic] Production started: ${production.uuid} for matter ${matterId}`);

      return {
        productionUuid: production.uuid,
        statusPage: production.status_page,
        status: production.status_string,
      };
    } catch (err) {
      const msg = err.response?.data?.error_message || err.message;
      throw new Error(`[Auphonic] Failed to submit audio: ${msg}`);
    }
  }

  // ---------------------------------------------------------------------------
  // STATUS + DOWNLOAD
  // ---------------------------------------------------------------------------

  /**
   * Checks the current status of a production.
   *
   * Status codes:
   *   0 = Incomplete
   *   1 = Not Started
   *   2 = Waiting (queued)
   *   3 = Done
   *   4 = Error
   *   5 = Encoding (almost done)
   *   9 = Processing
   */
  async getProductionStatus(productionUuid) {
    try {
      const response = await this.client.get(`/production/${productionUuid}.json`);
      const data = response.data.data;

      return {
        status: data.status,
        statusString: data.status_string,
        outputFiles: data.output_files || [],
        errorMessage: data.error_message || null,
        warningMessage: data.warning_message || null,
        statistics: data.statistics || null,
      };
    } catch (err) {
      throw new Error(`[Auphonic] Failed to get status: ${err.message}`);
    }
  }

  /**
   * Downloads the cleaned audio file from a completed production.
   *
   * @param {string} productionUuid
   * @param {string} [outputFilename] — Override the output filename
   *
   * @returns {string} Absolute path to the downloaded cleaned file
   */
  async downloadCleanedAudio(productionUuid, outputFilename = null) {
    const production = await this.getProductionStatus(productionUuid);

    if (production.status !== 3) {
      throw new Error(
        `[Auphonic] Production ${productionUuid} is not done (status: ${production.statusString})`
      );
    }

    if (!production.outputFiles.length) {
      throw new Error(`[Auphonic] No output files found for production ${productionUuid}`);
    }

    // Grab the first output file (our WAV)
    const outputFile = production.outputFiles[0];
    const downloadUrl = outputFile.download_url;

    if (!downloadUrl) {
      throw new Error(`[Auphonic] No download URL for production ${productionUuid}`);
    }

    const filename = outputFilename || outputFile.filename;
    const outputPath = path.join(this.outputDir, filename);

    try {
      const response = await this.client.get(downloadUrl, {
        responseType: 'stream',
        // Auphonic download URLs may redirect
        maxRedirects: 5,
      });

      const writer = fs.createWriteStream(outputPath);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      console.log(`[Auphonic] Downloaded cleaned audio: ${outputPath}`);
      return outputPath;
    } catch (err) {
      throw new Error(`[Auphonic] Download failed: ${err.message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // FALLBACK: POLLING (Use webhook instead when possible)
  // ---------------------------------------------------------------------------

  /**
   * Polls until production completes. Use ONLY as a fallback if webhook
   * delivery fails — webhook-driven flow is strongly preferred.
   *
   * @param {string} productionUuid
   * @param {number} [intervalMs=10000]  — Poll interval
   * @param {number} [timeoutMs=1800000] — Timeout (default 30 min)
   */
  async waitForCompletion(productionUuid, intervalMs = 10000, timeoutMs = 1800000) {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const production = await this.getProductionStatus(productionUuid);

      if (production.status === 3) {
        return production; // Done
      }

      if (production.status === 4) {
        throw new Error(`[Auphonic] Production failed: ${production.errorMessage}`);
      }

      console.log(`[Auphonic] Status: ${production.statusString} — waiting...`);
      await new Promise((r) => setTimeout(r, intervalMs));
    }

    throw new Error(`[Auphonic] Timed out waiting for production ${productionUuid}`);
  }
}

module.exports = AuphonicService;
