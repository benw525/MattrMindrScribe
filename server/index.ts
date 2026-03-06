import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { isR2Url, getR2KeyFromUrl, getR2PublicUrl } from './r2.js';
import { runMigrations } from 'stripe-replit-sync';
import { getStripeSync } from './stripeClient.js';
import { WebhookHandlers } from './webhookHandlers.js';
import authRoutes from './routes/auth.js';
import transcriptRoutes from './routes/transcripts.js';
import folderRoutes from './routes/folders.js';
import stripeRoutes from './routes/stripe.js';
import { authenticateToken } from './middleware/auth.js';
import pool from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
const PORT = isProduction ? 5000 : 3000;

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn('DATABASE_URL not set, skipping Stripe initialization');
    return;
  }

  try {
    console.log('Initializing Stripe schema...');
    await runMigrations({ databaseUrl });
    console.log('Stripe schema ready');

    const stripeSync = await getStripeSync();

    const replitDomains = process.env.REPLIT_DOMAINS;
    if (replitDomains) {
      const webhookBaseUrl = `https://${replitDomains.split(',')[0]}`;
      try {
        const { webhook } = await stripeSync.findOrCreateManagedWebhook(
          `${webhookBaseUrl}/api/stripe/webhook`
        );
        console.log(`Webhook configured: ${webhook?.url || webhookBaseUrl}`);
      } catch (webhookErr) {
        console.warn('Webhook setup skipped (may not be available in dev):', (webhookErr as any).message);
      }
    } else {
      console.log('REPLIT_DOMAINS not set, skipping webhook setup');
    }

    stripeSync.syncBackfill()
      .then(() => console.log('Stripe data synced'))
      .catch((err: any) => console.error('Error syncing Stripe data:', err));
  } catch (error) {
    console.error('Failed to initialize Stripe:', error);
  }
}

await initStripe();

app.use(cors({
  origin: isProduction 
    ? (process.env.REPLIT_DOMAINS?.split(',').map(d => `https://${d}`) || [])
    : true,
  credentials: true,
}));

app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature' });
    }

    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;
      if (!Buffer.isBuffer(req.body)) {
        console.error('Webhook body is not a Buffer');
        return res.status(500).json({ error: 'Webhook processing error' });
      }
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('Webhook error:', error.message);
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', authenticateToken as any, express.static(path.join(__dirname, '..', 'uploads')));

const mediaTokens = new Map<string, { userId: string; filename: string; expires: number; isR2: boolean }>();

app.post('/api/media/token', authenticateToken as any, async (req: any, res) => {
  const { filename } = req.body;
  if (!filename) return res.status(400).json({ error: 'Filename required' });

  const { rows } = await pool.query(
    'SELECT id FROM transcripts WHERE file_url = $1 AND user_id = $2 LIMIT 1',
    [filename, req.userId]
  );
  if (rows.length === 0) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const token = crypto.randomBytes(32).toString('hex');

  if (isR2Url(filename)) {
    const r2Key = getR2KeyFromUrl(filename);
    mediaTokens.set(token, {
      userId: req.userId,
      filename: r2Key,
      expires: Date.now() + 60 * 60 * 1000,
      isR2: true,
    });
  } else {
    mediaTokens.set(token, {
      userId: req.userId,
      filename: path.basename(filename),
      expires: Date.now() + 60 * 60 * 1000,
      isR2: false,
    });
  }

  const mediaFilename = isR2Url(filename) ? encodeURIComponent(getR2KeyFromUrl(filename)) : path.basename(filename);
  res.json({ token, mediaFilename });
});

app.get('/api/media/:filename', async (req, res) => {
  const token = req.query.token as string;
  if (!token) return res.status(401).json({ error: 'Token required' });
  const entry = mediaTokens.get(token);
  if (!entry || entry.expires < Date.now()) {
    mediaTokens.delete(token);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const requestedFile = decodeURIComponent(req.params.filename);

  if (entry.filename !== requestedFile) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (entry.isR2) {
    try {
      const { streamFromR2 } = await import('./r2.js');
      await streamFromR2(entry.filename, res);
    } catch (err: any) {
      console.error('[Media] R2 stream error:', err.message);
      return res.status(500).json({ error: 'Failed to stream file' });
    }
  } else {
    const filePath = path.resolve(__dirname, '..', 'uploads', requestedFile);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    res.sendFile(filePath);
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/transcripts', transcriptRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/stripe', stripeRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

if (isProduction) {
  const distPath = path.join(__dirname, '..', 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server running on http://0.0.0.0:${PORT}`);
});
