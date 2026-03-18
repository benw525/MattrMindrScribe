const express = require('express');
const router = express.Router();

/**
 * Auphonic Webhook Handler
 *
 * Auphonic sends an HTTP POST to your webhook URL when a production
 * finishes (success or failure). This route receives that callback
 * and kicks off the next pipeline step.
 *
 * Mount this in your Express app:
 *   app.use('/webhooks', require('./auphonic-webhook')(auphonicService, transcriptionQueue));
 */
module.exports = function createWebhookRouter(auphonicService, transcriptionQueue) {
  /**
   * POST /webhooks/auphonic
   *
   * Auphonic sends the full production JSON in the POST body.
   * Key fields we care about:
   *   - uuid: the production UUID
   *   - status: 3 = done, 4 = error
   *   - status_string: human-readable status
   *   - output_files[]: array with download_url for each output
   *   - metadata.title: we stored "matter-{matterId}-{timestamp}" here
   */
  router.post('/auphonic', express.json(), async (req, res) => {
    try {
      const production = req.body;

      // Auphonic may send the data nested under `data` or flat — handle both
      const data = production.data || production;
      const productionUuid = data.uuid;
      const status = data.status;
      const title = data.metadata?.title || '';

      console.log(`[Webhook] Auphonic callback for production ${productionUuid} — status: ${data.status_string}`);

      // Respond immediately — don't hold the webhook connection open
      res.status(200).json({ received: true });

      // Extract matter ID from the title we set during submission
      // Format: "matter-{matterId}-{timestamp}"
      const matterMatch = title.match(/^matter-(.+)-\d+$/);
      const matterId = matterMatch ? matterMatch[1] : null;

      if (status === 3) {
        // ── SUCCESS: Download cleaned audio and queue for Whisper ──
        const cleanedFilePath = await auphonicService.downloadCleanedAudio(productionUuid);

        console.log(`[Webhook] Cleaned audio downloaded: ${cleanedFilePath}`);

        // Queue the next pipeline step (Whisper transcription)
        await transcriptionQueue.add(
          'whisper-transcribe',
          {
            matterId,
            audioFilePath: cleanedFilePath,
            productionUuid,
            // Pass along any metadata your pipeline needs
            pipelineStage: 'whisper',
            cleanedAt: new Date().toISOString(),
          },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: true,
          }
        );

        console.log(`[Webhook] Queued Whisper job for matter ${matterId}`);
      } else if (status === 4) {
        // ── ERROR: Log and optionally retry or alert ──
        const errorMsg = data.error_message || 'Unknown Auphonic error';
        console.error(`[Webhook] Auphonic processing failed for ${productionUuid}: ${errorMsg}`);

        // Queue a failure handler — notify the user, retry, etc.
        await transcriptionQueue.add(
          'auphonic-failure',
          {
            matterId,
            productionUuid,
            error: errorMsg,
            warningMessage: data.warning_message || null,
          },
          { attempts: 1 }
        );
      } else {
        // Intermediate status — Auphonic shouldn't webhook for these,
        // but log it just in case
        console.warn(`[Webhook] Unexpected Auphonic status ${status} for ${productionUuid}`);
      }
    } catch (err) {
      console.error(`[Webhook] Error handling Auphonic callback:`, err);
      // Still return 200 so Auphonic doesn't retry endlessly
      if (!res.headersSent) {
        res.status(200).json({ received: true, error: 'Internal processing error' });
      }
    }
  });

  return router;
};
